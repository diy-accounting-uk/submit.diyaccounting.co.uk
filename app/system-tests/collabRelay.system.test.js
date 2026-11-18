// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/collabRelay.system.test.js
//
// The relay Lambda over the real DynamoDB repository on dynalite: the conditional seq write, the
// inbox query and the connection rows behave as the unit test's fake says they do.

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { makeSshTestKey } from "@app/test-helpers/sshSignatureTestKeys.js";

const TABLE = "collab-relay-system-test";
let server;
let relay;
let repository;
let relayModule;
const posted = [];
const coordinator = makeSshTestKey("coordinator");
const anvil = makeSshTestKey("anvil");

beforeAll(async () => {
  const { default: dynalite } = await import("dynalite");
  server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) =>
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve(server.address()))),
  );
  const endpoint = `http://127.0.0.1:${address.port}`;
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.COLLAB_RELAY_DYNAMODB_TABLE_NAME = TABLE;

  const client = new DynamoDBClient({ endpoint, region: "us-east-1", credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" } });
  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  repository = await import("@app/data/dynamoDbCollabRelayRepository.js");
  relayModule = await import("@app/functions/collab/collabRelay.js");
  relay = relayModule.createRelay({
    repository,
    coordinatorPublicKey: coordinator.publicKeyLine,
    postToConnection: async (connectionId, text) => posted.push({ connectionId, frame: JSON.parse(text) }),
    startReplay: async () => {},
  });
});

afterAll(async () => {
  server?.close();
});

const httpEvent = (routeKey, body) => ({ routeKey, rawPath: routeKey.split(" ")[1], headers: {}, body: JSON.stringify(body) });
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe("collab relay on DynamoDB", () => {
  test("registers, relays, refuses a replay, replays the inbox and acknowledges", async () => {
    const { signedText } = relayModule;
    const ts = nowSeconds();
    const reg = { party: "anvil", publicKey: anvil.publicKeyLine, ts };
    expect((await relay(httpEvent("POST /register", { ...reg, sig: coordinator.signMessage(signedText.register(reg)) }))).statusCode).toBe(
      200,
    );
    expect(await repository.getPartyKey("anvil")).toBe(anvil.publicKeyLine);

    const connect = { party: "coordinator", ts };
    const connected = await relay({
      requestContext: { eventType: "CONNECT", connectionId: "coord-1" },
      queryStringParameters: { party: "coordinator", ts: String(ts), sig: coordinator.signMessage(signedText.connect(connect)) },
    });
    expect(connected.statusCode).toBe(200);

    const envelope = {
      from: "anvil",
      to: "coordinator",
      seq: Date.now(),
      ts,
      body: "-----BEGIN AGE ENCRYPTED FILE-----\nabc\n-----END AGE ENCRYPTED FILE-----",
    };
    const signed = { ...envelope, sig: anvil.signMessage(signedText.send(envelope)) };
    const sent = await relay(httpEvent("POST /send", signed));
    expect(JSON.parse(sent.body)).toEqual({ id: repository.messageId("anvil", envelope.seq), delivered: 1 });
    expect(posted.at(-1)).toMatchObject({ connectionId: "coord-1", frame: { type: "message", body: envelope.body } });
    expect((await relay(httpEvent("POST /send", signed))).statusCode).toBe(409);

    posted.length = 0;
    expect(await relay({ collabRelayReplay: { connectionId: "coord-1", party: "coordinator" } })).toEqual({ replayed: 1 });

    const ids = [repository.messageId("anvil", envelope.seq)];
    const ack = { party: "coordinator", ts, ids };
    expect((await relay(httpEvent("POST /ack", { ...ack, sig: coordinator.signMessage(signedText.ack(ack)) }))).statusCode).toBe(200);
    expect(await repository.listMessages("coordinator", Date.now())).toEqual([]);

    await relay({ requestContext: { eventType: "DISCONNECT", connectionId: "coord-1" } });
    expect(await repository.listConnections(undefined, Date.now())).toEqual([]);
  });

  test("a new key clears the sender's seq and the same key again keeps it", async () => {
    expect(await repository.advanceSeq("forge", 100)).toBe(true);
    expect(await repository.advanceSeq("forge", 100)).toBe(false);
    const first = makeSshTestKey("forge");
    expect(await repository.putPartyKey("forge", first.publicKeyLine, Date.now())).toEqual({ changed: true });
    expect(await repository.advanceSeq("forge", 1)).toBe(true);
    expect(await repository.putPartyKey("forge", first.publicKeyLine, Date.now())).toEqual({ changed: false });
    expect(await repository.advanceSeq("forge", 1)).toBe(false);
  });

  test("hides an expired message that DynamoDB has not removed yet", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await repository.putMessage({ from: "anvil", to: "late", seq: 5, ts: 1, sig: "s", body: "b" }, eightDaysAgo);
    expect(await repository.listMessages("late", Date.now())).toEqual([]);
    expect(await repository.listMessages("late", eightDaysAgo)).toHaveLength(1);
  });
});
