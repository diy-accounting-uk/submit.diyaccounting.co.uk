// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/pending-request.js
// Reads the request a page stored in sessionStorage before it sent the user to HMRC to sign in.
// A page resumes only a request it stored itself: the activity recorded beside the request is
// this page, and every field the page needs is present. Any other request is ignored and left
// in place for the page that owns it.

(function () {
  "use strict";

  function readJson(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  // Returns the stored request, or null when none exists or it belongs to another activity.
  function read(storageKey, requiredFields) {
    const request = readJson(storageKey);
    if (!request || typeof request !== "object") return null;

    const storedActivity = sessionStorage.getItem("currentActivity");
    if (storedActivity && storedActivity !== window.location.pathname) {
      console.log(`Ignoring ${storageKey}: it was stored for ${storedActivity}`);
      return null;
    }

    const missing = (requiredFields || []).filter((field) => !request[field]);
    if (missing.length > 0) {
      console.log(`Ignoring ${storageKey}: it has no ${missing.join(", ")}`);
      return null;
    }
    return request;
  }

  window.PendingRequest = { read };
})();
