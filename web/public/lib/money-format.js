// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/money-format.js
// Sterling display formatting shared by the VAT read pages: thousands
// separators, two decimals (or whole pounds) and a leading minus.

(function () {
  "use strict";

  const twoDecimals = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
  const wholePounds = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  function formatGbp(amount) {
    return twoDecimals.format(Number(amount));
  }

  function formatGbpWhole(amount) {
    return wholePounds.format(Number(amount));
  }

  window.formatGbp = formatGbp;
  window.formatGbpWhole = formatGbpWhole;
})();
