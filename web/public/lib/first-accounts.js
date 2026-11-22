// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/first-accounts.js
// When small company accounts may leave out the prior year. Accounts show the preceding
// financial year's figures beside each item (FRS 102 paragraphs 1A.10 and 3.14), and a company's
// first financial year begins on the day it was incorporated (Companies Act 2006 sections 390 and
// 391), so only the first accounts have no preceding year. The accounts form and the accounts route
// both take the rule from here.

/**
 * Whether a period is the company's first, from its Companies House profile: the period starts on
 * the day the company was incorporated, and the register holds no accounts but, on a revision,
 * these same accounts.
 * @param {{dateOfCreation?: string, accountsLastPeriodStart?: string}} profile
 * @param {string} periodStart - ISO date
 * @returns {boolean}
 */
export function isFirstAccountsPeriod(profile, periodStart) {
  if (!periodStart || !profile?.dateOfCreation || profile.dateOfCreation !== periodStart) return false;
  return !profile.accountsLastPeriodStart || profile.accountsLastPeriodStart === periodStart;
}

/**
 * What is wrong with the years small company accounts state, or null.
 * @param {{periodStart: string, dateOfIncorporation?: string, hasPriorYear: boolean}} accounts -
 *   dateOfIncorporation is given only for first accounts
 * @returns {"prior-year-required"|"first-accounts-start-on-incorporation"|"first-accounts-have-no-prior-year"|null}
 */
export function comparativesFinding({ periodStart, dateOfIncorporation, hasPriorYear }) {
  if (!dateOfIncorporation) return hasPriorYear ? null : "prior-year-required";
  if (dateOfIncorporation !== periodStart) return "first-accounts-start-on-incorporation";
  return hasPriorYear ? "first-accounts-have-no-prior-year" : null;
}

/**
 * Whether a filed accounts document marks itself as the company's first accounts: it tags the date
 * of incorporation (bus:DateFormationOrIncorporation), and that date reads the same as the period's
 * start date (bus:StartDateForPeriodCoveredByReport).
 * @param {string} document - the filed iXBRL
 * @returns {boolean}
 */
export function marksFirstAccounts(document) {
  const factText = (name) =>
    new RegExp(`<ix:nonNumeric name="bus:${name}" contextRef="[^"]*"[^>]*>([^<]*)</ix:nonNumeric>`).exec(document)?.[1]?.trim();
  const incorporated = factText("DateFormationOrIncorporation");
  return Boolean(incorporated) && incorporated === factText("StartDateForPeriodCoveredByReport");
}
