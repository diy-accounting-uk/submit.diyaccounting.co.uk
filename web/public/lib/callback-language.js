// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/callback-language.js
// A callback page's address is registered with Companies House, HMRC or Cognito, so it has no Welsh
// copy and does not move. Loaded before page-chrome.js, this reads the stored language choice and sets
// the page's language from it, so the chrome, the skip link and the text the page's script writes
// through siteText are in that language.
try {
  if (window.localStorage.getItem("siteLanguage") === "cy") document.documentElement.setAttribute("lang", "cy");
} catch {
  // No storage: the page stays in English.
}
