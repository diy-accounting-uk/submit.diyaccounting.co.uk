// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const loggedLines = [];
vi.mock("@app/lib/logger.js", async (importOriginal) => {
  const actual = await importOriginal();
  const capture =
    (level) =>
    (...args) =>
      loggedLines.push({ level, args });
  const fakeLogger = {
    trace: capture("trace"),
    debug: capture("debug"),
    info: capture("info"),
    warn: capture("warn"),
    error: capture("error"),
  };
  return { ...actual, createLogger: () => fakeLogger };
});

const mockReadSecret = vi.fn();
vi.mock("@app/lib/cachedSecret.js", () => ({ readSecret: (...args) => mockReadSecret(...args) }));

const mockSignIn = vi.fn();
vi.mock("@app/lib/mcpReviewerSignIn.js", () => ({ signInReviewer: (...args) => mockSignIn(...args) }));

const stored = new Map();
vi.mock("@app/data/dynamoDbReviewerCodeRepository.js", () => ({
  reviewerCodeKey: (id) => `reviewer-code:${id}`,
  putReviewerCode: async (id, sealed) => stored.set(id, sealed),
  takeReviewerCode: async (id) => {
    const sealed = stored.get(id) ?? null;
    stored.delete(id);
    return sealed;
  },
}));

const { ingestHandler } = await import("@app/functions/mcp/mcpOauth.js");
const { verifyBlob } = await import("@app/lib/mcpOauthBlob.js");
const { clearClientMetadataCache } = await import("@app/lib/mcpOauthClients.js");

const HOST = "submit.diyaccounting.co.uk";
const BLOB_KEY = "b".repeat(64);
const BLOB_KEYS = { current: "v1", versions: { v1: BLOB_KEY } };
const UPSTREAM = "https://prod-auth.diyaccounting.co.uk/oauth2";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const USERNAME = "mcp-reviewer@test.diyaccounting.co.uk";
const PASSWORD = "Correct-Horse-9-Battery";
const TOKENS = { AccessToken: "reviewer-access-token", RefreshToken: "reviewer-refresh-token", ExpiresIn: 3600 };

const ENV_KEYS = [
  "MCP_PUBLIC_HOSTS",
  "MCP_UPSTREAM_AUTHORIZE_URL",
  "MCP_UPSTREAM_TOKEN_URL",
  "MCP_UPSTREAM_REVOKE_URL",
  "MCP_UPSTREAM_CLIENT_ID",
  "MCP_OAUTH_BLOB_KEY",
  "MCP_USER_POOL_ID",
  "MCP_REVIEWER_USERNAME",
  "MCP_REVIEWER_PASSWORD_SECRET_NAME",
  "MCP_REVIEWER_TOTP_SECRET_NAME",
];
const savedEnv = {};

function event({ method = "GET", path, query, body, headers = {}, cookies } = {}) {
  return {
    rawPath: path,
    rawQueryString: query ? new URLSearchParams(query).toString() : "",
    headers: { host: HOST, ...headers },
    requestContext: { requestId: "req-1", http: { method, path } },
    ...(cookies ? { cookies } : {}),
    ...(body !== undefined ? { body, isBase64Encoded: false } : {}),
  };
}

function formEvent(path, fields, extra = {}) {
  return event({
    method: "POST",
    path,
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "198.51.100.7", "user-agent": "reviewer-browser" },
    ...extra,
  });
}

async function consentPageFor() {
  const page = await ingestHandler(
    event({
      path: "/mcp/oauth/authorize",
      query: {
        response_type: "code",
        client_id: "diya-submit-dcr",
        redirect_uri: REDIRECT,
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
        resource: `https://${HOST}/mcp`,
        scope: "openid email profile",
        state: "client-state-123",
      },
    }),
  );
  return {
    page,
    consent: /name="consent" value="([^"]+)"/.exec(page.body)[1],
    nonce: /__Host-mcp_consent=([^;]+)/.exec(page.headers["Set-Cookie"])[1],
  };
}

