// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeAll, afterAll } from "vitest";
//import * as store from "../lib/dynamoDbBundleRepository.js";

// We start a local Dynalite instance using the helper in app/bin/dynamodb.js,
// then set environment variables so that the AWS SDK v3 client in
// app/data/dynamoDbBundleRepository.js connects to that local endpoint via
// AWS_ENDPOINT_URL[_DYNAMODB]. Only after env is set we dynamically import the
// bundle store module to ensure it picks up the correct configuration.

let stopDynalite;
// @ts-check
/** @typedef {typeof import("../data/dynamoDbBundleRepository.js")} DynamoStore */
/** @type {DynamoStore} */
let store;
const tableName = "bundles-system-test";

beforeAll(async () => {
  // const { startDynamoDB, ensureBundleTableExists } = await import("../bin/dynamodb.js");
  //
  // // Start local dynalite and configure environment for AWS SDK v3
  // const started = await startDynamoDB();
  // stopDynalite = started.stop;
  // const endpoint = started.endpoint;
  const { ensureBundleTableExists } = await import("../bin/dynamodb.js");
  const { default: dynalite } = await import("dynalite");

  const host = "127.0.0.1";
  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) => {
    server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address())));
  });
  stopDynalite = async () => {
    try {
      server.close();
    } catch {}
  };
  const endpoint = `http://${host}:${address.port}`;

  // Minimal AWS SDK env for local usage with endpoint override
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";

  // Endpoint override for DynamoDB (SDK v3 respects these vars)
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;

  // Enable DynamoDB usage in the bundle store
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;

  // Set salt for hashing user subs (required by subHasher.js)
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-system-tests"}}';

  // Initialize the salt before importing modules that use hashSub
  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  // Ensure the table exists on the local endpoint
  await ensureBundleTableExists(tableName, endpoint);

  // Import the store AFTER environment is configured
  store = await import("../data/dynamoDbBundleRepository.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {
    // ignore
  }
});

describe("System: dynamoDbBundleStore with local dynalite", () => {
  it("should enable DynamoDB via env and perform put/get/delete operations", async () => {
    const userId = "user-12345";
    const bundleId = "bundle-1";
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
    const bundle = {
      bundleId,
      expiry,
    };

    // Put the bundle
    await store.putBundle(userId, bundle);

    // Read bundles for the user
    const afterPut = await store.getUserBundles(userId);
    expect(Array.isArray(afterPut)).toBe(true);
    const found = afterPut.find((b) => b.bundleId === bundle.bundleId);
    expect(found).toBeTruthy();

    // Delete the bundle and ensure it's gone
    await store.deleteBundle(userId, bundle.bundleId);
    const afterDelete = await store.getUserBundles(userId);
    expect(afterDelete.find((b) => b.bundleId === bundle.bundleId)).toBeUndefined();
  });
});

