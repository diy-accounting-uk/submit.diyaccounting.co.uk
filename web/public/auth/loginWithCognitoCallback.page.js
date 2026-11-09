// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Check for authentication callback
function checkAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const state = urlParams.get("state");
  const error = urlParams.get("error");
  const errorDescription = urlParams.get("error_description");

  if (code) {
    console.log("Authentication callback received with code:", code);
    sessionStorage.removeItem("cognito_link_retry");
    handleAuthCallback(code, state);
  } else if (error || errorDescription) {
    console.error("OAuth error received:", error, errorDescription);
    if (shouldRetryAfterLink(errorDescription)) {
      restartSignInAfterLink();
      return;
    }
    sessionStorage.removeItem("cognito_link_retry");
    showStatus(`Authentication error: ${errorDescription || error}`, "error");
  }
}

// When the Pre sign-up trigger links a second provider to an existing profile, Cognito ends that
// first sign-in with this error. The same provider's sign-in, started once more, then succeeds.
const LINKED_PROFILE_ERROR = "already found an entry for username";

function shouldRetryAfterLink(errorDescription) {
  if (
    !String(errorDescription || "")
      .toLowerCase()
      .includes(LINKED_PROFILE_ERROR)
  )
    return false;
  return !sessionStorage.getItem("cognito_link_retry") && !!sessionStorage.getItem("cognito_identity_provider");
}

async function restartSignInAfterLink() {
  sessionStorage.setItem("cognito_link_retry", "1");
  await restartSignIn("Linking your sign-in to your existing account...");
}

async function restartSignIn(message) {
  const identityProvider = sessionStorage.getItem("cognito_identity_provider");
  showStatus(message, "info");
  try {
    // crypto-utils.js is a module script, so it has run only once the document has loaded.
    if (document.readyState === "loading") {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }
    const state = window.generateRandomState();
    const nonce = window.generateRandomState();
    const codeVerifier = window.generateCodeVerifier();
    sessionStorage.setItem("cognito_oauth_state", state);
    sessionStorage.setItem("cognito_oauth_nonce", nonce);
    sessionStorage.setItem("cognito_pkce_verifier", codeVerifier);
    const codeChallenge = await window.computeCodeChallenge(codeVerifier);
    const authUrl = await window.authUrlBuilder.buildCognitoAuthUrl(state, nonce, codeChallenge, { identityProvider });
    try {
      window.__correlation?.prepareRedirect?.();
    } catch {}
    window.location.replace(authUrl);
  } catch (err) {
    console.error("Failed to restart sign-in:", err);
    showStatus("Sign-in could not be completed. Please try logging in again.", "error");
  }
}

// The provider the person chose on the sign-in page. After a link the token's identities list
// holds every linked provider, and identities[0] is the first one linked, so the token cannot say
// which one this sign-in used.
function signedInProvider(idTokenPayload) {
  const requested = sessionStorage.getItem("cognito_identity_provider");
  if (requested) return requested === "COGNITO" ? "cognito" : requested;
  try {
    const identities = typeof idTokenPayload.identities === "string" ? JSON.parse(idTokenPayload.identities) : idTokenPayload.identities;
    if (Array.isArray(identities) && identities[0]) return identities[0].providerName || identities[0].providerType || "cognito";
  } catch {
    // malformed identities claim: fall back to "cognito"
  }
  return "cognito";
}

function base64UrlDecode(str) {
  // Replace URL-safe chars
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if missing
  const pad = str.length % 4;
  if (pad) {
    str += "=".repeat(4 - pad);
  }
  return atob(str);
}

