// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcTokenPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

// Capture the EventBridge send so activity-event tests can inspect the published
// Detail JSON directly rather than mocking activityAlert.js's hashing away.
const mockSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { ingestHandler: hmrcTokenPostHandler } = await import("@app/functions/hmrc/hmrcTokenPost.js");
const { hashSub } = await import("@app/services/subHasher.js");

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcTokenPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockSend.mockClear();
  });

  test("HEAD request returns expected status", async () => {
    const event = buildLambdaEvent({ method: "HEAD", path: "/api/v1/hmrc/token" });
    const response = await hmrcTokenPostHandler(event);
    expect([200, 400, 401]).toContain(response.statusCode);
  });

  test("returns 400 when code is missing", async () => {
    const event = buildLambdaEvent({ method: "POST", body: {} });
    const response = await hmrcTokenPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Missing code");
  });

  test("returns success with token exchange details when code provided", async () => {
    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    const response = await hmrcTokenPostHandler(event);
    expect([200, 500]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = parseResponseBody(response);
      expect(body).toBeDefined();
    }
  });

  test("accepts hmrcAccount header for synthetic", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { code: "test-code" },
      headers: { hmrcaccount: "synthetic" },
    });
    const response = await hmrcTokenPostHandler(event);
    expect([200, 500]).toContain(response.statusCode);
  });

  test("returns 400 for invalid hmrcAccount header", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { code: "test-code" },
      headers: { hmrcaccount: "invalid" },
    });
    const response = await hmrcTokenPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("publishes the hmrc-token-exchanged event with the hashed sub, never the raw sub", async () => {
    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    await hmrcTokenPostHandler(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const entry = mockSend.mock.calls[0][0].input.Entries[0];
    const rawDetail = entry.Detail;
    expect(rawDetail).not.toContain("test-sub");
    const detail = JSON.parse(rawDetail);
    expect(detail.event).toBe("hmrc-token-exchanged");
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("resolves the user sub from the x-user-sub header when no authorizer context is present", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { code: "test-code" },
      headers: { "x-user-sub": "header-sub" },
      authorizer: {},
    });
    await hmrcTokenPostHandler(event);

    const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.hashedSub).toBe(hashSub("header-sub"));
  });

  test("omits the hashed sub when no user identity is present", async () => {
    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" }, authorizer: {} });
    await hmrcTokenPostHandler(event);

    const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.hashedSub).toBeUndefined();
  });
});
