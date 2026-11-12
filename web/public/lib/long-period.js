// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/long-period.js
// The dates of a period of account longer than 12 months, for what a page shows: the two accounting
// periods, their days, and the two due dates. The books bundle works the boxes; this module only
// names the periods, so the form can show its panel the moment the dates are typed.

const DAY_MS = 86_400_000;

export const LONGEST_PERIOD_OF_ACCOUNT_MONTHS = 18;

function utcDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = utcDate(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(isoDate, days) {
  const date = utcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The same day of the month `months` later, or its last day when that month is shorter.
export function addMonths(isoDate, months) {
  const date = utcDate(isoDate);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function daysInclusive(isoStart, isoEnd) {
  return Math.round((utcDate(isoEnd).getTime() - utcDate(isoStart).getTime()) / DAY_MS) + 1;
}

/** The last day of the 12 months that start on isoStart. */
export function lastDayOfTwelveMonths(isoStart) {
  const date = utcDate(isoStart);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The two accounting periods of a period of account longer than 12 months: the first 12 months and
 * the rest. undefined when the dates are not both dates, or the period is 12 months or less.
 * tooLong is true when the period is longer than 18 months, which Companies Act 2006 s392 refuses.
 *
 * @param {string} periodStart - ISO date
 * @param {string} periodEnd - ISO date
 * @returns {{periods: Array<{periodStart: string, periodEnd: string, days: number}>, days: number, tooLong: boolean}|undefined}
 */
export function accountingPeriodDates(periodStart, periodEnd) {
  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodEnd < periodStart) return undefined;
  const firstEnd = lastDayOfTwelveMonths(periodStart);
  if (periodEnd <= firstEnd) return undefined;
  const secondStart = addDays(firstEnd, 1);
  return {
    periods: [
      { periodStart, periodEnd: firstEnd, days: daysInclusive(periodStart, firstEnd) },
      { periodStart: secondStart, periodEnd, days: daysInclusive(secondStart, periodEnd) },
    ],
    days: daysInclusive(periodStart, periodEnd),
    tooLong: periodEnd > addDays(addMonths(periodStart, LONGEST_PERIOD_OF_ACCOUNT_MONTHS), -1),
  };
}

/** The day after nine months from the end of an accounting period (TMA 1970 s59D(1)). */
export function taxDueDate(periodEnd) {
  const endsOnMonthEnd = addDays(periodEnd, 1).endsWith("-01");
  return endsOnMonthEnd ? addMonths(addDays(periodEnd, 1), 9) : addDays(addMonths(periodEnd, 9), 1);
}

/** Both returns of a long period of account file 12 months after the period of account ends. */
export function returnDueDate(periodOfAccountEnd) {
  return addMonths(periodOfAccountEnd, 12);
}

/** A date as a person reads it, for example "31 December 2025". */
export function longDateText(isoDate) {
  return utcDate(isoDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
