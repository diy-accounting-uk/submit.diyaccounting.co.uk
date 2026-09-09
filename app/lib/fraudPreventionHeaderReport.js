// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/fraudPreventionHeaderReport.js
//
// Parses HMRC's monthly fraud prevention header feedback email (from HMRC's Transaction
// Monitoring team). Each email reports on the previous calendar month and carries exactly one
// of three outcomes: the headers are correct, the headers have advisories to review, or the
// application sent no requests at all that month. HMRC's own developer guide additionally names
// "Missing", "Invalid" and "Errors" as header statuses shown on the Developer Hub dashboard
// alongside "Advisories", so the errors sentence is matched using the same template as the
// advisories one even though no error-status email has been seen yet.

const MONTH_YEAR_PATTERN = "([A-Za-z]+ \\d{4})";

const ZERO_TRAFFIC_RE = new RegExp(`has not sent any requests in\\s+${MONTH_YEAR_PATTERN}`, "i");
const IN_PRODUCTION_MONTH_RE = new RegExp(`in production,\\s*in\\s+${MONTH_YEAR_PATTERN}`, "i");
const ADVISORIES_RE = /has advisories that you need to review/i;
const ERRORS_RE = /has errors that you need to (?:fix|review)/i;

/**
 * Extract the report month (e.g. "April 2026") from an HMRC fraud prevention header email.
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractMonth(text) {
  const zeroTraffic = text.match(ZERO_TRAFFIC_RE);
  if (zeroTraffic) return zeroTraffic[1];

  const inProduction = text.match(IN_PRODUCTION_MONTH_RE);
  if (inProduction) return inProduction[1];

  return null;
}

/**
 * Parse the text of HMRC's monthly fraud prevention header feedback email.
 *
 * The result carries only what an operator needs to decide whether to act: the reported month,
 * the traffic count when the email states one (only the zero-traffic report gives a number; the
 * correct and advisories reports don't state a count, so trafficCount is null for those), any
 * advisories or errors raised, and whether the report needs a human to act on it at all.
 *
 * @param {string} emailText - The plain text body of the report email.
 * @returns {{month: string, trafficCount: number|null, advisories: string[], errors: string[], needsAction: boolean}}
 * @throws {Error} when the text does not carry a recognisable report month.
 */
export function parseFraudPreventionHeaderReport(emailText) {
  if (typeof emailText !== "string" || emailText.trim() === "") {
    throw new Error("fraudPreventionHeaderReport: email text is required");
  }

  const month = extractMonth(emailText);
  if (!month) {
    throw new Error("fraudPreventionHeaderReport: could not find a report month in the email text");
  }

  const isZeroTraffic = ZERO_TRAFFIC_RE.test(emailText);
  const trafficCount = isZeroTraffic ? 0 : null;

  const advisories = [];
  if (ADVISORIES_RE.test(emailText)) {
    advisories.push(`Fraud prevention headers have advisories to review for ${month}.`);
  }

  const errors = [];
  if (ERRORS_RE.test(emailText)) {
    errors.push(`Fraud prevention headers have errors to fix for ${month}.`);
  }

  const needsAction = advisories.length > 0 || errors.length > 0 || isZeroTraffic;

  return { month, trafficCount, advisories, errors, needsAction };
}
