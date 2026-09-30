// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// session-beacon.js — fire-and-forget session start beacon, sent only after the visitor accepts
// the consent banner. analytics.js registers its consent-granted listener first, so the landing
// attribution is stored by the time this script reads it.
(function () {
  if (typeof sessionStorage === "undefined") return;

  function hasAnalyticsConsent() {
    try {
      return localStorage.getItem("consent.analytics") === "granted";
    } catch {
      return false;
    }
  }

  function sendBeacon() {
    if (sessionStorage.getItem("__diy_session__")) return;
    sessionStorage.setItem("__diy_session__", "1");

    // Absent or unparsable storage carries no attribution fields; the beacon still fires with
    // just the page.
    let attribution = {};
    try {
      const raw = localStorage.getItem("attribution.landing");
      if (raw) attribution = JSON.parse(raw) || {};
    } catch {
      attribution = {};
    }

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/v1/session/beacon", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify({ page: window.location.pathname, ...attribution }));
    } catch {
      // beacon failures are expected (ad blockers, offline)
    }
  }

  if (hasAnalyticsConsent()) {
    sendBeacon();
  } else {
    document.addEventListener("consent-granted", sendBeacon, { once: true });
  }
})();
