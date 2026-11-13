// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The VAT return due date and the late submission penalty points, as gov.uk states them.
// web/unit-tests/vatPenaltyRules.test.js holds this table against the quotes of the source files.

export const PENALTY_POUNDS = 200;
export const POINTS_EXPIRE_MONTHS = 24;
export const DAYS_AFTER_MONTH_END = 7;

export const FREQUENCIES = {
  annual: { label: "Annually", threshold: 2, complianceMonths: 24, complianceReturns: 2, periodMonths: 12 },
  quarterly: { label: "Quarterly", threshold: 4, complianceMonths: 12, complianceReturns: 4, periodMonths: 3 },
  monthly: { label: "Monthly", threshold: 5, complianceMonths: 6, complianceReturns: 6, periodMonths: 1 },
};

const lastDayOfMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

function parseIso(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, monthIndex: month - 1, day };
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

/** The date the given number of months after an accounting period end; the last day of a month stays the last day of a month. */
export function addMonthsToPeriodEnd(periodEndIso, months) {
  const { year, monthIndex, day } = parseIso(periodEndIso);
  const endsMonth = day === lastDayOfMonth(year, monthIndex);
  const target = new Date(Date.UTC(year, monthIndex + months, 1));
  const targetLast = lastDayOfMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(endsMonth ? targetLast : Math.min(day, targetLast));
  return toIso(target);
}

/** One calendar month and 7 days after the end of the accounting period. */
export function returnDueDate(periodEndIso) {
  const due = new Date(`${addMonthsToPeriodEnd(periodEndIso, 1)}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + DAYS_AFTER_MONTH_END);
  return toIso(due);
}

/** The returns that still count towards points: the period and the ones before it that fall inside the expiry window. */
export function returnsInWindow(periodEndIso, frequency) {
  const { periodMonths } = FREQUENCIES[frequency];
  const count = POINTS_EXPIRE_MONTHS / periodMonths;
  return Array.from({ length: count }, (_, index) => {
    const periodEnd = addMonthsToPeriodEnd(periodEndIso, -periodMonths * index);
    return { periodEnd, dueDate: returnDueDate(periodEnd) };
  });
}

/** The points, the threshold and the penalties for a number of late returns. */
export function assessLateReturns(frequency, lateReturns) {
  const { threshold } = FREQUENCIES[frequency];
  const points = Math.min(lateReturns, threshold);
  const penalties = lateReturns >= threshold ? lateReturns - threshold + 1 : 0;
  return { points, threshold, penalties, penaltyPounds: penalties * PENALTY_POUNDS, atThreshold: points === threshold };
}
