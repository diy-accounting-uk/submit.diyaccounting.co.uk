// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/mcpHmrcGrantAccess.test.js
// Opening an HMRC grant: ownership, account, refresh near expiry, and what a refresh that races
// or fails does to the grant, over an in-memory table with HMRC's token endpoint stubbed.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { FakeCodesEntryTable } from "@app/test-helpers/fakeCodesEntryTable.js";
import { _setTestSalt, hashSub } from "@app/services/subHasher.js";
import { resetSecretCache } from "@app/lib/cachedSecret.js";
import { sealFor, HMRC_GRANT_PURPOSE } from "@app/lib/codesSeal.js";

const table = new FakeCodesEntryTable();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (builder) => table.execute(builder),
  getResourceName: () => "test-mcp-sessions",
}));
vi.mock("@app/data/dynamoDbHmrcApiRequestRepository.js", () => ({ putHmrcApiRequest: vi.fn() }));
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { createGrantedHmrcGrant } = await import("@app/data/dynamoDbHmrcGrantRepository.js");
const { openGrantFor, grantAccessTokenFromEvent, grantIdFromEvent, resolveBodyAccessToken, HMRC_GRANT_NOT_USABLE, GRANT_ID_PATTERN } =
  await import("@app/lib/mcpHmrcGrantAccess.js");
const { extractHmrcAccessTokenFromLambdaEvent, validateHmrcAccessToken, UnauthorizedTokenError } = await import("@app/services/hmrcApi.js");

const SUB = "user-sub-1";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function tokenResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function storeGrant({ accessExpiresIn = 14400, hmrcAccount = "live", sub = SUB } = {}) {
  const { grantId } = await createGrantedHmrcGrant({
    hashedSub: hashSub(sub),
    hmrcAccount,
    scope: "read:vat write:vat",
    accessExpiresAt: nowSeconds() + accessExpiresIn,
    seal: (id) => sealFor(HMRC_GRANT_PURPOSE, { accessToken: "access-1", refreshToken: "refresh-1" }, id),
  });
  return grantId;
}

function eventFor(headers, sub = SUB) {
  return buildLambdaEvent({ headers, authorizer: { authorizer: { jwt: { claims: { sub } } } } });
}

let tokenEndpoint;
let usedRefreshTokens;

