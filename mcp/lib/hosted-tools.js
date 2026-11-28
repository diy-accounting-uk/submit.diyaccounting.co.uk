// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// hosted-tools.js -- the tools the hosted MCP endpoint registers, and the four
// that change shape there: open_book reads the DIY Accounting Submit account only,
// derive_itsa_annual_submission and derive_company_tax_return answer without
// writing a file, and run_for_clients cannot run the book tools. The tools
// left out are the sign-in pair (the connector owns sign-in) and the filesystem
// tools. The DIYA-GL book's write tools (hosted-write-tools.js) save each change
// to the person's account, because the hosted server keeps no book between calls.
// The practice tools (invite_client, client_authorisation_status, run_for_clients)
// read the session's HMRC grant and take no token argument.

import { z } from "zod";

import { deriveCompanyTaxReturn } from "./accounts-tools.js";
import { openBook } from "./book-tools.js";
import { deriveItsaAnnualSubmission } from "./itsa-tools.js";
import { CHANGES_OUTSIDE, READS } from "./tool-annotations.js";
import { runForClients, RUN_FOR_CLIENTS_TOOLS } from "./batch-tools.js";
import { VAT_FILING_SENTENCE } from "./handoff-tools.js";
import { HOSTED_WRITE_OVERRIDES } from "./hosted-write-tools.js";
import { HOSTED_REGISTER_BOOK_OVERRIDES } from "./hosted-register-book.js";

// The book tools read and write the server's filesystem, which a hosted caller never reaches.
const HOSTED_RUN_FOR_CLIENTS_TOOLS = RUN_FOR_CLIENTS_TOOLS.filter((tool) => tool !== "open_book" && tool !== "save_book");

export const HOSTED_TOOL_NAMES = [
  "list_books",
  "open_book",
  "derive_vat_return",
  "prepare_vat_return",
  "derive_micro_entity_accounts",
  "derive_small_company_accounts",
  "derive_itsa_quarterly_update",
  "derive_itsa_annual_submission",
  "submit_itsa_quarterly_update",
  "submit_itsa_annual_submission",
  "derive_uk_property_period",
  "derive_uk_property_annual",
  "derive_company_tax_return",
  "company_filing_deadlines",
  "request_hmrc_authorisation",
  "list_vat_obligations",
  "list_vat_liabilities",
  "list_vat_payments",
  "list_vat_penalties",
  "get_vat_return",
  "submit_vat_return",
  "get_vat_receipt",
  "list_vat_receipts",
  "list_accounts_receipts",
  "render_micro_entity_accounts_sandbox",
  "render_small_company_accounts_sandbox",
  "request_companies_house_codes",
  "submit_micro_entity_accounts_sandbox",
  "submit_small_company_accounts_sandbox",
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
  "report",
  "trial_balance",
  "checks",
  "lines",
  "chart",
  "book",
  "look_up_rule",
  "prepare_micro_entity_accounts",
  "prepare_small_company_accounts",
  "prepare_company_tax_return",
  "edit_lines",
  "new_book",
  "roll_forward",
  "undo_book_change",
  "extract_book",
  "save_workbook",
  "new_book_from_register",
  "find_help",
  "book_format",
];

// Prod offers the DIYA-GL book tools, the VAT, accounts and Company Tax Return derivations, the link that
// opens the VAT form with the figures filled in, a company's filing deadlines from the public register,
// and the stored receipts. No hosted tool on prod files or reaches HMRC, because an AI client cannot
// give the fraud prevention headers a call needs. The HMRC tools, the sandbox filing tools and the
// practice tools register in every other environment.
const PROD_HOSTED_TOOL_NAMES = [
  "list_books",
  "open_book",
  "derive_vat_return",
  "prepare_vat_return",
  "get_vat_receipt",
  "list_vat_receipts",
  "company_filing_deadlines",
  "derive_micro_entity_accounts",
  "derive_small_company_accounts",
  "derive_company_tax_return",
  "list_accounts_receipts",
];

// The demo user that directory reviewers sign in as belongs to this Cognito group. Its token sees
// the prod tool set in every environment, so a reviewer on ci sees what a reviewer on prod sees.
export const REVIEWER_GROUP = "mcp-reviewer";

/**
 * The tool names the hosted endpoint registers in an environment, for a caller in these groups.
 * @param {string|undefined} environmentName
 * @param {string[]} [groups] - the token's `cognito:groups`
 * @returns {string[]}
 */
export function hostedToolNames(environmentName, groups = []) {
  const prod = (environmentName || "").toLowerCase() === "prod";
  return prod || groups.includes(REVIEWER_GROUP) ? PROD_HOSTED_TOOL_NAMES : HOSTED_TOOL_NAMES;
}

