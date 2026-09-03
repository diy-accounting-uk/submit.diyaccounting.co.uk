// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/bundlePost.system.test.js

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, makeIdToken } from "@app/test-helpers/eventBuilders.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let stopDynalite;
const bundlesTableName = "sys-bundlepost-bundles";
const passesTableName = "sys-bundlepost-passes";

describe("System: account/bundlePost high-level behaviours", () => {
  beforeAll(async () => {
    const { ensureBundleTableExists, ensurePassesTableExists, startDynamoDB } = await import("@app/bin/dynamodb.js");
    process.env.DYNAMODB_PORT = "0"; // random free port to avoid conflicts
    const { endpoint, stop } = await startDynamoDB();
    stopDynalite = stop;

    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTableName;
    process.env.PASSES_DYNAMODB_TABLE_NAME = passesTableName;

    await ensureBundleTableExists(bundlesTableName, endpoint);
    await ensurePassesTableExists(passesTableName, endpoint);
  });

  afterAll(async () => {
    try {
      await stopDynalite?.();
    } catch {}
  });

  beforeEach(async () => {
    vi.resetAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const event = buildLambdaEvent({ method: "POST", path: "/api/v1/bundle", body: { bundleId: "guest" } });
    // Remove Authorization header entirely
    delete event.headers.Authorization;
    delete event.headers.authorization;
    const res = await ingestHandler(event);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("test-sub");
    const event = buildLambdaEvent({ method: "POST", path: "/api/v1/bundle", headers: { Authorization: `Bearer ${token}` } });
    // Force invalid JSON
    event.body = "{not-json";
    const res = await ingestHandler(event);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/Invalid JSON/i);
  });

  it("returns 400 when bundleId is missing", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("test-sub");
    const event = buildLambdaEvent({ method: "POST", path: "/api/v1/bundle", headers: { Authorization: `Bearer ${token}` }, body: {} });
    const res = await ingestHandler(event);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/Missing bundleId/i);
  });

  it("refuses a direct re-request of an active on-request bundle the user already holds (already_granted)", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const { updateUserBundles } = await import("@app/services/bundleManagement.js");
    const token = makeIdToken("test-sub");
    const expiry = new Date(Date.now() + 3600_000).toISOString();
    await updateUserBundles("test-sub", [{ bundleId: "day-guest", expiry }]);
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
      body: { bundleId: "day-guest" },
    });
    const res = await ingestHandler(event);
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("already_granted");
    expect(body.error).toBe("already_granted");
  });

  it("re-grants an active on-request bundle with fresh tokens when redeemed via a pass", async () => {
    const { ingestHandler: passAdminPostHandler } = await import("@app/functions/account/passAdminPost.js");
    const { ingestHandler: passPostHandler } = await import("@app/functions/account/passPost.js");
    const { updateUserBundles } = await import("@app/services/bundleManagement.js");
    const { getUserBundles } = await import("@app/data/dynamoDbBundleRepository.js");

    const sub = "pass-redeem-sub";
    const expiry = new Date(Date.now() + 3600_000).toISOString();
    await updateUserBundles(sub, [{ bundleId: "day-guest", expiry, tokensGranted: 3, tokensConsumed: 2 }]);

    const adminEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/pass/admin",
      body: { passTypeId: "day-guest-test-pass", bundleId: "day-guest", validityPeriod: "P7D", maxUses: 1, createdBy: "system-test" },
    });
    const adminRes = await passAdminPostHandler(adminEvent);
    expect(adminRes.statusCode).toBe(200);
    const { code } = JSON.parse(adminRes.body);

    const token = makeIdToken(sub);
    const redeemEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/pass",
      headers: { Authorization: `Bearer ${token}` },
      body: { code },
    });
    const redeemRes = await passPostHandler(redeemEvent);
    expect(redeemRes.statusCode).toBe(200);
    const redeemBody = JSON.parse(redeemRes.body);
    expect(redeemBody.redeemed).toBe(true);
    expect(redeemBody.grantStatus).toBe("granted");

    const bundlesAfter = await getUserBundles(sub);
    const dayGuest = bundlesAfter.find((b) => b.bundleId === "day-guest");
    expect(dayGuest.tokensConsumed).toBe(0);
  });

  it("returns 400 unknown_qualifier when unexpected qualifier is provided", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("qual-user");
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
      body: { bundleId: "day-guest", qualifiers: { foo: "bar" } },
    });
    const res = await ingestHandler(event);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("unknown_qualifier");
  });

  it("grants an automatic bundle when user does not already have it (fresh user)", async () => {
    const { ingestHandler } = await import("@app/functions/account/bundlePost.js");
    const token = makeIdToken("grant-user");
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/bundle",
      headers: { Authorization: `Bearer ${token}` },
      body: { bundleId: "day-guest" },
    });
    const res = await ingestHandler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
  });
});
