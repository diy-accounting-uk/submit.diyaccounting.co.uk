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
    // A fake code against the real HMRC sandbox is rejected, never a 500: HMRC's own
    // reply decides between a 4xx (rejected) and a 502 (HMRC/network unreachable).
    expect([200, 400, 401, 502]).toContain(response.statusCode);
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
    expect([200, 400, 401, 502]).toContain(response.statusCode);
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

  test("returns the granted scope unchanged, so a self-assessment grant reaches the browser", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "not-a-real-token",
          token_type: "bearer",
          expires_in: 14400,
          scope: "read:self-assessment",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    try {
      const event = buildLambdaEvent({
        method: "POST",
        body: { code: "test-code" },
        headers: { hmrcaccount: "synthetic" },
      });
      const response = await hmrcTokenPostHandler(event);

      expect(response.statusCode).toBe(200);
      expect(parseResponseBody(response).scope).toBe("read:self-assessment");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("publishes the hmrc-token-exchanged event with the hashed sub, never the raw sub, once HMRC confirms success", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "not-a-real-token", token_type: "bearer", expires_in: 14400 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
      await hmrcTokenPostHandler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const entry = mockSend.mock.calls[0][0].input.Entries[0];
      const rawDetail = entry.Detail;
      expect(rawDetail).not.toContain("test-sub");
      const detail = JSON.parse(rawDetail);
      expect(detail.event).toBe("hmrc-token-exchanged");
      expect(detail.hashedSub).toBe(hashSub("test-sub"));
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("publishes hmrc-token-exchange-failed with HMRC's status and error code, never the description, on a 400 invalid_grant", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid or expired authorization code" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
      const response = await hmrcTokenPostHandler(event);

      expect(response.statusCode).toBe(400);
      const responseBody = parseResponseBody(response);
      expect(responseBody.error).toBe("invalid_grant");
      expect(responseBody.error_description).toBe("Invalid or expired authorization code");

      expect(mockSend).toHaveBeenCalledTimes(1);
      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.event).toBe("hmrc-token-exchange-failed");
      expect(detail.outcome).toBe("failure");
      expect(detail.failure).toBe("invalid_grant");
      expect(detail.hmrcStatus).toBe(400);
      expect(JSON.stringify(detail)).not.toContain("Invalid or expired authorization code");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("returns 401 and does not raise the 5xx alarm when HMRC rejects the client credentials", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_client", error_description: "invalid client id or secret" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
      const response = await hmrcTokenPostHandler(event);

      expect(response.statusCode).toBe(401);
      const responseBody = parseResponseBody(response);
      expect(responseBody.error).toBe("invalid_client");

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.event).toBe("hmrc-token-exchange-failed");
      expect(detail.hmrcStatus).toBe(401);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("returns 502 naming HMRC as the upstream when HMRC answers with a server error", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "server_error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
      const response = await hmrcTokenPostHandler(event);

      expect(response.statusCode).toBe(502);
      const responseBody = parseResponseBody(response);
      expect(responseBody.upstream).toBeTruthy();
      expect(responseBody.responseCode).toBe(500);

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.event).toBe("hmrc-token-exchange-failed");
      expect(detail.hmrcStatus).toBe(500);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("returns 502 when the request to HMRC fails at the network level", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND test-api.service.hmrc.gov.uk"));

    try {
      const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
      const response = await hmrcTokenPostHandler(event);

      expect(response.statusCode).toBe(502);
      const responseBody = parseResponseBody(response);
      expect(responseBody.upstream).toBeTruthy();

      const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
      expect(detail.event).toBe("hmrc-token-exchange-failed");
    } finally {
      global.fetch = originalFetch;
    }
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
