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
import {
  listVatObligations,
  submitVatReturn,
  getVatReceipt,
  previewMicroEntityAccounts,
  submitMicroEntityAccounts,
  pollAccountsSubmission,
} from "./submit-tools.js";

const PACKAGE_JSON = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export const SERVER_INFO = {
  name: "diya-submit",
  version: JSON.parse(readFileSync(PACKAGE_JSON, "utf8")).version,
};

const balanceSheetYearSchema = z.object({
  fixedAssets: z.number(),
  currentAssets: z.number(),
  creditorsWithinOneYear: z.number(),
  creditorsAfterOneYear: z.number(),
  calledUpShareCapital: z.number(),
  profitAndLossAccount: z.number(),
  capitalAndReserves: z.number(),
});

const accountsFilingInputSchema = {
  companyNumber: z.string().describe("The 8-character Companies House company number"),
  companyName: z.string().describe("The registered company name"),
  periodStart: z.string().describe("The accounting period's start date, YYYY-MM-DD"),
  periodEnd: z.string().describe("The accounting period's end date, YYYY-MM-DD"),
  balanceSheet: z
    .object({ currentYear: balanceSheetYearSchema, priorYear: balanceSheetYearSchema })
    .describe("The seven FRS 105 lines for the current and prior year, as derive_micro_entity_accounts answers them"),
  averageEmployees: z.number().describe("The average number of employees in the period"),
  director: z
    .object({ name: z.string(), dateApproved: z.string().describe("YYYY-MM-DD") })
    .describe("The signing director and the date the accounts were approved"),
  statementsAccepted: z
    .object({
      section477Exemption: z.boolean(),
      membersNotRequiredAudit: z.boolean(),
      directorsResponsibilities: z.boolean(),
      microEntityProvisions: z.boolean(),
    })
    .describe("Every micro-entity exemption statement, confirmed true by the user before filing"),
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
      "(a DIY Accounting workbook, a package zip, a diya-gl zip, or a diya-gl JSON file). With cloud: true, opens " +
      "bookId from the DIYA cloud instead (a practice client's own book with clientId), signed in via auth.js's " +
      "accessToken(). Answers the product, the entity, the period covered, the line count and the book checks " +
      "summary. Replaces the session's loaded book.",
    inputSchema: {
      path: z
        .string()
        .optional()
        .describe("Path to the book: a directory of book.toml + lines.jsonl, or one file the engine reads; unused with cloud"),
      cloud: z.boolean().optional().describe("Open bookId from the DIYA cloud instead of the filesystem"),
      bookId: z.string().optional().describe("The cloud book's id; required with cloud: true"),
      clientId: z.string().optional().describe("A practice client's id, to open that client's book instead of the practice's own"),
    },
    handler: openBook,
  },
  save_book: {
    description:
      "Save the session's loaded book to the filesystem. Formats: diya-gl-dir (book.toml + lines.jsonl into a " +
      "directory; the default for a path with no extension), diya-gl-zip, json, xlsx (the product's recalculating " +
      "workbook) and zip (the product's package). xlsx and zip fetch the template from spreadsheets.diyaccounting.co.uk " +
      "on first use. With cloud: true, writes to the DIYA cloud by bookId instead (a practice client's book set with " +
      "clientId), signed in via auth.js's accessToken(); carries the if-match etag from the session's last cloud " +
      "open or save of the same bookId.",
    inputSchema: {
      path: z.string().optional().describe("Where to write: a directory for diya-gl-dir, otherwise a file path; unused with cloud"),
      format: z.enum(SAVE_FORMATS).optional().describe("One of diya-gl-dir, diya-gl-zip, json, xlsx, zip; unused with cloud"),
      cloud: z.boolean().optional().describe("Save to the DIYA cloud by bookId instead of the filesystem"),
      bookId: z.string().optional().describe("The cloud book's id; required with cloud: true"),
      clientId: z.string().optional().describe("A practice client's id, to save into that client's book set"),
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
  list_vat_obligations: {
    description:
      "The open and fulfilled VAT obligations HMRC holds for one VRN, over the deployed API. Requires the caller's own " +
      "HMRC access token; obtaining it is outside this tool's scope.",
    inputSchema: {
      vrn: z.string().describe("VAT registration number, 9 digits"),
      hmrcAccessToken: z.string().describe("The user's HMRC OAuth access token"),
      from: z.string().optional().describe("From date, YYYY-MM-DD; defaults to the start of the current calendar year"),
      to: z.string().optional().describe("To date, YYYY-MM-DD; defaults to today"),
      status: z.enum(["O", "F"]).optional().describe("O (Open) or F (Fulfilled); both when omitted"),
      hmrcAccount: z.enum(["synthetic", "live"]).optional().describe("Which HMRC environment to call"),
      govTestScenario: z.string().optional().describe("HMRC sandbox test scenario"),
    },
    handler: listVatObligations,
  },
  submit_vat_return: {
    description:
      "Files the nine VAT boxes the user has confirmed (derive_vat_return's hmrc fields) over the deployed API. Boxes 3 " +
      "and 5 are HMRC's own totals and are not sent; the route derives them. Requires the caller's own HMRC access " +
      "token; obtaining it is outside this tool's scope.",
    inputSchema: {
      vatNumber: z.string().describe("VAT registration number, 9 digits"),
      periodStart: z.string().describe("The obligation's period start, YYYY-MM-DD"),
      periodEnd: z.string().describe("The obligation's period end, YYYY-MM-DD"),
      hmrcAccessToken: z.string().describe("The user's HMRC OAuth access token"),
      vatDueSales: z.number().describe("Box 1"),
      vatDueAcquisitions: z.number().describe("Box 2"),
      vatReclaimedCurrPeriod: z.number().describe("Box 4"),
      totalValueSalesExVAT: z.number().describe("Box 6"),
      totalValuePurchasesExVAT: z.number().describe("Box 7"),
      totalValueGoodsSuppliedExVAT: z.number().describe("Box 8"),
      totalAcquisitionsExVAT: z.number().describe("Box 9"),
      hmrcAccount: z.enum(["synthetic", "live"]).optional().describe("Which HMRC environment to call"),
      govTestScenario: z.string().optional().describe("HMRC sandbox test scenario"),
      runFraudPreventionHeaderValidation: z.boolean().optional(),
      allowSyntheticObligations: z
        .boolean()
        .optional()
        .describe("Synthetic only: file under any open obligation if the dates do not match"),
    },
    handler: submitVatReturn,
  },
  get_vat_receipt: {
    description: "A stored HMRC VAT receipt by its file name, over the deployed API.",
    inputSchema: {
      name: z.string().describe("The receipt file name, including .json"),
    },
    handler: getVatReceipt,
  },
  preview_micro_entity_accounts: {
    description:
      "The rendered FRS 105 micro-entity iXBRL for confirmed figures (derive_micro_entity_accounts' answer), over the " +
      "deployed API. Never reaches the Companies House XML Gateway.",
    inputSchema: accountsFilingInputSchema,
    handler: previewMicroEntityAccounts,
  },
  submit_micro_entity_accounts: {
    description:
      "Files confirmed micro-entity accounts through the Companies House XML Gateway, over the deployed API; returns " +
      "the submission number. Takes the company authentication code on this one call only; it is not stored.",
    inputSchema: {
      ...accountsFilingInputSchema,
      companyAuthCode: z.string().describe("The company's Companies House authentication code"),
    },
    handler: submitMicroEntityAccounts,
  },
  poll_accounts_submission: {
    description: "Accepted, rejected with reasons, or pending, for a submitted micro-entity accounts filing, over the deployed API.",
    inputSchema: {
      submissionNumber: z.string().describe("The 6-character submission number"),
    },
    handler: pollAccountsSubmission,
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
