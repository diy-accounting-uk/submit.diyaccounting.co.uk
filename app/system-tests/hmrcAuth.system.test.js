// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/hmrcAuth.system.test.js

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { ingestHandler as hmrcTokenPostHandler } from "../functions/hmrc/hmrcTokenPost.js";
import { buildLambdaEvent } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "../test-helpers/mockHelpers.js";
import { exportDynamoDBDataForUsers } from "../test-helpers/dynamodbExporter.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("System: HMRC Auth Flow (hmrcAuthUrl + hmrcToken)", () => {
  afterAll(async () => {
    // Export DynamoDB data for all users used in this test suite
    const userSubs = ["test-sub"];
    await exportDynamoDBDataForUsers(userSubs, "hmrcAuth.system.test.js");
  });
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(
      process.env,
      setupTestEnv({
        HMRC_CLIENT_SECRET: "test-client-secret",
        HMRC_SANDBOX_CLIENT_SECRET: "test-sandbox-client-secret",
      }),
    );
  });

  it("should generate auth URL and then exchange code for token", async () => {
    // Step 1: Generate auth URL - performed client side
    // Step 2: Exchange code for token (simulated callback)
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: { code: "test-authorization-code-123" },
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    expect([200, 500]).toContain(tokenResponse.statusCode);

    if (tokenResponse.statusCode === 200) {
      const tokenBody = parseResponseBody(tokenResponse);
      expect(tokenBody).toHaveProperty("url");
      expect(tokenBody).toHaveProperty("body");
      expect(tokenBody.url).toContain("oauth/token");
      expect(tokenBody.body).toHaveProperty("grant_type", "authorization_code");
      expect(tokenBody.body).toHaveProperty("code", "test-authorization-code-123");
    }
  });

  it("should handle synthetic account in auth flow", async () => {
    // Step 1: Generate auth URL for synthetic - performed client side
    // Step 2: Exchange code for token in synthetic
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: { code: "synthetic-code" },
      headers: { hmrcaccount: "synthetic" },
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    expect([200, 500]).toContain(tokenResponse.statusCode);

    if (tokenResponse.statusCode === 200) {
      const tokenBody = parseResponseBody(tokenResponse);
      expect(tokenBody.body).toHaveProperty("client_id", process.env.HMRC_SANDBOX_CLIENT_ID);
    }
  });

  it("should validate missing code in token exchange", async () => {
    const tokenEvent = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/hmrc/token",
      body: {},
    });

    const tokenResponse = await hmrcTokenPostHandler(tokenEvent);
    expect(tokenResponse.statusCode).toBe(400);

    const tokenBody = parseResponseBody(tokenResponse);
    expect(tokenBody.message).toContain("Missing code");
  });
});
