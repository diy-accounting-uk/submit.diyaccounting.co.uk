// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/accountSettings.js
// The settings a signed-in user keeps on their account, each with a default: pass generation, a
// boolean, and the company watch list, the company numbers the user watches.

export const ACCOUNT_SETTING_DEFAULTS = { passGeneration: true, watchedCompanies: [] };

// The most companies one watch list holds. The watch list page reads each company's profile from
// Companies House on every visit, so the cap bounds the calls one account can drive.
export const WATCH_LIST_CAP = 50;

const COMPANY_NUMBER = /^[A-Z0-9]{8}$/;

// The reason a value cannot be stored under a setting, or null when it can.
const SETTING_CHECKS = {
  passGeneration: (value) => (typeof value === "boolean" ? null : "Setting passGeneration must be true or false"),
  watchedCompanies: (value) => {
    if (!Array.isArray(value)) return "Setting watchedCompanies must be a list of company numbers";
    if (value.length > WATCH_LIST_CAP) return `Setting watchedCompanies holds at most ${WATCH_LIST_CAP} companies`;
    if (!value.every((companyNumber) => typeof companyNumber === "string" && COMPANY_NUMBER.test(companyNumber))) {
      return "Setting watchedCompanies must hold 8-character company numbers only";
    }
    if (new Set(value).size !== value.length) return "Setting watchedCompanies must not repeat a company number";
    return null;
  },
};

/**
 * The account settings to use: the stored value of each setting, else its default.
 * @param {object|null|undefined} stored - The stored settings
 * @returns {{passGeneration: boolean, watchedCompanies: string[]}} Every setting with a value
 */
export function resolveAccountSettings(stored) {
  const settings = { ...ACCOUNT_SETTING_DEFAULTS, watchedCompanies: [...ACCOUNT_SETTING_DEFAULTS.watchedCompanies] };
  for (const name of Object.keys(ACCOUNT_SETTING_DEFAULTS)) {
    if (stored?.[name] !== undefined && SETTING_CHECKS[name](stored[name]) === null) settings[name] = stored[name];
  }
  return settings;
}

/**
 * Check a settings update from a request body.
 * @param {object|null} body - The parsed request body
 * @returns {{update: object, errors: string[]}} The settings to change and the reasons the body is not valid
 */
export function validateAccountSettingsUpdate(body) {
  const errors = [];
  const update = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { update, errors: ["Request body must be a JSON object of settings"] };
  }
  for (const [name, value] of Object.entries(body)) {
    if (!(name in ACCOUNT_SETTING_DEFAULTS)) {
      errors.push(`Unknown setting: ${name}`);
      continue;
    }
    const problem = SETTING_CHECKS[name](value);
    if (problem) errors.push(problem);
    else update[name] = value;
  }
  if (errors.length === 0 && Object.keys(update).length === 0) errors.push("Request body names no setting");
  return { update, errors };
}
