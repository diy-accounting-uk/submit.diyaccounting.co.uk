// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/obligationFormatter.js

/**
 * Obligation formatting utilities for UI display
 * HMRC requirement: Period keys must NOT be shown to users
 * Per Software Developer Checklist Q9
 */

/**
 * Format obligation for display to user
 * HMRC requirement: Period keys should not be visible to users
 * @param {Object} obligation - Raw obligation from HMRC API
 * @returns {Object} Formatted obligation with hidden period key
 */
export function formatObligationForDisplay(obligation) {
  const startDate = new Date(obligation.start);
  const endDate = new Date(obligation.end);
  const dueDate = obligation.due ? new Date(obligation.due) : null;

  const dateOptions = { day: "numeric", month: "short", year: "numeric" };

  return {
    // Internal use only - NOT for display to users
    _periodKey: obligation.periodKey,

    // User-visible fields
    id: obligation.periodKey, // Used as key for selection, but displayed as date range
    displayName: `${startDate.toLocaleDateString("en-GB", dateOptions)} to ${endDate.toLocaleDateString("en-GB", dateOptions)}`,
    startDate: obligation.start,
    endDate: obligation.end,
    dueDate: obligation.due,
    dueDateFormatted: dueDate ? dueDate.toLocaleDateString("en-GB", dateOptions) : null,
    status: obligation.status, // 'O' (open) or 'F' (fulfilled)
    statusDisplay: obligation.status === "O" ? "Open" : "Submitted",
    receivedDate: obligation.received,
  };
}

/**
 * Format list of obligations for UI dropdown/selection
 * Returns array sorted by end date (most recent first)
 * @param {Array} obligations - Raw obligations from HMRC API
 * @returns {Array} Formatted obligations sorted by end date descending
 */
export function formatObligationsForSelection(obligations) {
  if (!Array.isArray(obligations)) {
    return [];
  }
  return obligations.map(formatObligationForDisplay).sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
}

/**
 * Filter obligations to show only open (unfulfilled) periods
 * @param {Array} formattedObligations - Already formatted obligations
 * @returns {Array} Only open obligations
 */
export function filterOpenObligations(formattedObligations) {
  return formattedObligations.filter((o) => o.status === "O");
}

/**
 * Get period key from formatted obligation (for API submission)
 * This extracts the hidden period key when user selects an obligation
 * @param {Object} formattedObligation - Formatted obligation object
 * @returns {string} The period key for HMRC API submission
 */
export function getPeriodKeyFromSelection(formattedObligation) {
  return formattedObligation._periodKey;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far a user-entered boundary may drift from the obligation's own boundary and still match.
 * VAT obligation periods are a month or longer, so a few days cannot reach a neighbouring period.
 */
export const OBLIGATION_DATE_TOLERANCE_DAYS = 3;

/**
 * Days of slack added either side of the requested period when asking HMRC for obligations.
 * HMRC filters on its own period dates, so a request keyed to drifted dates can otherwise
 * exclude the very obligation we are looking for.
 */
export const OBLIGATION_WINDOW_PADDING_DAYS = 7;

function toIsoDay(value) {
  if (typeof value !== "string") {
    return null;
  }
  const day = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
}

function daysApart(oneIsoDay, otherIsoDay) {
  return Math.abs(Date.parse(`${oneIsoDay}T00:00:00Z`) - Date.parse(`${otherIsoDay}T00:00:00Z`)) / MS_PER_DAY;
}

function shiftIsoDay(isoDay, days) {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Find the obligation a user's date range refers to.
 *
 * Period keys are opaque and cannot be calculated, so the date range is the only handle we have.
 * Exact boundaries win; otherwise the closest obligation within the tolerance wins, preferring an
 * open one when two are equally close. The caller decides what to do with the obligation's status.
 *
 * @param {Array} obligations - Raw obligations from HMRC (with start, end, status, periodKey)
 * @param {string} periodStart - Start date in ISO format (YYYY-MM-DD)
 * @param {string} periodEnd - End date in ISO format (YYYY-MM-DD)
 * @param {number} [toleranceDays] - Maximum drift allowed on each boundary
 * @returns {Object|null} The matching obligation, or null if none is close enough
 */
export function findObligationByDateRange(obligations, periodStart, periodEnd, toleranceDays = OBLIGATION_DATE_TOLERANCE_DAYS) {
  const requestedStart = toIsoDay(periodStart);
  const requestedEnd = toIsoDay(periodEnd);
  if (!Array.isArray(obligations) || !requestedStart || !requestedEnd) {
    return null;
  }

  const candidates = [];
  for (const obligation of obligations) {
    const obligationStart = toIsoDay(obligation?.start);
    const obligationEnd = toIsoDay(obligation?.end);
    if (!obligationStart || !obligationEnd) {
      continue;
    }
    const startDrift = daysApart(obligationStart, requestedStart);
    const endDrift = daysApart(obligationEnd, requestedEnd);
    if (startDrift > toleranceDays || endDrift > toleranceDays) {
      continue;
    }
    candidates.push({ obligation, drift: startDrift + endDrift });
  }

  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => a.drift - b.drift || openFirst(a.obligation, b.obligation));
  return candidates[0].obligation;
}

function openFirst(one, other) {
  if (one.status === other.status) return 0;
  return one.status === "O" ? -1 : 1;
}

/**
 * Build the date window to ask HMRC for obligations around a requested period.
 * Padded either side so a boundary the user typed a day or two out still returns its obligation,
 * without pushing the end of the window needlessly into the future.
 *
 * @param {string} periodStart - Start date in ISO format (YYYY-MM-DD)
 * @param {string} periodEnd - End date in ISO format (YYYY-MM-DD)
 * @param {Date} [now] - Current time, used to avoid a gratuitously future end date
 * @returns {{from: string, to: string}} Query window for the HMRC obligations endpoint
 */
export function obligationLookupWindow(periodStart, periodEnd, now = new Date()) {
  const start = toIsoDay(periodStart);
  const end = toIsoDay(periodEnd);
  if (!start || !end) {
    return { from: periodStart, to: periodEnd };
  }
  const today = now.toISOString().slice(0, 10);
  const paddedTo = shiftIsoDay(end, OBLIGATION_WINDOW_PADDING_DAYS);
  return {
    from: shiftIsoDay(start, -OBLIGATION_WINDOW_PADDING_DAYS),
    to: paddedTo > today && end < today ? today : paddedTo,
  };
}

/**
 * Describe an obligation period the way a customer would read it back.
 * @param {Object} obligation - Raw obligation from HMRC
 * @returns {string} e.g. "1 Feb 2026 to 30 Apr 2026"
 */
export function describeObligationPeriod(obligation) {
  const dateOptions = { day: "numeric", month: "short", year: "numeric" };
  const start = new Date(obligation.start).toLocaleDateString("en-GB", dateOptions);
  const end = new Date(obligation.end).toLocaleDateString("en-GB", dateOptions);
  return `${start} to ${end}`;
}
