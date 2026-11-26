// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// What the signed-in person has chosen to see. Preview features, which shows what the catalogue
// hides in this environment, is the choice made in this browser (localStorage, so every tab
// agrees), else the account's stored previewFeatures; signed in, a bundle answer brings the
// browser's choice into line with the account's, so both read one value. Operator
// features, which an operator turns off to see what a customer sees, lasts for the browser session
// (sessionStorage). The account settings live on the server and come with the bundles.

export const PREVIEW_FEATURES_HEADER = "x-preview-features";

const PREVIEW_FEATURES_KEY = "previewFeatures";
// The account's previewFeatures as last read, kept so a request sent before this page's first
// bundle answer carries the account's setting. Sign-out removes it.
export const ACCOUNT_PREVIEW_FEATURES_KEY = "accountPreviewFeatures";
const OPERATOR_FEATURES_KEY = "operatorFeatures";

export const ACCOUNT_SETTING_DEFAULTS = { passGeneration: true, watchedCompanies: [], previewFeatures: false };

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage unavailable: the choice lasts until the page closes
  }
}

// The account's stored previewFeatures from the last bundle answer this page read, or null before one.
let accountPreviewFeatures = null;

function writeLocal(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable: the account's setting read on this page decides
  }
}

function readOnOff(key) {
  try {
    const value = localStorage.getItem(key);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

// Keeps the account's previewFeatures, and when this browser holds a different choice takes the
// account's value into it, so the settings switch and every reader show the one value.
function rememberAccountSettings(settings) {
  if (typeof settings?.previewFeatures !== "boolean") return;
  accountPreviewFeatures = settings.previewFeatures;
  const value = settings.previewFeatures ? "on" : "off";
  writeLocal(ACCOUNT_PREVIEW_FEATURES_KEY, value);
  const choice = readBrowserPreviewChoice();
  if (choice && choice !== value) writeLocal(PREVIEW_FEATURES_KEY, value);
}

/**
 * The preview choice stored in this browser, or null when it holds none.
 * @returns {"on"|"off"|null}
 */
export function readBrowserPreviewChoice() {
  return readOnOff(PREVIEW_FEATURES_KEY);
}

/** Removes the preview choice from this browser, so the account's setting decides again. */
export function clearBrowserPreviewChoice() {
  writeLocal(PREVIEW_FEATURES_KEY, null);
}

/**
 * Whether preview features are on: the choice made in this browser when there is one, else the
 * account's stored previewFeatures from this page's bundle answer, else the account's value as last
 * read in this browser, else off.
 * @returns {boolean}
 */
export function isPreviewOn() {
  const choice = readBrowserPreviewChoice();
  if (choice) return choice === "on";
  if (accountPreviewFeatures !== null) return accountPreviewFeatures;
  return readOnOff(ACCOUNT_PREVIEW_FEATURES_KEY) === "on";
}

/** @param {boolean} on - Whether preview features show in every tab of this browser */
export function setPreviewOn(on) {
  writeLocal(PREVIEW_FEATURES_KEY, on ? "on" : "off");
}

/** @returns {boolean} True unless an operator turned operator features off for this session */
export function isOperatorFeaturesOn() {
  return readSession(OPERATOR_FEATURES_KEY) !== "off";
}

/** @param {boolean} on - Whether operator features show for this session */
export function setOperatorFeaturesOn(on) {
  writeSession(OPERATOR_FEATURES_KEY, on ? null : "off");
}

// A bundle read that has not answered in this time is a failed read, the time developer-mode.js
// gives its own bundle read, so a page waiting on it goes on.
export const BUNDLE_READ_TIMEOUT_MS = 8000;

// The read's answer, or a rejection once the time limit passes without one.
async function withinBundleReadTimeLimit(read) {
  let timer;
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`The bundle read gave no answer in ${BUNDLE_READ_TIMEOUT_MS} ms`)), BUNDLE_READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([read, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The bundle answer of the signed-in person, or null when nobody is signed in. A failed read, or one
 * that gives no answer in BUNDLE_READ_TIMEOUT_MS, rejects, so a caller can tell it from an account
 * that holds nothing.
 * @returns {Promise<object|null>}
 */
export async function readBundleResponse() {
  let idToken;
  try {
    idToken = localStorage.getItem("cognitoIdToken");
  } catch {
    return null;
  }
  if (!idToken) return null;
  const requestCache = window.requestCache;
  const read =
    requestCache && typeof requestCache.getJSON === "function"
      ? requestCache.getJSON("/api/v1/bundle", { ttlMs: 5000, init: { headers: { Authorization: `Bearer ${idToken}` } } })
      : window.fetchWithIdToken("/api/v1/bundle", {}).then((response) => {
          if (!response.ok) throw Object.assign(new Error(`Request failed with status ${response.status}`), { status: response.status });
          return response.json();
        });
  const response = await withinBundleReadTimeLimit(read);
  rememberAccountSettings(response?.settings);
  return response;
}

/**
 * The bundle answer, or null when nobody is signed in or the read fails: for a caller that shows
 * an extra only when the answer allows it, such as the operator's sections.
 * @returns {Promise<object|null>}
 */
export async function fetchBundleResponse() {
  try {
    return await readBundleResponse();
  } catch (err) {
    console.warn("viewer-settings: could not read the account settings", err);
    return null;
  }
}

/**
 * The account settings, each with the default when the person is signed out. A failed read
 * rejects, so the watch list is never shown empty for an account whose list could not be read.
 * @returns {Promise<{passGeneration: boolean, watchedCompanies: string[], previewFeatures: boolean}>}
 */
export async function fetchAccountSettings() {
  const response = await readBundleResponse();
  return { ...ACCOUNT_SETTING_DEFAULTS, ...(response?.settings ?? {}) };
}

/**
 * Add a company to the account's watch list, or remove one, on the server. The server applies the
 * change to the list it holds and answers the settings as stored. A full list refuses an add with an
 * error that carries the settings as stored.
 * @param {"add"|"remove"} op
 * @param {string} companyNumber - An 8-character company number
 * @returns {Promise<{passGeneration: boolean, watchedCompanies: string[]}>} The settings after the change
 */
export async function changeWatchList(op, companyNumber) {
  const response = await window.fetchWithIdToken("/api/v1/account/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ watchList: { [op]: companyNumber } }),
  });
  window.requestCache?.invalidate?.("/api/v1/bundle");
  const body = await response.json().catch(() => ({}));
  if (response.status === 409 && body.reason === "watch_list_full") {
    throw Object.assign(new Error(body.message), { settings: { ...ACCOUNT_SETTING_DEFAULTS, ...(body.settings ?? {}) } });
  }
  if (!response.ok) throw new Error(`The watch list was not saved (HTTP ${response.status})`);
  return { ...ACCOUNT_SETTING_DEFAULTS, ...(body.settings ?? {}) };
}

/**
 * Change one account setting on the server.
 * @param {string} name - The setting name
 * @param {boolean} value - The new value
 * @returns {Promise<{passGeneration: boolean, watchedCompanies: string[], previewFeatures: boolean}>} The settings after the change
 */
export async function updateAccountSetting(name, value) {
  const response = await window.fetchWithIdToken("/api/v1/account/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [name]: value }),
  });
  if (!response.ok) throw new Error(`The setting was not saved (HTTP ${response.status})`);
  window.requestCache?.invalidate?.("/api/v1/bundle");
  const settings = { ...ACCOUNT_SETTING_DEFAULTS, ...((await response.json()).settings ?? {}) };
  rememberAccountSettings(settings);
  return settings;
}

/**
 * Everything that decides whether the catalogue shows an item to this person. operator is true
 * when the bundle answer grants the operator bundle.
 * @returns {Promise<{preview: boolean, operatorFeatures: boolean, operator: boolean, account: {passGeneration: boolean, previewFeatures: boolean}}>}
 */
export async function fetchViewer() {
  // The catalogue's display rules take the default settings, and no operator, when the read fails.
  const response = await readBundleResponse().catch((err) => {
    console.warn("viewer-settings: could not read the account settings", err);
    return null;
  });
  const account = { ...ACCOUNT_SETTING_DEFAULTS, ...(response?.settings ?? {}) };
  const operator = (response?.bundles ?? []).some((bundle) => bundle.bundleId === "operator" && bundle.allocated);
  return { preview: isPreviewOn(), operatorFeatures: isOperatorFeaturesOn(), operator, account };
}
