// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// session-beacon.js — fire-and-forget session start beacon
(function () {
  if (typeof sessionStorage === "undefined") return;
  if (sessionStorage.getItem("__diy_session__")) return;
  sessionStorage.setItem("__diy_session__", "1");

  // Reads the landing attribution analytics.js stored under the same key, so the source
  // reaches the server without needing GA4 consent. Absent or unparsable storage carries no
  // attribution fields; the beacon still fires with just the page.
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
})();
