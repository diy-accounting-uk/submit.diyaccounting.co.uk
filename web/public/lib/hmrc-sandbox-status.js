// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-sandbox-status.js
// Each VAT page ships with a hidden production status line. showHmrcStatusForService swaps it for the
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

  // The page's sentence for the sandbox line and the production line as the page shipped it, kept so
  // a later decision of the HMRC account can draw the line again.
  let drawn = null;

  // The status line ships hidden and shows once the bundle read has chosen the HMRC account, so a
  // synthetic account never sees the production line first.
  async function showHmrcStatusForService(sentence, ...trailing) {
    const shipped = document.querySelector("p.hint[data-feature-status]");
    if (shipped && !drawn) drawn = { production: [...shipped.childNodes].map((node) => node.cloneNode(true)) };
    if (drawn) Object.assign(drawn, { sentence, trailing });
    const hmrcAccount = await window.readHmrcAccount();
    let env;
    try {
      env = (await window.envReady) || {};
    } catch {
      env = {};
    }
    if (hmrcAccount === "synthetic" || isHmrcTestApi(effectiveHmrcBaseUri(env, hmrcAccount))) {
      showHmrcSandboxStatus(sentence, ...trailing);
    }
    const banner = document.querySelector("p.hint[data-feature-status]");
    if (banner) banner.hidden = false;
  }

  // A second decision of the HMRC account (the bundles changed, or the person signed in again in
  // another tab) draws the line again for the account now decided.
  window.addEventListener("hmrc-account-decided", () => {
    const banner = document.querySelector("p.hint[data-feature-status]");
    if (!drawn || !banner) return;
    banner.setAttribute("data-feature-status", "production");
    banner.replaceChildren(...drawn.production.map((node) => node.cloneNode(true)));
    showHmrcStatusForService(drawn.sentence, ...drawn.trailing);
  });

  window.showHmrcSandboxStatus = showHmrcSandboxStatus;
  window.showHmrcStatusForService = showHmrcStatusForService;
})();
