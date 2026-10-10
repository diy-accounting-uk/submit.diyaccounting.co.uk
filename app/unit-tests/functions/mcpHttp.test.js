// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/mcpHttp.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockVerify = vi.fn();
vi.mock("aws-jwt-verify", () => ({
  JwtVerifier: { create: vi.fn().mockReturnValue({ verify: (...args) => mockVerify(...args) }) },
}));

const mockCreateMcpSession = vi.fn();
const mockGetMcpSession = vi.fn();
const mockUpdateMcpSessionCloud = vi.fn();
const mockDeleteMcpSession = vi.fn();
vi.mock("@app/data/dynamoDbMcpSessionRepository.js", () => ({
  createMcpSession: (...args) => mockCreateMcpSession(...args),
  getMcpSession: (...args) => mockGetMcpSession(...args),
  updateMcpSessionCloud: (...args) => mockUpdateMcpSessionCloud(...args),
  deleteMcpSession: (...args) => mockDeleteMcpSession(...args),
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
const { _setTestSalt, hashSub } = await import("@app/services/subHasher.js");

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

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};
const TOOLS_CALL = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "derive_vat_return", arguments: {} } };

beforeEach(() => {
  vi.clearAllMocks();
  _setTestSalt("test-salt-for-unit-tests");
  process.env.MCP_PUBLIC_HOSTS = HOST;
  process.env.MCP_ALLOWED_ORIGINS = `https://claude.ai,https://claude.com,https://${HOST}`;
  process.env.MCP_TOKEN_ISSUER = "https://issuer.test.example";
  process.env.MCP_TOKEN_JWKS_URI = "https://issuer.test.example/jwks.json";
  process.env.MCP_TOKEN_CLIENT_ID = "mcp-client";
  mockVerify.mockResolvedValue({ sub: USER_SUB, token_use: "access", client_id: "mcp-client" });
  mockHandleMcpRequest.mockImplementation(
    async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), { status: 200, headers: { "content-type": "application/json" } }),
  );
});

describe("mcpHttp ingestHandler", () => {
  it("answers 401 with the resource metadata challenge when no token is sent", async () => {
    const result = await ingestHandler(mcpEvent({ headers: { authorization: undefined }, body: INITIALIZE }));
    expect(result.statusCode).toBe(401);
    expect(result.headers["WWW-Authenticate"]).toBe(WWW_AUTHENTICATE_NO_TOKEN);
    expect(JSON.parse(result.body)).toMatchObject({ jsonrpc: "2.0", id: null });
    expect(mockVerify).not.toHaveBeenCalled();
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
    expect(mockCreateMcpSession).toHaveBeenCalledWith(OWN_HASH());
    const [request, options] = mockHandleMcpRequest.mock.calls[0];
    expect(request.url).toBe(`https://${HOST}/mcp`);
    expect(await request.json()).toMatchObject({ method: "initialize" });
    expect(await options.session.credentials.accessToken()).toBe("good-token");
    expect(await options.session.credentials.idToken()).toBeNull();
  });

  it("answers 400 when a non-initialize POST has no Mcp-Session-Id", async () => {
    const result = await ingestHandler(mcpEvent({ body: TOOLS_CALL }));
    expect(result.statusCode).toBe(400);
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
});
