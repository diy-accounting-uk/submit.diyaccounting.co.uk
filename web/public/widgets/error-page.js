// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Error page shared functionality

(function () {
  function showSignedInState() {
    const idToken = localStorage.getItem("cognitoIdToken");
    const userInfo = localStorage.getItem("userInfo");
    const loginStatus = document.querySelector(".login-status");
    const loginLink = document.querySelector(".login-link");

    if (!(idToken && userInfo && loginStatus && loginLink)) return;
    try {
      const user = JSON.parse(userInfo);
      loginStatus.textContent = user.email || "Logged in";
      loginLink.textContent = "Log out";
      loginLink.href = "#";
      loginLink.onclick = function (e) {
        e.preventDefault();
        localStorage.removeItem("cognitoIdToken");
        localStorage.removeItem("cognitoAccessToken");
        localStorage.removeItem("cognitoRefreshToken");
        localStorage.removeItem("userInfo");
        window.location.reload();
      };
    } catch (error) {
      console.error("Failed to parse user info:", error);
      // Parse error, keep default state
    }
  }

  // page-chrome.js builds the header on DOMContentLoaded and is loaded first, so this runs after it.
  document.addEventListener("DOMContentLoaded", showSignedInState);

  const retryButton = document.getElementById("retryBtn");
  if (retryButton) {
    retryButton.addEventListener("click", () => window.location.reload());
  }
})();
