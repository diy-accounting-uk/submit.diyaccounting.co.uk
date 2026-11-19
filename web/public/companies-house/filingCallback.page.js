// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// OAuth callback handling for Companies House. Mirrors activities/submitVatCallback.html:
// same state check, same token exchange shape, same "stay on the page so the error is
// visible" behaviour on failure - only the storage keys, endpoint and state key differ.

let navigationTarget = "../";

// The page's own text, in the stored language choice.
function writePageText() {
  document.title = window.siteText("ch.callback.title", "Companies House callback - DIY Accounting Submit");
  document.querySelector("header h1").textContent = window.siteText("ch.callback.heading", "Connecting to Companies House");
  document.querySelector("header .subtitle").textContent = window.siteText(
    "ch.callback.subtitle",
    "Finishing your sign-in with Companies House",
  );
  document.getElementById("navigationBtn").textContent = window.siteText("ch.callback.return-home", "Return home");
}

writePageText();

async function handleOAuthCallback() {
  const code = getValidatedAuthorisationCode();
  let succeeded = false;

  if (!code) {
    console.error("No valid authorisation code found in URL parameters.");
    showStatus(window.siteText("ch.callback.no-code", "No valid authorisation code found. Please try again."), "error");
  } else {
    try {
      showLoading();
      showStatus(window.siteText("ch.callback.exchanging", "Exchanging authorisation code for access token..."), "info");

      const requestedScope = sessionStorage.getItem("ch_oauth_scope");
      if (!requestedScope) {
        throw new Error(
          window.siteText(
            "ch.callback.no-scope",
            "No pending Companies House authorisation scope was found. Please start the filing again.",
          ),
        );
      }

      const tokenResponse = await exchangeToken(code, requestedScope);

      showStatus(window.siteText("ch.callback.obtained", "Obtained access token from Companies House..."), "info");

      // Companies House's token response names no scope, so the grant is recorded against
      // the scope the filing page requested: the filing page compares that exact string
      // before reusing the grant, and a grant that turns out not to cover the company is
      // rejected by the API with a 401, which starts a fresh authorise round trip.
      sessionStorage.removeItem("ch_oauth_state");
      sessionStorage.removeItem("ch_oauth_scope");
      sessionStorage.setItem("companiesHouseGrantId", tokenResponse.companiesHouseGrantId);
      sessionStorage.setItem("companiesHouseTokenExpiresAt", String(Date.now() + tokenResponse.expiresIn * 1000));
      sessionStorage.setItem("companiesHouseTokenScope", requestedScope);
      succeeded = true;
    } catch (error) {
      console.error("Companies House token exchange error:", error);
      showStatus(
        window.siteText("ch.callback.sign-in-failed", "Companies House sign-in failed: {message}", { message: error.message }),
        "error",
      );
    } finally {
      hideLoading();
    }
  }

  // Only carry on to the pending filing automatically when the token exchange
  // succeeded. On failure, stay on this page so the error message stays visible
  // instead of being wiped out by an immediate redirect.
  if (succeeded) {
    checkCurrentActivityAndRedirect();
  } else {
    offerReturnToActivity();
  }
}

// On failure, point the existing "Return home" button back at the pending
// filing instead, so the user can dismiss the error and retry.
function offerReturnToActivity() {
  const currentActivity = sessionStorage.getItem("currentActivity");
  const navigationBtn = document.getElementById("navigationBtn");
  if (currentActivity && navigationBtn) {
    navigationBtn.textContent = window.siteText("ch.callback.back-to-filing", "Back to Companies House filing");
    navigationTarget = currentActivity;
  }
}

function getValidatedAuthorisationCode() {
  console.log("Companies House OAuth callback handler");
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const state = urlParams.get("state");
  const error = urlParams.get("error");

  if (error) {
    showStatus(window.siteText("ch.callback.oauth-error", "Companies House OAuth error: {error}", { error }), "error");
    console.error("Companies House OAuth callback handler (error exit)");
    return null;
  }

  if (code && state) {
    const storedState = sessionStorage.getItem("ch_oauth_state");

    if (state !== storedState) {
      showStatus(window.siteText("ch.callback.invalid-state", "Invalid OAuth state. Please try again."), "error");
      console.error("Companies House OAuth callback handler (invalid state exit)");
      return null;
    }

    // Clear URL parameters
    console.log("Page transition initiated: Clearing URL parameters");
    window.history.replaceState({}, document.title, window.location.pathname);

    // Continue with token exchange and submission
    console.log("Companies House OAuth callback handler (normal completion)");
    return code;
  } else {
    console.log("Companies House OAuth callback handler (no action taken)");
    return null;
  }
}

async function exchangeToken(code, scope) {
  const url = `/api/v1/companies-house/token`;
  const redirectUri = await window.authUrlBuilder.companiesHouseRedirectUri();
  const body = JSON.stringify({ code, scope, redirectUri });
  console.log(`Exchanging Companies House token. Remote call initiated: POST ${url}`);

  // Cognito idToken identifies the authenticated web user for the token exchange audit,
  // the same way activities/submitVatCallback.html authenticates its HMRC token exchange.
  const response = await window.fetchWithIdToken(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    const message = `Failed to exchange Companies House token. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText}`;
    console.error(message);
    throw new Error(message);
  }

  const responseJson = await response.json();
  if (!responseJson.companiesHouseGrantId) {
    const message = `Failed to exchange Companies House token. Remote call response did not include companiesHouseGrantId: POST ${url} - Status: ${response.status} ${response.statusText}`;
    console.error(message);
    throw new Error(message);
  }
  if (!Number.isFinite(responseJson.expiresIn)) {
    const message = `Failed to exchange Companies House token. Remote call response did not include a numeric expiresIn: POST ${url} - Status: ${response.status} ${response.statusText}`;
    console.error(message);
    throw new Error(message);
  }

  console.log(`Exchanged Companies House token. Remote call completed successfully: POST ${url}`);
  return responseJson;
}

function checkCurrentActivityAndRedirect() {
  const currentActivity = sessionStorage.getItem("currentActivity");
  if (currentActivity) {
    console.log("Current activity found:", currentActivity);
    window.location.href = currentActivity;
  } else {
    console.log("No current activity found, staying on current page");
  }
}

document.getElementById("navigationBtn").addEventListener("click", () => {
  window.location.href = navigationTarget;
});

// Wait for submit.js module to be ready before running the callback handler
if (window.__submitReady__) {
  handleOAuthCallback();
} else {
  document.addEventListener("submit-ready", handleOAuthCallback, { once: true });
}
