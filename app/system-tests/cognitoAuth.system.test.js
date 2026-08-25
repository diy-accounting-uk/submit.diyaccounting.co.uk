// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/cognitoAuth.system.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ingestHandler as cognitoTokenPostHandler } from "../functions/auth/cognitoTokenPost.js";
import { buildLambdaEvent, buildHeadEvent } from "../test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess } from "../test-helpers/mockHelpers.js";

// Avoid DynamoDB side-effects from token exchange auditing
vi.mock("../data/dynamoDbHmrcApiRequestRepository.js", () => ({
  putHmrcApiRequest: vi.fn().mockResolvedValue(undefined),
}));

describe("System: Cognito token exchange", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(process.env, setupTestEnv());
  });

  it("should return 400 when grant_type is missing on token exchange", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/cognito/token",
    });

    event.body = Buffer.from("").toString("base64");

    const res = await cognitoTokenPostHandler(event);

    expect(res.statusCode).toBe(400);

    const body = parseResponseBody(res);
    expect(body.message).toMatch(/Missing grant_type/i);
  });

  it("should validate missing code for authorization_code grant", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/cognito/token",
    });

    const form = new URLSearchParams({
      grant_type: "authorization_code",
    }).toString();

    event.body = Buffer.from(form).toString("base64");

    const res = await cognitoTokenPostHandler(event);

    expect(res.statusCode).toBe(400);

    const body = parseResponseBody(res);
    expect(body.message).toMatch(/Missing code/i);
  });

  it("should exchange authorization_code for tokens", async () => {
    const mockFetch = setupFetchMock();

    mockHmrcSuccess(mockFetch, {
      access_token: "access-123",
      id_token: "id-456",
      refresh_token: "ref-789",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/cognito/token",
    });

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: "auth-code-123",
    }).toString();

    event.body = Buffer.from(form).toString("base64");

    const res = await cognitoTokenPostHandler(event);

    expect(res.statusCode).toBe(200);

    const body = parseResponseBody(res);
    expect(body).toMatchObject({
      accessToken: "access-123",
      hmrcAccessToken: "access-123",
      tokenType: "Bearer",
      expiresIn: 3600,
    });
  });

  it("should exchange refresh_token for new access token", async () => {
    const mockFetch = setupFetchMock();

    mockHmrcSuccess(mockFetch, {
      access_token: "access-456",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/cognito/token",
    });

    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: "refresh-123",
    }).toString();

    event.body = Buffer.from(form).toString("base64");

    const res = await cognitoTokenPostHandler(event);

    expect(res.statusCode).toBe(200);

    const body = parseResponseBody(res);
    expect(body).toMatchObject({
      accessToken: "access-456",
      hmrcAccessToken: "access-456",
      tokenType: "Bearer",
      expiresIn: 3600,
    });
  });

  it("should return 200 for HEAD on token endpoint", async () => {
    const event = buildHeadEvent({ path: "/api/v1/cognito/token" });
    const res = await cognitoTokenPostHandler(event);
    expect(res.statusCode).toBe(200);
  });
});
