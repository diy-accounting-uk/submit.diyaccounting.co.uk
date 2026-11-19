// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/oauthRedirectUri.js

// The environment apex hosts registered as callbacks with HMRC and Companies House, as in
// web/public/lib/auth-url-builder.js. A deployment is also registered under its own base URL.
export const APEX_CALLBACK_HOST = /^(?:ci-submit|submit)\.diyaccounting\.co\.uk$/;

/**
 * The redirect_uri a token exchange sends to the OAuth provider: the one the browser used at the
 * authorise step, accepted only when its origin is this deployment's own base URL or a registered
 * apex host, and its path is the callback page's path.
 * @param {unknown} candidate - the redirect_uri sent by the browser
 * @param {string} callbackPath - the callback page path without a leading slash
 * @returns {{ redirectUri: string } | { error: string }}
 */
export function resolveCallbackRedirectUri(candidate, callbackPath) {
  if (typeof candidate !== "string" || candidate === "") return { error: "Missing redirectUri from event body" };
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: "Invalid redirectUri. Must be an absolute URL." };
  }
  let ownOrigin;
  try {
    ownOrigin = new URL(process.env.DIY_SUBMIT_BASE_URL).origin;
  } catch {
    ownOrigin = null;
  }
  const isOwnOrigin = ownOrigin !== null && parsed.origin === ownOrigin;
  const isApexOrigin = parsed.protocol === "https:" && parsed.port === "" && APEX_CALLBACK_HOST.test(parsed.hostname);
  if (!isOwnOrigin && !isApexOrigin) return { error: "Invalid redirectUri. The host is not a registered callback host." };
  if (parsed.pathname !== `/${callbackPath}` || parsed.search !== "" || parsed.hash !== "" || parsed.username || parsed.password) {
    return { error: `Invalid redirectUri. Must be the ${callbackPath} callback page.` };
  }
  return { redirectUri: `${parsed.origin}/${callbackPath}` };
}

/**
 * The callback page URL on this deployment's own base URL, for flows that start from the server.
 * @param {string} callbackPath - the callback page path without a leading slash
 * @returns {string}
 */
export function ownCallbackRedirectUri(callbackPath) {
  return new URL(callbackPath, process.env.DIY_SUBMIT_BASE_URL).toString();
}
