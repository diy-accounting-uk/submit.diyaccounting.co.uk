// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The company watch list: the company numbers the account watches, kept as the watchedCompanies
// account setting, which comes with the bundles and changes one company at a time through
// PUT /api/v1/account/settings with watchList, applied by the server to the list it holds.

import { fetchAccountSettings, changeWatchList } from "./viewer-settings.js";

// The most companies one watch list holds, as app/lib/accountSettings.js allows.
export const WATCH_LIST_CAP = 50;

/** @returns {Promise<string[]>} The company numbers the account watches, oldest first */
export async function readWatchList() {
  return (await fetchAccountSettings()).watchedCompanies;
}

/**
 * Add a company to the watch list. A company already on it leaves the list as it is; a full list
 * refuses the add.
 * @param {string} companyNumber - An 8-character company number
 * @returns {Promise<string[]>} The watch list as stored after the change
 */
export async function addToWatchList(companyNumber) {
  return (await changeWatchList("add", companyNumber)).watchedCompanies;
}

/**
 * Remove a company from the watch list. A company not on it leaves the list as it is.
 * @param {string} companyNumber
 * @returns {Promise<string[]>} The watch list as stored after the change
 */
export async function removeFromWatchList(companyNumber) {
  return (await changeWatchList("remove", companyNumber)).watchedCompanies;
}
