// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

(function () {
  // Loading state management
  function showLoading() {
    console.log("Page display transition: Showing loading spinner");
    const loadingSpinner = document.getElementById("loadingSpinner");
    const submitBtn = document.getElementById("submitBtn");
    console.log("Loading spinner element:", loadingSpinner);
    if (loadingSpinner) {
      loadingSpinner.style.display = "block";
      loadingSpinner.style.visibility = "visible";
      loadingSpinner.style.opacity = "1";
      loadingSpinner.style.width = "40px";
      loadingSpinner.style.height = "40px";
      console.log("Loading spinner styles set:", loadingSpinner.style.cssText);
    }
    if (submitBtn) {
      submitBtn.disabled = true;
    }
  }

  function hideLoading() {
    console.log("Page display transition: Hiding loading spinner");
    const loadingSpinner = document.getElementById("loadingSpinner");
    const submitBtn = document.getElementById("submitBtn");
    if (loadingSpinner) {
      loadingSpinner.style.display = "none";
    }
    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }

  // Public API
  const api = {
    show: showLoading,
    hide: hideLoading,
  };

  // Attach as namespaced helper
  window.LoadingSpinner = window.LoadingSpinner || api;

  // Provide global function shims if not already defined, to ease migration
  if (typeof window.showLoading !== "function") {
    window.showLoading = showLoading;
  }
  if (typeof window.hideLoading !== "function") {
    window.hideLoading = hideLoading;
  }
})();
