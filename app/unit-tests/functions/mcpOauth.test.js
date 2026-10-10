// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
    fatal: capture("fatal"),
  };
  return { ...actual, createLogger: () => fakeLogger };
});

const mockSecretsSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { ingestHandler, resetBlobKeyCache, resourceMatches, cutScope } = await import("@app/functions/mcp/mcpOauth.js");
const { signBlob, verifyBlob } = await import("@app/lib/mcpOauthBlob.js");
const { clearClientMetadataCache } = await import("@app/lib/mcpOauthClients.js");

const HOST = "submit.diyaccounting.co.uk";
const BLOB_KEY = "b".repeat(64);
const UPSTREAM = "https://prod-auth.diyaccounting.co.uk/oauth2";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const LOOPBACK_REDIRECT = "http://localhost:53682/callback";
const CIMD_ID = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const RESOURCE = `https://${HOST}/mcp`;

const ENV_KEYS = [
  "MCP_PUBLIC_HOSTS",
  "MCP_UPSTREAM_AUTHORIZE_URL",
  "MCP_UPSTREAM_TOKEN_URL",
  "MCP_UPSTREAM_REVOKE_URL",
  "MCP_UPSTREAM_CLIENT_ID",
  "MCP_OAUTH_BLOB_KEY",
  "MCP_OAUTH_BLOB_KEY_SECRET_ARN",
];
const savedEnv = {};

function event({ method = "GET", path, query, body, base64 = false, headers = {}, cookies } = {}) {
  const rawQueryString = query === undefined ? "" : typeof query === "string" ? query : new URLSearchParams(query).toString();
  return {
    rawPath: path,
    rawQueryString,
    headers: { host: HOST, ...headers },
    requestContext: { requestId: "req-1", http: { method, path } },
    ...(cookies ? { cookies } : {}),
    ...(body !== undefined ? { body: base64 ? Buffer.from(body).toString("base64") : body, isBase64Encoded: base64 } : {}),
  };
}

function formEvent(path, fields, extra = {}) {
  return event({
    method: "POST",
    path,
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    ...extra,
  });
}

function authorizeQuery(overrides = {}) {
  const q = {
    response_type: "code",
    client_id: "diya-submit-dcr",
    redirect_uri: CLAUDE_REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: RESOURCE,
    scope: "openid email profile offline_access",
    state: "client-state-123",
    ...overrides,
  };
  for (const [k, v] of Object.entries(q)) if (v === undefined) delete q[k];
  return q;
}

function json(result) {
  return JSON.parse(result.body);
}

function location(result) {
  return new URL(result.headers.Location);
}

