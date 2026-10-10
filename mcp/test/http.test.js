// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createSession, openBook, restoreCloudBook, saveBook } from "../lib/book-tools.js";
import { HOSTED_TOOL_NAMES } from "../lib/hosted-tools.js";
import { handleMcpRequest } from "../lib/http.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const credentials = { accessToken: async () => "request-bearer", idToken: async () => null };

function post(body, headers = {}) {
  return new Request("https://submit.diyaccounting.co.uk/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};

describe("the hosted HTTP transport", () => {
  let storedZipBase64;

  beforeAll(async () => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
    const original = createSession({ credentials });
    await openBook(original, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        if (init?.method === "PUT") {
          storedZipBase64 = JSON.parse(init.body).zipBase64;
          return { ok: true, status: 200, json: async () => ({ metadata: { latestETag: "etag-1" } }) };
        }
        return { ok: true, status: 200, json: async () => ({ zipBase64: storedZipBase64, metadata: { latestETag: "etag-1" } }) };
      }),
    );
    await saveBook(original, { cloud: true, bookId: "book-1" });
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
  });

  it("answers initialize", async () => {
    const response = await handleMcpRequest(post(initialize), { session: createSession({ credentials }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.serverInfo.name).toBe("diya-submit");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("lists exactly the hosted tools", async () => {
    const response = await handleMcpRequest(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }), {
      session: createSession({ credentials }),
    });
    const body = await response.json();
    expect(body.result.tools.map((tool) => tool.name).sort()).toEqual([...HOSTED_TOOL_NAMES].sort());
  });

  it("derives a VAT return from a session restored from a stored cloud book", async () => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
    const session = createSession({ credentials });
    await restoreCloudBook(session, { bookId: "book-1" });
    const response = await handleMcpRequest(
      post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "derive_vat_return", arguments: { periodEnd: "2025-06-30" } } }),
      { session },
    );
    const body = await response.json();
    expect(body.result.isError).toBeUndefined();
    expect(body.result.structuredContent).toBeDefined();
  });

  it("answers 202 to a notification", async () => {
    const response = await handleMcpRequest(post({ jsonrpc: "2.0", method: "notifications/initialized" }), {
      session: createSession({ credentials }),
    });
    expect(response.status).toBe(202);
  });

  it("answers 400 to an unsupported MCP-Protocol-Version", async () => {
    const response = await handleMcpRequest(
      post({ jsonrpc: "2.0", id: 4, method: "tools/list" }, { "mcp-protocol-version": "1999-01-01" }),
      {
        session: createSession({ credentials }),
      },
    );
    expect(response.status).toBe(400);
  });
});
