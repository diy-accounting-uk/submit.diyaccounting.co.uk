// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-01 Sign customers in via Cognito
// - **Use when:** a page must start, complete or refresh a Cognito hosted-UI login.
// - **Does:** auth-url-builder.js builds the Cognito hosted-UI authorization URL. login.html and the callback pages redirect and complete the exchange. cognitoTokenPost.js exchanges the code or refresh token for tokens. auth-service.js tracks token expiry and refreshes the session. auth-status.js renders logged-in state and sends a logout beacon.
// - **Run:** `POST /api/v1/cognito/token`; `import { buildCognitoAuthUrl } from "web/public/lib/auth-url-builder.js"`
// - **Entry:** `web/public/lib/auth-url-builder.js:buildCognitoAuthUrl`; `app/functions/auth/cognitoTokenPost.js:ingestHandler`; `web/public/lib/services/auth-service.js`
// - **Files:** web/public/auth/login.html, web/public/auth/loginWithCognitoCallback.html, web/public/auth/loginWithMockCallback.html, web/public/auth/login-mock-addon.js, web/public/auth/signed-out.html, web/public/widgets/auth-status.js, web/public/lib/auth-url-builder.js, web/public/lib/services/auth-service.js, web/public/lib/utils/jwt-utils.js, app/functions/auth/cognitoTokenPost.js, app/functions/auth/preTokenGeneration/index.js, infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/IdentityStackTest.java, app/system-tests/cognitoAuth.system.test.js, app/unit-tests/functions/cognitoTokenPost.test.js, app/unit-tests/functions/preTokenGeneration.test.js, behaviour-tests/auth.behaviour.test.js, behaviour-tests/helpers/hosted-ui-navigation.js, behaviour-tests/steps/behaviour-login-steps.js, web/unit-tests/hosted-ui-navigation.test.js, web/unit-tests/auth-url-generation.test.js, web/unit-tests/auth-logout-sign-out.test.js
// - **Keywords:** cognito, login, logout, hosted ui, oauth, token refresh, auth-status, sign in, callback, mfa claim, user pool
// - **Related:** SITE-02
// @end-capability

