// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

(async function () {
  const url = "/api/v1/hmrc/vat/return";
  try {
    // HMRC VAT endpoints use custom authorizer with Cognito access token via X-Authorization
    const headers = {};
    try {
      const accessToken = localStorage.getItem("cognitoAccessToken");
      if (accessToken) headers["X-Authorization"] = `Bearer ${accessToken}`;
    } catch (err) {
      console.warn("Failed to retrieve cognitoAccessToken from localStorage for HEAD request to", url, ":", err.message);
    }
    const response = await fetch(url, { method: "HEAD", headers });
    console.log(`HEAD ${url} -> ${response.status} ${response.statusText}`);
  } catch (err) {
    console.error(`Error performing HEAD ${url}:`, err);
  }
})();
