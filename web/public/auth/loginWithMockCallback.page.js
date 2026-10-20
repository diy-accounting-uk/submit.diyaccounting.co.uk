// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Check for authentication callback
function checkAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const state = urlParams.get("state");

  if (code) {
    console.log("Authentication callback received with code:", code);
    handleAuthCallback(code, state);
  }
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

// Handle authentication callback from mock
async function handleAuthCallback(code, state) {
  try {
    showLoading();
    showStatus("Exchanging authorization code for access token...", "info");
    // Exchange authorization code for tokens via same-origin proxy to avoid PNA/CORS
    const tokenResponse = await fetch(`/api/v1/mock/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "debugger",
        code: code,
        // Use the current origin so it matches the authorize redirect_uri
        redirect_uri: `${window.location.origin}/auth/loginWithMockCallback.html`,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange authorization code for tokens");
    }

    const tokens = await tokenResponse.json();
    console.log("Received tokens from mock " + JSON.stringify(tokens));

    // Store tokens in localStorage
    if (tokens.access_token) {
      localStorage.setItem("cognitoAccessToken", tokens.access_token);
    }
    if (tokens.id_token) {
      localStorage.setItem("cognitoIdToken", tokens.id_token);
    }
    if (tokens.refresh_token) {
      localStorage.setItem("cognitoRefreshToken", tokens.refresh_token);
    }

    // Decode ID token to get user info
    const base64Payload = tokens.id_token.split(".")[1];
    const jsonPayload = base64UrlDecode(base64Payload);
    const idTokenPayload = JSON.parse(jsonPayload);

    console.log("Received id_token from mock " + JSON.stringify(idTokenPayload));

    localStorage.setItem(
      "userInfo",
      JSON.stringify({
        sub: idTokenPayload.sub,
        email: idTokenPayload.email,
        given_name: idTokenPayload.given_name,
        family_name: idTokenPayload.family_name,
      }),
    );

    console.log("User authenticated successfully using mock:", idTokenPayload.email);

    // Extract MFA status from the ID token
    // 1. Check amr (Authentication Methods Reference) claim — mock OAuth server provides amr: ["mfa", "pwd"]
    // 2. Fallback: detect federated login via identities claim + auth_time (same logic as Cognito callback)
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
      // amr claims explicitly indicate MFA
      // Map specific amr claims to HMRC MFA type values:
      //   otp = TOTP authenticator app → type=TOTP
      //   mfa/swk/hwk = other MFA methods → type=OTHER
      const mfaType = amrClaims.includes("otp") ? "TOTP" : "OTHER";
      const mfaMetadata = {
        type: mfaType,
        timestamp: authTime ? new Date(authTime * 1000).toISOString() : new Date().toISOString(),
        uniqueReference: await stableUniqueReference(idTokenPayload.sub, mfaType),
      };
      sessionStorage.setItem("mfaMetadata", JSON.stringify(mfaMetadata));
      console.log("MFA detected from amr claims:", amrClaims, "type:", mfaType, "Stored metadata:", mfaMetadata);
    } else if (isFederatedLogin && authTime) {
      // Federated login — IdP handles MFA but doesn't expose amr
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

    showStatus("Authenticated successfully. Fetching bundles...", "info");

    // No longer store bundles in localStorage; bundles will be fetched by pages as needed from /api/v1/bundle
    showStatus("Authenticated successfully. Redirecting...", "info");

    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);

    // Redirect to bundles page or home
    window.location.href = "../";
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
