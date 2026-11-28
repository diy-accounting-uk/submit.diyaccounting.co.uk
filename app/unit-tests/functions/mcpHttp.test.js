// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/mcpHttp.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockVerify = vi.fn();
const verifierConfigs = vi.hoisted(() => []);
vi.mock("aws-jwt-verify", () => ({
  JwtVerifier: {
    create: (config) => {
      verifierConfigs.push(config);
      return { verify: (...args) => mockVerify(...args) };
    },
  },
}));

const mockCreateMcpSession = vi.fn();
const mockGetMcpSession = vi.fn();
const mockUpdateMcpSessionCloud = vi.fn();
const mockDeleteMcpSession = vi.fn();
const mockUpdateMcpSessionHmrcGrant = vi.fn();
const mockGetMcpUserBook = vi.fn();
const mockPutMcpUserBook = vi.fn();
vi.mock("@app/data/dynamoDbMcpSessionRepository.js", () => ({
  createMcpSession: (...args) => mockCreateMcpSession(...args),
  getMcpSession: (...args) => mockGetMcpSession(...args),
  updateMcpSessionCloud: (...args) => mockUpdateMcpSessionCloud(...args),
  updateMcpSessionHmrcGrant: (...args) => mockUpdateMcpSessionHmrcGrant(...args),
  deleteMcpSession: (...args) => mockDeleteMcpSession(...args),
  getMcpUserBook: (...args) => mockGetMcpUserBook(...args),
  putMcpUserBook: (...args) => mockPutMcpUserBook(...args),
}));

const mockHandleMcpRequest = vi.fn();
vi.mock("../../../mcp/lib/http.js", () => ({
  handleMcpRequest: (...args) => mockHandleMcpRequest(...args),
}));

const mockRestoreCloudBook = vi.fn();
vi.mock("../../../mcp/lib/book-tools.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, restoreCloudBook: (...args) => mockRestoreCloudBook(...args) };
});

const { ingestHandler } = await import("@app/functions/mcp/mcpHttp.js");
const { hostedToolNames } = await import("../../../mcp/lib/hosted-tools.js");
const { _setTestSalt, hashSub } = await import("@app/services/subHasher.js");
const { HOSTED_CLIENT_ADDRESS_HEADER, readHostedClientAddress } = await import("@app/lib/hostedClientAddress.js");

const HOST = "submit.test.example";
const USER_SUB = "user-sub-1";
const OWN_HASH = () => hashSub(USER_SUB);
const WWW_AUTHENTICATE_NO_TOKEN = `Bearer resource_metadata="https://${HOST}/.well-known/oauth-protected-resource/mcp", scope="openid email profile"`;

function mcpEvent({ method = "POST", headers = {}, body } = {}) {
  return {
    requestContext: { http: { method, path: "/mcp" } },
    headers: { "host": HOST, "authorization": "Bearer good-token", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

const VIEWER_HEADERS = { "x-forwarded-for": "198.51.100.7, 10.0.0.1", "cloudfront-viewer-address": "198.51.100.7:50100" };

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};
const TOOLS_CALL = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "derive_vat_return", arguments: {} } };
const TOOLS_LIST = { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} };
const PING = { jsonrpc: "2.0", id: 4, method: "ping" };
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };
const NO_TOKEN = { authorization: undefined };

function expectNoAccountRead() {
  expect(mockVerify).not.toHaveBeenCalled();
  expect(mockCreateMcpSession).not.toHaveBeenCalled();
  expect(mockGetMcpSession).not.toHaveBeenCalled();
  expect(mockUpdateMcpSessionCloud).not.toHaveBeenCalled();
  expect(mockUpdateMcpSessionHmrcGrant).not.toHaveBeenCalled();
  expect(mockDeleteMcpSession).not.toHaveBeenCalled();
  expect(mockRestoreCloudBook).not.toHaveBeenCalled();
  expect(mockGetMcpUserBook).not.toHaveBeenCalled();
  expect(mockPutMcpUserBook).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  _setTestSalt("test-salt-for-unit-tests");
  process.env.MCP_PUBLIC_HOSTS = HOST;
  process.env.MCP_ALLOWED_ORIGINS = `https://claude.ai,https://claude.com,https://${HOST}`;
  process.env.MCP_TOKEN_ISSUER = "https://issuer.test.example";
  process.env.MCP_TOKEN_JWKS_URI = "https://issuer.test.example/jwks.json";
  process.env.MCP_TOKEN_CLIENT_ID = "mcp-client";
  mockVerify.mockResolvedValue({ sub: USER_SUB, token_use: "access", client_id: "mcp-client" });
  mockGetMcpUserBook.mockResolvedValue(null);
  mockHandleMcpRequest.mockImplementation(
    async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), { status: 200, headers: { "content-type": "application/json" } }),
  );
});

