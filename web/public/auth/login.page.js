// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Sign in with one identity provider via Cognito. A ?provider= value on the address, when it
// is on the allow list, replaces the button's provider.
async function loginWithProvider(buttonProvider) {
  const identityProvider = window.authUrlBuilder.resolveIdentityProvider(window.location.search, buttonProvider);
  console.log(`Initiating login with ${identityProvider} via Cognito`);

  console.log("Clear stored tokens and user info");
  localStorage.removeItem("cognitoAccessToken");
  localStorage.removeItem("cognitoIdToken");
  localStorage.removeItem("cognitoRefreshToken");
  localStorage.removeItem("userInfo");
  sessionStorage.removeItem("cognito_oauth_state");
  sessionStorage.removeItem("cognito_oauth_nonce");
  sessionStorage.removeItem("cognito_pkce_verifier");
  sessionStorage.removeItem("cognito_redirect_uri");
  sessionStorage.setItem("cognito_identity_provider", identityProvider);

  // Generate cryptographically secure state parameter for CSRF protection
  // Uses crypto.randomUUID() or crypto.getRandomValues() via crypto-utils.js
  const state = window.generateRandomState ? window.generateRandomState() : crypto.randomUUID().replace(/-/g, "");
  sessionStorage.setItem("cognito_oauth_state", state);

  // Generate cryptographically secure nonce for replay attack protection
  // The nonce is returned in the ID token and must match the original value
  const nonce = window.generateRandomState ? window.generateRandomState() : crypto.randomUUID().replace(/-/g, "");
  sessionStorage.setItem("cognito_oauth_nonce", nonce);

  // PKCE: the verifier stays in this tab until the callback sends it with the code
  const codeVerifier = window.generateCodeVerifier();
  sessionStorage.setItem("cognito_pkce_verifier", codeVerifier);

  let authResponseUrl;
  try {
    const codeChallenge = await window.computeCodeChallenge(codeVerifier);
    authResponseUrl = await window.authUrlBuilder.buildCognitoAuthUrl(state, nonce, codeChallenge, { identityProvider });
  } catch (err) {
    console.error("Failed to build Cognito auth URL:", err);
    if (typeof window.showStatus === "function") {
      window.showStatus("Sign-in is unavailable because the site configuration failed to load. Please reload the page.", "error");
    }
    return;
  }
  console.log("Generated Cognito Auth URL:", authResponseUrl);

  // The token exchange must send Cognito the exact redirect_uri the authorize request carried,
  // so it is read back from the URL just built.
  sessionStorage.setItem("cognito_redirect_uri", new URL(authResponseUrl).searchParams.get("redirect_uri"));

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
loginWithCognitoButton.onclick = () => loginWithProvider("Google");
loginWithCognitoButton.disabled = false;

try {
  if (sessionStorage.getItem("passAddOnReturn")) document.getElementById("pendingPassNote").hidden = false;
} catch {}

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
