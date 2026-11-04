// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/saltRotationWindow.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const stored = new Map();
const keyOf = (key) => JSON.stringify(Object.values(key));

const commandModule = {
  GetCommand: class {
    constructor(input) {
      this.run = () => ({ Item: stored.get(input.TableName + keyOf(input.Key)) });
    }
  },
  QueryCommand: class {
    constructor(input) {
      const hash = input.ExpressionAttributeValues[":hashedSub"];
      this.run = () => {
        const Items = [...stored.entries()]
          .filter(([key, item]) => key.startsWith(input.TableName) && item.hashedSub === hash)
          .map(([, item]) => item);
        return { Items, Count: Items.length };
      };
    }
  },
  UpdateCommand: class {
    constructor(input) {
      this.run = () => {
        const storeKey = input.TableName + keyOf(input.Key);
        const existing = stored.get(storeKey);
        if (input.ConditionExpression === "#status = :paid" && existing?.status !== "paid") {
          throw Object.assign(new Error("condition"), { name: "ConditionalCheckFailedException" });
        }
        if (input.ConditionExpression === "attribute_exists(clientId)" && !existing) {
          throw Object.assign(new Error("condition"), { name: "ConditionalCheckFailedException" });
        }
        const updated = { ...input.Key, ...existing, touched: true };
        if (input.ConditionExpression === "#status = :paid") updated.status = "used";
        if (input.UpdateExpression.includes("tokensConsumed")) {
          updated.tokensConsumed = (existing?.tokensConsumed ?? 0) + 1;
          updated.saltVersion = input.ExpressionAttributeValues[":saltVersion"];
        }
        stored.set(storeKey, updated);
        return { Attributes: updated };
      };
    }
  },
};

vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: async (build) => build(commandModule).run(),
  getResourceName: (name) => name,
}));

const { getUserBundles, consumeToken, getAccountSettings } = await import("@app/data/dynamoDbBundleRepository.js");
const { listUserReceipts } = await import("@app/data/dynamoDbReceiptRepository.js");
const { getClient, listClients, archiveClient, getPracticeArn } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { hasPaidCharge, markChargeUsed } = await import("@app/services/activityCharges.js");
const { _clearSalt, hashSubWithVersion, initializeSalt, isHashOfSub, subHashCandidates } = await import("@app/services/subHasher.js");

const SUB = "user-sub";
const BUNDLES = "BUNDLE_DYNAMODB_TABLE_NAME";
const RECEIPTS = "RECEIPTS_DYNAMODB_TABLE_NAME";
const CLIENTS = "PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME";
const CHARGES = "ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME";

const put = (table, key, attributes = {}) => stored.set(table + keyOf(key), { ...key, ...attributes });

