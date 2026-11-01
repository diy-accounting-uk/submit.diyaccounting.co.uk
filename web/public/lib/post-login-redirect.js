// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/post-login-redirect.js
// Pages store the address to return to after sign-in as location.pathname + location.search, a
// path from the site root. Only such a path is followed: a protocol-relative or absolute URL could
// send the signed-in user to another site.

(function () {
  function postLoginRedirectTarget(stored) {
    if (typeof stored !== "string") return "/";
    if (!stored.startsWith("/") || stored.startsWith("//") || stored.startsWith("/\\")) return "/";
    return stored;
  }

  window.postLoginRedirectTarget = postLoginRedirectTarget;
})();
