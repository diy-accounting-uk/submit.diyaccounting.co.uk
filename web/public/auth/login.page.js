// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Login with Google via Cognito
async function loginWithCognito() {
  console.log("Initiating login with Google via Cognito");

  console.log("Clear stored tokens and user info");
  localStorage.removeItem("cognitoAccessToken");
  localStorage.removeItem("cognitoIdToken");
  localStorage.removeItem("cognitoRefreshToken");
  localStorage.removeItem("userInfo");
  sessionStorage.removeItem("cognito_oauth_state");
  sessionStorage.removeItem("cognito_oauth_nonce");

  // Generate cryptographically secure state parameter for CSRF protection
  // Uses crypto.randomUUID() or crypto.getRandomValues() via crypto-utils.js
  const state = window.generateRandomState ? window.generateRandomState() : crypto.randomUUID().replace(/-/g, "");
  sessionStorage.setItem("cognito_oauth_state", state);

  // Generate cryptographically secure nonce for replay attack protection
  // The nonce is returned in the ID token and must match the original value
  const nonce = window.generateRandomState ? window.generateRandomState() : crypto.randomUUID().replace(/-/g, "");
  sessionStorage.setItem("cognito_oauth_nonce", nonce);

  let authResponseUrl;
  try {
    authResponseUrl = await window.authUrlBuilder.buildCognitoAuthUrl(state, nonce);
  } catch (err) {
    console.error("Failed to build Cognito auth URL:", err);
    if (typeof window.showStatus === "function") {
      window.showStatus("Sign-in is unavailable because the site configuration failed to load. Please reload the page.", "error");
    }
    return;
  }
  console.log("Generated Cognito Auth URL:", authResponseUrl);

  console.log("Redirecting to Cognito OAuth URL");
  try {
    window.__correlation?.prepareRedirect?.();
  } catch {}
  window.location.href = authResponseUrl;
}

// DOM elements and event listeners
// The button ships disabled: it renders long before the scripts above have loaded, and a
// click on it before this line ran did nothing at all.
const loginWithCognitoButton = document.getElementById("loginWithCognito");
loginWithCognitoButton.onclick = loginWithCognito;
loginWithCognitoButton.disabled = false;

sessionStorage.removeItem("currentActivity");
console.log("Current activity cleared");

// Initialize authentication on page load

// Only load mock auth addon in local development (localhost/127.0.0.1/local.submit)
// In production, this script is excluded from deployment and not needed
if (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "local.submit.diyaccounting.co.uk"
) {
  const script = document.createElement("script");
  script.src = "./login-mock-addon.js";
  document.body.appendChild(script);
}
