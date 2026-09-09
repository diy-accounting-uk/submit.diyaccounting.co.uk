// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/auth/login-mock-addon.js
// Mock OAuth login addon - only served in proxy/simulator environments
// In production, server.js returns an empty script for this file

(function () {
  "use strict";

  const container = document.getElementById("mock-auth-container");
  if (!container) return;

  // Inject the mock login button
  container.innerHTML = `
    <div class="auth-provider" id="mockOAuth2Provider">
      <button type="button" class="btn auth-btn" id="loginWithMockOAuth2">
        <img src="https://avatars.githubusercontent.com/u/11848947?s=48&v=4" alt="navikt/mock-oauth2-server" class="provider-logo" />
        Continue with mock-oauth2-server
      </button>
    </div>
  `;

  // Add click handler
  const mockButton = document.getElementById("loginWithMockOAuth2");
  if (mockButton) {
    mockButton.addEventListener("click", loginWithMockOAuth2);
  }

  // Login with Mock OAuth2 Server (and stubbed cognito)
  async function loginWithMockOAuth2() {
    console.log("Initiating navikt/mock-oauth2-server login");

    console.log("Clear stored tokens and user info");
    localStorage.removeItem("cognitoAccessToken");
    localStorage.removeItem("cognitoIdToken");
    localStorage.removeItem("cognitoRefreshToken");
    localStorage.removeItem("userInfo");
    sessionStorage.removeItem("cognito_oauth_state");

    // Generate state parameter for security using cryptographically secure random values
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const state = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem("cognito_oauth_state", state);

    try {
      // Get OAuth URL from the mock auth endpoint
      const response = await fetch(`/api/v1/mock/authUrl?state=${state}`);
      if (!response.ok) {
        throw new Error(`Failed to get auth URL: ${response.status}`);
      }
      const authResponse = await response.json();
      const authUrl = authResponse.authUrl;

      if (typeof window.showStatus === "function") {
        window.showStatus(`Handing off to ${authUrl}`, "info");
      }
      console.log("Redirecting to navikt/mock-oauth2-server");

      try {
        window.__correlation?.prepareRedirect?.();
      } catch (error) {
        console.error("Correlation preparation failed:", error);
        // Ignore correlation errors
      }

      window.location.href = authUrl;
    } catch (error) {
      console.error("Mock OAuth2 login failed:", error);
      if (typeof window.showStatus === "function") {
        window.showStatus("Mock OAuth2 server not available. Ensure npm run auth or npm run simulator is running.", "error");
      } else {
        alert("Mock OAuth2 server not available. Ensure npm run auth or npm run simulator is running.");
      }
    }
  }
})();
