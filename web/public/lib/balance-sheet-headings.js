// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/balance-sheet-headings.js
// diya-gl's iXBRL reader gives four balance sheet headings on their own: prepayments and accrued
// income, and called up share capital not paid, outside the current assets; accruals and deferred
// income outside the creditors; and the provisions for liabilities. A form with no box for one of them
// takes it into the line that holds it on a balance sheet without that heading, so the figures it
// fills still balance.

// Each heading, with the lines that take it in, the first the form has.
const HEADING_HOMES = {
  prepaymentsAccruedIncome: ["debtors", "currentAssets"],
  calledUpShareCapitalNotPaid: ["debtors", "currentAssets"],
  accrualsDeferredIncome: ["otherCreditors", "creditorsWithinOneYear"],
  provisionsForLiabilities: ["creditorsAfterOneYear"],
};

/**
 * One year's mapped balance sheet with each heading the form has no box for added into the first of
 * its lines the form has.
 * @param {Record<string, number>|undefined} year - a year of mapIxbrlAccounts' balanceSheet
 * @param {string[]} lines - the balance sheet lines the form has a box for
 * @returns {Record<string, number>|undefined}
 */
export function foldBalanceSheetHeadings(year, lines) {
  if (!year) return year;
  const folded = { ...year };
  for (const [heading, homes] of Object.entries(HEADING_HOMES)) {
    if (lines.includes(heading) || typeof folded[heading] !== "number") continue;
    const home = homes.find((line) => lines.includes(line));
    if (!home) continue;
    folded[home] = (folded[home] ?? 0) + folded[heading];
    delete folded[heading];
  }
  return folded;
}
