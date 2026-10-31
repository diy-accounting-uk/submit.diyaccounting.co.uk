// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-06 Derive ITSA quarterly and annual submission figures
// - **Use when:** a self-employed book's quarterly update or annual submission figures are needed for HMRC's Self Employment Business API.
// - **Does:** deriveItsaQuarterlyUpdate and deriveItsaAnnualSubmission in mcp/lib/itsa-tools.js call the diya-gl package's se-derivations module. registerItsaTools registers both against an MCP server and session. Each answer is restricted to the field set sa103-mtd-mapping.json allows for that tax year, omitting fields the book cannot source.
// - **Run:** no command; see Does and Entry
// - **Entry:** `mcp/lib/itsa-tools.js:deriveItsaQuarterlyUpdate`; `mcp/lib/itsa-tools.js:deriveItsaAnnualSubmission`; `mcp/lib/itsa-tools.js:registerItsaTools`
// - **Files:** mcp/lib/itsa-tools.js, mcp/test/itsa-tools.test.js, mcp/test/fixtures/brickwork-pro-se-vat/book.toml
// - **Keywords:** itsa, self employment business api, quarterly update, annual submission, se-derivations, sa103, mtd it
// - **Related:** MCP-03
// @end-capability

// itsa-tools.js -- the ITSA derivations over the session's loaded book:
// derive_itsa_quarterly_update answers one period of HMRC's Self Employment
// Business API (a period's own figures in a tax year filed as dated period
// summaries, a running total from 6 April in a year filed as cumulative
// period summaries), and derive_itsa_annual_submission answers the year's
// allowances and adjustments. Both call the published diya-gl package's own
// derivations and add only the session's "no book loaded" check; the annual
// answer can also be written to a file for the annual submission page.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

import {
  deriveItsaAnnualSubmission as deriveAnnualFromBook,
  deriveItsaQuarterlyUpdate as deriveQuarterlyFromBook,
  deriveUkPropertyAnnual as deriveUkPropertyAnnualFromBook,
  deriveUkPropertyPeriod as deriveUkPropertyPeriodFromBook,
} from "@diy-accounting-uk/diya-gl";
import { QUARTERLY_PERIOD_TYPES } from "@diy-accounting-uk/diya-gl/dist/app/lib/derivations/itsa.js";
import { z } from "zod";

import { callSubmitApi, hmrcAccessTokenFor, HMRC_ACCOUNTS, requireField } from "./submit-tools.js";

export { QUARTERLY_PERIOD_TYPES };

function requireLoaded(session) {
  if (!session.book || !session.lines) {
    throw new Error("No book is loaded. Call open_book first.");
  }
}

/**
 * derive_itsa_quarterly_update: one period of the Self Employment Business
 * API from the loaded book. In a tax year HMRC files as dated period
 * summaries the answer is that period's own figures; in a year filed as
 * cumulative period summaries (2025-26 on) it is the running total from the
 * year's first period through the one named. With no periodEndDate every
 * period is answered.
 * @param {Object} session
 * @param {{periodEndDate?: string, quarterlyPeriodType?: string, taxYear?: string}} params
 */
export async function deriveItsaQuarterlyUpdate(session, params = {}) {
  requireLoaded(session);
  return deriveQuarterlyFromBook(session.book, session.lines, params);
}

/**
 * derive_itsa_annual_submission: the year's allowances and adjustments from
 * the loaded book, restricted to the fields HMRC's schema accepts for that
 * tax year. With a path, the answer is also written there as JSON, the file
 * hmrc/itsa/annualSubmission.html's "Import from a book" control reads.
 * @param {Object} session
 * @param {{taxYear?: string, path?: string}} params
 */
export async function deriveItsaAnnualSubmission(session, { taxYear, path } = {}) {
  requireLoaded(session);
  const answer = await deriveAnnualFromBook(session.book, session.lines, { taxYear });
  if (path) {
    const resolved = resolvePath(path);
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, JSON.stringify(answer, null, 2) + "\n");
    answer.path = resolved;
  }
  return answer;
}

/**
 * derive_uk_property_period: one period's rental income and expenses from the loaded landlord book.
 * @param {Object} session
 * @param {{periodStartDate: string, periodEndDate: string}} params
 */
export async function deriveUkPropertyPeriod(session, params = {}) {
  requireLoaded(session);
  return deriveUkPropertyPeriodFromBook(session.book, session.lines, params);
}

/**
 * derive_uk_property_annual: the year's adjustments and allowances from the loaded landlord book.
 * @param {Object} session
 * @param {{taxYear: string}} params
 */
export async function deriveUkPropertyAnnual(session, params = {}) {
  requireLoaded(session);
  return deriveUkPropertyAnnualFromBook(session.book, session.lines, params);
}

const moneySection = z.record(z.string(), z.number());

