// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcTokenPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import { FakeCodesEntryTable } from "@app/test-helpers/fakeCodesEntryTable.js";

const table = new FakeCodesEntryTable();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (builder) => table.execute(builder),
  getResourceName: () => "test-mcp-sessions",
}));
vi.mock("@app/data/dynamoDbHmrcApiRequestRepository.js", () => ({ putHmrcApiRequest: vi.fn() }));

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
const { openGrantFor, GRANT_ID_PATTERN } = await import("@app/lib/mcpHmrcGrantAccess.js");

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("hmrcTokenPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    process.env.MCP_OAUTH_BLOB_KEY = "test-mcp-oauth-blob-key-0123456789abcdef";
    table.items.clear();
    mockSend.mockClear();
  });

  function stubHmrcExchange(body) {
    const originalFetch = global.fetch;
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    return () => {
      global.fetch = originalFetch;
    };
  }

  test("answers a grant id and withholds every HMRC token", async () => {
    const restore = stubHmrcExchange({
      access_token: "hmrc-access-secret",
      refresh_token: "hmrc-refresh-secret",
      id_token: "hmrc-id-secret",
      token_type: "bearer",
      expires_in: 14400,
      scope: "read:vat write:vat",
    });
    try {
      const response = await hmrcTokenPostHandler(buildLambdaEvent({ method: "POST", body: { code: "test-code" } }));

      expect(response.statusCode).toBe(200);
      const body = parseResponseBody(response);
      expect(body).not.toHaveProperty("refreshToken");
      expect(body).not.toHaveProperty("hmrcAccessToken");
      expect(body).not.toHaveProperty("idToken");
      expect(response.body).not.toContain("hmrc-access-secret");
      expect(response.body).not.toContain("hmrc-refresh-secret");
      expect(body.accessToken).toMatch(GRANT_ID_PATTERN);
      expect(body).toMatchObject({
        accessToken: body.hmrcGrantId,
        expiresIn: 14400,
        tokenType: "bearer",
        scope: "read:vat write:vat",
        hmrcAccount: "live",
      });
      expect(Object.keys(body).sort()).toEqual(
        expect.arrayContaining(["accessToken", "expiresIn", "hmrcAccount", "hmrcGrantId", "scope", "tokenType"]),
      );
    } finally {
      restore();
    }
  });

  test("seals the tokens in a web grant for the caller that only the same user opens", async () => {
    const restore = stubHmrcExchange({
      access_token: "hmrc-access-secret",
      refresh_token: "hmrc-refresh-secret",
      expires_in: 14400,
      scope: "read:vat",
    });
    try {
      const response = await hmrcTokenPostHandler(
        buildLambdaEvent({ method: "POST", body: { code: "test-code" }, headers: { hmrcaccount: "synthetic" } }),
      );
      const { hmrcGrantId } = parseResponseBody(response);

      const stored = table.items.get(`hmrc-grant:${hmrcGrantId}`);
      expect(stored).toMatchObject({
        hashedSub: hashSub("test-sub"),
        hmrcAccount: "synthetic",
        scope: "read:vat",
        state: "granted",
        origin: "web",
      });
      expect(JSON.stringify(stored)).not.toContain("hmrc-access-secret");
      expect(JSON.stringify(stored)).not.toContain("hmrc-refresh-secret");
      expect(JSON.stringify(stored)).not.toContain('test-sub"');

      const opened = await openGrantFor(hmrcGrantId, "test-sub");
      expect(opened).toMatchObject({ status: "granted", accessToken: "hmrc-access-secret", hmrcAccount: "synthetic" });
      expect((await openGrantFor(hmrcGrantId, "another-sub")).status).toBe("forbidden");
    } finally {
      restore();
    }
  });

  test("writes no grant when HMRC rejects the code", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "Content-Type": "application/json" } }),
      );
    try {
      const response = await hmrcTokenPostHandler(buildLambdaEvent({ method: "POST", body: { code: "test-code" } }));
      expect(response.statusCode).toBe(400);
      expect([...table.items.keys()].filter((key) => String(key).startsWith("hmrc-grant:"))).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
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

  test("returns 401 and exchanges nothing when no authorizer context is present", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn();
    try {
      const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" }, authorizer: {} });
      const response = await hmrcTokenPostHandler(event);

      expect(response.statusCode).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("ignores an x-user-sub header and returns 401 without authorizer context", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { code: "test-code" },
      headers: { "x-user-sub": "header-sub" },
      authorizer: {},
    });
    const response = await hmrcTokenPostHandler(event);

    expect(response.statusCode).toBe(401);
  });
});