let fetchMock;
function respond(status, body, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.MCP_PUBLIC_HOSTS = `${HOST}, ci-submit.diyaccounting.co.uk`;
  process.env.MCP_UPSTREAM_AUTHORIZE_URL = `${UPSTREAM}/authorize`;
  process.env.MCP_UPSTREAM_TOKEN_URL = `${UPSTREAM}/token`;
  process.env.MCP_UPSTREAM_REVOKE_URL = `${UPSTREAM}/revoke`;
  process.env.MCP_UPSTREAM_CLIENT_ID = "cognito-mcp-client";
  process.env.MCP_OAUTH_BLOB_KEY = BLOB_KEY;
  delete process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN;
  resetBlobKeyCache();
  clearClientMetadataCache();
  mockSecretsSend.mockReset();
  loggedLines.length = 0;
  fetchMock = vi.fn(async () => {
    throw new Error("unexpected fetch");
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe("mcpOauth metadata", () => {
  it.each(["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"])(
    "serves the protected resource metadata at %s byte for byte",
    async (path) => {
      const result = await ingestHandler(event({ path }));
      expect(result.statusCode).toBe(200);
      expect(result.headers["Cache-Control"]).toBe("max-age=300");
      expect(result.body).toBe(
        '{"resource":"https://submit.diyaccounting.co.uk/mcp","authorization_servers":["https://submit.diyaccounting.co.uk"],' +
          '"scopes_supported":["openid","email","profile"],"bearer_methods_supported":["header"],"resource_name":"DIY Accounting Submit"}',
      );
    },
  );

  it("serves the authorization server metadata byte for byte", async () => {
    const result = await ingestHandler(event({ path: "/.well-known/oauth-authorization-server" }));
    expect(result.statusCode).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("max-age=300");
    const b = "https://submit.diyaccounting.co.uk";
    expect(result.body).toBe(
      `{"issuer":"${b}","authorization_endpoint":"${b}/mcp/oauth/authorize","token_endpoint":"${b}/mcp/oauth/token",` +
        `"registration_endpoint":"${b}/mcp/oauth/register","revocation_endpoint":"${b}/mcp/oauth/revoke",` +
        `"response_types_supported":["code"],"grant_types_supported":["authorization_code","refresh_token"],` +
        `"code_challenge_methods_supported":["S256"],"token_endpoint_auth_methods_supported":["none"],` +
        `"revocation_endpoint_auth_methods_supported":["none"],"client_id_metadata_document_supported":true,` +
        `"scopes_supported":["openid","email","profile"]}`,
    );
  });

  it.each([
    ["/.well-known/oauth-protected-resource/mcp", "GET"],
    ["/.well-known/oauth-authorization-server", "GET"],
    ["/mcp/oauth/nothing", "GET"],
  ])("labels the JSON body of %s as application/json", async (path, method) => {
    const result = await ingestHandler(event({ method, path }));
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  it("labels the JSON body of a host rejection as application/json", async () => {
    const result = await ingestHandler(event({ path: "/.well-known/oauth-authorization-server", headers: { host: "evil.example" } }));
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  it("uses the request's host when it is listed", async () => {
    const result = await ingestHandler(
      event({ path: "/.well-known/oauth-authorization-server", headers: { host: "CI-Submit.diyaccounting.co.uk" } }),
    );
    expect(json(result).issuer).toBe("https://ci-submit.diyaccounting.co.uk");
  });

  it("answers 400 for a host outside MCP_PUBLIC_HOSTS", async () => {
    const result = await ingestHandler(event({ path: "/.well-known/oauth-authorization-server", headers: { host: "evil.example" } }));
    expect(result.statusCode).toBe(400);
    expect(json(result).error).toBe("invalid_request");
  });

  it("answers 404 for an unknown path and 405 with Allow for a wrong method", async () => {
    expect((await ingestHandler(event({ path: "/mcp/oauth/nothing" }))).statusCode).toBe(404);
    const result = await ingestHandler(event({ method: "DELETE", path: "/mcp/oauth/authorize" }));
    expect(result.statusCode).toBe(405);
    expect(result.headers.Allow).toBe("GET, POST");
  });
});

describe("mcpOauth register", () => {
  const register = (body, base64 = false) =>
    ingestHandler(event({ method: "POST", path: "/mcp/oauth/register", body, base64, headers: { "content-type": "application/json" } }));

  it("answers 201 with the one DCR client id for allowed redirect URIs", async () => {
    const result = await register(
      JSON.stringify({
        redirect_uris: [CLAUDE_REDIRECT, LOOPBACK_REDIRECT, "http://127.0.0.1:9/cb"],
        client_name: "Claude",
        token_endpoint_auth_method: "client_secret_basic",
      }),
      true,
    );
    expect(result.statusCode).toBe(201);
    const body = json(result);
    expect(body).toEqual({
      client_id: "diya-submit-dcr",
      client_id_issued_at: expect.any(Number),
      redirect_uris: [CLAUDE_REDIRECT, LOOPBACK_REDIRECT, "http://127.0.0.1:9/cb"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it.each([
    ["an unknown https host", "https://evil.example/api/mcp/auth_callback"],
    ["a Claude callback with an extra query", "https://claude.ai/api/mcp/auth_callback?x=1"],
    ["a Claude host on a different path", "https://claude.ai/other"],
    ["a loopback over https", "https://localhost:8080/callback"],
    ["a loopback lookalike host", "http://localhost.evil.example/callback"],
    ["userinfo pointing elsewhere", "http://localhost@evil.example/callback"],
    ["a non-URL", "javascript:alert(1)"],
  ])("refuses %s with invalid_redirect_uri", async (_label, uri) => {
    const result = await register(JSON.stringify({ redirect_uris: [CLAUDE_REDIRECT, uri] }));
    expect(result.statusCode).toBe(400);
    expect(json(result).error).toBe("invalid_redirect_uri");
  });

  it("refuses missing redirect_uris, a non-JSON body and unsupported grant types", async () => {
    expect(json(await register(JSON.stringify({}))).error).toBe("invalid_redirect_uri");
    expect(json(await register("not json")).error).toBe("invalid_client_metadata");
    expect(json(await register("[]")).error).toBe("invalid_client_metadata");
    expect(json(await register(JSON.stringify({ redirect_uris: [CLAUDE_REDIRECT], grant_types: ["implicit"] }))).error).toBe(
      "invalid_client_metadata",
    );
  });
});

describe("mcpOauth authorize GET", () => {
  const authorize = (overrides) => ingestHandler(event({ path: "/mcp/oauth/authorize", query: authorizeQuery(overrides) }));

  it("shows a consent page with its security headers, the redirect host and a consent cookie", async () => {
    const result = await authorize();
    expect(result.statusCode).toBe(200);
    expect(result.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(result.headers["Content-Security-Policy"]).toBe(
      `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(UPSTREAM).origin}; frame-ancestors 'none'`,
    );
    expect(result.headers["X-Frame-Options"]).toBe("DENY");
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(result.headers["Set-Cookie"]).toMatch(
      /^__Host-mcp_consent=[A-Za-z0-9_-]+; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=600$/,
    );
    expect(result.body).toContain("Claude (<strong>claude.ai</strong>) is asking to use DIY Accounting Submit as you");
    expect(result.body).toContain('<form method="post" action="/mcp/oauth/authorize">');
    expect(result.body).not.toContain("a program on this computer");

    const blob = /name="consent" value="([^"]+)"/.exec(result.body)[1];
    const verified = verifyBlob(blob, BLOB_KEY, "consent");
    expect(verified.ok).toBe(true);
    expect(verified.fields).toMatchObject({
      clientId: "diya-submit-dcr",
      redirectUri: CLAUDE_REDIRECT,
      state: "client-state-123",
      codeChallenge: CHALLENGE,
      scope: "openid email profile",
      resource: RESOURCE,
    });
  });

  it("adds the loopback line for a loopback redirect", async () => {
    const result = await authorize({ redirect_uri: LOOPBACK_REDIRECT });
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<strong>localhost:53682</strong>");
    expect(result.body).toContain("a program on this computer");
  });

  it("accepts a resource with an upper-case host and a trailing slash", async () => {
    expect((await authorize({ resource: `HTTPS://SUBMIT.diyaccounting.co.uk/mcp/` })).statusCode).toBe(200);
  });

  it.each([
    ["an unknown redirect", { redirect_uri: "https://evil.example/cb" }],
    ["a missing redirect", { redirect_uri: undefined }],
    ["an unknown client id", { client_id: "someone-else" }],
    ["a missing client id", { client_id: undefined }],
  ])("answers a 400 page for %s without redirecting", async (_label, overrides) => {
    const result = await authorize(overrides);
    expect(result.statusCode).toBe(400);
    expect(result.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(result.headers.Location).toBeUndefined();
  });

  it("answers a 400 page for a repeated parameter", async () => {
    const query = `${new URLSearchParams(authorizeQuery()).toString()}&redirect_uri=${encodeURIComponent("https://evil.example/cb")}`;
    const result = await ingestHandler(event({ path: "/mcp/oauth/authorize", query }));
    expect(result.statusCode).toBe(400);
    expect(result.headers.Location).toBeUndefined();
  });

  it.each([
    ["no PKCE", { code_challenge: undefined, code_challenge_method: undefined }, "invalid_request"],
    ["plain PKCE", { code_challenge_method: "plain" }, "invalid_request"],
    ["a malformed challenge", { code_challenge: "short" }, "invalid_request"],
    ["a wrong resource", { resource: "https://other.example/mcp" }, "invalid_target"],
    ["a resource on another path", { resource: `https://${HOST}/api` }, "invalid_target"],
    ["no resource", { resource: undefined }, "invalid_target"],
    ["a token response type", { response_type: "token" }, "unsupported_response_type"],
  ])("redirects %s back to the client with the error and its state", async (_label, overrides, error) => {
    const result = await authorize(overrides);
    expect(result.statusCode).toBe(302);
    const url = location(result);
    expect(`${url.origin}${url.pathname}`).toBe(CLAUDE_REDIRECT);
    expect(url.searchParams.get("error")).toBe(error);
    expect(url.searchParams.get("state")).toBe("client-state-123");
    expect(url.searchParams.get("code")).toBeNull();
  });

  it("refuses a CIMD client id outside claude.ai and claude.com before any fetch", async () => {
    const result = await authorize({ client_id: "https://evil.example/client.json" });
    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const internal = await authorize({ client_id: "https://claude.ai:8443/client.json" });
    expect(internal.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a CIMD client whose document lists the redirect, fetching without following redirects", async () => {
    fetchMock.mockResolvedValue(respond(200, { client_id: CIMD_ID, redirect_uris: [CLAUDE_REDIRECT] }, { "cache-control": "max-age=60" }));
    const first = await authorize({ client_id: CIMD_ID });
    expect(first.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(CIMD_ID);
    expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
    await authorize({ client_id: CIMD_ID });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a CIMD document whose client_id does not match the URL", async () => {
    fetchMock.mockResolvedValue(respond(200, { client_id: "https://claude.ai/other", redirect_uris: [CLAUDE_REDIRECT] }));
    expect((await authorize({ client_id: CIMD_ID })).statusCode).toBe(400);
  });

  it("refuses a CIMD document that does not list the redirect", async () => {
    fetchMock.mockResolvedValue(respond(200, { client_id: CIMD_ID, redirect_uris: ["https://claude.com/api/mcp/auth_callback"] }));
    expect((await authorize({ client_id: CIMD_ID })).statusCode).toBe(400);
  });

  it("refuses a CIMD document that redirects, is too large or fails to fetch", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    expect((await authorize({ client_id: CIMD_ID })).statusCode).toBe(400);
    fetchMock.mockResolvedValueOnce(
      respond(200, JSON.stringify({ client_id: CIMD_ID, redirect_uris: [CLAUDE_REDIRECT], pad: "x".repeat(70_000) })),
    );
    expect((await authorize({ client_id: CIMD_ID })).statusCode).toBe(400);
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect((await authorize({ client_id: CIMD_ID })).statusCode).toBe(400);
  });
});

async function consentFor(overrides) {
  const page = await ingestHandler(event({ path: "/mcp/oauth/authorize", query: authorizeQuery(overrides) }));
  const consent = /name="consent" value="([^"]+)"/.exec(page.body)[1];
  const nonce = /^__Host-mcp_consent=([^;]+);/.exec(page.headers["Set-Cookie"])[1];
  return { consent, nonce };
}

describe("mcpOauth authorize POST", () => {
  it("continues to Cognito with the client's challenge and the upstream blob, without resource", async () => {
    const { consent, nonce } = await consentFor();
    const result = await ingestHandler(formEvent("/mcp/oauth/authorize", { consent }, { cookies: [`__Host-mcp_consent=${nonce}`] }));
    expect(result.statusCode).toBe(302);
    expect(result.headers["Set-Cookie"]).toContain("Max-Age=0");
    const url = location(result);
    expect(`${url.origin}${url.pathname}`).toBe(`${UPSTREAM}/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cognito-mcp-client");
    expect(url.searchParams.get("redirect_uri")).toBe(`https://${HOST}/mcp/oauth/callback`);
    expect(url.searchParams.get("code_challenge")).toBe(CHALLENGE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.has("resource")).toBe(false);
    const upstream = verifyBlob(url.searchParams.get("state"), BLOB_KEY, "upstream");
    expect(upstream.ok).toBe(true);
    expect(upstream.fields).toMatchObject({ clientId: "diya-submit-dcr", redirectUri: CLAUDE_REDIRECT, state: "client-state-123" });
    expect(upstream.fields.nonce).toBeUndefined();
  });

  it("reads the consent cookie from the Cookie header too", async () => {
    const { consent, nonce } = await consentFor();
    const result = await ingestHandler(
      formEvent(
        "/mcp/oauth/authorize",
        { consent },
        { headers: { "content-type": "application/x-www-form-urlencoded", "cookie": `a=b; __Host-mcp_consent=${nonce}` } },
      ),
    );
    expect(result.statusCode).toBe(302);
  });

  it("refuses a consent posted without the browser's consent cookie", async () => {
    const { consent } = await consentFor();
    expect((await ingestHandler(formEvent("/mcp/oauth/authorize", { consent }))).statusCode).toBe(400);
    expect(
      (await ingestHandler(formEvent("/mcp/oauth/authorize", { consent }, { cookies: ["__Host-mcp_consent=other"] }))).statusCode,
    ).toBe(400);
  });

  it("refuses a tampered consent blob and a blob of another typ", async () => {
    const { consent, nonce } = await consentFor();
    const cookies = [`__Host-mcp_consent=${nonce}`];
    expect((await ingestHandler(formEvent("/mcp/oauth/authorize", { consent: `${consent}x` }, { cookies }))).statusCode).toBe(400);
    const upstreamTyp = signBlob({ nonce }, BLOB_KEY, { typ: "upstream", ttlSeconds: 60 });
    expect((await ingestHandler(formEvent("/mcp/oauth/authorize", { consent: upstreamTyp }, { cookies }))).statusCode).toBe(400);
  });

  it("refuses a body that is not form-encoded", async () => {
    const result = await ingestHandler(
      event({ method: "POST", path: "/mcp/oauth/authorize", body: "{}", headers: { "content-type": "application/json" } }),
    );
    expect(result.statusCode).toBe(400);
  });
});

function upstreamState(fields = {}) {
  return signBlob(
    {
      clientId: "diya-submit-dcr",
      redirectUri: CLAUDE_REDIRECT,
      state: "client-state-123",
      codeChallenge: CHALLENGE,
      scope: "openid email",
      resource: RESOURCE,
      ...fields,
    },
    BLOB_KEY,
    {
      typ: "upstream",
      ttlSeconds: 600,
    },
  );
}

describe("mcpOauth callback", () => {
  it("relays Cognito's code wrapped in a code blob with the client's state", async () => {
    const result = await ingestHandler(event({ path: "/mcp/oauth/callback", query: { code: "cognito-code-1", state: upstreamState() } }));
    expect(result.statusCode).toBe(302);
    const url = location(result);
    expect(`${url.origin}${url.pathname}`).toBe(CLAUDE_REDIRECT);
    expect(url.searchParams.get("state")).toBe("client-state-123");
    expect(url.searchParams.get("iss")).toBe(`https://${HOST}`);
    const code = verifyBlob(url.searchParams.get("code"), BLOB_KEY, "code");
    expect(code.fields).toEqual({
      code: "cognito-code-1",
      clientId: "diya-submit-dcr",
      redirectUri: CLAUDE_REDIRECT,
      scope: "openid email",
    });
  });

  it("relays a Cognito error to the client with its state", async () => {
    const result = await ingestHandler(
      event({ path: "/mcp/oauth/callback", query: { error: "access_denied", error_description: "<script>", state: upstreamState() } }),
    );
    const url = location(result);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("error_description")).toBeNull();
    expect(url.searchParams.get("state")).toBe("client-state-123");
  });

  it("maps an unrecognised error code to server_error", async () => {
    const result = await ingestHandler(event({ path: "/mcp/oauth/callback", query: { error: "Bad Thing", state: upstreamState() } }));
    expect(location(result).searchParams.get("error")).toBe("server_error");
  });

  it("answers a 400 page for a missing, forged or wrong-typ state", async () => {
    expect((await ingestHandler(event({ path: "/mcp/oauth/callback", query: { code: "c" } }))).statusCode).toBe(400);
    expect(
      (
        await ingestHandler(
          event({
            path: "/mcp/oauth/callback",
            query: { code: "c", state: signBlob({}, "z".repeat(64), { typ: "upstream", ttlSeconds: 60 }) },
          }),
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await ingestHandler(
          event({ path: "/mcp/oauth/callback", query: { code: "c", state: signBlob({}, BLOB_KEY, { typ: "consent", ttlSeconds: 60 }) } }),
        )
      ).statusCode,
    ).toBe(400);
  });
});

function codeBlob(fields = {}) {
  return signBlob(
    { code: "cognito-code-1", clientId: "diya-submit-dcr", redirectUri: CLAUDE_REDIRECT, scope: "openid email", ...fields },
    BLOB_KEY,
    { typ: "code", ttlSeconds: 300 },
  );
}

function tokenForm(overrides = {}) {
  const form = {
    grant_type: "authorization_code",
    code: codeBlob(),
    client_id: "diya-submit-dcr",
    redirect_uri: CLAUDE_REDIRECT,
    code_verifier: VERIFIER,
    resource: RESOURCE,
    ...overrides,
  };
  for (const [k, v] of Object.entries(form)) if (v === undefined) delete form[k];
  return form;
}

const COGNITO_TOKENS = {
  id_token: "cognito-id-token",
  access_token: "cognito-access-token",
  refresh_token: "cognito-refresh-token",
  expires_in: 3600,
  token_type: "Bearer",
};

describe("mcpOauth token", () => {
  it("exchanges the code with Cognito, forwarding the verifier and the callback redirect, and drops id_token", async () => {
    fetchMock.mockResolvedValue(respond(200, COGNITO_TOKENS));
    const result = await ingestHandler(formEvent("/mcp/oauth/token", tokenForm()));
    expect(result.statusCode).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(json(result)).toEqual({
      access_token: "cognito-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "cognito-refresh-token",
      scope: "openid email",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${UPSTREAM}/token`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
      grant_type: "authorization_code",
      client_id: "cognito-mcp-client",
      code: "cognito-code-1",
      redirect_uri: `https://${HOST}/mcp/oauth/callback`,
      code_verifier: VERIFIER,
    });
  });

  it("decodes a base64 body marked by API Gateway and accepts a request without resource", async () => {
    fetchMock.mockResolvedValue(respond(200, COGNITO_TOKENS));
    const result = await ingestHandler(formEvent("/mcp/oauth/token", tokenForm({ resource: undefined }), { base64: true }));
    expect(result.statusCode).toBe(200);
  });

  it.each([
    ["another client", { client_id: CIMD_ID }],
    ["another redirect", { redirect_uri: LOOPBACK_REDIRECT }],
  ])("rejects a code blob presented by %s", async (_label, overrides) => {
    const result = await ingestHandler(formEvent("/mcp/oauth/token", tokenForm(overrides)));
    expect(result.statusCode).toBe(400);
    expect(json(result).error).toBe("invalid_grant");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a forged, expired or wrong-typ code", async () => {
    for (const code of [
      "forged.code",
      signBlob({ code: "c", clientId: "diya-submit-dcr", redirectUri: CLAUDE_REDIRECT }, BLOB_KEY, {
        typ: "code",
        ttlSeconds: 1,
        now: Date.now() - 5000,
      }),
      upstreamState(),
    ]) {
      const result = await ingestHandler(formEvent("/mcp/oauth/token", tokenForm({ code })));
      expect(json(result).error).toBe("invalid_grant");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong resource with invalid_target", async () => {
    const result = await ingestHandler(formEvent("/mcp/oauth/token", tokenForm({ resource: "https://other.example/mcp" })));
    expect(json(result).error).toBe("invalid_target");
  });

  it("requires a well-formed code_verifier and the code's parameters", async () => {
    expect(json(await ingestHandler(formEvent("/mcp/oauth/token", tokenForm({ code_verifier: undefined })))).error).toBe("invalid_request");
    expect(json(await ingestHandler(formEvent("/mcp/oauth/token", tokenForm({ code_verifier: "short" })))).error).toBe("invalid_request");
    expect(json(await ingestHandler(formEvent("/mcp/oauth/token", tokenForm({ redirect_uri: undefined })))).error).toBe("invalid_request");
  });

  it("passes Cognito's invalid_grant through as 400 invalid_grant", async () => {
    fetchMock.mockResolvedValue(respond(400, { error: "invalid_grant" }));
    const result = await ingestHandler(formEvent("/mcp/oauth/token", tokenForm()));
    expect(result.statusCode).toBe(400);
    expect(json(result).error).toBe("invalid_grant");
  });

  it("answers invalid_grant for any other Cognito failure", async () => {
    fetchMock.mockResolvedValueOnce(respond(500, "oops"));
    expect(json(await ingestHandler(formEvent("/mcp/oauth/token", tokenForm()))).error).toBe("invalid_grant");
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(json(await ingestHandler(formEvent("/mcp/oauth/token", tokenForm()))).error).toBe("invalid_grant");
  });

  it("refreshes through Cognito and passes the rotated refresh token through", async () => {
    fetchMock.mockResolvedValue(respond(200, { ...COGNITO_TOKENS, refresh_token: "rotated-refresh" }));
    const result = await ingestHandler(
      formEvent("/mcp/oauth/token", {
        grant_type: "refresh_token",
        refresh_token: "old-refresh",
        client_id: "diya-submit-dcr",
        resource: RESOURCE,
      }),
    );
    expect(result.statusCode).toBe(200);
    expect(json(result)).toEqual({
      access_token: "cognito-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "rotated-refresh",
    });
    expect(Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[0][1].body))).toEqual({
      grant_type: "refresh_token",
      client_id: "cognito-mcp-client",
      refresh_token: "old-refresh",
    });
  });

  it("answers invalid_grant for a dead refresh token", async () => {
    fetchMock.mockResolvedValue(respond(400, { error: "invalid_grant" }));
    const result = await ingestHandler(
      formEvent("/mcp/oauth/token", { grant_type: "refresh_token", refresh_token: "dead", client_id: CIMD_ID }),
    );
    expect(result.statusCode).toBe(400);
    expect(json(result).error).toBe("invalid_grant");
  });

  it("refuses a refresh from an unknown client and an unsupported grant type", async () => {
    expect(
      json(await ingestHandler(formEvent("/mcp/oauth/token", { grant_type: "refresh_token", refresh_token: "r", client_id: "x" }))).error,
    ).toBe("invalid_client");
    expect(json(await ingestHandler(formEvent("/mcp/oauth/token", { grant_type: "password" }))).error).toBe("unsupported_grant_type");
    expect(
      json(await ingestHandler(formEvent("/mcp/oauth/token", { grant_type: "refresh_token", client_id: "diya-submit-dcr" }))).error,
    ).toBe("invalid_request");
  });

  it("refuses a body that is not form-encoded", async () => {
    const result = await ingestHandler(
      event({
        method: "POST",
        path: "/mcp/oauth/token",
        body: JSON.stringify(tokenForm()),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(json(result).error).toBe("invalid_request");
  });
});

describe("mcpOauth revoke", () => {
  it("forwards the token to Cognito with the MCP client id and answers 200", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    const result = await ingestHandler(formEvent("/mcp/oauth/revoke", { token: "refresh-1", client_id: "diya-submit-dcr" }));
    expect(result.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${UPSTREAM}/revoke`);
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({ token: "refresh-1", client_id: "cognito-mcp-client" });
  });

  it("answers 200 whatever Cognito says", async () => {
    fetchMock.mockResolvedValueOnce(respond(400, { error: "unsupported_token_type" }));
    expect((await ingestHandler(formEvent("/mcp/oauth/revoke", { token: "t" }))).statusCode).toBe(200);
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect((await ingestHandler(formEvent("/mcp/oauth/revoke", { token: "t" }))).statusCode).toBe(200);
  });

  it("requires a token", async () => {
    expect(json(await ingestHandler(formEvent("/mcp/oauth/revoke", {}))).error).toBe("invalid_request");
  });
});

describe("mcpOauth blob key", () => {
  it("reads the key once from Secrets Manager when only the ARN is set", async () => {
    delete process.env.MCP_OAUTH_BLOB_KEY;
    process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:1:secret:prod/submit/mcp/oauth-blob-key";
    mockSecretsSend.mockResolvedValue({ SecretString: BLOB_KEY });
    expect((await ingestHandler(event({ path: "/mcp/oauth/authorize", query: authorizeQuery() }))).statusCode).toBe(200);
    expect((await ingestHandler(event({ path: "/mcp/oauth/authorize", query: authorizeQuery() }))).statusCode).toBe(200);
    expect(mockSecretsSend).toHaveBeenCalledTimes(1);
    expect(mockSecretsSend.mock.calls[0][0].input).toEqual({ SecretId: process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN });
  });

  it("answers 500 when no key is configured", async () => {
    delete process.env.MCP_OAUTH_BLOB_KEY;
    const result = await ingestHandler(event({ path: "/mcp/oauth/authorize", query: authorizeQuery() }));
    expect(result.statusCode).toBe(500);
  });
});

describe("mcpOauth helpers", () => {
  it("cuts scope to openid email profile and uses all three when nothing is left", () => {
    expect(cutScope("profile offline_access openid")).toBe("openid profile");
    expect(cutScope("offline_access")).toBe("openid email profile");
    expect(cutScope(undefined)).toBe("openid email profile");
  });

  it("matches resource on scheme, host and path only", () => {
    expect(resourceMatches(`https://${HOST}/mcp`, HOST)).toBe(true);
    expect(resourceMatches(`https://${HOST}/mcp?x=1`, HOST)).toBe(false);
    expect(resourceMatches(`http://${HOST}/mcp`, HOST)).toBe(false);
    expect(resourceMatches(`https://${HOST}:444/mcp`, HOST)).toBe(false);
    expect(resourceMatches("not a url", HOST)).toBe(false);
  });
});

describe("mcpOauth logging", () => {
  it("never logs a code, token, verifier or blob across the whole flow", async () => {
    const { consent, nonce } = await consentFor();
    const toCognito = await ingestHandler(formEvent("/mcp/oauth/authorize", { consent }, { cookies: [`__Host-mcp_consent=${nonce}`] }));
    const upstreamBlob = location(toCognito).searchParams.get("state");
    const back = await ingestHandler(event({ path: "/mcp/oauth/callback", query: { code: "cognito-secret-code", state: upstreamBlob } }));
    const clientCode = location(back).searchParams.get("code");
    fetchMock.mockResolvedValue(respond(200, COGNITO_TOKENS));
    const tokens = await ingestHandler(formEvent("/mcp/oauth/token", tokenForm({ code: clientCode })));
    expect(tokens.statusCode).toBe(200);
    await ingestHandler(
      formEvent("/mcp/oauth/token", { grant_type: "refresh_token", refresh_token: "cognito-refresh-token", client_id: "diya-submit-dcr" }),
    );
    await ingestHandler(formEvent("/mcp/oauth/revoke", { token: "cognito-refresh-token" }));

    expect(loggedLines.length).toBeGreaterThan(0);
    const logged = JSON.stringify(loggedLines);
    for (const secret of [
      consent,
      nonce,
      upstreamBlob,
      clientCode,
      "cognito-secret-code",
      VERIFIER,
      CHALLENGE,
      "cognito-access-token",
      "cognito-refresh-token",
      "cognito-id-token",
      BLOB_KEY,
    ]) {
      expect(logged).not.toContain(secret);
    }
    expect(logged).toContain('"outcome":"tokens_issued"');
    expect(logged).toContain('"redirectHost":"claude.ai"');
  });
});
