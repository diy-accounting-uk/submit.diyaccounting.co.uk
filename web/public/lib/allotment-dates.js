// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/allotment-dates.js
// A return of allotment is due within one month of the allotment (Companies Act 2006, section 555),
// counted from the last day of a period of allotments. A plain ES module, so a unit test and the page
// both read it.

/**
 * The last day a return for an allotment is on time: the same day of the next month, or that
 * month's last day when it has no such day (31 January gives 28 or 29 February).
 * @param {string} lastAllotmentDate - YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
export function returnDueDate(lastAllotmentDate) {
  const [year, month, day] = String(lastAllotmentDate).split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const dueDay = Math.min(day, daysInNextMonth);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
}

/**
 * Whether a return filed on a day is late: after the due date of the last allotment it returns.
 * @param {string} lastAllotmentDate - YYYY-MM-DD
 * @param {string} filedOn - YYYY-MM-DD, today in the UK
 * @returns {boolean}
 */
export function isLateReturn(lastAllotmentDate, filedOn) {
  return String(filedOn) > returnDueDate(lastAllotmentDate);
}
