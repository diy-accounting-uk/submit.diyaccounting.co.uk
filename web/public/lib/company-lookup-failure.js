// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/company-lookup-failure.js
// What the status line says when looking up a company on the register fails, in the page's
// language, by what the lookup route answered. The route's own message is in English and stays in
// the console.

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const COMPANIES_HOUSE_NOT_ANSWERING = new Set([502, 503, 504]);

/**
 * The page's sentence for a failed company lookup.
 * @param {{status?: number}} error - the lookup client's error, with the route's status when it answered
 * @param {string} companyNumber - the number looked up
 * @returns {string}
 */
export function companyLookupFailureText(error, companyNumber) {
  const status = error?.status;
  if (status === 404) {
    return siteText(
      "ch.lookup.not-found",
      "Companies House has no company with the number {number}. Check the number and look it up again.",
      { number: companyNumber },
    );
  }
  if (status === 400) {
    return siteText("ch.lookup.not-a-number", "That is not a company number. A company number is 8 characters, for example 00000001.");
  }
  if (status === 401) return siteText("widget.failure-sign-in-expired", "Your sign-in has expired.");
  if (status === 403) return siteText("widget.failure-no-bundle", "Your account has no bundle that allows this.");
  if (status === 429) {
    return siteText("ch.lookup.too-many", "Too many Companies House lookups just now. Try again in a few minutes.");
  }
  if (COMPANIES_HOUSE_NOT_ANSWERING.has(status)) {
    return siteText("ch.lookup.not-answering", "Companies House did not answer. Try again in a few minutes.");
  }
  return siteText(
    "ch.lookup.submit-fault",
    "Submit could not look up the company. This is a fault in Submit: try again, and ask for help if it happens again.",
  );
}

/** Show a failed lookup's sentence in the status line and keep the route's message in the console. */
export function showCompanyLookupFailure(showStatus, error, companyNumber) {
  console.error("Failed to look up the company:", error);
  showStatus(companyLookupFailureText(error, companyNumber), "error");
}
