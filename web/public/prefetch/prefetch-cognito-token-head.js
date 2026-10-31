// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-34 Prefetch and retry a Cognito token refresh
// - **Use when:** a 401 must trigger an automatic Cognito token refresh and retry, or when the exchange must start early.
// - **Does:** The frontend's fetchWithIdToken and ensureSession helpers call the refresh_token grant automatically on a 401 and retry the original request. prefetch-cognito-token-head.js and prefetch-mock-token-head.js start that exchange early in page load, for real and simulator variants.
// - **Run:** no command; see Does and Entry
// - **Entry:** `web/public/prefetch/prefetch-cognito-token-head.js`
// - **Files:** web/unit-tests/token-refresh.test.js, behaviour-tests/tokenRefresh.behaviour.test.js, web/public/prefetch/prefetch-cognito-token-head.js, web/public/prefetch/prefetch-mock-token-head.js
// - **Keywords:** cognito, token refresh, 401 retry, prefetch, fetchWithIdToken, ensureSession
// - **Related:** BILL-33
// @end-capability

(async function () {
  const url = "/api/v1/cognito/token";
  try {
    const response = await fetch(url, { method: "HEAD" });
    console.log(`HEAD ${url} -> ${response.status} ${response.statusText}`);
  } catch (err) {
    console.error(`Error performing HEAD ${url}:`, err);
  }
})();
