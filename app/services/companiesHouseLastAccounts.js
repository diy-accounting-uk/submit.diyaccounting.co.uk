// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseLastAccounts.js
// The figures of a company's last filed accounts, read from the register's newest set of accounts
// and its iXBRL document, for the next accounts' prior-year column.

import { mapIxbrlAccounts } from "@diy-accounting-uk/diya-gl/dist/app/lib/ixbrl-accounts.js";
import { IxbrlError } from "@diy-accounting-uk/diya-gl/dist/app/lib/ixbrl-reader.js";
import { fetchLastFiledAccounts } from "./companiesHouseFiledAccounts.js";
import { isValidCompanyNumber } from "./companiesHouseApi.js";

// The most characters of a reason the answer and the log carry: a reader's message can quote text
// from the document, which anyone who files accounts writes.
const MAX_REASON_LENGTH = 300;

function unreadable(set, reason) {
  return { outcome: "unreadable", set, reason: reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH)}…` : reason };
}

/**
 * One filed iXBRL document mapped to the figures of its own year. Either regime is read, and a
 * document without a prior year (a company's first accounts) maps as well, because the fill reads
 * only the year the document was made up to. A document whose figures do not hold together throws.
 * @param {string} document - the iXBRL text
 * @returns {{companyNumber: string, regime: "micro"|"small", period: {start: string, end: string}, approvalDate: string|null,
 *   balanceSheet: object, profitAndLoss: {format: number, figures: object}|null, filleted: boolean, dormant: boolean}}
 * @throws {IxbrlError}
 */
export function mapLastAccounts(document) {
  const mapped = mapIxbrlAccounts(document, { regime: "any", firstAccounts: true });
  return {
    companyNumber: mapped.company.number,
    regime: mapped.regime,
    period: mapped.period,
    approvalDate: mapped.approvalDate,
    balanceSheet: mapped.balanceSheet.currentYear,
    profitAndLoss: mapped.profitAndLoss ? { format: mapped.profitAndLoss.format, figures: mapped.profitAndLoss.currentYear } : null,
    filleted: mapped.filleted,
    dormant: mapped.dormant,
  };
}

/**
 * The company's last filed accounts as the next accounts' prior year. outcome says what the form can
 * do with them: "mapped" (the figures are in accounts), "none" (no accounts on the register),
 * "paper" (filed on paper, a scanned document only), "no-ixbrl" (filed electronically, with no
 * iXBRL document), "too-large" (the document is over the size limit) or "unreadable" (the document
 * does not read as accounts; reason says why).
 * @param {string} companyNumber
 * @returns {Promise<{chResponse: object}|{outcome: string, set?: object, accounts?: object, reason?: string}>}
 *   chResponse alone when a read from Companies House failed
 */
export async function readLastAccounts(companyNumber) {
  const { chResponse, problem, set, document } = await fetchLastFiledAccounts(companyNumber);
  if (chResponse) return { chResponse };
  if (problem === "no-accounts") return { outcome: "none" };
  if (problem === "no-ixbrl") return { outcome: set.paperFiled ? "paper" : "no-ixbrl", set };
  if (problem === "too-large") return { outcome: "too-large", set };
  try {
    const accounts = mapLastAccounts(document);
    // A document filed on the register for one company can state another company's number; its
    // figures are not this company's.
    const { normalised } = isValidCompanyNumber(accounts.companyNumber);
    if (normalised !== companyNumber) {
      return unreadable(set, `The document states the company number ${normalised}, not ${companyNumber}.`);
    }
    return { outcome: "mapped", set, accounts };
  } catch (error) {
    if (error instanceof IxbrlError) return unreadable(set, error.message);
    // The reader walks the document's markup by recursion, so markup nested deeper than the call
    // stack allows cannot be read.
    if (error instanceof RangeError) return unreadable(set, "The document's markup is nested too deeply to read.");
    throw error;
  }
}
