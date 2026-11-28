// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// book-read-tools.js -- diya-gl's read tools over the session's open DIYA-GL book: the report, the
// trial balance, the book checks, the ledger lines, the chart of accounts and the book's profile.
// Each calls the published @diy-accounting-uk/diya-gl tool's own handler with the session's book and
// lines; no engine code lives here. The titles and descriptions use Submit's customer wording.

import { z } from "zod";

import { LINE_GROUPINGS } from "@diy-accounting-uk/diya-gl/dist/app/lib/book-queries.js";
import { TOOLS as DIYA_GL_TOOLS } from "@diy-accounting-uk/diya-gl/dist/app/lib/mcp/diya-gl-tools.js";

import { READS } from "./tool-annotations.js";

// The open book alone, never a book or lines passed in a call: diya-gl's handlers take either.
function openBookOnly(session) {
  if (!session.book || !session.lines) throw new Error("No book is loaded. Call open_book first.");
  return { book: session.book, lines: session.lines };
}

function diyaGlRead(name) {
  return (session, params = {}) => DIYA_GL_TOOLS[name].handler(openBookOnly(session), params);
}

const oneOrMany = (description) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(description);

/**
 * The read tools keyed by MCP name, in the shape server.js's TOOLS table uses; createServer
 * registers them beside it.
 */
export const BOOK_READ_TOOLS = {
  report: {
    title: "Report a DIYA-GL book's figures",
    annotations: READS,
    description:
      "Works out the figures of the open DIYA-GL book (one business's sales, purchases and bank lines for a year): " +
      "the profit and loss account, the balance sheet, the tax and VAT figures and the compliance checks, each figure " +
      "with the label the spreadsheet prints for it, and the book checks. Use this when the person asks what their " +
      "profit, turnover, tax bill or VAT due is, or which lines make up a figure (entryNumbers). It does not change the " +
      "book, file anything or contact HMRC.",
    inputSchema: {
      entryNumbers: z
        .union([z.boolean(), z.array(z.string())])
        .optional()
        .describe(
          "true gives every figure the entryNumbers of the lines behind it; a list of figure keys (for example " +
            "section/profit-loss-account/sales-turnover) gives them to those figures only",
        ),
    },
    handler: diyaGlRead("report"),
  },
  trial_balance: {
    title: "Trial balance of a DIYA-GL book",
    annotations: READS,
    description:
      "Answers the trial balance of the open DIYA-GL book of a company: every account's balance in the debit or the credit " +
      "column and the two totals, over the year, one month, one VAT quarter or a date range, with the year-end postings " +
      "of the registers. Name an account to also get the lines and postings behind its balance. Use this when the " +
      "person asks whether their trial balance balances, what an account's balance is, or what moved in a month. " +
      "Company DIYA-GL books only. It does not change the book or contact HMRC.",
    inputSchema: {
      period: z
        .enum(["year", "month", "vatQuarter", "custom"])
        .optional()
        .describe("year (the default), month, vatQuarter, or custom with from and to"),
      month: z.string().optional().describe("YYYY-MM of the month, or of the VAT quarter's last month; needed for month and vatQuarter"),
      from: z.string().optional().describe("First day, YYYY-MM-DD inclusive, for a custom range"),
      to: z.string().optional().describe("Last day, YYYY-MM-DD inclusive, for a custom range"),
      account: z.string().optional().describe("An account id (for example 1300); adds that account's postings"),
    },
    handler: diyaGlRead("trial_balance"),
  },
  checks: {
    title: "Check a DIYA-GL book",
    annotations: READS,
    description:
      "Answers every book check and warning over the open DIYA-GL book, each with its verdict (pass, warn or fail), what it " +
      "means and the entryNumbers of the lines that fail it, with the pass, warn and fail counts. Use this when the " +
      "person asks whether anything is wrong with their records, which entries fall outside the year, which sales " +
      "have no invoice number, whether there are duplicates, or how near they are to the VAT threshold. It does not " +
      "change the book or contact HMRC.",
    inputSchema: {},
    handler: diyaGlRead("checks"),
  },
  lines: {
    title: "Read a DIYA-GL book's lines",
    annotations: READS,
    description:
      "Reads the lines of the open DIYA-GL book (every sale, purchase, bank movement, payslip and journal entry, with " +
      "its entryNumber, journal, account, date, amount, customer, supplier or payee, description, reference and VAT " +
      "fields), filtered and optionally grouped with a count and a total in pence. Filters combine: journal, account, " +
      "dates, text and reference. Use this when the person asks who their best customer is, which suppliers cost most, " +
      "what they spent on something in a month, or for their largest sales or purchases. It does not change the book.",
    inputSchema: {
      journal: oneOrMany("The journals to keep: sales, purchases, bank, payroll or journal"),
      accountMainID: oneOrMany("The account ids to keep, for example 4000 (the chart tool lists them)"),
      from: z.string().optional().describe("The earliest date kept, YYYY-MM-DD inclusive"),
      to: z.string().optional().describe("The latest date kept, YYYY-MM-DD inclusive"),
      text: z.string().optional().describe("Text found in the customer, supplier or payee, or the description, ignoring case"),
      documentReference: z.string().optional().describe("Text found in the reference, ignoring case"),
      groupBy: z.enum(LINE_GROUPINGS).optional().describe("detailComment (customer or supplier), accountMainID or month (YYYY-MM)"),
      top: z.number().int().min(1).optional().describe("Keep at most this many groups, or without groupBy the largest lines"),
    },
    handler: diyaGlRead("lines"),
  },
  chart: {
    title: "Chart of accounts of a DIYA-GL book",
    annotations: READS,
    description:
      "Answers the chart of accounts of the open DIYA-GL book: each account's id, name, group, class and normal side, for a " +
      "company the accounts line it feeds, the spreadsheet column it lands in, how many lines post to it with their " +
      "total in pence, and the report rows it reaches. Use this when the person asks which account to use for " +
      "something, where a cost shows in their accounts, or which accounts have no activity. It does not change the book.",
    inputSchema: {},
    handler: diyaGlRead("chart"),
  },
  book: {
    title: "Profile of a DIYA-GL book",
    annotations: READS,
    description:
      "Answers the profile of the open DIYA-GL book: the product, the accounting period, the business (name, trade, address, " +
      "VAT registration, cash or accruals basis), the tax settings, the bank accounts, the journals with their line " +
      "counts and dates, and the registers it carries (directors, employees, debtors, creditors, fixed assets, " +
      "dividends, members, opening balances, stock). Use this when the person asks what period their records cover, " +
      "whether they are VAT registered, or who their directors or employees are. It does not change the book.",
    inputSchema: {},
    handler: diyaGlRead("book"),
  },
};
