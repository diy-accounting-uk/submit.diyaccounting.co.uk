// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The rules of the Making Tax Digital for Income Tax scope checker: which start date a person's
// qualifying income gives, and the first quarterly update deadline for that start date. The
// thresholds and dates are the ones GOV.UK gives; the unit tests read them from the source files.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Each rule: the qualifying income must be over `threshold` pounds in the tax year `taxYear`.
// The rules run from the earliest start date to the latest.
export const START_RULES = [
  { taxYear: "2024 to 2025", threshold: 50000, startDate: "2026-04-06", firstUpdateDeadline: "2026-08-07" },
  { taxYear: "2025 to 2026", threshold: 30000, startDate: "2027-04-06", firstUpdateDeadline: "2027-08-07" },
  { taxYear: "2026 to 2027", threshold: 20000, startDate: "2028-04-06", firstUpdateDeadline: "2028-08-07" },
];

export const FIRST_UPDATE_PERIOD = "6 April to 5 July";

export const RECORD_FIELDS = ["amount", "date when the income was received or expenses incurred", "category"];

export function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatPounds(amount) {
  return `£${amount.toLocaleString("en-GB")}`;
}

/** A pound amount typed by a person: blank is 0, anything that is not a number of 0 or more is null. */
export function parseIncome(text) {
  const cleaned = String(text ?? "")
    .replace(/[£,\s]/g, "")
    .trim();
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  const onlyDigitsAndPoint = [...cleaned].every((character) => "0123456789.".includes(character));
  return onlyDigitsAndPoint && Number.isFinite(value) ? value : null;
}

/** Qualifying income is the total of self-employment and property income before expenses. */
export function qualifyingIncome(selfEmployment, property) {
  return selfEmployment + property;
}

/**
 * Check one set of incomes against the three rules.
 * @param {Object<string, {selfEmployment: number, property: number}>} incomeByTaxYear keyed by the tax year of each rule
 * @param {string} today an ISO date
 * @returns {{inScope: boolean, startDate?: string, firstUpdateDeadline?: string, rule?: object, totals: object[], started?: boolean, deadlinePassed?: boolean}}
 */
export function assessScope(incomeByTaxYear, today) {
  const totals = START_RULES.map((rule) => {
    const income = incomeByTaxYear[rule.taxYear] ?? { selfEmployment: 0, property: 0 };
    return { rule, total: qualifyingIncome(income.selfEmployment, income.property) };
  });
  const match = totals.find(({ rule, total }) => total > rule.threshold);
  if (!match) return { inScope: false, totals };
  return {
    inScope: true,
    rule: match.rule,
    startDate: match.rule.startDate,
    firstUpdateDeadline: match.rule.firstUpdateDeadline,
    started: match.rule.startDate <= today,
    deadlinePassed: match.rule.firstUpdateDeadline < today,
    totals,
  };
}