const reviewerPost = ({ consent, nonce }, fields = { username: USERNAME, password: PASSWORD }) =>
  ingestHandler(formEvent("/mcp/oauth/reviewer", { consent, ...fields }, { cookies: [`__Host-mcp_consent=${nonce}`] }));

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.MCP_PUBLIC_HOSTS = HOST;
  process.env.MCP_UPSTREAM_AUTHORIZE_URL = `${UPSTREAM}/authorize`;
  process.env.MCP_UPSTREAM_TOKEN_URL = `${UPSTREAM}/token`;
  process.env.MCP_UPSTREAM_REVOKE_URL = `${UPSTREAM}/revoke`;
  process.env.MCP_UPSTREAM_CLIENT_ID = "cognito-mcp-client";
  process.env.MCP_OAUTH_BLOB_KEY = BLOB_KEY;
  process.env.MCP_USER_POOL_ID = "eu-west-2_pool";
  process.env.MCP_REVIEWER_USERNAME = USERNAME;
  process.env.MCP_REVIEWER_PASSWORD_SECRET_NAME = "ci/submit/mcp/reviewer-password";
  process.env.MCP_REVIEWER_TOTP_SECRET_NAME = "ci/submit/mcp/reviewer-totp-seed";
  clearClientMetadataCache();
  stored.clear();
  loggedLines.length = 0;
  mockReadSecret.mockReset().mockResolvedValue(PASSWORD);
  mockSignIn.mockReset().mockImplementation(async ({ trace }) => {
    trace.challengeName = "SOFTWARE_TOKEN_MFA";
    trace.totpRetry = "none";
    return TOKENS;
  });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("the consent page", () => {
  it("offers a reviewer sign-in form that posts the consent blob, and lets the form's redirect reach the application", async () => {
    const { page } = await consentPageFor();
    expect(page.body).toContain("Reviewer sign-in");
    expect(page.body).toContain('<form method="post" action="/mcp/oauth/reviewer">');
    expect(page.body).toContain('name="username"');
    expect(page.body).toContain('type="password"');
    expect(page.headers["Content-Security-Policy"]).toContain(`form-action 'self' ${new URL(UPSTREAM).origin} https://claude.ai;`);
  });

  it("leaves the form out where no reviewer user is configured", async () => {
    delete process.env.MCP_REVIEWER_USERNAME;
    const { page } = await consentPageFor();
    expect(page.body).not.toContain("Reviewer sign-in");
    expect(page.headers["Content-Security-Policy"]).not.toContain("claude.ai");
    const answer = await ingestHandler(formEvent("/mcp/oauth/reviewer", { consent: "x" }));
    expect(answer.statusCode).toBe(404);
  });
});

