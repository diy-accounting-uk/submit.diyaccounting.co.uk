// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/mcpHmrcGrant.test.js
// The HMRC grant from a tool call's request, through the callback page's post, to the MCP's read
// of the token, over an in-memory table with HMRC's token endpoint stubbed.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import { FakeCodesEntryTable } from "@app/test-helpers/fakeCodesEntryTable.js";
import { _setTestSalt } from "@app/services/subHasher.js";
import { resetBlobKeyCache } from "@app/lib/mcpBlobKey.js";

const table = new FakeCodesEntryTable();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (builder) => table.execute(builder),
  getResourceName: () => "test-mcp-sessions",
}));
vi.mock("@app/data/dynamoDbHmrcApiRequestRepository.js", () => ({ putHmrcApiRequest: vi.fn() }));
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { ingestHandler } = await import("@app/functions/mcp/mcpHmrcGrant.js");

const ROUTE = "/api/v1/mcp/hmrc-grants";
const HMRC_SANDBOX = "https://test-api.service.hmrc.example";
const HMRC_LIVE = "https://api.service.hmrc.example";

function authorizerFor(sub) {
  return { authorizer: { jwt: { claims: { sub } } } };
}

async function call(event) {
  const response = await ingestHandler(event);
  return { response, body: parseResponseBody(response) };
}

function requestGrant(body = { hmrcAccount: "synthetic" }, sub = "user-sub-1") {
  return call(buildLambdaEvent({ method: "POST", path: ROUTE, body, authorizer: authorizerFor(sub) }));
}

function postCallback(body) {
  return call(buildLambdaEvent({ method: "POST", path: `${ROUTE}/callback`, body, authorizer: {} }));
}

function readGrant(grantId, sub = "user-sub-1") {
  return call(
    buildLambdaEvent({ method: "GET", path: `${ROUTE}/${grantId}`, pathParameters: { grantId }, authorizer: authorizerFor(sub) }),
  );
}

function tokenResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stateOf(url) {
  return new URL(url).searchParams.get("state");
}

let tokenEndpoint;

