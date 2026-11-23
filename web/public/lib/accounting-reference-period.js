// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounting-reference-period.js
// The rules for a changed accounting reference period: which periods may be changed, and the length
// limit (Companies House's AA01 says "You cannot extend a period beyond 18 months unless the company
// is in administration."). A plain ES module, so the change form's page and the simulator's answer
// apply the same arithmetic.

const pad = (number) => String(number).padStart(2, "0");

function isoDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * The last date a period that starts on periodStart can end on and be no longer than 18 months.
 *
 * A "month" is a calendar month (Interpretation Act 1978, Schedule 1). The months are counted from
 * the day before the period starts, the end of the period before it, by the rule the Companies Act
 * 2006 gives for its other periods of months (section 443): the date in the 18th month after that
 * corresponds to it; the last day of that month where the day before the period is the last day of
 * its month; and the last day of February where that day is the 29th or 30th and the month is
 * February.
 * @param {string} periodStart - ISO date
 * @returns {string} ISO date
 */
export function latestEndWithinEighteenMonths(periodStart) {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const before = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - 1));
  const day = before.getUTCDate();
  const lastDayOfItsMonth = new Date(Date.UTC(before.getUTCFullYear(), before.getUTCMonth() + 1, 0)).getUTCDate();
  const monthIndex = before.getUTCMonth() + 18;
  const targetYear = before.getUTCFullYear() + Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const endDay = day === lastDayOfItsMonth ? daysInTargetMonth : Math.min(day, daysInTargetMonth);
  return isoDate(new Date(Date.UTC(targetYear, targetMonth, endDay)));
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

function dayAfter(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)));
}

/**
 * The end of the 12-month period after one that ends on periodEnd: the accounting reference date a
 * year on, or the month's last day where the month has no such day.
 * @param {string} periodEnd - ISO date
 * @param {{day: string|number, month: string|number}} [accountingReferenceDate]
 * @returns {string} ISO date
 */
export function nextReferenceDate(periodEnd, accountingReferenceDate) {
  const [year, month, day] = periodEnd.split("-").map(Number);
  const refMonth = Number(accountingReferenceDate?.month) || month;
  const refDay = Number(accountingReferenceDate?.day) || day;
  const lastDay = new Date(Date.UTC(year + 1, refMonth, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(year + 1, refMonth - 1, Math.min(refDay, lastDay))));
}

/**
 * The two periods a change of accounting reference date can name, as AA01 defines them: the
 * current period, "which has not yet come to an end", and the immediately previous one. The
 * register's next accounts are for the earliest period not yet filed: the current period while it
 * runs, or, once it has ended, the previous one, with the current period after it to the next
 * reference date. While the accounts are overdue no period can be changed.
 * @param {object} accounts
 * @param {string} accounts.nextStart - the next accounts' period start
 * @param {string} accounts.nextEnd - the next accounts' period end
 * @param {string} [accounts.nextDue] - the date the next accounts are due
 * @param {string} [accounts.lastStart] - the last accounts' period start
 * @param {string} [accounts.lastEnd] - the last accounts' period end
 * @param {{day: string|number, month: string|number}} [accounts.accountingReferenceDate]
 * @param {string} today - ISO date
 * @returns {{overdue: boolean, periods: Array<{start: string, end: string, current: boolean}>}}
 */
export function changeablePeriods(accounts, today) {
  const { nextStart, nextEnd, nextDue, lastStart, lastEnd, accountingReferenceDate } = accounts;
  if (!nextStart || !nextEnd) return { overdue: false, periods: [] };
  if (nextDue && nextDue < today) return { overdue: true, periods: [] };
  if (nextEnd >= today) {
    const periods = [{ start: nextStart, end: nextEnd, current: true }];
    if (lastStart && lastEnd) periods.push({ start: lastStart, end: lastEnd, current: false });
    return { overdue: false, periods };
  }
  return {
    overdue: false,
    periods: [
      { start: dayAfter(nextEnd), end: nextReferenceDate(nextEnd, accountingReferenceDate), current: true },
      { start: nextStart, end: nextEnd, current: false },
    ],
  };
}
