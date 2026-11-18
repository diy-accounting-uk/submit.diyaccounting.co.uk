// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-216 Relay signed messages from cloud workers to the coordinator
// - **Use when:** a cloud worker must wake the local coordinator at once, or the coordinator must reach a worker without git.
// - **Does:** collabRelay.js is the one Lambda of CollabRelayStack, in ci only. It accepts a WebSocket connection only with a fresh SSH signature of its party. POST /send stores a signed envelope for seven days and pushes it to the recipient's open connections. A connection gets the unacknowledged messages again, POST /ack removes them, and POST /register takes a party key that the coordinator signed. A rule pings every connection each 9 minutes.
// - **Run:** `bash .claude/skills/new-cloud-session/new-cloud-session.sh relay-url`
// - **Entry:** `app/functions/collab/collabRelay.js:handler`; `app/lib/sshSignature.js:verifySshSignature`
// - **Files:** app/functions/collab/collabRelay.js, app/lib/sshSignature.js, app/data/dynamoDbCollabRelayRepository.js, app/unit-tests/functions/collabRelay.test.js, app/unit-tests/lib/sshSignature.test.js, app/system-tests/collabRelay.system.test.js, app/test-helpers/sshSignatureTestKeys.js, infra/main/java/co/uk/diyaccounting/submit/stacks/CollabRelayStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/CollabRelayStackTest.java
// - **Keywords:** relay, websocket, cloud worker, coordinator, collaborate, ssh signature, sshsig, age, wake, monitor
// - **Related:** OPS-09, OPS-156
// @end-capability

// app/functions/collab/collabRelay.js
//
// Every request is authenticated by an ed25519 SSH signature (SSHSIG, `ssh-keygen -Y sign -n
// submit-collab`) over one line that names what it does, so a worker needs no AWS credentials:
//   connect|<party>|<ts>                          $connect query string: party, ts, sig
//   send|<from>|<to>|<seq>|<ts>|<body>            POST /send: {from, to, seq, ts, sig, body}
//   ack|<party>|<ts>|<id>,<id>...                 POST /ack: {party, ts, ids, sig}
//   register|<party>|<publicKey>|<ts>             POST /register: {party, publicKey, ts, sig}, signed by the coordinator
// ts is epoch seconds and must be within five minutes of the relay's clock. seq must be higher
// than every seq the relay accepted from the same sender. body is opaque to the relay: the sender
// encrypts it to the recipient with `age -R`.

