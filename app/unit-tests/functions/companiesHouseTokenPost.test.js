// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/companiesHouseTokenPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, setupFetchMock, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

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

const { ingestHandler: companiesHouseTokenPostHandler } = await import("@app/functions/companies-house/companiesHouseTokenPost.js");
const { hashSub } = await import("@app/services/subHasher.js");

dotenvConfigIfNotBlank({ path: ".env.test" });

function fakeHeaders(headers) {
  return {
    forEach: (callback) => {
      Object.entries(headers).forEach(([key, value]) => callback(value, key));
    },
  };
}

describe("companiesHouseTokenPost ingestHandler", () => {
  let mockFetch;

  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_IDENTITY_BASE_URI: "https://identity-sandbox.company-information.service.gov.uk",
        COMPANIES_HOUSE_CLIENT_ID: "test-companies-house-client-id",
        COMPANIES_HOUSE_CLIENT_SECRET: "test-companies-house-client-secret",
      }),
    );
    delete process.env.COMPANIES_HOUSE_CLIENT_SECRET_ARN;
    mockFetch = setupFetchMock();
    mockSend.mockClear();
  });

  test("HEAD request returns 200", async () => {
    const event = buildLambdaEvent({ method: "HEAD", path: "/api/v1/companies-house/token" });
    const response = await companiesHouseTokenPostHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 400 when code is missing", async () => {
    const event = buildLambdaEvent({ method: "POST", body: {} });
    const response = await companiesHouseTokenPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Missing code");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("exchanges the code and maps the response, without the refresh token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: "a-companies-house-access-token",
          refresh_token: "a-companies-house-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope:
            "https://identity.company-information.service.gov.uk/user/profile.read https://api.company-information.service.gov.uk/company/06846849/registered-office-address.update",
        }),
      headers: fakeHeaders({}),
    });

    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    const response = await companiesHouseTokenPostHandler(event);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.accessToken).toBe("a-companies-house-access-token");
    expect(body.expiresIn).toBe(3600);
    expect(body.tokenType).toBe("Bearer");
    expect(body.scope).toContain("registered-office-address.update");
    expect(body.refreshToken).toBeUndefined();
    expect(body.refresh_token).toBeUndefined();
  });

  test("sends the token request as form-urlencoded with the redirect URI and client secret", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: "a-token", expires_in: 3600, token_type: "Bearer", scope: "" }),
      headers: fakeHeaders({}),
    });

    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    await companiesHouseTokenPostHandler(event);

    const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
    expect(requestedUrl).toBe("https://identity-sandbox.company-information.service.gov.uk/oauth2/token");
    expect(requestInit.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(requestInit.body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("test-code");
    expect(params.get("client_id")).toBe("test-companies-house-client-id");
    expect(params.get("client_secret")).toBe("test-companies-house-client-secret");
    expect(params.get("redirect_uri")).toContain("companies-house/filingCallback.html");
  });

  test("returns 400 and Companies House's own error when it answers invalid_grant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "invalid_grant", error_description: "Invalid or expired authorization code" }),
      headers: fakeHeaders({}),
    });

    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    const response = await companiesHouseTokenPostHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toBe("Invalid or expired authorization code");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.event).toBe("companies-house-token-exchange-failed");
    expect(detail.outcome).toBe("failure");
    expect(detail.failure).toBe("invalid_grant");
    expect(detail.companiesHouseStatus).toBe(400);
    expect(JSON.stringify(detail)).not.toContain("Invalid or expired authorization code");
  });

  test("returns 401 and does not raise the 5xx alarm when Companies House rejects the client credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "invalid_client", error_description: "invalid client id or secret" }),
      headers: fakeHeaders({}),
    });

    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    const response = await companiesHouseTokenPostHandler(event);

    expect(response.statusCode).toBe(401);
    const body = parseResponseBody(response);
    expect(body.error).toBe("invalid_client");

    const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.event).toBe("companies-house-token-exchange-failed");
    expect(detail.companiesHouseStatus).toBe(401);
  });

  test("returns 502 naming Companies House as the upstream when it answers with a server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "server_error" }),
      headers: fakeHeaders({}),
    });

    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    const response = await companiesHouseTokenPostHandler(event);

    expect(response.statusCode).toBe(502);
    const body = parseResponseBody(response);
    expect(body.upstream).toBeTruthy();
    expect(body.responseCode).toBe(500);

    const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.event).toBe("companies-house-token-exchange-failed");
    expect(detail.companiesHouseStatus).toBe(500);
  });

  test("returns 502 when the request to Companies House fails at the network level", async () => {
    mockFetch.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND identity-sandbox.company-information.service.gov.uk"));

    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    const response = await companiesHouseTokenPostHandler(event);

    expect(response.statusCode).toBe(502);
    const body = parseResponseBody(response);
    expect(body.upstream).toBeTruthy();

    const detail = JSON.parse(mockSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.event).toBe("companies-house-token-exchange-failed");
    expect(detail.companiesHouseStatus).toBe(502);
  });

  test("publishes the companies-house-token-exchanged event with the hashed sub, never the raw sub", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: "a-token", expires_in: 3600, token_type: "Bearer", scope: "" }),
      headers: fakeHeaders({}),
    });

    const event = buildLambdaEvent({ method: "POST", body: { code: "test-code" } });
    await companiesHouseTokenPostHandler(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const entry = mockSend.mock.calls[0][0].input.Entries[0];
    const rawDetail = entry.Detail;
    expect(rawDetail).not.toContain("test-sub");
    const detail = JSON.parse(rawDetail);
    expect(detail.event).toBe("companies-house-token-exchanged");
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });
});