function itsaHeaders(hmrcAccount, govTestScenario) {
  return { hmrcAccount, ...(govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {}) };
}

/**
 * submit_itsa_quarterly_update: files one period of the Self Employment Business API over the
 * deployed route, with the session's HMRC grant for the itsa service. Sends only the sections
 * the caller gave; the route drops an empty one.
 * @param {Object} session
 * @param {{nino: string, businessId: string, taxYear: string, periodStartDate?: string, periodEndDate?: string,
 *   periodIncome?: Object, periodExpenses?: Object, periodDisallowableExpenses?: Object, hmrcAccount?: string,
 *   govTestScenario?: string, runFraudPreventionHeaderValidation?: boolean}} params
 */
export async function submitItsaQuarterlyUpdate(session, params = {}) {
  const nino = requireField("submit_itsa_quarterly_update", params, "nino");
  const businessId = requireField("submit_itsa_quarterly_update", params, "businessId");
  const taxYear = requireField("submit_itsa_quarterly_update", params, "taxYear");
  const { periodStartDate, periodEndDate, periodIncome, periodExpenses, periodDisallowableExpenses } = params;
  const { govTestScenario, runFraudPreventionHeaderValidation } = params;
  const { accessToken, hmrcAccount } = await hmrcAccessTokenFor(session, "submit_itsa_quarterly_update", params.hmrcAccount);

  return callSubmitApi(session, "/api/v1/hmrc/itsa/self-employment/period", {
    method: "POST",
    customAuthorizer: true,
    headers: { Authorization: `Bearer ${accessToken}`, ...itsaHeaders(hmrcAccount, govTestScenario) },
    body: {
      nino,
      businessId,
      taxYear,
      ...(periodStartDate ? { periodStartDate } : {}),
      ...(periodEndDate ? { periodEndDate } : {}),
      ...(periodIncome ? { periodIncome } : {}),
      ...(periodExpenses ? { periodExpenses } : {}),
      ...(periodDisallowableExpenses ? { periodDisallowableExpenses } : {}),
      ...(runFraudPreventionHeaderValidation !== undefined ? { runFraudPreventionHeaderValidation } : {}),
    },
  });
}

/**
 * submit_itsa_annual_submission: files the year's allowances and adjustments over the deployed
 * Self Employment annual route, with the session's HMRC grant for the itsa service.
 * @param {Object} session
 * @param {{nino: string, businessId: string, taxYear: string, adjustments?: Object, allowances?: Object,
 *   nonFinancials?: Object, hmrcAccount?: string, govTestScenario?: string,
 *   runFraudPreventionHeaderValidation?: boolean}} params
 */
export async function submitItsaAnnualSubmission(session, params = {}) {
  const nino = requireField("submit_itsa_annual_submission", params, "nino");
  const businessId = requireField("submit_itsa_annual_submission", params, "businessId");
  const taxYear = requireField("submit_itsa_annual_submission", params, "taxYear");
  const { adjustments, allowances, nonFinancials, govTestScenario, runFraudPreventionHeaderValidation } = params;
  const { accessToken, hmrcAccount } = await hmrcAccessTokenFor(session, "submit_itsa_annual_submission", params.hmrcAccount);

  return callSubmitApi(session, "/api/v1/hmrc/itsa/self-employment/annual", {
    method: "PUT",
    customAuthorizer: true,
    headers: { Authorization: `Bearer ${accessToken}`, ...itsaHeaders(hmrcAccount, govTestScenario) },
    body: {
      nino,
      businessId,
      taxYear,
      ...(adjustments ? { adjustments } : {}),
      ...(allowances ? { allowances } : {}),
      ...(nonFinancials ? { nonFinancials } : {}),
      ...(runFraudPreventionHeaderValidation !== undefined ? { runFraudPreventionHeaderValidation } : {}),
    },
  });
}

/**
 * The ITSA tools keyed by MCP name, in the shape server.js's TOOLS table
 * uses; createServer registers them beside it.
 */