import {
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http409ConflictResponse,
  http413PayloadTooLargeResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { createLogger } from "../../lib/logger.js";
import { parseSshEd25519PublicKey, verifySshSignature } from "../../lib/sshSignature.js";
import * as relayRepository from "../../data/dynamoDbCollabRelayRepository.js";

const logger = createLogger({ source: "app/functions/collab/collabRelay.js" });

export const NAMESPACE = "submit-collab";
export const COORDINATOR = "coordinator";
export const CLOCK_WINDOW_SECONDS = 5 * 60;
// A WebSocket frame from API Gateway carries at most 128 KB; a large result travels by git.
export const MAX_BODY_BYTES = 64 * 1024;
const MAX_ACK_IDS = 100;
const PARTY_PATTERN = /^[a-z]{1,32}$/;
const ID_PATTERN = /^\d{16}\.[a-z]{1,32}$/;
// A connection is not open to @connections until its $connect answer reaches API Gateway, so
// the replay that the $connect handler starts tries again for up to about three seconds.
const REPLAY_ATTEMPTS = 6;
const REPLAY_RETRY_MS = 500;

export const signedText = {
  connect: ({ party, ts }) => `connect|${party}|${ts}`,
  send: ({ from, to, seq, ts, body }) => `send|${from}|${to}|${seq}|${ts}|${body}`,
  ack: ({ party, ts, ids }) => `ack|${party}|${ts}|${ids.join(",")}`,
  register: ({ party, publicKey, ts }) => `register|${party}|${publicKey}|${ts}`,
};

const isGone = (error) => error?.name === "GoneException" || error?.$metadata?.httpStatusCode === 410;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toInteger(value) {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/**
 * The relay, with its outside calls passed in so tests can run it without AWS.
 *
 * @param {object} deps
 * @param {object} deps.repository - the functions of dynamoDbCollabRelayRepository.js
 * @param {(connectionId: string, text: string) => Promise<void>} deps.postToConnection
 * @param {(job: {connectionId: string, party: string}) => Promise<void>} deps.startReplay
 * @param {string} deps.coordinatorPublicKey - OpenSSH public key line of the coordinator
 * @param {() => number} [deps.nowMs]
 * @param {(ms: number) => Promise<void>} [deps.wait]
 */
export function createRelay({ repository, postToConnection, startReplay, coordinatorPublicKey, nowMs = () => Date.now(), wait = sleep }) {
  const coordinatorKey = parseSshEd25519PublicKey(coordinatorPublicKey) ? coordinatorPublicKey.trim() : null;

  async function publicKeyOf(party) {
    if (party === COORDINATOR) return coordinatorKey;
    return repository.getPartyKey(party);
  }

  function fresh(ts) {
    return Math.abs(Math.floor(nowMs() / 1000) - ts) <= CLOCK_WINDOW_SECONDS;
  }

  async function signedBy(party, message, signature) {
    const publicKeyLine = await publicKeyOf(party);
    return Boolean(publicKeyLine) && verifySshSignature({ publicKeyLine, namespace: NAMESPACE, message, signature });
  }

  // Posts one frame; answers false and forgets the connection when API Gateway says it is gone.
  async function deliver(connectionId, frame) {
    try {
      await postToConnection(connectionId, JSON.stringify(frame));
      return true;
    } catch (error) {
      if (!isGone(error)) throw error;
      await repository.deleteConnection(connectionId);
      return false;
    }
  }

  const messageFrame = (message) => ({ type: "message", ...message });

  async function connect(event) {
    const { party, ts: tsText, sig } = event.queryStringParameters || {};
    const ts = toInteger(tsText);
    if (!PARTY_PATTERN.test(party || "") || !ts || !fresh(ts) || !(await signedBy(party, signedText.connect({ party, ts }), sig))) {
      logger.warn({ message: "Refused a relay connection", party: PARTY_PATTERN.test(party || "") ? party : undefined });
      return { statusCode: 401, body: "unauthorised" };
    }
    const connectionId = event.requestContext.connectionId;
    await repository.putConnection(connectionId, party, nowMs());
    await startReplay({ connectionId, party });
    logger.info({ message: "Relay connection open", party });
    return { statusCode: 200, body: "connected" };
  }

  async function disconnect(event) {
    await repository.deleteConnection(event.requestContext.connectionId);
    return { statusCode: 200, body: "disconnected" };
  }

  async function replay({ connectionId, party }) {
    const messages = await repository.listMessages(party, nowMs());
    let replayed = 0;
    for (const message of messages) {
      let sent = false;
      for (let attempt = 1; attempt <= REPLAY_ATTEMPTS && !sent; attempt++) {
        try {
          await postToConnection(connectionId, JSON.stringify(messageFrame(message)));
          sent = true;
        } catch (error) {
          if (!isGone(error)) throw error;
          if (attempt === REPLAY_ATTEMPTS) {
            await repository.deleteConnection(connectionId);
            return { replayed };
          }
          await wait(REPLAY_RETRY_MS);
        }
      }
      replayed++;
    }
    return { replayed };
  }

  async function send(request, payload) {
    const { from, to, sig, body } = payload;
    const seq = toInteger(payload.seq);
    const ts = toInteger(payload.ts);
    if (
      !PARTY_PATTERN.test(from || "") ||
      !PARTY_PATTERN.test(to || "") ||
      !seq ||
      !ts ||
      typeof body !== "string" ||
      typeof sig !== "string"
    ) {
      return http400BadRequestResponse({ request, message: "send needs from, to, seq, ts, sig and body" });
    }
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      return http413PayloadTooLargeResponse({ request, message: `body is over ${MAX_BODY_BYTES} bytes; send the result by git` });
    }
    if (!fresh(ts)) return http401UnauthorizedResponse({ request, message: "ts is outside the five-minute window" });
    if (!(await signedBy(from, signedText.send({ from, to, seq, ts, body }), sig))) {
      return http401UnauthorizedResponse({ request, message: "sig does not verify for from" });
    }
    if (!(await publicKeyOf(to))) return http404NotFoundResponse({ request, message: "to is not a registered party" });
    if (!(await repository.advanceSeq(from, seq))) {
      return http409ConflictResponse({ request, message: "seq is not newer than the last seq from this sender" });
    }
    const id = await repository.putMessage({ from, to, seq, ts, sig, body }, nowMs());
    let delivered = 0;
    for (const { connectionId } of await repository.listConnections(to, nowMs())) {
      if (await deliver(connectionId, messageFrame({ id, from, to, seq, ts, sig, body }))) delivered++;
    }
    logger.info({ message: "Relayed a message", from, to, id, delivered });
    return http200OkResponse({ request, data: { id, delivered } });
  }

  async function ack(request, payload) {
    const { party, sig, ids } = payload;
    const ts = toInteger(payload.ts);
    if (
      !PARTY_PATTERN.test(party || "") ||
      !ts ||
      typeof sig !== "string" ||
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.length > MAX_ACK_IDS ||
      !ids.every((id) => typeof id === "string" && ID_PATTERN.test(id))
    ) {
      return http400BadRequestResponse({ request, message: `ack needs party, ts, sig and 1 to ${MAX_ACK_IDS} message ids` });
    }
    if (!fresh(ts)) return http401UnauthorizedResponse({ request, message: "ts is outside the five-minute window" });
    if (!(await signedBy(party, signedText.ack({ party, ts, ids }), sig))) {
      return http401UnauthorizedResponse({ request, message: "sig does not verify for party" });
    }
    for (const id of ids) await repository.deleteMessage(party, id);
    return http200OkResponse({ request, data: { acknowledged: ids.length } });
  }

  async function register(request, payload) {
    const { party, publicKey, sig } = payload;
    const ts = toInteger(payload.ts);
    if (!PARTY_PATTERN.test(party || "") || !ts || typeof sig !== "string" || typeof publicKey !== "string") {
      return http400BadRequestResponse({ request, message: "register needs party, publicKey, ts and sig" });
    }
    if (party === COORDINATOR) return http403ForbiddenResponse({ request, message: "the coordinator key comes from the stack" });
    if (!parseSshEd25519PublicKey(publicKey)) return http400BadRequestResponse({ request, message: "publicKey is not an ssh-ed25519 key" });
    if (!coordinatorKey) return http403ForbiddenResponse({ request, message: "the relay has no coordinator key" });
    if (!fresh(ts)) return http401UnauthorizedResponse({ request, message: "ts is outside the five-minute window" });
    if (!(await signedBy(COORDINATOR, signedText.register({ party, publicKey, ts }), sig))) {
      return http401UnauthorizedResponse({ request, message: "sig does not verify for the coordinator" });
    }
    const { changed } = await repository.putPartyKey(party, publicKey.trim(), nowMs());
    logger.info({ message: "Registered a relay party", party, changed });
    return http200OkResponse({ request, data: { party, changed } });
  }

  async function ping() {
    let pinged = 0;
    for (const { connectionId } of await repository.listConnections(undefined, nowMs())) {
      if (await deliver(connectionId, { type: "ping", ts: Math.floor(nowMs() / 1000) })) pinged++;
    }
    return { pinged };
  }

  const httpRoutes = { "POST /send": send, "POST /ack": ack, "POST /register": register };

  return async function handle(event) {
    const context = event?.requestContext;
    if (context?.eventType === "CONNECT") return connect(event);
    if (context?.eventType === "DISCONNECT") return disconnect(event);
    const route = httpRoutes[event?.routeKey];
    if (route) {
      const request = new URL(`https://relay${event.rawPath || "/"}`);
      const payload = parseRequestBody(event);
      if (!payload || typeof payload !== "object") return http400BadRequestResponse({ request, message: "the body is not JSON" });
      try {
        return await route(request, payload);
      } catch (error) {
        logger.error({ message: "Relay request failed", route: event.routeKey, error: error.message });
        return http500ServerErrorResponse({ request, message: "the relay failed" });
      }
    }
    if (!context && event?.collabRelayReplay) return replay(event.collabRelayReplay);
    if (!context && event?.source === "aws.events") return ping();
    throw new Error(`collabRelay cannot handle this event: ${event?.routeKey || context?.eventType || event?.source || "unknown"}`);
  };
}

let managementClient = null;

async function postToConnectionWithApiGateway(connectionId, text) {
  const { ApiGatewayManagementApiClient, PostToConnectionCommand } = await import("@aws-sdk/client-apigatewaymanagementapi");
  managementClient ??= new ApiGatewayManagementApiClient({ endpoint: process.env.COLLAB_RELAY_CALLBACK_URL });
  await managementClient.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: Buffer.from(text) }));
}

let lambdaClient = null;

// The $connect answer must return before API Gateway opens the connection to @connections, so
// the replay runs in a second, asynchronous invocation of this same function.
async function startReplayWithLambda(job) {
  const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
  lambdaClient ??= new LambdaClient({ region: process.env.AWS_REGION });
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ collabRelayReplay: job })),
    }),
  );
}

let relay = null;

export async function handler(event) {
  relay ??= createRelay({
    repository: relayRepository,
    postToConnection: postToConnectionWithApiGateway,
    startReplay: startReplayWithLambda,
    coordinatorPublicKey: process.env.COLLAB_COORDINATOR_PUBLIC_KEY || "",
  });
  return relay(event);
}
