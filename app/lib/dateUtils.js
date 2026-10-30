// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/dateUtils.js
// Shared date utilities for TTL calculations and timestamp handling

/**
 * Calculate a DynamoDB TTL (Unix epoch seconds) and ISO datestamp
 * @param {Date} baseDate - The date to calculate from
 * @param {Object} offset - Time offset configuration
 * @param {number} [offset.months] - Number of months to add
 * @param {number} [offset.days] - Number of days to add
 * @param {number} [offset.hours] - Number of hours to add
 * @returns {{ttl: number, ttl_datestamp: string}} TTL as Unix epoch seconds and ISO datestamp
 */
export function calculateTtl(baseDate, offset = {}) {
  // Months use UTC calendar fields. Days, hours and minutes are fixed lengths of epoch time,
  // so a clock change between the base date and the TTL does not shift the result.
  let ttlMs = baseDate.getTime();

  if (offset.months) {
    const monthDate = new Date(ttlMs);
    monthDate.setUTCMonth(monthDate.getUTCMonth() + offset.months);
    ttlMs = monthDate.getTime();
  }

  const fixedSeconds = (offset.days || 0) * 86400 + (offset.hours || 0) * 3600 + (offset.minutes || 0) * 60;
  const ttl = Math.floor(ttlMs / 1000) + fixedSeconds;

  return {
    ttl,
    ttl_datestamp: new Date(ttl * 1000).toISOString(),
  };
}

/**
 * The UTC days an hourly pull rewrites: yesterday, final, then today so far. Each day is one
 * `dt=YYYY-MM-DD` object that the next run overwrites, so a re-run is idempotent.
 * @param {Date} [now]
 * @returns {string[]} "YYYY-MM-DD", oldest first
 */
export function recentPullDays(now = new Date()) {
  return [1, 0].map((daysBack) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack)).toISOString().slice(0, 10),
  );
}

// Common TTL presets for different record types
export const TTL_PRESETS = {
  // HMRC requires tax records to be kept for 7 years (approx 2555 days)
  HMRC_TAX_RECORDS: { days: 2555 },
  // HMRC API request audit trail — 28-day retention
  TWENTY_EIGHT_DAYS: { days: 28 },
  // Standard retention of 1 month
  ONE_MONTH: { months: 1 },
  // Short-lived async request state
  ONE_HOUR: { hours: 1 },
  // Security state: bundle-endpoint rate-limit buckets outlive their one-minute window
  // slightly, so a burst spanning the boundary still has both buckets to read.
  FIVE_MINUTES: { minutes: 5 },
  // Security state: a sign-in session item outlives any session it tracks, so a session
  // resumed after a long gap still has its prior lastIssuedAt to compare against.
  THIRTY_DAYS: { days: 30 },
};

/**
 * Calculate TTL for HMRC tax records (7 years / 2555 days)
 * @param {Date} baseDate - The date to calculate from (usually creation date)
 * @returns {{ttl: number, ttl_datestamp: string}} TTL values
 */
export function calculateHmrcTaxRecordTtl(baseDate) {
  return calculateTtl(baseDate, TTL_PRESETS.HMRC_TAX_RECORDS);
}

/**
 * Calculate TTL for 28-day retention (HMRC API request audit trail)
 * @param {Date} baseDate - The date to calculate from
 * @returns {{ttl: number, ttl_datestamp: string}} TTL values
 */
export function calculateTwentyEightDayTtl(baseDate) {
  return calculateTtl(baseDate, TTL_PRESETS.TWENTY_EIGHT_DAYS);
}

/**
 * Calculate TTL for standard 1-month retention
 * @param {Date} baseDate - The date to calculate from
 * @returns {{ttl: number, ttl_datestamp: string}} TTL values
 */
export function calculateOneMonthTtl(baseDate) {
  return calculateTtl(baseDate, TTL_PRESETS.ONE_MONTH);
}

/**
 * Calculate TTL for short-lived 1-hour retention
 * @param {Date} baseDate - The date to calculate from
 * @returns {{ttl: number, ttl_datestamp: string}} TTL values
 */
export function calculateOneHourTtl(baseDate) {
  return calculateTtl(baseDate, TTL_PRESETS.ONE_HOUR);
}

/**
 * TTL (Unix epoch seconds) for a security-state rate-counter item, five minutes from now.
 * Returns the epoch seconds directly rather than the {ttl, ttl_datestamp} pair the other
 * calculators return: callers set it inline as a DynamoDB expression attribute value.
 * @returns {number}
 */
export function fiveMinuteTtl() {
  return calculateTtl(new Date(), TTL_PRESETS.FIVE_MINUTES).ttl;
}

/**
 * TTL (Unix epoch seconds) for a security-state sign-in session item, thirty days from now.
 * @returns {number}
 */
export function thirtyDayTtl() {
  return calculateTtl(new Date(), TTL_PRESETS.THIRTY_DAYS).ttl;
}

/**
 * Fixed one-minute bucket key for a rate counter. A sliding window would need a read per
 * request; a fixed bucket needs one atomic ADD whose return value is the count. The edge is
 * a caller spreading requests across a minute boundary can reach roughly double the stated
 * threshold before tripping it - acceptable for a limiter whose purpose is to catch a burst,
 * not to enforce an exact quota.
 *
 * @param {Date} [date]
 * @returns {number}
 */
export function nowMinute(date = new Date()) {
  return Math.floor(date.getTime() / 60000);
}

/**
 * Add an ISO 8601 duration of the form PnYnMnD to a date. Minimal support for years,
 * months and days only — no time components.
 * @param {Date} fromDate - The date to add the duration to
 * @param {string} iso - The ISO 8601 duration string, e.g. "P1Y6M"
 * @param {{onUnsupported?: (iso: string) => void}} [options] - onUnsupported is called,
 *   and fromDate returned unchanged, when iso does not match the supported pattern
 * @returns {Date}
 */
export function parseIsoDurationToDate(fromDate, iso, { onUnsupported } = {}) {
  const d = new Date(fromDate.getTime());
  // eslint-disable-next-line security/detect-unsafe-regex
  const m = String(iso || "").match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
  if (!m) {
    if (onUnsupported) onUnsupported(iso);
    return d;
  }
  const years = parseInt(m[1] || "0", 10);
  const months = parseInt(m[2] || "0", 10);
  const days = parseInt(m[3] || "0", 10);
  d.setFullYear(d.getFullYear() + years);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return d;
}