describe("mcpHmrcGrantAccess", () => {
  beforeEach(() => {
    table.items.clear();
    usedRefreshTokens = new Set();
    process.env.MCP_SESSIONS_DYNAMODB_TABLE_NAME = "test-mcp-sessions";
    process.env.HMRC_BASE_URI = "https://api.service.hmrc.example";
    process.env.HMRC_CLIENT_ID = "live-client";
    process.env.HMRC_CLIENT_SECRET = "live-secret";
    process.env.HMRC_SANDBOX_BASE_URI = "https://test-api.service.hmrc.example";
    process.env.HMRC_SANDBOX_CLIENT_ID = "sandbox-client";
    process.env.HMRC_SANDBOX_CLIENT_SECRET = "sandbox-secret";
    process.env.MCP_OAUTH_BLOB_KEY = "test-mcp-oauth-blob-key-0123456789abcdef";
    resetSecretCache();
    _setTestSalt("test-salt-for-unit-tests");
    // HMRC accepts a refresh token once.
    tokenEndpoint = vi.fn(async (_url, init) => {
      const refreshToken = new URLSearchParams(init.body).get("refresh_token");
      if (usedRefreshTokens.has(refreshToken)) return tokenResponse(400, { error: "invalid_grant" });
      usedRefreshTokens.add(refreshToken);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return tokenResponse(200, { access_token: "access-2", refresh_token: "refresh-2", expires_in: 14400 });
    });
    vi.stubGlobal("fetch", (url, init) => tokenEndpoint(url, init));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("opening a grant", () => {
    test("answers the token of a grant far from expiry without calling HMRC", async () => {
      const grantId = await storeGrant();
      expect(await openGrantFor(grantId, SUB)).toMatchObject({ status: "granted", accessToken: "access-1", origin: "web" });
      expect(tokenEndpoint).not.toHaveBeenCalled();
    });

    test("refuses another user's grant and reports an unknown one as missing", async () => {
      const grantId = await storeGrant();
      expect(await openGrantFor(grantId, "user-sub-2")).toEqual({ status: "forbidden" });
      expect(await openGrantFor("99999999-2222-4333-8444-555555555555", SUB)).toEqual({ status: "missing" });
    });

    test("refreshes inside the 30 minute margin and releases the refresh claim", async () => {
      const grantId = await storeGrant({ accessExpiresIn: 600 });
      expect(await openGrantFor(grantId, SUB)).toMatchObject({ status: "granted", accessToken: "access-2" });
      expect(table.items.get(`hmrc-grant:${grantId}`).refreshingUntil).toBeUndefined();
      expect(await openGrantFor(grantId, SUB)).toMatchObject({ accessToken: "access-2" });
      expect(tokenEndpoint).toHaveBeenCalledTimes(1);
    });

    test("does not extend the grant's own 24 hours when it refreshes", async () => {
      const grantId = await storeGrant({ accessExpiresIn: 600 });
      const before = table.items.get(`hmrc-grant:${grantId}`).ttl;
      await openGrantFor(grantId, SUB);
      expect(table.items.get(`hmrc-grant:${grantId}`).ttl).toBe(before);
    });

    test("sends one refresh to HMRC when two callers open a grant near expiry together", async () => {
      const grantId = await storeGrant({ accessExpiresIn: 600 });
      const [first, second] = await Promise.all([openGrantFor(grantId, SUB), openGrantFor(grantId, SUB)]);
      expect(tokenEndpoint).toHaveBeenCalledTimes(1);
      expect(first.status).toBe("granted");
      expect(second.status).toBe("granted");
      expect(table.items.has(`hmrc-grant:${grantId}`)).toBe(true);
    });

    test("makes a caller wait for the refresh when the access token has already expired", async () => {
      const grantId = await storeGrant({ accessExpiresIn: -5 });
      const [first, second] = await Promise.all([openGrantFor(grantId, SUB), openGrantFor(grantId, SUB)]);
      expect(tokenEndpoint).toHaveBeenCalledTimes(1);
      expect(first).toMatchObject({ status: "granted", accessToken: "access-2" });
      expect(second).toMatchObject({ status: "granted", accessToken: "access-2" });
    });

    test("deletes the grant when HMRC answers invalid_grant", async () => {
      const grantId = await storeGrant({ accessExpiresIn: 600 });
      tokenEndpoint.mockResolvedValueOnce(tokenResponse(400, { error: "invalid_grant" }));
      expect(await openGrantFor(grantId, SUB)).toEqual({ status: "missing" });
      expect(table.items.has(`hmrc-grant:${grantId}`)).toBe(false);
    });

    test("keeps the grant and its current token when HMRC cannot be reached and the token has life left", async () => {
      const grantId = await storeGrant({ accessExpiresIn: 600 });
      tokenEndpoint.mockRejectedValueOnce(new Error("network down"));
      expect(await openGrantFor(grantId, SUB)).toMatchObject({ status: "granted", accessToken: "access-1" });
      expect(table.items.has(`hmrc-grant:${grantId}`)).toBe(true);
    });

    test("keeps the grant and answers unavailable when HMRC fails and the token has expired", async () => {
      const grantId = await storeGrant({ accessExpiresIn: -5 });
      tokenEndpoint.mockResolvedValueOnce(tokenResponse(503, { error: "server_error" }));
      expect(await openGrantFor(grantId, SUB)).toEqual({ status: "unavailable" });
      expect(table.items.has(`hmrc-grant:${grantId}`)).toBe(true);
    });
  });

  describe("the grant a request names", () => {
    test("reads the id from the grant header, or from a bearer shaped like a grant id, and not from a raw token", () => {
      const id = "11111111-2222-4333-8444-555555555555";
      expect(grantIdFromEvent(eventFor({ "x-mcp-hmrc-grant": id }))).toBe(id);
      expect(grantIdFromEvent(eventFor({ Authorization: `Bearer ${id}` }))).toBe(id);
      expect(grantIdFromEvent(eventFor({ Authorization: "Bearer mock-hmrc-access-token-raw" }))).toBeNull();
      expect(grantIdFromEvent(eventFor({}))).toBeNull();
      expect(GRANT_ID_PATTERN.test("mock-hmrc-access-token-123")).toBe(false);
    });

    test("opens a grant named in the bearer slot", async () => {
      const grantId = await storeGrant();
      expect(await extractHmrcAccessTokenFromLambdaEvent(eventFor({ Authorization: `Bearer ${grantId}`, hmrcAccount: "live" }))).toBe(
        "access-1",
      );
    });

    test("passes a raw bearer token through unchanged", async () => {
      expect(await extractHmrcAccessTokenFromLambdaEvent(eventFor({ Authorization: "Bearer raw-hmrc-token-123" }))).toBe(
        "raw-hmrc-token-123",
      );
      expect(await extractHmrcAccessTokenFromLambdaEvent(eventFor({}))).toBeNull();
    });

    test("answers the not-usable marker for an unknown grant, another user's grant and a signed-out caller", async () => {
      const grantId = await storeGrant();
      const unknown = "99999999-2222-4333-8444-555555555555";
      expect(await grantAccessTokenFromEvent(eventFor({ "x-mcp-hmrc-grant": unknown }))).toBe(HMRC_GRANT_NOT_USABLE);
      expect(await grantAccessTokenFromEvent(eventFor({ "x-mcp-hmrc-grant": grantId }, "user-sub-2"))).toBe(HMRC_GRANT_NOT_USABLE);
      const signedOut = buildLambdaEvent({ headers: { "x-mcp-hmrc-grant": grantId }, authorizer: {} });
      expect(await grantAccessTokenFromEvent(signedOut)).toBe(HMRC_GRANT_NOT_USABLE);
      expect(await extractHmrcAccessTokenFromLambdaEvent(eventFor({ "x-mcp-hmrc-grant": unknown }))).toBe(HMRC_GRANT_NOT_USABLE);
    });

    test("makes validateHmrcAccessToken refuse the not-usable marker as unauthorised and accept a raw token", () => {
      expect(() => validateHmrcAccessToken(HMRC_GRANT_NOT_USABLE)).toThrow(UnauthorizedTokenError);
      expect(() => validateHmrcAccessToken("raw-hmrc-token-123")).not.toThrow();
    });

    test("treats a browser grant with no hmrcAccount header as the live account", async () => {
      const sandboxGrant = await storeGrant({ hmrcAccount: "synthetic" });
      const liveGrant = await storeGrant({ hmrcAccount: "live" });
      expect(await grantAccessTokenFromEvent(eventFor({ "x-mcp-hmrc-grant": sandboxGrant }))).toBe(HMRC_GRANT_NOT_USABLE);
      expect(await grantAccessTokenFromEvent(eventFor({ "x-mcp-hmrc-grant": sandboxGrant, "hmrcAccount": "synthetic" }))).toBe("access-1");
      expect(await grantAccessTokenFromEvent(eventFor({ "x-mcp-hmrc-grant": sandboxGrant, "hmrcAccount": "live" }))).toBe(
        HMRC_GRANT_NOT_USABLE,
      );
      expect(await grantAccessTokenFromEvent(eventFor({ "x-mcp-hmrc-grant": liveGrant }))).toBe("access-1");
    });

    test("lets an MCP grant, which has no origin, skip the hmrcAccount header", async () => {
      const grantId = await storeGrant({ hmrcAccount: "synthetic" });
      delete table.items.get(`hmrc-grant:${grantId}`).origin;
      expect(await grantAccessTokenFromEvent(eventFor({ "x-mcp-hmrc-grant": grantId }))).toBe("access-1");
    });

    test("resolves a body value shaped like a grant id and returns any other value unchanged", async () => {
      const grantId = await storeGrant();
      const event = eventFor({});
      expect(await resolveBodyAccessToken(event, grantId)).toBe("access-1");
      expect(await resolveBodyAccessToken(event, "raw-hmrc-token-123")).toBe("raw-hmrc-token-123");
      expect(await resolveBodyAccessToken(event, undefined)).toBeUndefined();
      expect(await resolveBodyAccessToken(event, "99999999-2222-4333-8444-555555555555")).toBe(HMRC_GRANT_NOT_USABLE);
    });
  });
});
