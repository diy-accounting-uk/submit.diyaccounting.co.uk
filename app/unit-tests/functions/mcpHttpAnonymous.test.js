// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/mcpHttpAnonymous.test.js
// The hosted endpoint with its real MCP transport, called with no Authorization header.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockVerify = vi.fn();
vi.mock("aws-jwt-verify", () => ({
  JwtVerifier: { create: () => ({ verify: (...args) => mockVerify(...args) }) },
}));

const sessionStore = vi.hoisted(() => ({ calls: [] }));
vi.mock("@app/data/dynamoDbMcpSessionRepository.js", () => {
  const record =
    (name) =>
    async (...args) => {
      sessionStore.calls.push(name);
      throw new Error(`${name} must not run for an anonymous caller`);
    };
  return {
    createMcpSession: record("createMcpSession"),
    getMcpSession: record("getMcpSession"),
    updateMcpSessionCloud: record("updateMcpSessionCloud"),
    updateMcpSessionHmrcGrant: record("updateMcpSessionHmrcGrant"),
    deleteMcpSession: record("deleteMcpSession"),
    getMcpUserBook: record("getMcpUserBook"),
    putMcpUserBook: record("putMcpUserBook"),
  };
});

const { ingestHandler } = await import("@app/functions/mcp/mcpHttp.js");
const { hostedToolNames } = await import("../../../mcp/lib/hosted-tools.js");

const HOST = "submit.test.example";
const WWW_AUTHENTICATE_NO_TOKEN = `Bearer resource_metadata="https://${HOST}/.well-known/oauth-protected-resource/mcp", scope="openid email profile"`;

function anonymousPost(body) {
  return {
    requestContext: { http: { method: "POST", path: "/mcp" } },
    headers: { "host": HOST, "content-type": "application/json", "accept": "application/json, text/event-stream" },
    body: JSON.stringify(body),
  };
}

let savedEnvironmentName;

beforeEach(() => {
  sessionStore.calls.length = 0;
  mockVerify.mockReset();
  savedEnvironmentName = process.env.ENVIRONMENT_NAME;
  process.env.ENVIRONMENT_NAME = "prod";
  process.env.MCP_PUBLIC_HOSTS = HOST;
  process.env.MCP_ALLOWED_ORIGINS = `https://claude.ai,https://${HOST}`;
});

afterEach(() => {
  if (savedEnvironmentName === undefined) delete process.env.ENVIRONMENT_NAME;
  else process.env.ENVIRONMENT_NAME = savedEnvironmentName;
});

describe("the hosted MCP endpoint without a token", () => {
  it("answers initialize with the server's name and capabilities and no session id", async () => {
    const result = await ingestHandler(
      anonymousPost({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "catalogue", version: "1" } },
      }),
    );
    expect(result.statusCode).toBe(200);
    expect(Object.keys(result.headers).map((name) => name.toLowerCase())).not.toContain("mcp-session-id");
    const { result: initialized } = JSON.parse(result.body);
    expect(initialized.serverInfo.name).toBe("diya-submit");
    expect(initialized.capabilities.tools).toBeDefined();
  });

  it("lists prod's six hosted tools by name, title and input schema", async () => {
    const result = await ingestHandler(anonymousPost({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
    expect(result.statusCode).toBe(200);
    const { tools } = JSON.parse(result.body).result;
    expect(tools.map((tool) => tool.name)).toEqual(hostedToolNames("prod"));
    expect(tools).toHaveLength(6);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("answers ping", async () => {
    const result = await ingestHandler(anonymousPost({ jsonrpc: "2.0", id: 3, method: "ping" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ jsonrpc: "2.0", id: 3, result: {} });
  });

  it("refuses a tools/call with 401 and the challenge that starts sign-in, for every prod tool", async () => {
    for (const name of hostedToolNames("prod")) {
      const result = await ingestHandler(anonymousPost({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name, arguments: {} } }));
      expect(result.statusCode, name).toBe(401);
      expect(result.headers["WWW-Authenticate"]).toBe(WWW_AUTHENTICATE_NO_TOKEN);
    }
  });

  it("never touches the sessions table or verifies a token", async () => {
    await ingestHandler(anonymousPost({ jsonrpc: "2.0", id: 5, method: "tools/list", params: {} }));
    await ingestHandler(anonymousPost({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "list_books", arguments: {} } }));
    expect(sessionStore.calls).toEqual([]);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
