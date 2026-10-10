// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/mcpHosted.system.test.js
//
// The hosted MCP endpoint through the Express server: an SDK client over streamable HTTP with a
// bearer signed by a key the test caches into the verifier, sessions in a dynalite table, and a
// cloud book served by a stubbed storage API.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPrivateKey, createSign, generateKeyPairSync } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const FIXTURE_BOOK = resolve(dirname(fileURLToPath(import.meta.url)), "../../mcp/test/fixtures/brickwork-pro-ltd-vat");
const STORAGE_BASE_URL = "https://storage.test/";
const SESSIONS_TABLE = "mcp-hosted-system-test-sessions";
const KEY_ID = "mcp-system-test-key";
const BOOK_ID = "book-1";
const realFetch = globalThis.fetch;

let stopDynalite;
let httpServer;
let mcpUrl;
let privateKeyPem;

function base64Url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function signedAccessToken({ sub = "mcp-system-test-user", clientId = process.env.MCP_TOKEN_CLIENT_ID, ttlSeconds = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: KEY_ID };
  const payload = {
    iss: process.env.MCP_TOKEN_ISSUER,
    sub,
    token_use: "access",
    client_id: clientId,
    scope: "openid email profile",
    iat: now,
    exp: now + ttlSeconds,
  };
  const signingInput = `${base64Url(header)}.${base64Url(payload)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(createPrivateKey(privateKeyPem));
  return `${signingInput}.${signature.toString("base64url")}`;
}

async function connectClient(token) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: realFetch,
  });
  const client = new Client({ name: "mcp-hosted-system-test", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

function rawPost(body, headers = {}) {
  return realFetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}

function structured(result) {
  expect(result.isError).toBeFalsy();
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}

beforeAll(async () => {
  const { default: dynalite } = await import("dynalite");
  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolveListen, reject) => {
    server.listen(0, "127.0.0.1", (error) => (error ? reject(error) : resolveListen(server.address())));
  });
  stopDynalite = async () => {
    try {
      server.close();
    } catch {}
  };
  const dynamoEndpoint = `http://127.0.0.1:${address.port}`;
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = "dummy";
  process.env.AWS_ENDPOINT_URL = dynamoEndpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = dynamoEndpoint;
  process.env.MCP_SESSIONS_DYNAMODB_TABLE_NAME = SESSIONS_TABLE;
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-mcp-hosted-system-tests"}}';
  process.env.DIYA_SUBMIT_BASE_URL = STORAGE_BASE_URL;

  const { ensureMcpSessionsTableExists } = await import("../bin/dynamodb.js");
  await ensureMcpSessionsTableExists(SESSIONS_TABLE, dynamoEndpoint);

  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const { getTokenVerifier } = await import("../functions/mcp/mcpHttp.js");
  getTokenVerifier().cacheJwks({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KEY_ID, alg: "RS256", use: "sig" }] });

  // Save the fixture book through the storage stub so tools/call can reopen it.
  let storedZipBase64;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      if (!String(url).startsWith(STORAGE_BASE_URL)) return realFetch(url, init);
      if (init?.method === "PUT") {
        storedZipBase64 = JSON.parse(init.body).zipBase64;
        return { ok: true, status: 200, json: async () => ({ metadata: { latestETag: "etag-1" } }) };
      }
      return { ok: true, status: 200, json: async () => ({ zipBase64: storedZipBase64, metadata: { latestETag: "etag-1" } }) };
    }),
  );
  const { createSession, openBook, saveBook } = await import("../../mcp/lib/book-tools.js");
  const seed = createSession({ credentials: { accessToken: async () => "seed", idToken: async () => null } });
  await openBook(seed, { path: join(FIXTURE_BOOK) });
  await saveBook(seed, { cloud: true, bookId: BOOK_ID });

  const { app } = await import("../bin/server.js");
  httpServer = await new Promise((resolveListen) => {
    const listening = app.listen(0, "127.0.0.1", () => resolveListen(listening));
  });
  const host = `127.0.0.1:${httpServer.address().port}`;
  process.env.MCP_PUBLIC_HOSTS = host;
  mcpUrl = `http://${host}/mcp`;
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise((resolveClose) => (httpServer ? httpServer.close(resolveClose) : resolveClose()));
  await stopDynalite?.();
});

describe("System: hosted MCP endpoint through Express", () => {
  it("lists the hosted tool set after initialize", async () => {
    const { HOSTED_TOOL_NAMES } = await import("../../mcp/lib/hosted-tools.js");
    const { client } = await connectClient(signedAccessToken());
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...HOSTED_TOOL_NAMES].sort());
    await client.close();
  });

  it("opens a cloud book, derives from it on a later call, and ends the session on close", async () => {
    const { client, transport } = await connectClient(signedAccessToken());
    const opened = structured(await client.callTool({ name: "open_book", arguments: { bookId: BOOK_ID } }));
    expect(opened).toBeDefined();
    const derived = await client.callTool({ name: "derive_vat_return", arguments: { periodEnd: "2025-06-30" } });
    expect(derived.isError).toBeFalsy();
    expect(derived.structuredContent).toBeDefined();

    const sessionId = transport.sessionId;
    expect(sessionId).toBeTruthy();
    await transport.terminateSession();
    const afterDelete = await rawPost(
      { jsonrpc: "2.0", id: 9, method: "tools/list" },
      { "Authorization": `Bearer ${signedAccessToken()}`, "Mcp-Session-Id": sessionId },
    );
    expect(afterDelete.status).toBe(404);
  });

  it("answers 401 with the resource metadata challenge when no token is sent", async () => {
    const response = await rawPost({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="https://${new URL(mcpUrl).host}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it("answers 401 for a token issued to another client", async () => {
    const response = await rawPost(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { Authorization: `Bearer ${signedAccessToken({ clientId: "another-client" })}` },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("answers 405 to GET", async () => {
    const response = await realFetch(mcpUrl, { headers: { Authorization: `Bearer ${signedAccessToken()}` } });
    expect(response.status).toBe(405);
  });

  it("refuses another user's session id with 404", async () => {
    const { transport, client } = await connectClient(signedAccessToken({ sub: "first-user" }));
    const response = await rawPost(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { "Authorization": `Bearer ${signedAccessToken({ sub: "second-user" })}`, "Mcp-Session-Id": transport.sessionId },
    );
    expect(response.status).toBe(404);
    await client.close();
  });
});
