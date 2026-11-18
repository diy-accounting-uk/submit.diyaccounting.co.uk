// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The callback's address is registered with Companies House, so the page has no Welsh copy and
// does not move. It reads the stored language choice before page-chrome.js reads the page's
// language, so the chrome and the text that filingCallback.page.js writes are in that language.
try {
  if (window.localStorage.getItem("siteLanguage") === "cy") document.documentElement.setAttribute("lang", "cy");
} catch {
  // No storage: the page stays in English.
}
