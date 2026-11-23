// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounts-revision-register.js
// Revised accounts that name no receipt replace accounts filed another way, so the accounts they
// replace are looked for on the Companies House register. The accounts route asks the question and
// the accounts forms word its refusal in the reader's language, both from here.

export const COMPANY_NOT_ON_REGISTER = "revision-company-not-on-register";
export const PERIOD_NOT_ON_REGISTER = "revision-period-not-on-register";

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

// Chromium's Intl has no Welsh, so a Welsh date is written from the month names here.
const WELSH_MONTHS = [
  "Ionawr",
  "Chwefror",
  "Mawrth",
  "Ebrill",
  "Mai",
  "Mehefin",
  "Gorffennaf",
  "Awst",
  "Medi",
  "Hydref",
  "Tachwedd",
  "Rhagfyr",
];

// A period end as the filing records print a date: 31 March 2026, or 31 Mawrth 2026 where the page
// reads in Welsh. A value that is not a real day is printed as it came.
function periodEndText(periodEnd) {
  const date = new Date(`${periodEnd}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== periodEnd) return String(periodEnd);
  if (globalThis.siteLanguage?.chrome() === "cy")
    return `${date.getUTCDate()} ${WELSH_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Why the register gives revised accounts nothing to replace, or null when it holds accounts made up
 * to the period's end.
 * @param {{companyFound: boolean, madeUpDates: string[]}} register - whether the register holds the
 *   company, and the made-up date of each set of accounts it holds for it
 * @param {string} periodEnd - the end of the revised accounts' period, YYYY-MM-DD
 * @returns {string|null} COMPANY_NOT_ON_REGISTER, PERIOD_NOT_ON_REGISTER or null
 */
export function registerRefusalReason(register, periodEnd) {
  if (!register.companyFound) return COMPANY_NOT_ON_REGISTER;
  return register.madeUpDates.includes(periodEnd) ? null : PERIOD_NOT_ON_REGISTER;
}

/**
 * The sentence for a refusal, in the reader's language on a page and in English on the server.
 * @param {string} reason - COMPANY_NOT_ON_REGISTER or PERIOD_NOT_ON_REGISTER
 * @param {{companyNumber: string, periodEnd: string}} filing - the company and period end of the revised accounts
 * @returns {string|null} null for any other reason
 */
export function registerRefusalText(reason, { companyNumber, periodEnd }) {
  if (reason === COMPANY_NOT_ON_REGISTER) {
    return siteText(
      "ch.revision.refuse-company-not-on-register",
      "Companies House holds no company with the number {number}, so there are no accounts to revise.",
      { number: companyNumber },
    );
  }
  if (reason === PERIOD_NOT_ON_REGISTER) {
    return siteText(
      "ch.revision.refuse-period-not-on-register",
      "Companies House holds no accounts for this company made up to {end}, so there are no accounts for revised accounts to replace.",
      { end: periodEndText(periodEnd) },
    );
  }
  return null;
}

/**
 * The sentence for a filing error that is a register refusal, or null for any other error.
 * @param {{reason?: string, body?: {companyNumber?: string, periodEnd?: string}}} error - a failed accounts request
 * @returns {string|null}
 */
export function registerRefusalOfError(error) {
  return registerRefusalText(error?.reason, { companyNumber: error?.body?.companyNumber, periodEnd: error?.body?.periodEnd });
}