// What an assistant connected to prod's tool set needs to know beyond each tool's description: what
// the connector cannot do, how a return gets filed, and what to show from a derived return.
const PROD_HOSTED_INSTRUCTIONS =
  "A book is one DIYA-GL file: one business's sales, purchases and bank lines for a year. " +
  'Say "your DIYA-GL book" or "your records" to the person, never "your books". ' +
  "This connector reads and works out figures: it opens a DIYA-GL book and derives from it a VAT return, a company's " +
  "micro-entity or small company accounts and a Company Tax Return; it prepares the link that opens the VAT return " +
  "form with the VAT figures filled in; it looks up a company's filing deadlines on the Companies House register; and " +
  "it reads stored VAT receipts and accounts filings. No tool files a return or accounts, or pays HMRC or anyone else. " +
  "When asked to file accounts or a Company Tax Return, or to pay, say that this connector cannot do it and that the " +
  "person files those on the DIY Accounting Submit website. To file a VAT return, call prepare_vat_return, give the person its link and " +
  `tell them: "${VAT_FILING_SENTENCE}" After derive_vat_return, show the nine boxes and the largest lines behind ` +
  "boxes 1 and 4. When list_books answers no DIYA-GL book, say that no DIYA-GL book is saved in the account and give " +
  "the link https://submit.diyaccounting.co.uk/mcp.html#what-you-need.";

/**
 * The server instructions the hosted endpoint sends in an environment, for a caller in these groups:
 * prod's tool set carries them, the wider tool set carries none.
 * @param {string|undefined} environmentName
 * @param {string[]} [groups] - the token's `cognito:groups`
 * @returns {string|undefined}
 */
export function hostedInstructions(environmentName, groups = []) {
  return hostedToolNames(environmentName, groups) === PROD_HOSTED_TOOL_NAMES ? PROD_HOSTED_INSTRUCTIONS : undefined;
}

export const HOSTED_OVERRIDES = {
  open_book: {
    title: "Open a DIYA-GL book",
    annotations: READS,
    description:
      "Opens a DIYA-GL book saved in the person's DIY Accounting Submit account by its bookId, which list_books gives " +
      "(a practice client's own DIYA-GL book with clientId). Answers the product, the business, the period covered, the " +
      "line count and the book's checks, and replaces any DIYA-GL book already open in this conversation. Use this when " +
      "the person picks a saved DIYA-GL book, or before working out or preparing a VAT return from their records. It " +
      "does not change the book, file anything or contact HMRC.",
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
    title: "Derive an ITSA annual submission",
    annotations: READS,
    description:
      "The year's allowances and adjustments for HMRC's Self Employment Business API annual submission from the loaded " +
      "self-employed DIYA-GL book, restricted to the fields HMRC accepts for that tax year.",
    inputSchema: {
      taxYear: z.string().optional().describe("Override the tax year the book's dates imply, as 2025-26"),
    },
    handler: (session, { taxYear } = {}) => deriveItsaAnnualSubmission(session, { taxYear }),
  },
  run_for_clients: {
    title: "Run a tool for every client",
    annotations: CHANGES_OUTSIDE,
    description:
      "Runs one client-scoped tool once per client in the practice's own list (list_clients), passing each client's " +
      "clientId in turn. Returns one row per client -- {clientId, displayName, ok, result or error} -- plus a summary " +
      `count; one client's failure never stops the rest. tool is one of ${HOSTED_RUN_FOR_CLIENTS_TOOLS.join(", ")}. ` +
      "For submit_micro_entity_accounts_sandbox or submit_small_company_accounts_sandbox, put in args a codesEntryId that request_companies_house_codes answered " +
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
    title: "Derive a Company Tax Return",
    annotations: READS,
    description:
      "Works out the figures a Company Tax Return (CT600) takes, from the open DIYA-GL book of a company: the accounting " +
      "period, the computation figures, the profit and loss account, and the book's own trading profit and Corporation " +
      "Tax as a check. Use this when the person asks what their Corporation Tax will be, for their CT600 figures, or how " +
      "their taxable profit is worked out. It refuses a book that is not a company's, makes a trading loss or carries net " +
      "non-trading loan relationship debits, and it does not file the return or contact HMRC.",
    inputSchema: {},
    handler: (session) => deriveCompanyTaxReturn(session, {}),
  },
  ...HOSTED_WRITE_OVERRIDES,
  ...HOSTED_REGISTER_BOOK_OVERRIDES,
};
