// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/accountSettings.js
// The settings a signed-in user keeps on their account. Each is a boolean with a default.

export const ACCOUNT_SETTING_DEFAULTS = { passGeneration: true };

/**
 * The account settings to use: the stored value of each setting, else its default.
 * @param {object|null|undefined} stored - The stored settings
 * @returns {{passGeneration: boolean}} Every setting with a value
 */
export function resolveAccountSettings(stored) {
  const settings = { ...ACCOUNT_SETTING_DEFAULTS };
  for (const name of Object.keys(ACCOUNT_SETTING_DEFAULTS)) {
    if (typeof stored?.[name] === "boolean") settings[name] = stored[name];
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
    if (!(name in ACCOUNT_SETTING_DEFAULTS)) errors.push(`Unknown setting: ${name}`);
    else if (typeof value !== "boolean") errors.push(`Setting ${name} must be true or false`);
    else update[name] = value;
  }
  if (errors.length === 0 && Object.keys(update).length === 0) errors.push("Request body names no setting");
  return { update, errors };
}
