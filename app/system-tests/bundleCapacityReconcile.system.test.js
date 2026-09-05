// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// System tests for the bundle capacity reconciliation Lambda against a local
// dynalite table carrying the bundleId-expiry-index GSI, so the query path
// (rather than a mocked repository) is exercised end to end.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

let stopDynalite;
let bundleRepository;
let capacityRepository;
let reconcileHandler;

const tableName = "bundles-system-test-reconcile";
const capacityTableName = "bundle-capacity-system-test-reconcile";

beforeAll(async () => {
  const { ensureBundleTableExists, ensureCapacityTableExists } = await import("../bin/dynamodb.js");
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

  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = tableName;
  process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME = capacityTableName;
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-reconcile-tests"}}';

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  await ensureBundleTableExists(tableName, endpoint);
  await ensureCapacityTableExists(capacityTableName, endpoint);

  bundleRepository = await import("../data/dynamoDbBundleRepository.js");
  capacityRepository = await import("../data/dynamoDbCapacityRepository.js");
  ({ handler: reconcileHandler } = await import("../functions/account/bundleCapacityReconcile.js"));
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {}
});

describe("System: bundle capacity reconciliation via bundleId-expiry-index", () => {
  it("reads a counter of 0 for a capped bundle with no allocations", async () => {
    await reconcileHandler({});

    const counter = await capacityRepository.getCounter("day-guest");
    expect(counter.activeCount).toBe(0);
  });

  it("counts only the allocations whose expiry has not yet passed", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (let i = 0; i < 5; i++) {
      await bundleRepository.putBundleByHashedSub(`reconcile-future-${i}`, { bundleId: "day-guest", expiry: future });
    }
    for (let i = 0; i < 3; i++) {
      await bundleRepository.putBundleByHashedSub(`reconcile-past-${i}`, { bundleId: "day-guest", expiry: past });
    }

    await reconcileHandler({});

    const counter = await capacityRepository.getCounter("day-guest");
    expect(counter.activeCount).toBe(5);
  });

  it("stays sparse: a bundle item with no expiry never enters the count", async () => {
    await bundleRepository.putBundleByHashedSub("reconcile-no-expiry", { bundleId: "day-guest" });

    await reconcileHandler({});

    const counter = await capacityRepository.getCounter("day-guest");
    expect(counter.activeCount).toBe(5);
  });
});
