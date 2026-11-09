// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/cognitoCallbackHosts.js

// Hosts registered as Cognito callbacks (IdentityStack.buildAuthHosts). The browser holds the same
// pattern as COGNITO_CALLBACK_HOST in web/public/lib/auth-url-builder.js; a unit test keeps them equal.
export const COGNITO_CALLBACK_HOST = /^(?:ci-submit|prod-submit|submit|ci-set\d+\.submit)\.diyaccounting\.co\.uk$/;

export const COGNITO_CALLBACK_PATH = "/auth/loginWithCognitoCallback.html";

// True when redirectUri is the sign-in callback on a registered host, or the callback of the
// deployment's own base URL (the address the browser falls back to when its host is unregistered,
// such as the local proxy and simulator).
export function isRegisteredCognitoRedirectUri(redirectUri, baseUrl) {
  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return false;
  }
  if (parsed.search || parsed.hash || parsed.username || parsed.password) return false;
  if (parsed.pathname !== COGNITO_CALLBACK_PATH) return false;
  if (parsed.protocol === "https:" && !parsed.port && COGNITO_CALLBACK_HOST.test(parsed.hostname)) return true;
  if (!baseUrl) return false;
  try {
    return redirectUri === new URL(COGNITO_CALLBACK_PATH, baseUrl).href;
  } catch {
    return false;
  }
}