describe("the reviewer sign-in", () => {
  it("signs the configured user in and redirects with a code that holds no tokens", async () => {
    const asked = await consentPageFor();
    const result = await reviewerPost(asked);
    expect(result.statusCode).toBe(302);
    expect(result.headers["Set-Cookie"]).toContain("Max-Age=0");
    const url = new URL(result.headers.Location);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
    expect(url.searchParams.get("state")).toBe("client-state-123");
    expect(url.searchParams.get("iss")).toBe(`https://${HOST}`);
    const code = url.searchParams.get("code");
    expect(code).not.toContain("reviewer-access-token");
    const verified = verifyBlob(code, BLOB_KEYS, "code");
    expect(verified.ok).toBe(true);
    expect(verified.fields).toMatchObject({
      clientId: "diya-submit-dcr",
      redirectUri: REDIRECT,
      scope: "openid email profile",
      codeChallenge: CHALLENGE,
    });
    expect(stored.size).toBe(1);
    expect([...stored.values()][0]).not.toContain("reviewer-access-token");
    expect(mockSignIn).toHaveBeenCalledOnce();
    expect(mockSignIn.mock.calls[0][0]).toMatchObject({
      password: PASSWORD,
      viewer: { ipAddress: "198.51.100.7", serverName: HOST, serverPath: "/mcp/oauth/reviewer", userAgent: "reviewer-browser" },
    });
  });

  it.each([
    ["a wrong password", { username: USERNAME, password: "wrong" }, true],
    ["a wrong user name", { username: "someone@example.com", password: PASSWORD }, false],
  ])("shows the page again with 401 and never reaches Cognito for %s", async (_name, fields, usernameMatched) => {
    const asked = await consentPageFor();
    const result = await reviewerPost(asked, fields);
    expect(result.statusCode).toBe(401);
    expect(result.body).toContain("The user name or password is not right.");
    expect(result.body).toContain("Reviewer sign-in");
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(stored.size).toBe(0);
    const outcome = loggedLines.map((l) => l.args[0]).find((fields2) => fields2.outcome === "credentials_refused");
    expect(outcome.usernameMatched).toBe(usernameMatched);
  });

  it("sends Cognito the configured user name and not the typed one", async () => {
    const asked = await consentPageFor();
    await reviewerPost(asked, { username: USERNAME, password: PASSWORD });
    expect(JSON.stringify(mockSignIn.mock.calls[0][0])).not.toContain("typed");
    expect(mockSignIn.mock.calls[0][0]).not.toHaveProperty("username");
  });

  it("refuses a missing consent cookie and a tampered consent blob before the password is read", async () => {
    const asked = await consentPageFor();
    const noCookie = await ingestHandler(
      formEvent("/mcp/oauth/reviewer", { consent: asked.consent, username: USERNAME, password: PASSWORD }),
    );
    expect(noCookie.statusCode).toBe(400);
    const tampered = await reviewerPost({ consent: `${asked.consent}x`, nonce: asked.nonce });
    expect(tampered.statusCode).toBe(400);
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockReadSecret).not.toHaveBeenCalled();
  });

  it("shows an error page and logs the Cognito error name when the sign-in fails", async () => {
    mockSignIn.mockImplementation(async ({ trace }) => {
      trace.challengeName = "SOFTWARE_TOKEN_MFA";
      trace.totpRetry = "next_window";
      throw Object.assign(new Error("secret detail"), { name: "NotAuthorizedException" });
    });
    const result = await reviewerPost(await consentPageFor());
    expect(result.statusCode).toBe(400);
    expect(result.body).not.toContain("secret detail");
    const line = loggedLines.map((l) => l.args[0]).find((f) => f.outcome === "cognito_refused");
    expect(line).toMatchObject({
      endpoint: "reviewer",
      clientId: "diya-submit-dcr",
      redirectHost: "claude.ai",
      usernameMatched: true,
      cognitoErrorName: "NotAuthorizedException",
      challengeName: "SOFTWARE_TOKEN_MFA",
      totpRetry: "next_window",
    });
  });

  it("writes one log line per POST that holds no password, code or token", async () => {
    const asked = await consentPageFor();
    loggedLines.length = 0;
    const result = await reviewerPost(asked);
    const code = new URL(result.headers.Location).searchParams.get("code");
    const lines = loggedLines.filter((l) => l.args[0].endpoint === "reviewer");
    expect(lines).toHaveLength(1);
    expect(lines[0].args[0]).toMatchObject({
      outcome: "code_issued",
      usernameMatched: true,
      challengeName: "SOFTWARE_TOKEN_MFA",
      totpRetry: "none",
    });
    const logged = JSON.stringify(loggedLines);
    for (const secret of [PASSWORD, code, "reviewer-access-token", "reviewer-refresh-token", asked.consent, asked.nonce]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("the token route for a reviewer code", () => {
  const exchange = async (code, verifier = VERIFIER) =>
    ingestHandler(
      formEvent("/mcp/oauth/token", {
        grant_type: "authorization_code",
        code,
        client_id: "diya-submit-dcr",
        redirect_uri: REDIRECT,
        code_verifier: verifier,
        resource: `https://${HOST}/mcp`,
      }),
    );
  const issue = async () => new URL((await reviewerPost(await consentPageFor())).headers.Location).searchParams.get("code");

  it("returns the sealed tokens once", async () => {
    const code = await issue();
    const first = await exchange(code);
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body)).toEqual({
      access_token: "reviewer-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "reviewer-refresh-token",
      scope: "openid email profile",
    });
    const second = await exchange(code);
    expect(second.statusCode).toBe(400);
    expect(JSON.parse(second.body).error).toBe("invalid_grant");
  });

  it("refuses a wrong verifier and keeps the code for the right one", async () => {
    const code = await issue();
    const wrong = await exchange(code, "A".repeat(43));
    expect(JSON.parse(wrong.body).error).toBe("invalid_grant");
    expect(stored.size).toBe(1);
    expect((await exchange(code)).statusCode).toBe(200);
  });

  it("refuses a code whose stored item is gone", async () => {
    const code = await issue();
    stored.clear();
    expect(JSON.parse((await exchange(code)).body).error).toBe("invalid_grant");
  });
});
