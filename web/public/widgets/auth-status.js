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
    refreshBtn.setAttribute("aria-label", "check token balance");
    refreshBtn.setAttribute("title", "check token balance");
    refreshBtn.type = "button";
    refreshBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">' +
      '<path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>' +
      "</svg>";
    refreshBtn.addEventListener("click", onRefreshTokenBalance);

    tokenLink.appendChild(tokenCountEl);
    tokenBalanceEl.appendChild(tokenLink);
    tokenBalanceEl.appendChild(refreshBtn);
    authSection.insertBefore(tokenBalanceEl, loginLinkElement);
    return tokenBalanceEl;
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
      const tokenCountEl2 = tokenBalanceEl.querySelector(".token-count");
      if (tokenCountEl2) tokenCountEl2.textContent = "0 tokens";
      tokenBalanceEl.style.display = "inline-flex";
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
        if (hasTokenBundles && typeof data.tokensRemaining === "number") {
          tokenCountEl.textContent = data.tokensRemaining + " token" + (data.tokensRemaining !== 1 ? "s" : "");
        } else {
          tokenCountEl.textContent = "0 tokens";
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
      loginStatusElement.textContent = "Logged in as " + userLabel;
      loginLinkElement.textContent = "Logout";
      loginLinkElement.href = "#";
      loginLinkElement.onclick = logout;
      // Fetch token balance after login status is set
      fetchAndDisplayTokens();
    } else {
      loginStatusElement.textContent = "Not logged in";
      // Hide token balance when not logged in
      const tokenBalanceEl = document.querySelector(".token-balance");
      if (tokenBalanceEl) tokenBalanceEl.style.display = "none";

      const currentPage = window.location.pathname.split("/").pop();
      if (currentPage === "login.html") {
        loginLinkElement.textContent = "Home";
        loginLinkElement.href = "/";
      } else {
        loginLinkElement.textContent = "Log in";
        loginLinkElement.href = "../auth/login.html";
      }
      loginLinkElement.onclick = null;
    }
  }

  // Logout function
  async function logout(e) {
    // Prevent the <a> default action — without this, updateLoginStatus() changes
    // the href from "#" to "../auth/login.html" and the browser's default <a> click
    // navigation races with (and overrides) the Cognito redirect below.
    if (e && e.preventDefault) e.preventDefault();

    console.log("Logging out user");

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

    // In simulator mode, navigate to activities page instead of reloading
    // (demo credentials are re-injected on each page load)
    if (document.documentElement.dataset.simulator === "true") {
      const pathPrefix = window.location.pathname.startsWith("/sim/") ? "/sim/" : "/";
      window.location.href = window.location.origin + pathPrefix;
      return;
    }

    // Redirect to Cognito logout endpoint to invalidate session
    const env = await window.envReady;
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
