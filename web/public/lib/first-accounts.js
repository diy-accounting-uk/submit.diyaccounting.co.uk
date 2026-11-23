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
 * the day the company was incorporated, and no accounts on the register end before it starts. The
 * profile's last accounts always give their end (period_end_on) and do not always give their start.
 * Accounts the register holds for a later year leave the period the first, so a revision of first
 * accounts is a revision of first accounts whatever has been filed since.
 * @param {{dateOfCreation?: string, accountsLastPeriodEnd?: string}} profile
 * @param {string} periodStart - ISO date
 * @returns {boolean}
 */
export function isFirstAccountsPeriod(profile, periodStart) {
  if (!periodStart || !profile?.dateOfCreation || profile.dateOfCreation !== periodStart) return false;
  return !profile.accountsLastPeriodEnd || profile.accountsLastPeriodEnd >= periodStart;
}

// A company's first accounting reference period runs more than six months but not more than 18
// months from incorporation (Companies Act 2006 s391(5)), and may not be extended beyond 18 months
// (s392(5)); its financial year may end up to seven days either side of the reference date (s390(3)).
const FIRST_PERIOD_MONTHS = 18;
const FINANCIAL_YEAR_LEEWAY_DAYS = 7;

/**
 * Whether a period that starts on the day of incorporation ends no later than a first financial
 * year can: 18 months from that day, and the seven days a financial year may run past its
 * reference date. A longer period starting on that day is not one set of first accounts.
 * @param {string} periodStart - ISO date, the day of incorporation
 * @param {string} periodEnd - ISO date
 * @returns {boolean}
 */
export function endsWithinFirstFinancialYear(periodStart, periodEnd) {
  const start = new Date(`${periodStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || !periodEnd) return false;
  const latest = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + FIRST_PERIOD_MONTHS, start.getUTCDate() - 1 + FINANCIAL_YEAR_LEEWAY_DAYS),
  );
  return periodEnd <= latest.toISOString().slice(0, 10);
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
