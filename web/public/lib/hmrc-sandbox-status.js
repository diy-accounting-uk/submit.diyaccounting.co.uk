// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-sandbox-status.js
// Each VAT page ships with a production status line. showHmrcStatusForService swaps it for the
// sandbox line when the page's HMRC calls go to HMRC's test service: always for a synthetic account,
// which uses HMRC_SANDBOX_BASE_URI, and for any account where HMRC_BASE_URI is the test API.

(function () {
  "use strict";

  function showHmrcSandboxStatus(sentence, ...trailing) {
    const banner = document.querySelector("p.hint[data-feature-status]");
    if (!banner) return;
    banner.setAttribute("data-feature-status", "sandbox");
    banner.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = window.siteText ? window.siteText("vat-submit.status-sandbox", "Status: sandbox.") : "Status: sandbox.";
    banner.append(strong, ` ${sentence} `, ...trailing.filter(Boolean));
  }

  // HMRC's test API answers on a test-api host; every other host is treated as the live API.
  function isHmrcTestApi(baseUri) {
    try {
      return /^test-api(\.|$)/.test(new URL(baseUri).hostname);
    } catch {
      return false;
    }
  }

  // The HMRC base URI the page's calls go to.
  function effectiveHmrcBaseUri(env, hmrcAccount) {
    return hmrcAccount === "synthetic" ? env.HMRC_SANDBOX_BASE_URI : env.HMRC_BASE_URI;
  }

  async function showHmrcStatusForService(sentence, ...trailing) {
    const hmrcAccount = sessionStorage.getItem("hmrcAccount");
    let env;
    try {
      env = (await window.envReady) || {};
    } catch {
      env = {};
    }
    if (hmrcAccount === "synthetic" || isHmrcTestApi(effectiveHmrcBaseUri(env, hmrcAccount))) {
      showHmrcSandboxStatus(sentence, ...trailing);
    }
  }

  window.showHmrcSandboxStatus = showHmrcSandboxStatus;
  window.showHmrcStatusForService = showHmrcStatusForService;
})();