describe("mcpHttp ingestHandler", () => {
  it("answers 401 with the resource metadata challenge to a tools/call with no token", async () => {
    const result = await ingestHandler(mcpEvent({ headers: NO_TOKEN, body: TOOLS_CALL }));
    expect(result.statusCode).toBe(401);
    expect(result.headers["WWW-Authenticate"]).toBe(WWW_AUTHENTICATE_NO_TOKEN);
    expect(JSON.parse(result.body)).toMatchObject({ jsonrpc: "2.0", id: null });
    expect(mockHandleMcpRequest).not.toHaveBeenCalled();
    expectNoAccountRead();
  });

  it.each([
    ["initialize", INITIALIZE],
    ["notifications/initialized", INITIALIZED],
    ["ping", PING],
    ["tools/list", TOOLS_LIST],
  ])("answers %s with no token, without a stored session and without reading an account", async (_name, body) => {
    const result = await ingestHandler(mcpEvent({ headers: NO_TOKEN, body }));
    expect(result.statusCode).toBe(200);
    expect(result.headers["Mcp-Session-Id"]).toBeUndefined();
    expect(mockHandleMcpRequest).toHaveBeenCalledOnce();
    expectNoAccountRead();
  });

  it("gives an anonymous caller a session that holds no book, no grant and no credentials", async () => {
    await ingestHandler(mcpEvent({ headers: { ...NO_TOKEN, ...VIEWER_HEADERS }, body: TOOLS_LIST }));
    const { session } = mockHandleMcpRequest.mock.calls[0][1];
    expect(session).toMatchObject({ book: null, lines: null, cloud: null, hmrcGrant: null });
    await expect(session.credentials.accessToken()).rejects.toThrow(/sign in/);
    await expect(session.clientHeaders()).rejects.toThrow(/sign in/);
  });

  it("lists the prod tool set to an anonymous caller on prod and the environment's set elsewhere", async () => {
    const saved = process.env.ENVIRONMENT_NAME;
    try {
      process.env.ENVIRONMENT_NAME = "prod";
      await ingestHandler(mcpEvent({ headers: NO_TOKEN, body: TOOLS_LIST }));
      expect(mockHandleMcpRequest.mock.calls[0][1].toolNames).toEqual(hostedToolNames("prod"));

      process.env.ENVIRONMENT_NAME = "ci";
      await ingestHandler(mcpEvent({ headers: NO_TOKEN, body: TOOLS_LIST }));
      expect(mockHandleMcpRequest.mock.calls[1][1].toolNames).toEqual(hostedToolNames("ci"));
    } finally {
      if (saved === undefined) delete process.env.ENVIRONMENT_NAME;
      else process.env.ENVIRONMENT_NAME = saved;
    }
  });

  it.each([
    ["resources/list", { jsonrpc: "2.0", id: 5, method: "resources/list" }],
    ["resources/read", { jsonrpc: "2.0", id: 6, method: "resources/read", params: { uri: "ui://widget/vat-review-card.html" } }],
    ["prompts/list", { jsonrpc: "2.0", id: 7, method: "prompts/list" }],
    ["a batch that hides a tools/call behind a tools/list", [TOOLS_LIST, TOOLS_CALL]],
    ["a batch of tools/list alone", [TOOLS_LIST]],
    ["a body that is not JSON", "{not json"],
    ["a body with no method", { jsonrpc: "2.0", id: 8 }],
  ])("answers 401 with the challenge to %s with no token", async (_name, body) => {
    const event = mcpEvent({ headers: NO_TOKEN });
    event.body = typeof body === "string" ? body : JSON.stringify(body);
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
    expect(result.headers["WWW-Authenticate"]).toBe(WWW_AUTHENTICATE_NO_TOKEN);
    expect(mockHandleMcpRequest).not.toHaveBeenCalled();
    expectNoAccountRead();
  });

  it("answers 401 to a DELETE with no token", async () => {
    const result = await ingestHandler(mcpEvent({ method: "DELETE", headers: { ...NO_TOKEN, "mcp-session-id": "s-4" } }));
    expect(result.statusCode).toBe(401);
    expect(result.headers["WWW-Authenticate"]).toBe(WWW_AUTHENTICATE_NO_TOKEN);
    expectNoAccountRead();
  });

  it("answers 401 invalid_token to a tools/list that carries a token that does not verify", async () => {
    mockVerify.mockRejectedValue(new Error("expired"));
    const result = await ingestHandler(mcpEvent({ body: TOOLS_LIST }));
    expect(result.statusCode).toBe(401);
    expect(result.headers["WWW-Authenticate"]).toBe(`${WWW_AUTHENTICATE_NO_TOKEN}, error="invalid_token"`);
    expect(mockHandleMcpRequest).not.toHaveBeenCalled();
  });

  it("answers 401 invalid_token to a tools/list whose Authorization header is not a bearer token", async () => {
    const result = await ingestHandler(mcpEvent({ headers: { authorization: "Basic dXNlcjpwYXNz" }, body: TOOLS_LIST }));
    expect(result.statusCode).toBe(401);
    expect(result.headers["WWW-Authenticate"]).toBe(`${WWW_AUTHENTICATE_NO_TOKEN}, error="invalid_token"`);
    expect(mockHandleMcpRequest).not.toHaveBeenCalled();
    expectNoAccountRead();
  });

  it("binds the token by issuer and by the MCP's own app client, and refuses a token from another client", async () => {
    mockCreateMcpSession.mockResolvedValue({ sessionId: "s-1" });
    await ingestHandler(mcpEvent({ body: INITIALIZE }));
    const config = verifierConfigs.at(-1);
    expect(config.issuer).toBe("https://issuer.test.example");
    expect(config.audience).toBeNull();
    expect(() => config.customJwtCheck({ payload: { token_use: "access", client_id: "mcp-client" } })).not.toThrow();
    expect(() => config.customJwtCheck({ payload: { token_use: "access", client_id: "web-client" } })).toThrow(/another client/);
    expect(() => config.customJwtCheck({ payload: { token_use: "id", client_id: "mcp-client" } })).toThrow(/token_use/);
  });

  it("adds error=invalid_token to the challenge when the token does not verify", async () => {
    mockVerify.mockRejectedValue(new Error("expired"));
    const result = await ingestHandler(mcpEvent({ body: INITIALIZE }));
    expect(result.statusCode).toBe(401);
    expect(result.headers["WWW-Authenticate"]).toBe(`${WWW_AUTHENTICATE_NO_TOKEN}, error="invalid_token"`);
    expect(mockHandleMcpRequest).not.toHaveBeenCalled();
  });

  it("answers 403 when the Origin is not allowed", async () => {
    const result = await ingestHandler(mcpEvent({ headers: { origin: "https://evil.example" }, body: INITIALIZE }));
    expect(result.statusCode).toBe(403);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("accepts an allowed Origin", async () => {
    mockCreateMcpSession.mockResolvedValue({ sessionId: "s-1" });
    const result = await ingestHandler(mcpEvent({ headers: { origin: "https://claude.ai" }, body: INITIALIZE }));
    expect(result.statusCode).toBe(200);
  });

  it("answers 405 with Allow on GET", async () => {
    const result = await ingestHandler(mcpEvent({ method: "GET" }));
    expect(result.statusCode).toBe(405);
    expect(result.headers.Allow).toBe("POST, DELETE");
  });

  it("creates a session on initialize and returns Mcp-Session-Id", async () => {
    mockCreateMcpSession.mockResolvedValue({ sessionId: "session-abc" });
    const result = await ingestHandler(mcpEvent({ body: INITIALIZE }));
    expect(result.statusCode).toBe(200);
    expect(result.headers["Mcp-Session-Id"]).toBe("session-abc");
    expect(mockCreateMcpSession).toHaveBeenCalledWith(OWN_HASH(), "other");
    const [request, options] = mockHandleMcpRequest.mock.calls[0];
    expect(request.url).toBe(`https://${HOST}/mcp`);
    expect(await request.json()).toMatchObject({ method: "initialize" });
    expect(await options.session.credentials.accessToken()).toBe("good-token");
    expect(await options.session.credentials.idToken()).toBeNull();
  });

  it("stores the kind of assistant initialize names and gives it to the tools", async () => {
    mockCreateMcpSession.mockResolvedValue({ sessionId: "session-claude" });
    const initialize = { ...INITIALIZE, params: { ...INITIALIZE.params, clientInfo: { name: "claude-ai", version: "0.1.0" } } };
    await ingestHandler(mcpEvent({ body: initialize }));
    expect(mockCreateMcpSession).toHaveBeenCalledWith(OWN_HASH(), "claude");
    expect(mockHandleMcpRequest.mock.calls[0][1].session.client).toBe("claude");
  });

  it("stores unknown when initialize names no client", async () => {
    mockCreateMcpSession.mockResolvedValue({ sessionId: "session-nameless" });
    const { clientInfo, ...params } = INITIALIZE.params;
    expect(clientInfo.name).toBe("test");
    await ingestHandler(mcpEvent({ body: { ...INITIALIZE, params } }));
    expect(mockCreateMcpSession).toHaveBeenCalledWith(OWN_HASH(), "unknown");
  });

  it("gives the tools the assistant kind the stored session holds", async () => {
    mockGetMcpSession.mockResolvedValue({ sessionId: "s-7", hashedSub: OWN_HASH(), client: "chatgpt", cloud: null });
    await ingestHandler(mcpEvent({ headers: { "mcp-session-id": "s-7" }, body: TOOLS_CALL }));
    expect(mockHandleMcpRequest.mock.calls[0][1].session.client).toBe("chatgpt");
    expect(mockCreateMcpSession).not.toHaveBeenCalled();
  });

  it("gives the tools the caller's signed address and the MCP's version pair", async () => {
    mockCreateMcpSession.mockResolvedValue({ sessionId: "session-abc" });
    await ingestHandler(mcpEvent({ body: INITIALIZE, headers: VIEWER_HEADERS }));

    const headers = await mockHandleMcpRequest.mock.calls[0][1].session.clientHeaders();

    expect(headers["Gov-Vendor-Version"]).toMatch(/^diya-submit-mcp=/);
    expect(readHostedClientAddress(headers[HOSTED_CLIENT_ADDRESS_HEADER], USER_SUB)).toMatchObject({
      ip: "198.51.100.7",
      port: "50100",
    });
  });

  it("hands the transport the prod tool list in prod and the full list elsewhere", async () => {
    const saved = process.env.ENVIRONMENT_NAME;
    mockCreateMcpSession.mockResolvedValue({ sessionId: "session-abc" });
    try {
      process.env.ENVIRONMENT_NAME = "prod";
      await ingestHandler(mcpEvent({ body: INITIALIZE }));
      expect(mockHandleMcpRequest.mock.calls[0][1].toolNames).toContain("open_book");
      expect(mockHandleMcpRequest.mock.calls[0][1].toolNames).not.toContain("submit_vat_return");
      expect(mockHandleMcpRequest.mock.calls[0][1].toolNames).not.toContain("submit_itsa_quarterly_update");

      process.env.ENVIRONMENT_NAME = "ci";
      await ingestHandler(mcpEvent({ body: INITIALIZE }));
      expect(mockHandleMcpRequest.mock.calls[1][1].toolNames).toContain("submit_itsa_quarterly_update");
    } finally {
      if (saved === undefined) delete process.env.ENVIRONMENT_NAME;
      else process.env.ENVIRONMENT_NAME = saved;
    }
  });

  it("hands a caller in the reviewer group the prod tool list outside prod", async () => {
    const saved = process.env.ENVIRONMENT_NAME;
    mockCreateMcpSession.mockResolvedValue({ sessionId: "session-abc" });
    mockVerify.mockResolvedValue({
      "sub": USER_SUB,
      "token_use": "access",
      "client_id": "mcp-client",
      "cognito:groups": ["mcp-reviewer"],
    });
    try {
      process.env.ENVIRONMENT_NAME = "ci";
      await ingestHandler(mcpEvent({ body: INITIALIZE }));
      const { toolNames } = mockHandleMcpRequest.mock.calls[0][1];
      expect(toolNames).toContain("open_book");
      expect(toolNames).not.toContain("submit_itsa_quarterly_update");
    } finally {
      if (saved === undefined) delete process.env.ENVIRONMENT_NAME;
      else process.env.ENVIRONMENT_NAME = saved;
    }
  });

  it("starts the session on a signed-in tools/call that has no Mcp-Session-Id, and stores the book it opens there", async () => {
    mockCreateMcpSession.mockResolvedValue({ sessionId: "s-new", hashedSub: OWN_HASH(), cloud: null });
    mockHandleMcpRequest.mockImplementationOnce(async (_request, { session }) => {
      session.cloud = { bookId: "book-9", clientId: null, etag: "e1" };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await ingestHandler(mcpEvent({ body: TOOLS_CALL }));
    expect(result.statusCode).toBe(200);
    expect(result.headers["Mcp-Session-Id"]).toBe("s-new");
    expect(mockCreateMcpSession).toHaveBeenCalledWith(OWN_HASH(), "unknown");
    expect(mockHandleMcpRequest.mock.calls[0][1].session.client).toBe("unknown");
    expect(mockGetMcpSession).not.toHaveBeenCalled();
    expect(await mockHandleMcpRequest.mock.calls[0][1].session.credentials.accessToken()).toBe("good-token");
    expect(mockUpdateMcpSessionCloud).toHaveBeenCalledWith("s-new", { bookId: "book-9", clientId: null, etag: "e1" });
  });

  it("answers 400 when a DELETE has no Mcp-Session-Id", async () => {
    const result = await ingestHandler(mcpEvent({ method: "DELETE" }));
    expect(result.statusCode).toBe(400);
    expect(mockDeleteMcpSession).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown session", async () => {
    mockGetMcpSession.mockResolvedValue(null);
    const result = await ingestHandler(mcpEvent({ headers: { "mcp-session-id": "nope" }, body: TOOLS_CALL }));
    expect(result.statusCode).toBe(404);
    expect(mockHandleMcpRequest).not.toHaveBeenCalled();
  });

  it("answers 404 for another user's session", async () => {
    mockGetMcpSession.mockResolvedValue({ sessionId: "s-2", hashedSub: "someone-else", cloud: null });
    const result = await ingestHandler(mcpEvent({ headers: { "mcp-session-id": "s-2" }, body: TOOLS_CALL }));
    expect(result.statusCode).toBe(404);
    expect(mockHandleMcpRequest).not.toHaveBeenCalled();
  });

  it("reloads the stored cloud book before a tool call and writes back a changed pointer", async () => {
    mockGetMcpSession.mockResolvedValue({
      sessionId: "s-3",
      hashedSub: OWN_HASH(),
      cloud: { bookId: "book-1", clientId: null, etag: "e1" },
    });
    mockRestoreCloudBook.mockImplementation(async (session, pointer) => {
      session.book = { name: "book" };
      session.lines = [];
      session.cloud = { ...pointer, etag: "e2" };
    });
    const result = await ingestHandler(mcpEvent({ headers: { "mcp-session-id": "s-3" }, body: TOOLS_CALL }));
    expect(result.statusCode).toBe(200);
    expect(mockRestoreCloudBook).toHaveBeenCalledOnce();
    expect(mockHandleMcpRequest.mock.calls[0][1].session.book).toEqual({ name: "book" });
    expect(mockUpdateMcpSessionCloud).toHaveBeenCalledWith("s-3", { bookId: "book-1", clientId: null, etag: "e2" });
  });

  it("writes back the etag a tool call's save gave the open book, so the next call reopens the saved version", async () => {
    mockGetMcpSession.mockResolvedValue({
      sessionId: "s-7",
      hashedSub: OWN_HASH(),
      cloud: { bookId: "book-1", clientId: null, etag: "e1" },
    });
    mockRestoreCloudBook.mockImplementation(async (session, pointer) => {
      session.book = { name: "book" };
      session.lines = [];
      session.cloud = { ...pointer };
    });
    mockHandleMcpRequest.mockImplementationOnce(async (_request, { session }) => {
      session.cloud = { bookId: "book-1", clientId: null, etag: "e-saved" };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await ingestHandler(mcpEvent({ headers: { "mcp-session-id": "s-7" }, body: TOOLS_CALL }));
    expect(mockUpdateMcpSessionCloud).toHaveBeenCalledWith("s-7", { bookId: "book-1", clientId: null, etag: "e-saved" });
    expect(mockPutMcpUserBook).toHaveBeenCalledWith(OWN_HASH(), { bookId: "book-1", clientId: null, etag: "e-saved" });
  });

  it("hands the stored HMRC grant to the tools and leaves it alone when no tool changed it", async () => {
    const hmrcGrant = { grantId: "11111111-2222-4333-8444-555555555555", hmrcAccount: "live" };
    mockGetMcpSession.mockResolvedValue({ sessionId: "s-5", hashedSub: OWN_HASH(), cloud: null, hmrcGrant });
    await ingestHandler(mcpEvent({ headers: { "mcp-session-id": "s-5" }, body: TOOLS_CALL }));
    expect(mockHandleMcpRequest.mock.calls[0][1].session.hmrcGrant).toEqual(hmrcGrant);
    expect(mockUpdateMcpSessionHmrcGrant).not.toHaveBeenCalled();
  });

  it("writes back the grant a tool call started", async () => {
    mockGetMcpSession.mockResolvedValue({ sessionId: "s-6", hashedSub: OWN_HASH(), cloud: null });
    const started = { grantId: "aaaaaaaa-2222-4333-8444-555555555555", hmrcAccount: "synthetic" };
    mockHandleMcpRequest.mockImplementationOnce(async (_request, { session }) => {
      session.hmrcGrant = started;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await ingestHandler(mcpEvent({ headers: { "mcp-session-id": "s-6" }, body: TOOLS_CALL }));
    expect(mockUpdateMcpSessionHmrcGrant).toHaveBeenCalledWith("s-6", started);
  });

  it("deletes the caller's own session and answers 204", async () => {
    mockGetMcpSession.mockResolvedValue({ sessionId: "s-4", hashedSub: OWN_HASH(), cloud: null });
    const result = await ingestHandler(mcpEvent({ method: "DELETE", headers: { "mcp-session-id": "s-4" } }));
    expect(result.statusCode).toBe(204);
    expect(mockDeleteMcpSession).toHaveBeenCalledWith("s-4");
  });

  it("does not delete another user's session", async () => {
    mockGetMcpSession.mockResolvedValue({ sessionId: "s-5", hashedSub: "someone-else", cloud: null });
    const result = await ingestHandler(mcpEvent({ method: "DELETE", headers: { "mcp-session-id": "s-5" } }));
    expect(result.statusCode).toBe(404);
    expect(mockDeleteMcpSession).not.toHaveBeenCalled();
  });
  describe("the user's last open book", () => {
    const userBooks = new Map();
    const OPEN_BOOK = { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "open_book", arguments: { bookId: "book-u1" } } };

    function okResponse() {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    beforeEach(() => {
      userBooks.clear();
      let sessionNumber = 0;
      mockCreateMcpSession.mockImplementation(async (hashedSub) => ({ sessionId: `s-u${++sessionNumber}`, hashedSub, cloud: null }));
      mockGetMcpUserBook.mockImplementation(async (hashedSub) => userBooks.get(hashedSub) ?? null);
      mockPutMcpUserBook.mockImplementation(async (hashedSub, cloud) => userBooks.set(hashedSub, cloud));
      mockRestoreCloudBook.mockImplementation(async (session, pointer) => {
        session.book = { name: pointer.bookId };
        session.lines = [];
        session.cloud = { ...pointer };
      });
      mockHandleMcpRequest.mockImplementation(async (_request, { session }) => {
        if (session.book === null) {
          session.book = { name: "book-u1" };
          session.lines = [];
          session.cloud = { bookId: "book-u1", clientId: null, etag: "eu1" };
        }
        return okResponse();
      });
    });

    it("derives from the book an open_book in another session opened, on a tools/call with no Mcp-Session-Id", async () => {
      const opened = await ingestHandler(mcpEvent({ body: OPEN_BOOK }));
      expect(opened.headers["Mcp-Session-Id"]).toBe("s-u1");
      expect(mockPutMcpUserBook).toHaveBeenCalledWith(OWN_HASH(), { bookId: "book-u1", clientId: null, etag: "eu1" });

      let bookAtDerive;
      mockHandleMcpRequest.mockImplementationOnce(async (_request, { session }) => {
        bookAtDerive = session.book;
        return okResponse();
      });
      const derived = await ingestHandler(mcpEvent({ body: TOOLS_CALL }));
      expect(derived.statusCode).toBe(200);
      expect(derived.headers["Mcp-Session-Id"]).toBe("s-u2");
      expect(bookAtDerive).toEqual({ name: "book-u1" });
      expect(mockGetMcpUserBook).toHaveBeenLastCalledWith(OWN_HASH());
      expect(mockPutMcpUserBook).toHaveBeenCalledOnce();
    });

    it("never restores another user's book", async () => {
      await ingestHandler(mcpEvent({ body: OPEN_BOOK }));
      mockVerify.mockResolvedValue({ sub: "user-sub-2", token_use: "access", client_id: "mcp-client" });

      let bookAtDerive;
      mockHandleMcpRequest.mockImplementationOnce(async (_request, { session }) => {
        bookAtDerive = session.book;
        return okResponse();
      });
      await ingestHandler(mcpEvent({ body: TOOLS_CALL }));
      expect(bookAtDerive).toBeNull();
      expect(mockGetMcpUserBook).toHaveBeenLastCalledWith(hashSub("user-sub-2"));
      expect(mockRestoreCloudBook).not.toHaveBeenCalled();
    });

    it("keeps the book a stored session holds over the user's last open book", async () => {
      userBooks.set(OWN_HASH(), { bookId: "book-other", clientId: null, etag: "e9" });
      mockGetMcpSession.mockResolvedValue({
        sessionId: "s-7",
        hashedSub: OWN_HASH(),
        cloud: { bookId: "book-7", clientId: null, etag: "e7" },
      });
      let bookAtCall;
      mockHandleMcpRequest.mockImplementationOnce(async (_request, { session }) => {
        bookAtCall = session.book;
        return okResponse();
      });
      await ingestHandler(mcpEvent({ headers: { "mcp-session-id": "s-7" }, body: TOOLS_CALL }));
      expect(bookAtCall).toEqual({ name: "book-7" });
      expect(mockGetMcpUserBook).not.toHaveBeenCalled();
      expect(mockPutMcpUserBook).not.toHaveBeenCalled();
    });

    it("answers the tool call with no book when the user's last open book cannot be reopened", async () => {
      userBooks.set(OWN_HASH(), { bookId: "book-gone", clientId: null, etag: "e1" });
      mockRestoreCloudBook.mockRejectedValueOnce(new Error("Not found"));
      let bookAtCall;
      mockHandleMcpRequest.mockImplementationOnce(async (_request, { session }) => {
        bookAtCall = session.book;
        return okResponse();
      });
      const result = await ingestHandler(mcpEvent({ body: TOOLS_CALL }));
      expect(result.statusCode).toBe(200);
      expect(bookAtCall).toBeNull();
    });
  });
});
