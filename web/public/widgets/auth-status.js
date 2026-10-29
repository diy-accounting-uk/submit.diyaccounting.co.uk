// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

(function () {
  function pickDisplayName(user) {
    const candidates = ["given_name", "name", "email", "sub"];

    for (const key of candidates) {
      if (user[key]) {
        return user[key];
      }
    }

    return "Unidentified User";
  }

  // Ensure the token-balance element exists in the auth-section
  function ensureTokenBalanceElement(loginStatusElement, loginLinkElement) {
    const authSection = loginStatusElement.parentNode;
    let tokenBalanceEl = authSection.querySelector(".token-balance");
    if (tokenBalanceEl) return tokenBalanceEl;

    tokenBalanceEl = document.createElement("span");
    tokenBalanceEl.className = "token-balance";
    tokenBalanceEl.style.display = "none";

    const tokenLink = document.createElement("a");
    tokenLink.href = "/usage.html";
    tokenLink.style.textDecoration = "none";
    tokenLink.style.color = "inherit";

    const tokenCountEl = document.createElement("span");
    tokenCountEl.className = "token-count";

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "token-refresh-btn";
    refreshBtn.setAttribute("aria-label", "Refresh token balance");
    refreshBtn.setAttribute("title", "Refresh token balance");
    refreshBtn.type = "button";
    refreshBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">' +
      '<path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>' +
      "</svg>";
    refreshBtn.addEventListener("click", onRefreshTokenBalance);

    tokenLink.appendChild(tokenCountEl);
    tokenBalanceEl.appendChild(tokenLink);
    tokenBalanceEl.appendChild(refreshBtn);
    authSection.insertBefore(tokenBalanceEl, authSection.querySelector(".settings-cog") || loginLinkElement);
    return tokenBalanceEl;
  }

  // The settings cog sits between the token balance and the logout link.
  function ensureSettingsCog(loginLinkElement) {
    const authSection = loginLinkElement.parentNode;
    if (authSection.querySelector(".settings-cog")) return;
    const cog = document.createElement("a");
    cog.className = "settings-cog";
    cog.href = "/settings.html";
    cog.setAttribute("aria-label", "Settings");
    cog.setAttribute("title", "Settings");
    cog.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
      '<path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.31-.07.63-.07.94s.02.63.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>' +
      "</svg>";
    authSection.insertBefore(cog, loginLinkElement);
  }

  // Fetch and display token balance
  async function fetchAndDisplayTokens() {
    const loginStatusElement = document.querySelector(".login-status");
    const loginLinkElement = document.querySelector(".login-link");
    if (!loginStatusElement || !loginLinkElement) return;

    const userInfo = localStorage.getItem("userInfo");
    if (!userInfo) return;

    const tokenBalanceEl = ensureTokenBalanceElement(loginStatusElement, loginLinkElement);
    const tokenCountEl = tokenBalanceEl.querySelector(".token-count");
    if (!tokenCountEl) return;

    // Wait for submit.js to be ready (provides fetchWithIdToken)
    if (!window.__submitReady__) {
      document.addEventListener("submit-ready", () => fetchAndDisplayTokens(), { once: true });
      return;
    }

    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) {
      tokenBalanceEl.style.display = "none";
      return;
    }

    try {
      const rc = window.requestCache;
      let data;
      if (rc && typeof rc.getJSON === "function") {
        data = await rc.getJSON("/api/v1/bundle", {
          ttlMs: 5000,
          init: { headers: { Authorization: "Bearer " + idToken } },
        });
      } else if (window.fetchWithIdToken) {
        const response = await window.fetchWithIdToken("/api/v1/bundle", {});
        if (response.ok) {
          data = await response.json();
        }
      }

      if (data && data.bundles && Array.isArray(data.bundles)) {
        const hasTokenBundles = data.bundles.some(function (b) {
          return b.allocated && b.tokensGranted !== undefined;
        });
        const hasUnlimitedTokenBundle = data.bundles.some(function (b) {
          return b.allocated && b.tokensGranted === "unlimited";
        });
        if (hasUnlimitedTokenBundle) {
          tokenCountEl.textContent = "Unlimited tokens";
        } else if (hasTokenBundles && typeof data.tokensRemaining === "number") {
          tokenCountEl.textContent = data.tokensRemaining + " token" + (data.tokensRemaining !== 1 ? "s" : "");
        } else {
          // No token bundle held (an operator, for one): there is no balance to show.
          tokenBalanceEl.style.display = "none";
          return;
        }
      } else {
        tokenCountEl.textContent = "0 tokens";
      }
      tokenBalanceEl.style.display = "inline-flex";
    } catch (err) {
      console.warn("Failed to fetch token balance:", err);
      tokenCountEl.textContent = "0 tokens";
      tokenBalanceEl.style.display = "inline-flex";
    }
  }

  // Refresh button handler: clear all caches and re-fetch
  function onRefreshTokenBalance() {
    // Clear L1 in-memory request cache
    if (window.requestCache && typeof window.requestCache.invalidate === "function") {
      window.requestCache.invalidate("/api/v1/bundle");
    }
    // Clear L2 IndexedDB bundle cache
    try {
      const userInfoJson = localStorage.getItem("userInfo");
      if (userInfoJson && window.bundleCache) {
        const user = JSON.parse(userInfoJson);
        if (user && user.sub) {
          window.bundleCache.clearBundles(user.sub);
        }
      }
    } catch {
      // ignore
    }
    // Also reset the entitlement-status widget's in-memory cache
    if (window.__entitlementStatus) {
      // Trigger a fresh entitlement check on next call
      try {
        window.EntitlementStatus.update();
      } catch {
        // ignore
      }
    }
    fetchAndDisplayTokens();
  }

  // A page that changes the balance (a bundle request, a generated pass) announces it here.
  window.addEventListener("bundle-changed", onRefreshTokenBalance);
  window.addEventListener("token-balance-changed", onRefreshTokenBalance);

  // Update login status display
  function updateLoginStatus() {
    const userInfo = localStorage.getItem("userInfo");
    const loginStatusElement = document.querySelector(".login-status");
    const loginLinkElement = document.querySelector(".login-link");

    if (!loginStatusElement || !loginLinkElement) {
      return; // Elements not found, skip
    }

    if (userInfo) {
      const user = JSON.parse(userInfo);
      const userLabel = pickDisplayName(user);
      console.log("User info:", user);
      console.log("User label:", userLabel);
      const prefix = document.createElement("span");
      prefix.className = "login-prefix";
      prefix.textContent = "Logged in as ";
      loginStatusElement.replaceChildren(prefix, userLabel);
      loginStatusElement.title = "Logged in as " + userLabel;
      ensureSettingsCog(loginLinkElement);
      loginLinkElement.textContent = "Logout";
      loginLinkElement.href = "#";
      loginLinkElement.onclick = logout;
      // Fetch token balance after login status is set
      fetchAndDisplayTokens();
    } else {
      loginStatusElement.textContent = "Not logged in";
      loginStatusElement.removeAttribute("title");
      // Hide token balance and the settings cog when not logged in
      const tokenBalanceEl = document.querySelector(".token-balance");
      if (tokenBalanceEl) tokenBalanceEl.style.display = "none";
      document.querySelector(".settings-cog")?.remove();

      const currentPage = window.location.pathname.split("/").pop();
      if (currentPage === "login.html") {
        loginLinkElement.style.display = "none";
      } else {
        loginLinkElement.style.display = "";
        loginLinkElement.textContent = "Log in";
        loginLinkElement.href = "/auth/login.html";
      }
      loginLinkElement.onclick = null;
    }
  }

  // End the session server-side: revoke the refresh token (Cognito's /oauth2/revoke, so a
  // copied refresh token stops working) and tell the authenticated sign-out route to publish
  // "logout" and delete the session item. Both are keepalive fetches, not navigator.sendBeacon,
  // because sendBeacon carries no custom headers and the sign-out route needs the caller's
  // Authorization header. The fetch calls are started here but not awaited to completion --
  // only awaited to *being sent* (env lookup, then the synchronous fetch() call that puts the
  // request in flight). logout() below awaits this function so both requests are in flight
  // before it returns, then relies on keepalive to carry them through the reload/redirect that
  // follows; awaiting a fetch's response there instead stalls that navigation for no benefit,
  // since keepalive already guarantees delivery survives the page going away.
  async function revokeAndSignOut() {
    let env;
    try {
      env = (await window.envReady) || {};
    } catch {
      env = {};
    }

    const refreshToken = localStorage.getItem("cognitoRefreshToken");
    if (refreshToken && env.COGNITO_BASE_URI && env.COGNITO_CLIENT_ID) {
      fetch(env.COGNITO_BASE_URI.replace(/\/$/, "") + "/oauth2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "token=" + encodeURIComponent(refreshToken) + "&client_id=" + encodeURIComponent(env.COGNITO_CLIENT_ID),
        keepalive: true,
      }).catch(() => {
        // revoke failures are expected (offline, ad blockers) -- local sign-out still proceeds
      });
    }

    const accessToken = localStorage.getItem("cognitoAccessToken");
    if (accessToken) {
      fetch("/api/v1/session/sign-out", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken },
        keepalive: true,
      }).catch(() => {
        // sign-out failures are expected (offline, ad blockers) -- local sign-out still proceeds
      });
    }

    if (typeof gtag === "function") {
      gtag("event", "logout");
    }
  }

  // Logout function
  async function logout(e) {
    // Prevent the <a> default action — without this, updateLoginStatus() changes
    // the href from "#" to "/auth/login.html" and the browser's default <a> click
    // navigation races with (and overrides) the Cognito redirect below.
    if (e && e.preventDefault) e.preventDefault();

    console.log("Logging out user");

    await revokeAndSignOut();

    // Clear Cognito tokens and user info from localStorage
    localStorage.removeItem("cognitoAccessToken");
    localStorage.removeItem("cognitoIdToken");
    localStorage.removeItem("cognitoRefreshToken");
    localStorage.removeItem("userInfo");
    localStorage.removeItem("authState");

    // Clear HMRC-related data from sessionStorage
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcAccount");
    sessionStorage.removeItem("submission_data");
    sessionStorage.removeItem("pendingObligationsRequest");
    sessionStorage.removeItem("pendingReturnRequest");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("cognito_oauth_state");
    sessionStorage.removeItem("traceparent");
    sessionStorage.removeItem("mfaMetadata");
    sessionStorage.removeItem("pendingPass");
    sessionStorage.removeItem("postLoginRedirect");
    sessionStorage.removeItem("passValidation");
    sessionStorage.removeItem("carriedVrn");
    sessionStorage.removeItem("carriedNino");
    sessionStorage.removeItem("carriedBusinessId");
    sessionStorage.removeItem("carriedTaxYear");
    sessionStorage.removeItem("carriedPeriodStart");
    sessionStorage.removeItem("carriedPeriodEnd");

    // Redirect to Cognito logout endpoint to invalidate session. window.envReady is
    // undefined on a page that never loaded env-loader.js, and rejects when /submit.env
    // failed to fetch — either way the local sign-out above must still stand, so resolve
    // defensively instead of letting logout() throw before it reaches the reload fallback.
    let env;
    try {
      env = (await window.envReady) || {};
    } catch {
      env = {};
    }
    if (env.COGNITO_BASE_URI && env.COGNITO_CLIENT_ID) {
      const logoutUri = window.location.origin + "/auth/signed-out.html";
      const logoutUrl =
        env.COGNITO_BASE_URI.replace(/\/$/, "") +
        "/logout?" +
        "client_id=" +
        env.COGNITO_CLIENT_ID +
        "&" +
        "logout_uri=" +
        encodeURIComponent(logoutUri);
      window.location.href = logoutUrl;
    } else {
      window.location.reload();
    }
  }

  // Initialize auth status
  function initializeAuthStatus() {
    updateLoginStatus();
  }

  // Expose functions globally for backward compatibility
  if (typeof window !== "undefined") {
    window.updateLoginStatus = updateLoginStatus;
    window.logout = logout;
    window.AuthStatus = {
      update: updateLoginStatus,
      logout: logout,
      initialize: initializeAuthStatus,
      refreshTokens: fetchAndDisplayTokens,
    };

    // Refresh token display when bundles change (e.g. after grant/revoke on bundles.html)
    window.addEventListener("bundle-changed", function () {
      if (window.requestCache) window.requestCache.invalidate("/api/v1/bundle");
      fetchAndDisplayTokens();
    });
  }

  // Auto-initialize if DOM is already loaded, otherwise wait for it
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAuthStatus);
  } else {
    initializeAuthStatus();
  }
})();