export const ITSA_TOOLS = {
  derive_itsa_quarterly_update: {
    description:
      "One period of HMRC's Self Employment Business API from the loaded self-employed book: the period's own figures " +
      "in a tax year filed as dated period summaries, a running total from 6 April in a year filed as cumulative period " +
      "summaries (2025-26 on). Picks the period by periodEndDate among the year's four (standard quarters by default); " +
      "with no periodEndDate answers every period. A field the book cannot source is omitted, never sent as zero.",
    inputSchema: {
      periodEndDate: z.string().optional().describe("The period's end date, YYYY-MM-DD, as HMRC's obligation names it"),
      quarterlyPeriodType: z.enum(QUARTERLY_PERIOD_TYPES).optional().describe("standard (6 April quarters, the default) or calendar"),
      taxYear: z.string().optional().describe("Override the tax year the book's dates imply, as 2025-26"),
    },
    handler: deriveItsaQuarterlyUpdate,
  },
  derive_itsa_annual_submission: {
    description:
      "The year's allowances and adjustments for HMRC's Self Employment Business API annual submission from the loaded " +
      "self-employed book, restricted to the fields HMRC accepts for that tax year. With a path, also writes the answer " +
      "as the JSON file hmrc/itsa/annualSubmission.html imports.",
    inputSchema: {
      taxYear: z.string().optional().describe("Override the tax year the book's dates imply, as 2025-26"),
      path: z.string().optional().describe("Where to write the answer as JSON for the annual submission page's import"),
    },
    handler: deriveItsaAnnualSubmission,
  },
  derive_uk_property_period: {
    description:
      "One period of HMRC's UK property income and expenses from the loaded landlord book whose chart names the property " +
      "accounts: the period's own figures, both ends inclusive; a cumulative year's running total is the same call with the " +
      "period starting on 6 April. Answers the income, the expenses, the slots the book did not fill and the postings behind " +
      "each figure. Refuses a period carrying both consolidated and itemised expenses.",
    inputSchema: {
      periodStartDate: z.string().describe("The period's first day, YYYY-MM-DD"),
      periodEndDate: z.string().describe("The period's last day, YYYY-MM-DD"),
    },
    handler: deriveUkPropertyPeriod,
  },
  derive_uk_property_annual: {
    description:
      "The year's adjustments and allowances for HMRC's UK property annual submission from the loaded landlord book whose " +
      "chart names the property accounts. The elections and the landlord facts are left to the annual submission page and named in leftToPage.",
    inputSchema: {
      taxYear: z.string().describe("The tax year, as 2025-26"),
    },
    handler: deriveUkPropertyAnnual,
  },
  submit_itsa_quarterly_update: {
    description:
      "Files one period of HMRC's Self Employment Business API (derive_itsa_quarterly_update's figures, once the user " +
      "has confirmed them) over the deployed API. In a tax year filed as cumulative period summaries (2025-26 on) the " +
      "figures are the running total from 6 April and the period dates are optional; in earlier years they are required. " +
      "Uses the session's HMRC authorisation for the itsa service: call request_hmrc_authorisation with services " +
      '["itsa"] first if this tool says none is held.',
    inputSchema: {
      nino: z.string().describe("The customer's National Insurance number"),
      businessId: z.string().describe("The self-employment business id HMRC holds, for example XAIS12345678901"),
      taxYear: z.string().describe("The tax year, as 2025-26"),
      periodStartDate: z.string().optional().describe("The period's start, YYYY-MM-DD"),
      periodEndDate: z.string().optional().describe("The period's end, YYYY-MM-DD"),
      periodIncome: moneySection.optional().describe("Income by field, as derive_itsa_quarterly_update answers it"),
      periodExpenses: moneySection.optional().describe("Expenses by field, as derive_itsa_quarterly_update answers it"),
      periodDisallowableExpenses: moneySection
        .optional()
        .describe("Disallowable expenses by field, as derive_itsa_quarterly_update answers it"),
      hmrcAccount: z
        .enum(HMRC_ACCOUNTS)
        .optional()
        .describe("Which HMRC environment to call; defaults to the session's HMRC authorisation's own"),
      govTestScenario: z.string().optional().describe("HMRC sandbox test scenario"),
      runFraudPreventionHeaderValidation: z.boolean().optional(),
    },
    handler: submitItsaQuarterlyUpdate,
  },
  submit_itsa_annual_submission: {
    description:
      "Files the year's allowances and adjustments for HMRC's Self Employment Business API annual submission " +
      "(derive_itsa_annual_submission's figures, once the user has confirmed them) over the deployed API. Uses the " +
      'session\'s HMRC authorisation for the itsa service: call request_hmrc_authorisation with services ["itsa"] first if ' +
      "this tool says none is held.",
    inputSchema: {
      nino: z.string().describe("The customer's National Insurance number"),
      businessId: z.string().describe("The self-employment business id HMRC holds, for example XAIS12345678901"),
      taxYear: z.string().describe("The tax year, as 2025-26"),
      adjustments: moneySection.optional().describe("Adjustments by field, as derive_itsa_annual_submission answers them"),
      allowances: moneySection.optional().describe("Allowances by field, as derive_itsa_annual_submission answers them"),
      nonFinancials: z.record(z.string(), z.unknown()).optional().describe("The non-financial facts HMRC takes, when the year needs them"),
      hmrcAccount: z
        .enum(HMRC_ACCOUNTS)
        .optional()
        .describe("Which HMRC environment to call; defaults to the session's HMRC authorisation's own"),
      govTestScenario: z.string().optional().describe("HMRC sandbox test scenario"),
      runFraudPreventionHeaderValidation: z.boolean().optional(),
    },
    handler: submitItsaAnnualSubmission,
  },
};
