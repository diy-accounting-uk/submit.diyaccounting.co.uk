// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/allotment-dates.js
// A return of allotment is due within one month of making an allotment (Companies Act 2006, section
// 555(2)), so a return for a period of allotments is due within one month of its first allotment.
// A plain ES module, so a unit test and the page both read it.

/**
 * The last day a return for an allotment is on time: the same day of the next month, or that
 * month's last day when it has no such day (31 January gives 28 or 29 February).
 * @param {string} allotmentDate - YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
export function returnDueDate(allotmentDate) {
  const [year, month, day] = String(allotmentDate).split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const dueDay = Math.min(day, daysInNextMonth);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
}

/**
 * The last day a return for allotments made on one day or over a period is on time: one month from
 * the first allotment it returns.
 * @param {{startDate: string, endDate?: string}} dates - YYYY-MM-DD; endDate for a period
 * @returns {string} YYYY-MM-DD
 */
export function returnDueDateFor({ startDate }) {
  return returnDueDate(startDate);
}

/**
 * Whether a return filed on a day is late: after the due date of the first allotment it returns.
 * @param {{startDate: string, endDate?: string}} dates - YYYY-MM-DD; endDate for a period
 * @param {string} filedOn - YYYY-MM-DD, today in the UK
 * @returns {boolean}
 */
export function isLateReturn(dates, filedOn) {
  return String(filedOn) > returnDueDateFor(dates);
}