describe("System: the account settings item and its watch list with local dynalite", () => {
  it("adds many companies at once and keeps every one, up to the cap, with the other settings as they were", async () => {
    const userId = "watch-list-concurrent-user";
    await store.updateAccountSettings(userId, { passGeneration: false });
    const numbers = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(8, "0"));

    const outcomes = await Promise.all(numbers.map((number) => store.addToWatchedCompanies(userId, number, 10)));

    const stored = await store.getAccountSettings(userId);
    expect(stored.passGeneration).toBe(false);
    expect(stored.watchedCompanies).toHaveLength(10);
    expect(new Set(stored.watchedCompanies).size).toBe(10);
    expect(outcomes.filter((outcome) => outcome.status === "added")).toHaveLength(10);
    expect(outcomes.filter((outcome) => outcome.status === "full")).toHaveLength(2);
  });

  it("adds a company already on the list once, and removes one not on it as a change of nothing", async () => {
    const userId = "watch-list-duplicate-user";
    const [first, second] = await Promise.all([
      store.addToWatchedCompanies(userId, "SC000001", 50),
      store.addToWatchedCompanies(userId, "SC000001", 50),
    ]);
    expect([first.status, second.status].sort()).toEqual(["added", "unchanged"]);
    expect((await store.removeFromWatchedCompanies(userId, "00000009")).status).toBe("unchanged");
    expect((await store.getAccountSettings(userId)).watchedCompanies).toEqual(["SC000001"]);
  });

  it("loses neither a watch list change nor a pass generation change made at the same moment", async () => {
    const userId = "watch-list-and-setting-user";
    await store.updateAccountSettings(userId, { passGeneration: true });
    await store.addToWatchedCompanies(userId, "00000001", 50);

    await Promise.all([
      store.updateAccountSettings(userId, { passGeneration: false }),
      store.addToWatchedCompanies(userId, "00000002", 50),
      store.removeFromWatchedCompanies(userId, "00000001"),
      store.addToWatchedCompanies(userId, "00000003", 50),
    ]);

    const stored = await store.getAccountSettings(userId);
    expect(stored.passGeneration).toBe(false);
    expect([...stored.watchedCompanies].sort()).toEqual(["00000002", "00000003"]);
  });

  it("removes from a watch list stored whole before operations existed", async () => {
    const userId = "watch-list-stored-whole-user";
    await store.updateAccountSettings(userId, { passGeneration: true, watchedCompanies: ["00000001", "00000002", "00000003"] });

    await Promise.all([store.removeFromWatchedCompanies(userId, "00000001"), store.removeFromWatchedCompanies(userId, "00000003")]);

    expect((await store.getAccountSettings(userId)).watchedCompanies).toEqual(["00000002"]);
  });
});

describe("System: the account's first source on the settings item with local dynalite", () => {
  const first = { utmSource: "newsletter", landedAt: "2026-11-20T09:00:00.000Z" };
  const later = { utmSource: "google", landedAt: "2026-12-01T10:00:00.000Z" };

  it("has no first source until one is recorded, then keeps the first whatever is recorded after it", async () => {
    const userId = "first-source-user";
    expect(await store.getFirstAccountSource(userId)).toBeUndefined();

    expect(await store.recordFirstAccountSource(userId, first)).toEqual(first);
    expect(await store.recordFirstAccountSource(userId, later)).toEqual(first);
    expect(await store.getFirstAccountSource(userId)).toEqual(first);
  });

  it("keeps one of many sources recorded at once", async () => {
    const userId = "first-source-at-once-user";
    const sources = Array.from({ length: 8 }, (_, index) => ({ utmSource: `source-${index}` }));
    const stored = await Promise.all(sources.map((source) => store.recordFirstAccountSource(userId, source)));
    expect(new Set(stored.map((source) => source.utmSource)).size).toBe(1);
    expect(await store.getFirstAccountSource(userId)).toEqual(stored[0]);
  });

  it("leaves the settings and the bundles as they were", async () => {
    const userId = "first-source-with-settings-user";
    await store.updateAccountSettings(userId, { passGeneration: true });
    await store.addToWatchedCompanies(userId, "00000001", 50);

    await store.recordFirstAccountSource(userId, first);

    expect(await store.getAccountSettings(userId)).toEqual({ passGeneration: true, watchedCompanies: ["00000001"] });
    expect(await store.getUserBundles(userId)).toEqual([]);
    await store.updateAccountSettings(userId, { passGeneration: false });
    expect(await store.getFirstAccountSource(userId)).toEqual(first);
  });
});

describe("System: the time the record of first sources began with local dynalite", () => {
  it("keeps the time of the first call, whatever time a later call gives, and shows in no account's bundles or settings", async () => {
    const calls = await Promise.all(
      ["2026-11-22T10:00:00.000Z", "2026-11-22T10:00:01.000Z", "2026-11-22T10:00:02.000Z"].map((now) => store.beginFirstSourceRecord(now)),
    );
    expect(new Set(calls.map((call) => call.beganAt)).size).toBe(1);
    expect(calls.filter((call) => call.begunNow)).toHaveLength(1);

    const later = await store.beginFirstSourceRecord("2027-01-01T00:00:00.000Z");
    expect(later).toEqual({ beganAt: calls[0].beganAt, begunNow: false });
    expect(await store.getUserBundles("#all-accounts")).toEqual([]);
    expect(await store.getFirstAccountSource("first-source-user")).not.toHaveProperty("firstSourceRecordBeganAt");
  });
});
