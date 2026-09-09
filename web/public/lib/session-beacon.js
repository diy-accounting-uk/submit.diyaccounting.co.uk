// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// session-beacon.js — fire-and-forget session start beacon
(function () {
  if (typeof sessionStorage === "undefined") return;
  if (sessionStorage.getItem("__diy_session__")) return;
  sessionStorage.setItem("__diy_session__", "1");

  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/session/beacon", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({ page: window.location.pathname }));
  } catch {
    // beacon failures are expected (ad blockers, offline)
  }
})();
