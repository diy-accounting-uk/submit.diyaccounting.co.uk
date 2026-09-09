// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
