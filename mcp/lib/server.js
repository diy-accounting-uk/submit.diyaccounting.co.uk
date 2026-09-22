// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// server.js -- the submission MCP server, written once over the MCP SDK's
// transport abstraction so the stdio surface (bin/diya-submit-mcp.js) and
// the hosted streamable-HTTP surface (plan row M4) register the same tools
// against the same session. PLAN_SUBMISSION_MCP.md is the plan of record.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { createSession, openBook, saveBook, SAVE_FORMATS } from "./book-tools.js";
import { deriveMicroEntityAccounts } from "./accounts-tools.js";
import { deriveVatReturn } from "./vat-tools.js";
import { registerItsaTools } from "./itsa-tools.js";
import { moveBookToClient } from "./practice-tools.js";

const PACKAGE_JSON = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export const SERVER_INFO = {
  name: "diya-submit",
  version: JSON.parse(readFileSync(PACKAGE_JSON, "utf8")).version,
};

function asToolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function asToolError(err) {
  return { isError: true, content: [{ type: "text", text: err?.message ?? String(err) }] };
}

/**
 * The tools the server registers, keyed by MCP name, with the handler each
 * one calls: a test can drive the handlers directly against a session
 * without a transport.
 */
export const TOOLS = {
  open_book: {
    description:
      "Open a diya-gl book from the filesystem: a directory holding book.toml and lines.jsonl, or a single file " +
      "(a DIY Accounting workbook, a package zip, a diya-gl zip, or a diya-gl JSON file). Answers the product, the " +
      "entity, the period covered, the line count and the book checks summary. Replaces the session's loaded book.",
    inputSchema: {
      path: z.string().describe("Path to the book: a directory of book.toml + lines.jsonl, or one file the engine reads"),
    },
    handler: openBook,
  },
  save_book: {
    description:
      "Save the session's loaded book to the filesystem. Formats: diya-gl-dir (book.toml + lines.jsonl into a " +
      "directory; the default for a path with no extension), diya-gl-zip, json, xlsx (the product's recalculating " +
      "workbook) and zip (the product's package). xlsx and zip fetch the template from spreadsheets.diyaccounting.co.uk " +
      "on first use.",
    inputSchema: {
      path: z.string().describe("Where to write: a directory for diya-gl-dir, otherwise a file path"),
      format: z.enum(SAVE_FORMATS).optional().describe("One of diya-gl-dir, diya-gl-zip, json, xlsx, zip"),
    },
    handler: saveBook,
  },
  derive_vat_return: {
    description:
      "The nine VAT boxes for one obligation period from the session's loaded book, read from the engine's own VAT " +
      "interface: the quarter ending on periodEnd (a month end the book carries), with HMRC's field names and " +
      "rounding, the three months' figures, and every sales and purchases journal line that fed boxes 1, 4, 6 and 7. " +
      "Refuses a book that is not VAT registered, a period the book does not carry, and a period whose lines do not " +
      "reconcile with the interface.",
    inputSchema: {
      periodEnd: z.string().describe("The obligation's period end, YYYY-MM-DD; must be a month end the book's VAT interface carries"),
      periodStart: z
        .string()
        .optional()
        .describe("The obligation's period start, YYYY-MM-DD; refused unless it opens the quarter ending periodEnd"),
      periodKey: z.string().optional().describe("The obligation's period key, echoed back for the submit call"),
    },
    handler: deriveVatReturn,
  },
  derive_micro_entity_accounts: {
    description:
      "The seven FRS 105 balance-sheet lines the accounts filing takes, from the session's loaded book: the current " +
      "year from the engine's published balance sheet and the prior year from the book's opening balance, in whole " +
      "pounds with capital and reserves equal to net assets, plus the period dates, the company number and name, the " +
      "first director and the employee count. Refuses a book whose published or opening balance sheet does not balance.",
    inputSchema: {},
    handler: deriveMicroEntityAccounts,
  },
  move_book_to_client: {
    description:
      "Move one of the practice's own books to a client's book set (PLAN_PRICE_UPDATE.md (d), migration from sole " +
      "trader to practice). Calls DIY Accounting Submit's own move route, which copies the book and every kept " +
      "version, verifies each copy, then deletes the source. Refuses when the client already has a book with this " +
      "id, or the practice has no such book of its own.",
    inputSchema: {
      clientId: z.string().describe("The client's id"),
      bookId: z.string().describe("The book's id, one of the practice's own"),
    },
    handler: moveBookToClient,
  },
};

/**
 * An McpServer with every tool registered against one session. Connect it to
 * whichever transport the surface uses.
 * @param {Object} [session] - defaults to a fresh, empty session
 * @returns {McpServer}
 */
export function createServer(session = createSession()) {
  const server = new McpServer(SERVER_INFO);
  for (const [name, tool] of Object.entries(TOOLS)) {
    server.registerTool(name, { description: tool.description, inputSchema: tool.inputSchema }, async (params) => {
      try {
        return asToolResult(await tool.handler(session, params));
      } catch (err) {
        return asToolError(err);
      }
    });
  }
  registerItsaTools(server, session);
  return server;
}
