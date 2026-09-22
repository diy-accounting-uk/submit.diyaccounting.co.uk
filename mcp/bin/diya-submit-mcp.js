#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// diya-submit-mcp.js -- the stdio surface of the submission MCP: the same
// server lib/server.js builds, connected to stdin and stdout. Point an MCP
// client at this command with no arguments.
//
// --all-clients <tool> [--arg key=value ...] is a one-shot mode instead: it runs run_for_clients
// (batch-tools.js) for the given tool across every one of the practice's clients, prints one line
// per client to stdout, and exits non-zero if any client's run was not ok. No stdio server starts
// in this mode.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { runForClients } from "../lib/batch-tools.js";
import { createSession } from "../lib/book-tools.js";
import { createServer } from "../lib/server.js";

function parseAllClientsArgs(args) {
  const toolIndex = args.indexOf("--all-clients");
  const tool = args[toolIndex + 1];
  if (!tool) {
    throw new Error("--all-clients requires a tool name");
  }

  const toolArgs = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--arg") continue;
    const pair = args[i + 1];
    const separatorIndex = pair ? pair.indexOf("=") : -1;
    if (separatorIndex === -1) {
      throw new Error(`--arg requires key=value, got "${pair ?? ""}"`);
    }
    toolArgs[pair.slice(0, separatorIndex)] = pair.slice(separatorIndex + 1);
  }

  return { tool, args: toolArgs };
}

async function runAllClients(args) {
  const { tool, args: toolArgs } = parseAllClientsArgs(args);
  const { rows, summary } = await runForClients(createSession(), { tool, args: toolArgs });

  for (const row of rows) {
    const outcome = row.ok ? "ok" : `failed: ${row.error}`;
    console.log(`${row.clientId}\t${row.displayName}\t${outcome}`);
  }

  process.exitCode = summary.failed > 0 ? 1 : 0;
}

const cliArgs = process.argv.slice(2);
if (cliArgs.includes("--all-clients")) {
  try {
    await runAllClients(cliArgs);
  } catch (err) {
    console.error(err?.message ?? String(err));
    process.exitCode = 1;
  }
} else {
  await createServer().connect(new StdioServerTransport());
}
