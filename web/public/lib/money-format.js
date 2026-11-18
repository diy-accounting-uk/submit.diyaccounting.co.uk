// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/money-format.js
// Sterling display formatting shared by the VAT read pages: thousands
// separators, two decimals (or whole pounds) and a leading minus.

(function () {
  "use strict";

  // Amounts follow the language of the site's text: cy-GB when it reads in Welsh.
  function locale() {
    return window.siteLanguage?.chrome?.() === "cy" ? "cy-GB" : "en-GB";
  }

  function formatGbp(amount) {
    return new Intl.NumberFormat(locale(), { style: "currency", currency: "GBP" }).format(Number(amount));
  }

  function formatGbpWhole(amount) {
    return new Intl.NumberFormat(locale(), {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(amount));
  }

  window.formatGbp = formatGbp;
  window.formatGbpWhole = formatGbpWhole;
})();
