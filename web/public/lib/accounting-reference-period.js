// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounting-reference-period.js
// The length rule for a changed accounting reference period: Companies House's AA01 says "You cannot
// extend a period beyond 18 months unless the company is in administration." A plain ES module, so
// the change form's page and the simulator's answer apply the same arithmetic.

const pad = (number) => String(number).padStart(2, "0");

function isoDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * The last date a period that starts on periodStart can end on and be no longer than 18 months.
 * @param {string} periodStart - ISO date
 * @returns {string} ISO date
 */
export function latestEndWithinEighteenMonths(periodStart) {
  const [year, month, day] = periodStart.split("-").map(Number);
  const monthIndex = month - 1 + 18;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  // The day 18 months on, or the month's last day where it has no such day, less one day.
  return isoDate(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInTargetMonth) - 1)));
}

/**
 * Whether a period from periodStart to periodEnd is longer than 18 months.
 * @param {string} periodStart - ISO date
 * @param {string} periodEnd - ISO date
 * @returns {boolean}
 */
export function longerThanEighteenMonths(periodStart, periodEnd) {
  return periodEnd > latestEndWithinEighteenMonths(periodStart);
}

/**
 * The date nine months after a period's end, when a private company's accounts for it fall due.
 * @param {string} periodEnd - ISO date
 * @returns {string} ISO date
 */
export function accountsDueNineMonthsAfter(periodEnd) {
  const [year, month, day] = periodEnd.split("-").map(Number);
  const monthIndex = month - 1 + 9;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInTargetMonth))));
}
