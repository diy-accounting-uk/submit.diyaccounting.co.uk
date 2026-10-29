// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// What the signed-in person has chosen to see. Two choices last for the browser session
// (sessionStorage): preview features, which shows what the catalogue hides in this environment,
// and operator features, which an operator turns off to see what a customer sees. The account
// settings live on the server and come with the bundles.

export const PREVIEW_FEATURES_HEADER = "x-preview-features";

const PREVIEW_FEATURES_KEY = "previewFeatures";
const OPERATOR_FEATURES_KEY = "operatorFeatures";

export const ACCOUNT_SETTING_DEFAULTS = { passGeneration: true };

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

/** @returns {boolean} True when preview features are on for this session (off by default) */
export function isPreviewOn() {
  return readSession(PREVIEW_FEATURES_KEY) === "on";
}

/** @param {boolean} on - Whether preview features show for this session */
export function setPreviewOn(on) {
  writeSession(PREVIEW_FEATURES_KEY, on ? "on" : null);
}

/** @returns {boolean} True unless an operator turned operator features off for this session */
export function isOperatorFeaturesOn() {
  return readSession(OPERATOR_FEATURES_KEY) !== "off";
}

/** @param {boolean} on - Whether operator features show for this session */
export function setOperatorFeaturesOn(on) {
  writeSession(OPERATOR_FEATURES_KEY, on ? null : "off");
}

/**
 * The bundle response: the person's bundles, token balance and account settings.
 * @returns {Promise<{bundles: object[], settings: object}|null>} Null when the person is signed out or the read fails
 */
export async function fetchBundleResponse() {
  let idToken = null;
  try {
    idToken = localStorage.getItem("cognitoIdToken");
  } catch {
    return null;
  }
  if (!idToken) return null;
  try {
    const requestCache = window.requestCache;
    if (requestCache && typeof requestCache.getJSON === "function") {
      return await requestCache.getJSON("/api/v1/bundle", { ttlMs: 5000, init: { headers: { Authorization: `Bearer ${idToken}` } } });
    }
    const response = await window.fetchWithIdToken("/api/v1/bundle", {});
    return response.ok ? await response.json() : null;
  } catch (err) {
    console.warn("viewer-settings: could not read the account settings", err);
    return null;
  }
}

/**
 * The account settings, each with the default when the person is signed out or the read fails.
 * @returns {Promise<{passGeneration: boolean}>}
 */
export async function fetchAccountSettings() {
  const response = await fetchBundleResponse();
  return { ...ACCOUNT_SETTING_DEFAULTS, ...(response?.settings ?? {}) };
}

/**
 * Change one account setting on the server.
 * @param {string} name - The setting name
 * @param {boolean} value - The new value
 * @returns {Promise<{passGeneration: boolean}>} The settings after the change
 */
export async function updateAccountSetting(name, value) {
  const response = await window.fetchWithIdToken("/api/v1/account/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [name]: value }),
  });
  if (!response.ok) throw new Error(`The setting was not saved (HTTP ${response.status})`);
  window.requestCache?.invalidate?.("/api/v1/bundle");
  return { ...ACCOUNT_SETTING_DEFAULTS, ...((await response.json()).settings ?? {}) };
}

/**
 * Everything that decides whether the catalogue shows an item to this person.
 * @returns {Promise<{preview: boolean, operatorFeatures: boolean, account: {passGeneration: boolean}}>}
 */
export async function fetchViewer() {
  return { preview: isPreviewOn(), operatorFeatures: isOperatorFeaturesOn(), account: await fetchAccountSettings() };
}
