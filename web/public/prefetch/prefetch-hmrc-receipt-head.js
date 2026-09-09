// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

(async function () {
  const url = "/api/v1/hmrc/receipt";
  try {
    const headers = {};
    try {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
    } catch (err) {
      console.warn("Failed to retrieve cognitoIdToken from localStorage for HEAD request to", url, ":", err.message);
    }
    const response = await fetch(url, { method: "HEAD", headers });
    console.log(`HEAD ${url} -> ${response.status} ${response.statusText}`);
  } catch (err) {
    console.error(`Error performing HEAD ${url}:`, err);
  }
})();
