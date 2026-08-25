// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/public/lib/auth-url-builder.js
(function () {
  "use strict";

  async function buildCognitoAuthUrl(state, nonce, scope = "openid profile email") {
    const env = await window.envReady;

    const redirectUri = env.DIY_SUBMIT_BASE_URL.replace(/\/$/, "") + "/auth/loginWithCognitoCallback.html";

    // Build authorization URL with state (CSRF protection) and nonce (replay attack protection)
    let url =
      `${env.COGNITO_BASE_URI.replace(/\/$/, "")}/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(env.COGNITO_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    // Include nonce for OpenID Connect - returned in ID token for validation
    if (nonce) {
      url += `&nonce=${encodeURIComponent(nonce)}`;
    }

    return url;
  }

  async function buildHmrcAuthUrl(state, scope = "write:vat read:vat", account = "live") {
    const env = await window.envReady;

    const sandbox = account.toLowerCase() === "sandbox";

    const base = sandbox ? env.HMRC_SANDBOX_BASE_URI : env.HMRC_BASE_URI;

    const clientId = sandbox ? env.HMRC_SANDBOX_CLIENT_ID : env.HMRC_CLIENT_ID;

    const redirectUri = env.DIY_SUBMIT_BASE_URL.replace(/\/$/, "") + "/activities/submitVatCallback.html";

    return (
      `${base.replace(/\/$/, "")}/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`
    );
  }

  window.authUrlBuilder = { buildCognitoAuthUrl, buildHmrcAuthUrl };
})();
