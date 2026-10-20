// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Initialize page - wait for submit.js module to be ready
function initPage() {
  checkAuthStatus();
}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}

document.getElementById("navigationBtn").addEventListener("click", () => {
  window.location.href = "../";
});