describe("reads and writes during a salt rotation", () => {
  let oldHash;
  let newHash;
  const originalSalt = process.env.USER_SUB_HASH_SALT;

  beforeEach(async () => {
    stored.clear();
    _clearSalt();
    process.env.USER_SUB_HASH_SALT = JSON.stringify({ current: "v3", versions: { v2: "old", v3: "new" } });
    await initializeSalt();
    oldHash = hashSubWithVersion(SUB, "v2");
    newHash = hashSubWithVersion(SUB, "v3");
  });

  afterEach(() => {
    process.env.USER_SUB_HASH_SALT = originalSalt;
    _clearSalt();
  });

  test("the candidates list the current hash first and every earlier hash after it", () => {
    expect(subHashCandidates(SUB)).toEqual([
      { version: "v3", hashedSub: newHash },
      { version: "v2", hashedSub: oldHash },
    ]);
    expect(isHashOfSub(SUB, oldHash)).toBe(true);
    expect(isHashOfSub(SUB, "someone-else")).toBe(false);
  });

  test("a container that still treats the old version as current finds a moved item", async () => {
    _clearSalt();
    process.env.USER_SUB_HASH_SALT = JSON.stringify({ current: "v2", versions: { v2: "old", v3: "new" } });
    await initializeSalt();
    put(BUNDLES, { hashedSub: newHash, bundleId: "moved" });

    expect((await getUserBundles(SUB)).map((bundle) => bundle.bundleId)).toEqual(["moved"]);
  });

  test("bundles under two hashes merge, and the current hash wins for a bundle under both", async () => {
    put(BUNDLES, { hashedSub: newHash, bundleId: "both" }, { from: "new" });
    put(BUNDLES, { hashedSub: oldHash, bundleId: "both" }, { from: "old" });
    put(BUNDLES, { hashedSub: oldHash, bundleId: "not-moved-yet" });

    const bundles = await getUserBundles(SUB);

    expect(bundles.map((bundle) => bundle.bundleId).sort()).toEqual(["both", "not-moved-yet"]);
    expect(bundles.find((bundle) => bundle.bundleId === "both").from).toBe("new");
  });

  test("a token spent on a bundle not moved yet lands on that item and adds no item at the new hash", async () => {
    put(BUNDLES, { hashedSub: oldHash, bundleId: "day-guest" }, { tokensConsumed: 2, tokensGranted: 5 });

    await consumeToken(SUB, "day-guest");

    expect(stored.get(BUNDLES + keyOf({ hashedSub: oldHash, bundleId: "day-guest" }))).toMatchObject({
      tokensConsumed: 3,
      saltVersion: "v2",
    });
    expect(stored.has(BUNDLES + keyOf({ hashedSub: newHash, bundleId: "day-guest" }))).toBe(false);
  });

  test("account settings not moved yet are still read", async () => {
    const { ACCOUNT_SETTINGS_ITEM_ID } = await import("@app/data/dynamoDbBundleRepository.js");
    put(BUNDLES, { hashedSub: oldHash, bundleId: ACCOUNT_SETTINGS_ITEM_ID }, { settings: { theme: "dark" } });

    expect(await getAccountSettings(SUB)).toEqual({ theme: "dark" });
  });

  test("receipts under two hashes merge", async () => {
    put(RECEIPTS, { hashedSub: newHash, receiptId: "2026-11-01T10:00:00.000Z-1" });
    put(RECEIPTS, { hashedSub: oldHash, receiptId: "2026-10-01T10:00:00.000Z-2" });

    const { length } = await listUserReceipts(SUB);

    expect(length).toBe(2);
  });

  test("a practice's clients under two hashes merge, and a single client is found under either", async () => {
    put(CLIENTS, { hashedSub: newHash, clientId: "new-client" });
    put(CLIENTS, { hashedSub: oldHash, clientId: "old-client" });
    put(CLIENTS, { hashedSub: oldHash, clientId: "practice#profile" }, { arn: "ARN123" });

    expect((await listClients(SUB)).map((client) => client.clientId).sort()).toEqual(["new-client", "old-client"]);
    expect(await getClient(SUB, "old-client")).toMatchObject({ clientId: "old-client" });
    expect(await getPracticeArn(SUB)).toBe("ARN123");
  });

  test("an update to a client not moved yet lands on its row", async () => {
    put(CLIENTS, { hashedSub: oldHash, clientId: "old-client" });

    await archiveClient(SUB, "old-client");

    expect(stored.get(CLIENTS + keyOf({ hashedSub: oldHash, clientId: "old-client" })).touched).toBe(true);
  });

  test("a charge paid under the earlier hash counts as paid and can be spent once", async () => {
    const chargeKey = "charge#vat#123";
    put(CHARGES, { hashedSub: oldHash, chargeKey }, { status: "paid" });

    expect(await hasPaidCharge(SUB, "vat", "123")).toBe(true);
    expect(await markChargeUsed(SUB, "vat", "123")).toBe(true);
    expect(await hasPaidCharge(SUB, "vat", "123")).toBe(false);
    expect(await markChargeUsed(SUB, "vat", "123")).toBe(false);
  });
});
