// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-13 Warm backend routes via prefetch scripts
// - **Use when:** a page must pre-warm a Lambda or route before its own script needs the real response.
// - **Does:** Each prefetch-*-head.js script issues one HEAD request from the page's head element. It targets the catalog, HMRC receipt, HMRC receipt name, HMRC token or mock auth URL route. It does not fetch or cache the response body.
// - **Run:** no command; see Does and Entry
// - **Entry:** `web/public/prefetch/prefetch-catalog-head.js`
// - **Files:** web/public/prefetch/prefetch-catalog-head.js, web/public/prefetch/prefetch-hmrc-receipt-head.js, web/public/prefetch/prefetch-hmrc-receipt-name-head.js, web/public/prefetch/prefetch-hmrc-token-head.js, web/public/prefetch/prefetch-mock-authurl-head.js
// - **Keywords:** prefetch, head request, warm route, cold start, lambda warming
// - **Related:** SITE-09
// @end-capability

(async function () {
  const url = "/api/v1/catalog";
  try {
    const response = await fetch(url, { method: "HEAD" });
    console.log(`HEAD ${url} -> ${response.status} ${response.statusText}`);
    if (!response.ok) {
      console.error("Catalog HEAD returned non-OK", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (err) {
    console.error(`Error performing HEAD ${url}:`, err);
  }
})();
