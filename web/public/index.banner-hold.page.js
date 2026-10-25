// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Hold the banner's place from first paint when it is going to appear, so the page does not jump when the feature flag answers.
(function () {
  const banner = document.getElementById("feedbackEngagementBanner");
  if (banner && localStorage.getItem("cognitoIdToken") && localStorage.getItem("feedbackEngagementRegistered") !== "true") {
    banner.hidden = false;
    banner.style.visibility = "hidden";
  }
})();
