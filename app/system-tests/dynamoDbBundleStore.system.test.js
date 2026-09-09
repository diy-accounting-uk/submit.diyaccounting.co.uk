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
