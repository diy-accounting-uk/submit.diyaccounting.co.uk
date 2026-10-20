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
