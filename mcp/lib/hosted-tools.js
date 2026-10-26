// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// hosted-tools.js -- the tools the hosted MCP endpoint registers, and the four
// that change shape there: open_book reads the DIYA cloud only,
// derive_itsa_annual_submission and derive_company_tax_return answer without
// writing a file, and run_for_clients cannot run the book tools. The tools
// left out are the sign-in pair (the connector owns sign-in) and the filesystem
// tools. The practice tools (invite_client, client_authorisation_status,
// run_for_clients) read the session's HMRC grant and take no token argument.

import { z } from "zod";

import { deriveCompanyTaxReturn } from "./accounts-tools.js";
import { openBook } from "./book-tools.js";
import { deriveItsaAnnualSubmission } from "./itsa-tools.js";
import { runForClients, RUN_FOR_CLIENTS_TOOLS } from "./batch-tools.js";

// The book tools read and write the server's filesystem, which a hosted caller never reaches.
const HOSTED_RUN_FOR_CLIENTS_TOOLS = RUN_FOR_CLIENTS_TOOLS.filter((tool) => tool !== "open_book" && tool !== "save_book");

export const HOSTED_TOOL_NAMES = [
  "list_books",
  "open_book",
  "derive_vat_return",
  "derive_micro_entity_accounts",
  "derive_small_company_accounts",
  "derive_itsa_quarterly_update",
  "derive_itsa_annual_submission",
  "submit_itsa_quarterly_update",
  "submit_itsa_annual_submission",
  "derive_uk_property_period",
  "derive_uk_property_annual",
  "derive_company_tax_return",
  "request_hmrc_authorisation",
  "list_vat_obligations",
  "list_vat_liabilities",
  "list_vat_payments",
  "list_vat_penalties",
  "get_vat_return",
  "submit_vat_return",
  "get_vat_receipt",
  "list_vat_receipts",
  "render_micro_entity_accounts_sandbox",
  "request_companies_house_codes",
  "submit_micro_entity_accounts_sandbox",
  "poll_submission",
  "get_confirmation_statement_data_sandbox",
  "render_confirmation_statement_sandbox",
  "submit_confirmation_statement_sandbox",
  "list_clients",
  "add_client",
  "move_book_to_client",
  "invite_client",
  "client_authorisation_status",
  "run_for_clients",
];

export const HOSTED_OVERRIDES = {
  open_book: {
    description:
      "Open a book saved in the DIYA cloud by bookId (a practice client's own book with clientId), signed in as the " +
      "caller. Answers the product, the entity, the period covered, the line count and the book checks summary. " +
      "Replaces the session's loaded book.",
    inputSchema: {
      bookId: z.string().describe("The cloud book's id"),
      clientId: z.string().optional().describe("A practice client's id, to open that client's book instead of the practice's own"),
    },
    handler: async (session, { bookId, clientId } = {}) => {
      if (!bookId) throw new Error("open_book requires bookId");
      return openBook(session, { cloud: true, bookId, clientId });
    },
  },
  derive_itsa_annual_submission: {
    description:
      "The year's allowances and adjustments for HMRC's Self Employment Business API annual submission from the loaded " +
      "self-employed book, restricted to the fields HMRC accepts for that tax year.",
    inputSchema: {
      taxYear: z.string().optional().describe("Override the tax year the book's dates imply, as 2025-26"),
    },
    handler: (session, { taxYear } = {}) => deriveItsaAnnualSubmission(session, { taxYear }),
  },
  run_for_clients: {
    description:
      "Runs one client-scoped tool once per client in the practice's own list (list_clients), passing each client's " +
      "clientId in turn. Returns one row per client -- {clientId, displayName, ok, result or error} -- plus a summary " +
      `count; one client's failure never stops the rest. tool is one of ${HOSTED_RUN_FOR_CLIENTS_TOOLS.join(", ")}. ` +
      "For submit_micro_entity_accounts_sandbox, put in args a codesEntryId that request_companies_house_codes answered " +
      "for these clients' clientIds; each client's call takes its own codes from it.",
    inputSchema: {
      tool: z.enum(HOSTED_RUN_FOR_CLIENTS_TOOLS).describe("The client-scoped tool to run for every client"),
      args: z
        .record(z.string(), z.any())
        .optional()
        .describe("That tool's other arguments; clientId is added per client and overrides any given here"),
    },
    handler: async (session, { tool, args } = {}) => {
      if (!HOSTED_RUN_FOR_CLIENTS_TOOLS.includes(tool)) {
        throw new Error(`run_for_clients does not support tool "${tool}" here; must be one of ${HOSTED_RUN_FOR_CLIENTS_TOOLS.join(", ")}`);
      }
      return runForClients(session, { tool, args });
    },
  },
  derive_company_tax_return: {
    description:
      "The figures the Company Tax Return form takes, from the session's loaded Company book: the accounting period, the " +
      "computation figures, the profit and loss account from the engine's published statements, and the book's own " +
      "trading profit and Corporation Tax as a working sheet for a check. Refuses a book that is not a Company book, " +
      "makes a trading loss or carries net non-trading loan relationship debits.",
    inputSchema: {},
    handler: (session) => deriveCompanyTaxReturn(session, {}),
  },
};
