// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

(function () {
  // Clear any remaining auth-related localStorage
  // (auth-status.js already clears these before the Cognito redirect,
  // but belt-and-braces in case the user navigates here directly)
  localStorage.removeItem("loginProvider");
  localStorage.removeItem("cognitoAccessToken");
  localStorage.removeItem("cognitoIdToken");
  localStorage.removeItem("cognitoRefreshToken");
  localStorage.removeItem("userInfo");
  localStorage.removeItem("authState");
})();

// "Sign out and use another account" on the pass page stores its link here. The sign-out
// returns to this fixed page, which forwards to the stored link once.
(function () {
  let stored = null;
  try {
    stored = sessionStorage.getItem("passReturnAfterSignOut");
    sessionStorage.removeItem("passReturnAfterSignOut");
  } catch {}
  if (stored && window.postLoginRedirectTarget(stored) === stored) window.location.replace(stored);
})();
