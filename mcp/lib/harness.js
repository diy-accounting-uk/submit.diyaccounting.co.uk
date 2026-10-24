// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// harness.js -- calls one tool of the full submission MCP server through a real MCP client over an
// in-memory transport. The chat harness page uses it so a recording makes genuine tool calls
// without a model, a stdio child process or a hosted sign-in.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer, SERVER_INFO } from "./server.js";

/**
 * Lists the server's tools and the configuration a client adds to reach it.
 * @param {Object} session
 * @returns {Promise<{serverName: string, tools: {name: string, description: string}[]}>}
 */
export async function listHarnessTools(session) {
  return withClient(session, async (client) => {
    const { tools } = await client.listTools();
    return { serverName: SERVER_INFO.name, tools: tools.map(({ name, description }) => ({ name, description })) };
  });
}

/**
 * Calls one tool and answers its parsed JSON text, or the error text when the tool failed.
 * @param {Object} session
 * @param {string} tool
 * @param {Object} args
 * @returns {Promise<{ok: boolean, result: *}>}
 */
export async function callHarnessTool(session, tool, args = {}) {
  return withClient(session, async (client) => {
    const answer = await client.callTool({ name: tool, arguments: args });
    const text = (answer.content ?? []).map((part) => part.text ?? "").join("\n");
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // A tool that answers prose keeps its text.
    }
    return { ok: !answer.isError, result: parsed };
  });
}

async function withClient(session, use) {
  const server = createServer(session);
  const client = new Client({ name: "diya-submit-chat-harness", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  try {
    return await use(client);
  } finally {
    await client.close();
    await server.close();
  }
}
