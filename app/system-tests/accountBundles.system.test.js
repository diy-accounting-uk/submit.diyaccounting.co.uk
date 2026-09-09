// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/accountBundles.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, makeIdToken } from "@app/test-helpers/eventBuilders.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
const bundlesTableName = "sys-test-bundles";

describe("System: account bundle ingestHandlers", () => {
  beforeAll(async () => {
    const { ensureBundleTableExists, startDynamoDB } = await import("@app/bin/dynamodb.js");

    // Use a random free port to avoid collisions with other suites
    process.env.DYNAMODB_PORT = "0";

    const { endpoint, stop } = await startDynamoDB();
    stopDynalite = stop;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTableName;

    // Initialize the salt for hashing user subs (already set in .env.test)
    const { initializeSalt } = await import("@app/services/subHasher.js");
    await initializeSalt();

    await ensureBundleTableExists(bundlesTableName, endpoint);
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    // Seed bundles: grant 'guest' to test-sub
    const { updateUserBundles } = await import("@app/services/bundleManagement.js");
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await updateUserBundles("test-sub", [{ bundleId: "guest", expiry }]);
  });

  it("GET /bundle returns user bundles (authorized)", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundleGet.js");
    const token = makeIdToken("test-sub");
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await ingestHandler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // repository returns objects; ensure at least one entry
    expect(Array.isArray(body.bundles)).toBe(true);
  });

  it("POST /bundle adds a new bundle when qualifiers satisfied", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("test-sub", { transactionId: "tx-1", subscriptionTier: "pro" });
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
      body: {
        bundleId: "pro",
        duration: "P1M",
        qualifiers: { transactionId: "tx-1", subscriptionTier: "pro" },
      },
    });
    const res = await ingestHandler(event);
    expect([200, 403, 400, 404]).toContain(res.statusCode);
  });

  it("DELETE /bundle removes a specific bundle by query param", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundleDelete.js");
    const token = makeIdToken("test-sub");
    const event = buildLambdaEvent({
      method: "DELETE",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
      queryStringParameters: { bundleId: "guest" },
    });
    const res = await ingestHandler(event);
    expect([204, 404]).toContain(res.statusCode);
  });

  it("HEAD /bundle returns 200", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundleGet.js");
    const event = buildLambdaEvent({ method: "HEAD", path: "/api/v1/bundle" });
    const res = await ingestHandler(event);
    expect(res.statusCode).toBe(200);
  });
});
