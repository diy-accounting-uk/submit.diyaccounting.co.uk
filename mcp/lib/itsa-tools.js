// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// itsa-tools.js -- the two ITSA derivations over the session's loaded book:
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
} from "@diy-accounting-uk/diya-gl";
import { QUARTERLY_PERIOD_TYPES } from "@diy-accounting-uk/diya-gl/dist/app/lib/derivations/itsa.js";
import { z } from "zod";

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
};
