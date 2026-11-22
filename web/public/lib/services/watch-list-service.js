// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The company watch list: the company numbers the account watches, kept as the watchedCompanies
// account setting, which comes with the bundles and is written by PUT /api/v1/account/settings.

import { fetchAccountSettings, updateAccountSetting } from "./viewer-settings.js";

// The most companies one watch list holds, as app/lib/accountSettings.js allows.
export const WATCH_LIST_CAP = 50;

/** @returns {Promise<string[]>} The company numbers the account watches, oldest first */
export async function readWatchList() {
  return (await fetchAccountSettings()).watchedCompanies;
}

/**
 * Add a company to the watch list.
 * @param {string} companyNumber - An 8-character company number
 * @returns {Promise<string[]>} The watch list after the change
 */
export async function addToWatchList(companyNumber) {
  const current = await readWatchList();
  if (current.includes(companyNumber)) return current;
  if (current.length >= WATCH_LIST_CAP) throw new Error(`The watch list holds at most ${WATCH_LIST_CAP} companies`);
  return (await updateAccountSetting("watchedCompanies", [...current, companyNumber])).watchedCompanies;
}

/**
 * Remove a company from the watch list.
 * @param {string} companyNumber
 * @returns {Promise<string[]>} The watch list after the change
 */
export async function removeFromWatchList(companyNumber) {
  const current = await readWatchList();
  return (
    await updateAccountSetting(
      "watchedCompanies",
      current.filter((watched) => watched !== companyNumber),
    )
  ).watchedCompanies;
}
