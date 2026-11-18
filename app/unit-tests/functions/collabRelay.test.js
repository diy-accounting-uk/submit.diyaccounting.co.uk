// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/collabRelay.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { createRelay, signedText, MAX_BODY_BYTES } from "@app/functions/collab/collabRelay.js";
import { messageId } from "@app/data/dynamoDbCollabRelayRepository.js";
import { makeSshTestKey } from "@app/test-helpers/sshSignatureTestKeys.js";

const NOW_MS = 1_763_460_000_000;
const NOW = NOW_MS / 1000;

// The repository's functions over plain maps, with the same contract as the DynamoDB one.
function fakeRepository() {
  const keys = new Map();
  const seqs = new Map();
  const inboxes = new Map();
  const connections = new Map();
  return {
    keys,
    inboxes,
    connections,
    getPartyKey: async (party) => keys.get(party) ?? null,
    putPartyKey: async (party, publicKey) => {
      const changed = keys.get(party) !== publicKey;
      keys.set(party, publicKey);
      if (changed) seqs.delete(party);
      return { changed };
    },
    advanceSeq: async (party, seq) => {
      if (seqs.has(party) && seqs.get(party) >= seq) return false;
      seqs.set(party, seq);
      return true;
    },
    putMessage: async (message) => {
      const id = messageId(message.from, message.seq);
      const inbox = inboxes.get(message.to) ?? new Map();
      inbox.set(id, { id, ...message });
      inboxes.set(message.to, inbox);
      return id;
    },
    listMessages: async (party) => [...(inboxes.get(party)?.values() ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    deleteMessage: async (party, id) => inboxes.get(party)?.delete(id),
    putConnection: async (connectionId, party) => connections.set(connectionId, party),
    deleteConnection: async (connectionId) => connections.delete(connectionId),
    listConnections: async (party) =>
      [...connections.entries()].filter(([, p]) => !party || p === party).map(([connectionId, p]) => ({ connectionId, party: p })),
  };
}

const coordinator = makeSshTestKey("coordinator");
const anvil = makeSshTestKey("anvil");
const stranger = makeSshTestKey("stranger");

let repository;
let posted;
let gone;
let replays;
let relay;

function httpEvent(routeKey, body) {
  return { routeKey, rawPath: routeKey.split(" ")[1], headers: {}, body: JSON.stringify(body) };
}

function connectEvent(connectionId, query) {
  return { requestContext: { eventType: "CONNECT", routeKey: "$connect", connectionId }, queryStringParameters: query };
}

function signedSend(key, { from = "anvil", to = "coordinator", seq = NOW_MS, ts = NOW, body = "age-ciphertext" } = {}) {
  return { from, to, seq, ts, body, sig: key.signMessage(signedText.send({ from, to, seq, ts, body })) };
}

const status = (response) => response.statusCode;
const json = (response) => JSON.parse(response.body);

beforeEach(async () => {
  repository = fakeRepository();
  posted = [];
  gone = new Set();
  replays = [];
  relay = createRelay({
    repository,
    coordinatorPublicKey: coordinator.publicKeyLine,
    nowMs: () => NOW_MS,
    wait: async () => {},
    postToConnection: async (connectionId, text) => {
      if (gone.has(connectionId)) throw Object.assign(new Error("gone"), { name: "GoneException" });
      posted.push({ connectionId, frame: JSON.parse(text) });
    },
    startReplay: async (job) => replays.push(job),
  });
  await repository.putPartyKey("anvil", anvil.publicKeyLine);
});

describe("collabRelay $connect", () => {
  test("opens a connection with a fresh signature of its party and starts a replay", async () => {
    const sig = coordinator.signMessage(signedText.connect({ party: "coordinator", ts: NOW }));
    const response = await relay(connectEvent("c1", { party: "coordinator", ts: String(NOW), sig }));
    expect(status(response)).toBe(200);
    expect(repository.connections.get("c1")).toBe("coordinator");
    expect(replays).toEqual([{ connectionId: "c1", party: "coordinator" }]);
  });

  test("refuses a signature by another key", async () => {
    const sig = stranger.signMessage(signedText.connect({ party: "anvil", ts: NOW }));
    expect(status(await relay(connectEvent("c1", { party: "anvil", ts: String(NOW), sig })))).toBe(401);
    expect(repository.connections.size).toBe(0);
  });

  test("refuses a ts outside the five-minute window on either side", async () => {
    for (const ts of [NOW - 301, NOW + 301]) {
      const sig = anvil.signMessage(signedText.connect({ party: "anvil", ts }));
      expect(status(await relay(connectEvent("c1", { party: "anvil", ts: String(ts), sig })))).toBe(401);
    }
    const sig = anvil.signMessage(signedText.connect({ party: "anvil", ts: NOW - 300 }));
    expect(status(await relay(connectEvent("c2", { party: "anvil", ts: String(NOW - 300), sig })))).toBe(200);
  });

  test("refuses an unregistered party and a missing query string", async () => {
    const sig = stranger.signMessage(signedText.connect({ party: "stranger", ts: NOW }));
    expect(status(await relay(connectEvent("c1", { party: "stranger", ts: String(NOW), sig })))).toBe(401);
    expect(status(await relay(connectEvent("c2", undefined)))).toBe(401);
  });
});

describe("collabRelay POST /send", () => {
  test("stores the envelope and pushes it to every open connection of the recipient", async () => {
    await repository.putConnection("coord-1", "coordinator");
    await repository.putConnection("coord-2", "coordinator");
    await repository.putConnection("anvil-1", "anvil");
    const envelope = signedSend(anvil);
    const response = await relay(httpEvent("POST /send", envelope));
    expect(status(response)).toBe(200);
    expect(json(response)).toEqual({ id: messageId("anvil", NOW_MS), delivered: 2 });
    expect(posted.map((p) => p.connectionId).sort()).toEqual(["coord-1", "coord-2"]);
    expect(posted[0].frame).toMatchObject({ type: "message", from: "anvil", to: "coordinator", body: "age-ciphertext", seq: NOW_MS });
    expect(await repository.listMessages("coordinator")).toHaveLength(1);
  });

  test("drops a connection that API Gateway reports gone and still stores the message", async () => {
    await repository.putConnection("coord-old", "coordinator");
    gone.add("coord-old");
    const response = await relay(httpEvent("POST /send", signedSend(anvil)));
    expect(json(response).delivered).toBe(0);
    expect(repository.connections.has("coord-old")).toBe(false);
    expect(await repository.listMessages("coordinator")).toHaveLength(1);
  });

  test("refuses a replayed envelope and any seq that is not newer", async () => {
    const first = signedSend(anvil, { seq: 10 });
    expect(status(await relay(httpEvent("POST /send", first)))).toBe(200);
    expect(status(await relay(httpEvent("POST /send", first)))).toBe(409);
    expect(status(await relay(httpEvent("POST /send", signedSend(anvil, { seq: 9 }))))).toBe(409);
    expect(status(await relay(httpEvent("POST /send", signedSend(anvil, { seq: 11 }))))).toBe(200);
  });

  test("refuses a signature that does not match from, or a changed body, without using the seq", async () => {
    expect(status(await relay(httpEvent("POST /send", signedSend(stranger, { seq: 20 }))))).toBe(401);
    const tampered = { ...signedSend(anvil, { seq: 20 }), body: "other" };
    expect(status(await relay(httpEvent("POST /send", tampered)))).toBe(401);
    expect(status(await relay(httpEvent("POST /send", signedSend(anvil, { seq: 20 }))))).toBe(200);
  });

  test("refuses an old ts, an unknown recipient, a large body and a malformed envelope", async () => {
    expect(status(await relay(httpEvent("POST /send", signedSend(anvil, { ts: NOW - 301 }))))).toBe(401);
    expect(status(await relay(httpEvent("POST /send", signedSend(anvil, { to: "nobody" }))))).toBe(404);
    expect(status(await relay(httpEvent("POST /send", signedSend(anvil, { body: "x".repeat(MAX_BODY_BYTES + 1) }))))).toBe(413);
    expect(status(await relay(httpEvent("POST /send", { from: "anvil" })))).toBe(400);
    expect(status(await relay({ routeKey: "POST /send", rawPath: "/send", headers: {}, body: "{not json" }))).toBe(400);
  });

  test("lets the coordinator send to a registered worker", async () => {
    const response = await relay(httpEvent("POST /send", signedSend(coordinator, { from: "coordinator", to: "anvil" })));
    expect(status(response)).toBe(200);
    expect(await repository.listMessages("anvil")).toHaveLength(1);
  });
});

describe("collabRelay replay and POST /ack", () => {
  test("replays the messages not yet acknowledged, oldest first, and an ack removes them", async () => {
    await relay(httpEvent("POST /send", signedSend(anvil, { seq: 2, body: "second" })));
    await relay(httpEvent("POST /send", signedSend(anvil, { seq: 3, body: "third" })));
    expect(await relay({ collabRelayReplay: { connectionId: "c9", party: "coordinator" } })).toEqual({ replayed: 2 });
    expect(posted.map((p) => p.frame.body)).toEqual(["second", "third"]);

    const ids = [messageId("anvil", 2)];
    const ack = {
      party: "coordinator",
      ts: NOW,
      ids,
      sig: coordinator.signMessage(signedText.ack({ party: "coordinator", ts: NOW, ids })),
    };
    expect(json(await relay(httpEvent("POST /ack", ack)))).toEqual({ acknowledged: 1 });
    expect((await repository.listMessages("coordinator")).map((m) => m.body)).toEqual(["third"]);
  });

  test("retries a replay while the new connection is not open yet", async () => {
    await relay(httpEvent("POST /send", signedSend(anvil, { seq: 2 })));
    gone.add("c9");
    let calls = 0;
    const waitThenOpen = async () => {
      calls++;
      if (calls === 2) gone.delete("c9");
    };
    const retrying = createRelay({
      repository,
      coordinatorPublicKey: coordinator.publicKeyLine,
      nowMs: () => NOW_MS,
      wait: waitThenOpen,
      postToConnection: async (connectionId, text) => {
        if (gone.has(connectionId)) throw Object.assign(new Error("gone"), { name: "GoneException" });
        posted.push({ connectionId, frame: JSON.parse(text) });
      },
      startReplay: async () => {},
    });
    expect(await retrying({ collabRelayReplay: { connectionId: "c9", party: "coordinator" } })).toEqual({ replayed: 1 });
  });

  test("refuses an ack signed by another party or with a malformed id", async () => {
    await relay(httpEvent("POST /send", signedSend(anvil, { seq: 2 })));
    const ids = [messageId("anvil", 2)];
    const forged = { party: "coordinator", ts: NOW, ids, sig: anvil.signMessage(signedText.ack({ party: "coordinator", ts: NOW, ids })) };
    expect(status(await relay(httpEvent("POST /ack", forged)))).toBe(401);
    const bad = { party: "coordinator", ts: NOW, ids: ["../x"], sig: coordinator.signMessage("ack|coordinator|0|../x") };
    expect(status(await relay(httpEvent("POST /ack", bad)))).toBe(400);
    expect(await repository.listMessages("coordinator")).toHaveLength(1);
  });
});

describe("collabRelay POST /register", () => {
  const registration = (key, party, publicKey, ts = NOW) => ({
    party,
    publicKey,
    ts,
    sig: key.signMessage(signedText.register({ party, publicKey, ts })),
  });

  test("registers a worker key signed by the coordinator", async () => {
    const forge = makeSshTestKey("forge");
    const response = await relay(httpEvent("POST /register", registration(coordinator, "forge", forge.publicKeyLine)));
    expect(json(response)).toEqual({ party: "forge", changed: true });
    expect(repository.keys.get("forge")).toBe(forge.publicKeyLine);
  });

  test("refuses a registration that a worker signed, one for the coordinator, and a key that is not ssh-ed25519", async () => {
    const forge = makeSshTestKey("forge");
    expect(status(await relay(httpEvent("POST /register", registration(anvil, "forge", forge.publicKeyLine))))).toBe(401);
    expect(status(await relay(httpEvent("POST /register", registration(coordinator, "coordinator", forge.publicKeyLine))))).toBe(403);
    expect(status(await relay(httpEvent("POST /register", registration(coordinator, "forge", "ssh-rsa AAAAB3NzaC1yc2E= x"))))).toBe(400);
    expect(repository.keys.has("forge")).toBe(false);
  });

  test("refuses every registration when the stack gave no coordinator key", async () => {
    const keyless = createRelay({
      repository,
      coordinatorPublicKey: "",
      nowMs: () => NOW_MS,
      postToConnection: async () => {},
      startReplay: async () => {},
    });
    const forge = makeSshTestKey("forge");
    expect(status(await keyless(httpEvent("POST /register", registration(coordinator, "forge", forge.publicKeyLine))))).toBe(403);
  });
});

describe("collabRelay ping", () => {
  test("sends a ping frame to every connection and drops the gone ones", async () => {
    await repository.putConnection("a", "coordinator");
    await repository.putConnection("b", "anvil");
    gone.add("b");
    expect(await relay({ "source": "aws.events", "detail-type": "Scheduled Event" })).toEqual({ pinged: 1 });
    expect(posted).toEqual([{ connectionId: "a", frame: { type: "ping", ts: NOW } }]);
    expect(repository.connections.has("b")).toBe(false);
  });
});

describe("collabRelay $disconnect", () => {
  test("forgets the connection", async () => {
    await repository.putConnection("a", "coordinator");
    await relay({ requestContext: { eventType: "DISCONNECT", routeKey: "$disconnect", connectionId: "a" } });
    expect(repository.connections.size).toBe(0);
  });
});