// Handle authentication callback from Cognito
async function handleAuthCallback(code, state) {
  try {
    showLoading();

    // CRITICAL: Validate state parameter to prevent CSRF attacks
    // State must match what was stored in sessionStorage before redirect
    const storedState = sessionStorage.getItem("cognito_oauth_state");
    if (!state || state !== storedState) {
      console.error("OAuth state mismatch - possible CSRF attack", {
        receivedState: state ? state.substring(0, 8) + "..." : "none",
        hasStoredState: !!storedState,
      });
      showStatus("Security validation failed. Please try logging in again.", "error");
      sessionStorage.removeItem("cognito_oauth_state");
      hideLoading();
      return;
    }

    // Clear state immediately after validation (single use)
    sessionStorage.removeItem("cognito_oauth_state");

    // PKCE: the verifier saved before the redirect proves this tab started the sign-in
    const codeVerifier = sessionStorage.getItem("cognito_pkce_verifier");
    sessionStorage.removeItem("cognito_pkce_verifier");
    if (!codeVerifier) {
      console.error("PKCE code verifier missing from sessionStorage");
      showStatus("Security validation failed. Please try logging in again.", "error");
      hideLoading();
      return;
    }

    // The redirect_uri the sign-in started with; Cognito requires the exchange to repeat it exactly
    const redirectUri = sessionStorage.getItem("cognito_redirect_uri");
    sessionStorage.removeItem("cognito_redirect_uri");
    if (!redirectUri) {
      console.error("Redirect URI missing from sessionStorage");
      showStatus("Security validation failed. Please try logging in again.", "error");
      hideLoading();
      return;
    }

    showStatus("Exchanging authorization code for access token...", "info");

    const url = `/api/v1/cognito/token`;
    const body = {
      grant_type: "authorization_code",
      code: code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    };
    console.log(`Exchanging token. Remote call initiated: POST ${url} ++ Body: ${body}`);

    const tokenResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange authorization code for tokens");
    }

    const tokens = await tokenResponse.json();
    console.log("Received tokens from Cognito, fields: " + Object.keys(tokens).join(","));

    // Store tokens in localStorage (support both snake_case and camelCase fields)
    const accessToken = tokens.accessToken || tokens.access_token;
    const idToken = tokens.idToken || tokens.id_token;
    const refreshToken = tokens.refreshToken || tokens.refresh_token;

    // Decode ID token to get user info
    if (!idToken) {
      throw new Error("Missing idToken in exchange-token response");
    }
    const base64Payload = idToken.split(".")[1];
    const jsonPayload = base64UrlDecode(base64Payload);
    const idTokenPayload = JSON.parse(jsonPayload);

    console.log("Received id_token from Cognito, claims: " + Object.keys(idTokenPayload).join(","));

    // Validate nonce to prevent replay attacks
    // The nonce in the ID token must match the one we stored before the redirect
    const storedNonce = sessionStorage.getItem("cognito_oauth_nonce");
    if (storedNonce) {
      if (!idTokenPayload.nonce || idTokenPayload.nonce !== storedNonce) {
        console.error("OAuth nonce mismatch - possible replay attack", {
          hasTokenNonce: !!idTokenPayload.nonce,
          hasStoredNonce: !!storedNonce,
        });
        sessionStorage.removeItem("cognito_oauth_nonce");
        // A sign-in that Cognito carried through its own chooser page can come back without the nonce
        // this tab sent. The same provider's sign-in, started once more, carries it straight through.
        if (!sessionStorage.getItem("cognito_nonce_retry") && sessionStorage.getItem("cognito_identity_provider")) {
          sessionStorage.setItem("cognito_nonce_retry", "1");
          await restartSignIn("Confirming your sign-in...");
          return;
        }
        showStatus("Security validation failed (nonce mismatch). Please try logging in again.", "error");
        hideLoading();
        return;
      }
      // Clear nonce after successful validation (single use)
      sessionStorage.removeItem("cognito_oauth_nonce");
    }
    sessionStorage.removeItem("cognito_nonce_retry");

    // Tokens are kept only once the nonce has matched.
    if (accessToken) {
      localStorage.setItem("cognitoAccessToken", accessToken);
    }
    if (idToken) {
      localStorage.setItem("cognitoIdToken", idToken);
    }
    if (refreshToken) {
      localStorage.setItem("cognitoRefreshToken", refreshToken);
    }

    // Handle optional email gracefully
    const userEmail = idTokenPayload.email;

    localStorage.setItem(
      "userInfo",
      JSON.stringify({
        sub: idTokenPayload.sub,
        email: userEmail,
        given_name: idTokenPayload.given_name,
        family_name: idTokenPayload.family_name,
      }),
    );

    console.log("User authenticated successfully using Cognito:", userEmail || "no email provided");
    // GA4: login event after successful Cognito authentication. method names the identity
    // provider of this sign-in (e.g. "Google"), or "cognito" for a native email/password user.
    const loginProvider = signedInProvider(idTokenPayload);
    if (typeof gtag === "function") {
      gtag("event", "login", { method: loginProvider });
    }
    showStatus("Authenticated successfully. Fetching bundles...", "info");

    // Extract MFA status from the ID token
    // 1. Check amr (Authentication Methods Reference) claim — standard OIDC, provided by some IdPs
    // 2. Fallback: detect federated login via identities claim + auth_time
    //    Google and other federated IdPs enforce 2FA but don't expose amr in their tokens;
    //    Cognito includes identities and auth_time for federated users
    const amrClaims = idTokenPayload.amr || [];
    const mfaIndicators = ["mfa", "swk", "hwk", "otp"]; // mfa=multi-factor, swk=software key, hwk=hardware key, otp=one-time password
    const hasMFA = Array.isArray(amrClaims) && amrClaims.some((method) => mfaIndicators.includes(method));
    const isFederatedLogin = Array.isArray(idTokenPayload.identities) && idTokenPayload.identities.length > 0;
    const authTime = idTokenPayload.auth_time;

    // Generate a stable unique-reference for HMRC Gov-Client-Multi-Factor header.
    // HMRC requires: "Use the same hashing function consistently so that this can be
    // recognised across API calls." SHA-256(sub + ":" + factorType) gives a stable
    // identifier per user per MFA method. sub is already an opaque UUID (no PII).
    async function stableUniqueReference(sub, factorType) {
      const encoder = new TextEncoder();
      const data = encoder.encode(sub + ":" + factorType);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    if (hasMFA) {
      // amr claims explicitly indicate MFA (e.g. Cognito native TOTP, or IdPs that provide amr)
      // Map specific amr claims to HMRC MFA type values:
      //   otp = TOTP authenticator app → type=TOTP
      //   mfa/swk/hwk = other MFA methods (federated IdP, security key) → type=OTHER
      const mfaType = amrClaims.includes("otp") ? "TOTP" : "OTHER";
      const mfaMetadata = {
        type: mfaType,
        timestamp: authTime ? new Date(authTime * 1000).toISOString() : new Date().toISOString(),
        uniqueReference: await stableUniqueReference(idTokenPayload.sub, mfaType),
      };
      sessionStorage.setItem("mfaMetadata", JSON.stringify(mfaMetadata));
      console.log("MFA detected from amr claims:", amrClaims, "type:", mfaType, "Stored metadata:", mfaMetadata);
    } else if (idTokenPayload["custom:mfa_method"] === "TOTP") {
      // Cognito native auth with TOTP MFA — detected via Pre Token Generation trigger
      // (Cognito doesn't populate amr for native TOTP, so this custom claim is the signal)
      const mfaMetadata = {
        type: "TOTP",
        timestamp: authTime ? new Date(authTime * 1000).toISOString() : new Date().toISOString(),
        uniqueReference: await stableUniqueReference(idTokenPayload.sub, "TOTP"),
      };
      sessionStorage.setItem("mfaMetadata", JSON.stringify(mfaMetadata));
      console.log("MFA detected from custom:mfa_method claim. type: TOTP. Stored metadata:", mfaMetadata);
    } else if (isFederatedLogin && authTime) {
      // Federated login (Google, etc.) — IdP handles MFA but doesn't expose amr;
      // use auth_time from the token as the authentication timestamp
      const providerNames = idTokenPayload.identities.map((id) => id.providerName || id.providerType).join(", ");
      const mfaMetadata = {
        type: "OTHER",
        timestamp: new Date(authTime * 1000).toISOString(),
        uniqueReference: await stableUniqueReference(idTokenPayload.sub, "OTHER"),
      };
      sessionStorage.setItem("mfaMetadata", JSON.stringify(mfaMetadata));
      console.log("MFA inferred from federated login (" + providerNames + "), auth_time:", authTime, "Stored metadata:", mfaMetadata);
    } else {
      // No MFA detected - remove any existing metadata
      sessionStorage.removeItem("mfaMetadata");
      console.log("No MFA detected. amr:", amrClaims, "federated:", isFederatedLogin, "auth_time:", authTime);
    }

    // Store login provider for logout flow (Google logout requires extra redirect)
    localStorage.setItem("loginProvider", loginProvider);

    // No longer store bundles in localStorage; bundles will be fetched by pages as needed from /api/v1/bundle
    showStatus("Authenticated successfully. Redirecting...", "info");

    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);

    // Redirect to stored return URL (e.g. bundles.html?pass=CODE) or home
    let redirectUrl = "../";
    try {
      const postLoginRedirect = sessionStorage.getItem("postLoginRedirect");
      if (postLoginRedirect) {
        sessionStorage.removeItem("postLoginRedirect");
        redirectUrl = window.postLoginRedirectTarget(postLoginRedirect);
      }
    } catch {}
    // replace keeps this empty callback page out of the history, so Back does not return to it.
    window.location.replace(redirectUrl);
  } catch (error) {
    console.error("Authentication callback error:", error);
    showStatus(`Authentication failed: ${error.message}`, "error");
  } finally {
    hideLoading();
  }
}

// Check if this page was loaded as a callback from authentication
checkAuthCallback();

document.getElementById("homeBtn").addEventListener("click", () => {
  window.location.href = "../";
});