describe("mcpHmrcGrant", () => {
  beforeEach(() => {
    table.items.clear();
    process.env.MCP_SESSIONS_DYNAMODB_TABLE_NAME = "test-mcp-sessions";
    process.env.DIY_SUBMIT_BASE_URL = "https://submit.example/";
    process.env.HMRC_BASE_URI = HMRC_LIVE;
    process.env.HMRC_CLIENT_ID = "live-client";
    process.env.HMRC_CLIENT_SECRET = "live-secret";
    process.env.HMRC_SANDBOX_BASE_URI = HMRC_SANDBOX;
    process.env.HMRC_SANDBOX_CLIENT_ID = "sandbox-client";
    process.env.HMRC_SANDBOX_CLIENT_SECRET = "sandbox-secret";
    process.env.MCP_OAUTH_BLOB_KEY = "test-mcp-oauth-blob-key-0123456789abcdef";
    resetBlobKeyCache();
    _setTestSalt("test-salt-for-unit-tests");
    tokenEndpoint = vi.fn(async () =>
      tokenResponse(200, {
        access_token: "hmrc-access-1",
        refresh_token: "hmrc-refresh-1",
        expires_in: 14400,
        scope: "read:vat write:vat",
      }),
    );
    vi.stubGlobal("fetch", (url, init) => tokenEndpoint(url, init));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("requesting a grant", () => {
    test("answers HMRC's authorisation link with an mcp state and stores only the state's hash", async () => {
      const { response, body } = await requestGrant({ hmrcAccount: "synthetic", services: ["vat"] });
      expect(response.statusCode).toBe(201);
      const url = new URL(body.url);
      expect(`${url.origin}${url.pathname}`).toBe(`${HMRC_SANDBOX}/oauth/authorize`);
      expect(url.searchParams.get("client_id")).toBe("sandbox-client");
      expect(url.searchParams.get("redirect_uri")).toBe("https://submit.example/activities/submitVatCallback.html");
      expect(url.searchParams.get("scope")).toBe("read:vat write:vat");
      const state = stateOf(body.url);
      expect(state).toMatch(new RegExp(`^mcp\\.${body.grantId}\\.[A-Za-z0-9_-]{43}$`));
      const stored = table.items.get(`hmrc-grant:${body.grantId}`);
      expect(stored).toMatchObject({ state: "pending", hmrcAccount: "synthetic", scope: "read:vat write:vat" });
      expect(stored.hashedSub).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain(state.split(".")[2]);
      expect(JSON.stringify(stored)).not.toContain("user-sub-1");
    });

    test("uses the live client and asks for both scopes for vat and itsa", async () => {
      const { body } = await requestGrant({ services: ["vat", "itsa"] });
      const url = new URL(body.url);
      expect(url.origin).toBe(HMRC_LIVE);
      expect(url.searchParams.get("client_id")).toBe("live-client");
      expect(url.searchParams.get("scope")).toBe("read:vat write:vat read:self-assessment write:self-assessment");
      expect(body.hmrcAccount).toBe("live");
    });

    test("asks for the agent authorisation scopes for agent", async () => {
      const { body } = await requestGrant({ services: ["agent"] });
      expect(new URL(body.url).searchParams.get("scope")).toBe("read:sent-invitations write:sent-invitations");
      expect(body.scope).toBe("read:sent-invitations write:sent-invitations");
    });

    test("needs a signed-in user and refuses an unknown service or account", async () => {
      const unsigned = await call(buildLambdaEvent({ method: "POST", path: ROUTE, body: {}, authorizer: {} }));
      expect(unsigned.response.statusCode).toBe(401);
      expect((await requestGrant({ services: ["paye"] })).response.statusCode).toBe(400);
      expect((await requestGrant({ hmrcAccount: "production" })).response.statusCode).toBe(400);
    });
  });

  describe("the callback", () => {
    test("exchanges the code, seals both tokens and answers only that access is granted", async () => {
      const { body: grant } = await requestGrant();
      const { response, body } = await postCallback({ code: "auth-code-1", state: stateOf(grant.url) });
      expect(response.statusCode).toBe(200);
      expect(body).toEqual({ state: "granted" });

      const [tokenUrl, tokenInit] = tokenEndpoint.mock.calls[0];
      expect(tokenUrl).toBe(`${HMRC_SANDBOX}/oauth/token`);
      const sent = new URLSearchParams(tokenInit.body);
      expect(sent.get("grant_type")).toBe("authorization_code");
      expect(sent.get("code")).toBe("auth-code-1");
      expect(sent.get("client_id")).toBe("sandbox-client");
      expect(sent.get("redirect_uri")).toBe("https://submit.example/activities/submitVatCallback.html");

      const stored = table.items.get(`hmrc-grant:${grant.grantId}`);
      expect(stored.state).toBe("granted");
      expect(JSON.stringify(stored)).not.toContain("hmrc-access-1");
      expect(JSON.stringify(stored)).not.toContain("hmrc-refresh-1");
      expect(stored.ttl - Math.floor(Date.now() / 1000)).toBeGreaterThan(23 * 3600);
    });

    test("admits one callback per state", async () => {
      const { body: grant } = await requestGrant();
      const state = stateOf(grant.url);
      expect((await postCallback({ code: "auth-code-1", state })).response.statusCode).toBe(200);
      expect((await postCallback({ code: "auth-code-2", state })).response.statusCode).toBe(409);
      expect(tokenEndpoint).toHaveBeenCalledTimes(1);
    });

    test("refuses a state whose secret does not match its grant", async () => {
      const { body: grant } = await requestGrant();
      const forged = `mcp.${grant.grantId}.${"A".repeat(43)}`;
      expect((await postCallback({ code: "auth-code-1", state: forged })).response.statusCode).toBe(404);
      expect(table.items.get(`hmrc-grant:${grant.grantId}`).state).toBe("pending");
      expect(tokenEndpoint).not.toHaveBeenCalled();
    });

    test("refuses a state that is not an mcp state, and a missing code", async () => {
      const { body: grant } = await requestGrant();
      expect((await postCallback({ code: "auth-code-1", state: "web-journey-state" })).response.statusCode).toBe(400);
      expect((await postCallback({ state: stateOf(grant.url) })).response.statusCode).toBe(400);
    });

    test("deletes the grant and passes on HMRC's error when HMRC refuses the code", async () => {
      tokenEndpoint.mockResolvedValueOnce(tokenResponse(400, { error: "invalid_grant", error_description: "code expired" }));
      const { body: grant } = await requestGrant();
      const { response, body } = await postCallback({ code: "stale", state: stateOf(grant.url) });
      expect(response.statusCode).toBe(400);
      expect(body.error).toBe("invalid_grant");
      expect(table.items.has(`hmrc-grant:${grant.grantId}`)).toBe(false);
    });
  });

  describe("reading the token", () => {
    async function grantedGrant(sub) {
      const { body: grant } = await requestGrant({ hmrcAccount: "synthetic" }, sub);
      await postCallback({ code: "auth-code-1", state: stateOf(grant.url) });
      return grant.grantId;
    }

    test("answers pending before the callback", async () => {
      const { body: grant } = await requestGrant();
      const { response, body } = await readGrant(grant.grantId);
      expect(response.statusCode).toBe(200);
      expect(body).toEqual({ status: "pending", hmrcAccount: "synthetic" });
    });

    test("answers the access token to its owner", async () => {
      const grantId = await grantedGrant();
      const { response, body } = await readGrant(grantId);
      expect(response.statusCode).toBe(200);
      expect(body).toMatchObject({
        status: "granted",
        accessToken: "hmrc-access-1",
        hmrcAccount: "synthetic",
        scope: "read:vat write:vat",
      });
      expect(body.refreshToken).toBeUndefined();
    });

    test("answers 404 to anyone but the owner, and for an id that is not a grant id", async () => {
      const grantId = await grantedGrant();
      const stranger = await readGrant(grantId, "user-sub-2");
      expect(stranger.response.statusCode).toBe(404);
      expect(stranger.body.message).toContain("request_hmrc_authorisation");
      expect((await readGrant("hmrc-grant:../x")).response.statusCode).toBe(404);
    });

    test("refreshes an access token near its expiry and keeps the new pair", async () => {
      const grantId = await grantedGrant();
      table.items.get(`hmrc-grant:${grantId}`).accessExpiresAt = Math.floor(Date.now() / 1000) + 60;
      tokenEndpoint.mockResolvedValueOnce(
        tokenResponse(200, { access_token: "hmrc-access-2", refresh_token: "hmrc-refresh-2", expires_in: 14400 }),
      );

      const { body } = await readGrant(grantId);

      expect(body.accessToken).toBe("hmrc-access-2");
      const sent = new URLSearchParams(tokenEndpoint.mock.calls[1][1].body);
      expect(sent.get("grant_type")).toBe("refresh_token");
      expect(sent.get("refresh_token")).toBe("hmrc-refresh-1");
      const { body: again } = await readGrant(grantId);
      expect(again.accessToken).toBe("hmrc-access-2");
      expect(tokenEndpoint).toHaveBeenCalledTimes(2);
    });

    test("deletes the grant when HMRC refuses the refresh", async () => {
      const grantId = await grantedGrant();
      table.items.get(`hmrc-grant:${grantId}`).accessExpiresAt = Math.floor(Date.now() / 1000) + 60;
      tokenEndpoint.mockResolvedValueOnce(tokenResponse(400, { error: "invalid_grant" }));

      const { response } = await readGrant(grantId);

      expect(response.statusCode).toBe(404);
      expect(table.items.has(`hmrc-grant:${grantId}`)).toBe(false);
    });
  });
});