// web/public/lib/auth-url-builder.js
(function () {
  "use strict";

  // Hosts registered as callbacks, from IdentityStack.buildAuthHosts (Cognito), infra/hmrc/hmrc.toml and
  // infra/companies-house/companies-house.toml. A sign-in must return to the address it started on,
  // because session storage belongs to one address.
  const COGNITO_CALLBACK_HOST = /^(?:ci-submit|prod-submit|submit|ci-set\d+\.submit)\.diyaccounting\.co\.uk$/;
  const HMRC_CALLBACK_HOST = /^(?:ci-submit|submit)\.diyaccounting\.co\.uk$/;
  const COMPANIES_HOUSE_CALLBACK_HOST = /^(?:ci-submit|submit)\.diyaccounting\.co\.uk$/;

  // The page's own origin when it is a registered callback host, otherwise the deployment's base URL.
  function callbackBase(env, registeredHost) {
    return (registeredHost.test(window.location.hostname) ? window.location.origin : env.DIY_SUBMIT_BASE_URL).replace(/\/$/, "");
  }

  // Names Cognito accepts as identity_provider. COGNITO is the user pool's own email and password form.
  const IDENTITY_PROVIDERS = ["Google", "Microsoft", "SignInWithApple", "COGNITO"];

  // The provider named by a ?provider= query value when it is on the list, otherwise the button's own.
  function resolveIdentityProvider(search, buttonProvider) {
    const requested = new URLSearchParams(search || "").get("provider");
    return IDENTITY_PROVIDERS.includes(requested) ? requested : buttonProvider;
  }

  function cognitoRedirectUri(env) {
    return callbackBase(env, COGNITO_CALLBACK_HOST) + "/auth/loginWithCognitoCallback.html";
  }

  async function buildCognitoAuthUrl(state, nonce, codeChallenge, { scope = "openid profile email", identityProvider } = {}) {
    const env = await window.envReady;

    const redirectUri = cognitoRedirectUri(env);

    // Build authorization URL with state (CSRF protection), nonce (replay attack protection)
    // and a PKCE S256 code challenge (authorization code interception protection)
    let url =
      `${env.COGNITO_BASE_URI.replace(/\/$/, "")}/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(env.COGNITO_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&code_challenge_method=S256`;

    // Include nonce for OpenID Connect - returned in ID token for validation
    if (nonce) {
      url += `&nonce=${encodeURIComponent(nonce)}`;
    }

    if (identityProvider) {
      url += `&identity_provider=${encodeURIComponent(identityProvider)}`;
    }

    return url;
  }

  async function buildHmrcAuthUrl(state, scope = "write:vat read:vat", account = "live") {
    const env = await window.envReady;

    const synthetic = account.toLowerCase() === "synthetic";

    const base = synthetic ? env.HMRC_SANDBOX_BASE_URI : env.HMRC_BASE_URI;

    const clientId = synthetic ? env.HMRC_SANDBOX_CLIENT_ID : env.HMRC_CLIENT_ID;

    const redirectUri = callbackBase(env, HMRC_CALLBACK_HOST) + "/activities/submitVatCallback.html";

    return (
      `${base.replace(/\/$/, "")}/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`
    );
  }

  async function buildCompaniesHouseAuthUrl(state, scope) {
    const env = await window.envReady;

    const redirectUri = callbackBase(env, COMPANIES_HOUSE_CALLBACK_HOST) + "/companies-house/filingCallback.html";

    // British spelling: Companies House's identity service uses "authorise", not "authorize".
    return (
      `${env.COMPANIES_HOUSE_IDENTITY_BASE_URI.replace(/\/$/, "")}/oauth2/authorise` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(env.COMPANIES_HOUSE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`
    );
  }

  // Figures sent from a DIYA-GL page arrive as "#books=<base64url JSON>". The fragment never
  // survives the sign-in redirect, so the page keeps the decoded text in sessionStorage the
  // moment it loads, before any redirect, and the fill reads it from there after sign-in.
  const BOOKS_FRAGMENT_PREFIX = "#books=";
  const BOOKS_HANDOFF_KEY = "booksHandoff";
  const MAX_BOOKS_FRAGMENT_LENGTH = 32768;

  function decodeBase64Url(encoded) {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  }

  // The decoded JSON text of a books fragment, null when the hash carries none, or { problem }
  // when it carries one that cannot be decoded.
  function readBooksFragment(hash) {
    if (typeof hash !== "string" || !hash.startsWith(BOOKS_FRAGMENT_PREFIX)) return null;
    const encoded = hash.slice(BOOKS_FRAGMENT_PREFIX.length);
    if (encoded.length === 0 || encoded.length > MAX_BOOKS_FRAGMENT_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
      return { problem: "the figures in the link are not in the expected form" };
    }
    try {
      return { text: decodeBase64Url(encoded) };
    } catch {
      return { problem: "the figures in the link could not be decoded" };
    }
  }

  // Moves a books fragment into sessionStorage and clears it from the address bar. Without a
  // sign-in the page's own address is kept as the return address, so sign-in lands back here.
  function captureBooksFragment() {
    const read = readBooksFragment(window.location.hash);
    if (!read) return;
    sessionStorage.setItem(BOOKS_HANDOFF_KEY, JSON.stringify(read));
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!localStorage.getItem("cognitoIdToken")) {
      sessionStorage.setItem("postLoginRedirect", window.location.pathname + window.location.search);
    }
  }

  if (window.location && window.location.hash) captureBooksFragment();

  window.authUrlBuilder = {
    buildCognitoAuthUrl,
    cognitoRedirectUri,
    resolveIdentityProvider,
    IDENTITY_PROVIDERS,
    buildHmrcAuthUrl,
    buildCompaniesHouseAuthUrl,
    readBooksFragment,
    captureBooksFragment,
    BOOKS_HANDOFF_KEY,
  };
})();
