// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/asyncRequestPersistence.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, makeIdToken, buildAuthorizerContext } from "@app/test-helpers/eventBuilders.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
const asyncRequestsTableName = "sys-test-async-requests";
const bundlesTableName = "sys-test-bundles-async";

describe("System: async request persistence with dynalite", () => {
  beforeAll(async () => {
    const { ensureAsyncRequestsTableExists, ensureBundleTableExists, startDynamoDB } = await import("@app/bin/dynamodb.js");

    // Use a random free port to avoid collisions with other suites
    process.env.DYNAMODB_PORT = "0";

    const { endpoint, stop } = await startDynamoDB();
    stopDynalite = stop;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME = asyncRequestsTableName;
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTableName;

    // Initialize the salt for hashing user subs (already set in .env.test)
    const { initializeSalt } = await import("@app/services/subHasher.js");
    await initializeSalt();

    await ensureAsyncRequestsTableExists(asyncRequestsTableName, endpoint);
    await ensureBundleTableExists(bundlesTableName, endpoint);
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(async () => {
    // Seed bundles: grant 'guest' to test-async-user
    const { updateUserBundles } = await import("@app/services/bundleManagement.js");
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await updateUserBundles("test-async-user", [{ bundleId: "guest", expiry }]);
  });

  it("stores pending request state for async processing", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("test-async-user");
    const requestId = "async-test-request-1";

    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      requestId: requestId,
      authorizer: buildAuthorizerContext("test-async-user"),
      body: { bundleId: "day-guest" },
      headers: {
        "Authorization": `Bearer ${token}`,
        "x-request-id": requestId,
        "x-wait-time-ms": "50", // Very short wait to trigger async processing
      },
    });

    const res = await ingestHandler(event);

    // Should return 202 for async processing, or 201 if it completed very quickly
    expect([201, 202]).toContain(res.statusCode);

    if (res.statusCode === 202) {
      const body = JSON.parse(res.body);
      expect(body.message).toBe("Request accepted for processing");
    } else {
      const body = JSON.parse(res.body);
      expect(body.status).toBeDefined();
    }

    // Verify request was stored in DynamoDB
    const { getAsyncRequest } = await import("@app/data/dynamoDbAsyncRequestRepository.js");
    const storedRequest = await getAsyncRequest("test-async-user", requestId);
    expect(storedRequest).not.toBeNull();
    expect(["processing", "pending", "completed"]).toContain(storedRequest.status);
  });

  it("retrieves completed request from persistence after waiting", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("test-async-user");
    const requestId = "async-test-request-2";

    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      requestId: requestId,
      authorizer: buildAuthorizerContext("test-async-user"),
      body: { bundleId: "day-guest" },
      headers: {
        "Authorization": `Bearer ${token}`,
        "x-request-id": requestId,
        "x-wait-time-ms": "2000", // Wait 2 seconds to allow async completion
      },
    });

    const res = await ingestHandler(event);

    // Should either return 201 with success or 202 if still processing
    expect([201, 202]).toContain(res.statusCode);

    if (res.statusCode === 201) {
      const body = JSON.parse(res.body);
      expect(body.status).toBeDefined();
    }

    // Verify request was stored in DynamoDB
    const { getAsyncRequest } = await import("@app/data/dynamoDbAsyncRequestRepository.js");
    const storedRequest = await getAsyncRequest("test-async-user", requestId);
    expect(storedRequest).not.toBeNull();
  });

  it("returns synchronous response when wait time header is large", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("test-async-user");
    const requestId = "sync-test-request-1";

    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      requestId: requestId,
      authorizer: buildAuthorizerContext("test-async-user"),
      body: { bundleId: "day-guest" },
      headers: {
        "Authorization": `Bearer ${token}`,
        "x-request-id": requestId,
        "x-wait-time-ms": "30000", // Large wait time to trigger synchronous processing
      },
    });

    const res = await ingestHandler(event);

    // Should return 201 immediately for synchronous processing
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBeDefined();
  });

  it("stores completed bundle grant in async request state", async () => {
    const { grantBundle } = await import("@app/functions/account/bundlePost.js");
    const requestId = "retrieve-test-request-1";

    // Call grantBundle directly with requestId
    const decodedToken = { sub: "test-async-user" };
    const result = await grantBundle("test-async-user", { bundleId: "day-guest" }, decodedToken, requestId);
    expect(result.statusCode).toBe(201);

    // Verify the result was stored
    const { getAsyncRequest } = await import("@app/data/dynamoDbAsyncRequestRepository.js");
    const storedRequest = await getAsyncRequest("test-async-user", requestId);
    expect(storedRequest).not.toBeNull();
    expect(storedRequest.status).toBe("completed");
    expect(storedRequest.data).toHaveProperty("status");
  });

  it("handles missing async requests table gracefully", async () => {
    // Temporarily disable the async requests table
    const originalTableName = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
    delete process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;

    try {
      const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
      const token = makeIdToken("test-async-user");

      const event = buildLambdaEvent({
        method: "POST",
        path: "/api/v1/bundle",
        body: { bundleId: "day-guest" },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await ingestHandler(event);

      // Should still work without async table (synchronous mode)
      expect(res.statusCode).toBe(201);
    } finally {
      // Restore the table name
      process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME = originalTableName;
    }
  });
});
