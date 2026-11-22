// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-sandbox-status.js
// Each VAT and Income Tax page ships with a hidden production status line. showHmrcStatusForService swaps it for the
// sandbox line when the page's HMRC calls go to HMRC's test service: always for a synthetic account,
// which uses HMRC_SANDBOX_BASE_URI, and for any account where HMRC_BASE_URI is the test API.

(function () {
  "use strict";

  const siteText = (id, english) => (window.siteText ? window.siteText(id, english) : english);

  function showHmrcSandboxStatus(sentence, ...trailing) {
    const banner = document.querySelector("p.hint[data-feature-status]");
    if (!banner) return;
    banner.setAttribute("data-feature-status", "sandbox");
    banner.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = siteText("vat-submit.status-sandbox", "Status: sandbox.");
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

  // The synthetic indicator and the test data link are on show for a synthetic account only.
  function showSyntheticMarks(synthetic) {
    for (const id of ["syntheticIndicator", "testDataLink"]) {
      document.getElementById(id)?.classList.toggle("visible", synthetic);
    }
  }

  // The page's sentence for the sandbox line and the production line as the page shipped it, kept so
  // a later decision of the HMRC account can draw the line again.
  let drawn = null;

  function shippedProductionStatus(banner) {
    return { production: [...banner.childNodes].map((node) => node.cloneNode(true)), trailing: [] };
  }

  // While the bundle read that chooses the HMRC account fails, the line says that the account is not
  // decided and that nothing is sent.
  function showHmrcAccountUndecided() {
    const banner = document.querySelector("p.hint[data-feature-status]");
    if (!banner) return;
    if (!drawn) drawn = shippedProductionStatus(banner);
    banner.setAttribute("data-feature-status", "undecided");
    banner.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = siteText("vat.status-undecided", "Status: checking your account.");
    const sentence = siteText(
      "vat.status-undecided-text",
      "This page could not read whether your account uses HMRC's test service. Nothing is sent to HMRC until it has.",
    );
    banner.append(strong, ` ${sentence}`);
    showSyntheticMarks(false);
    banner.hidden = false;
  }

  // The status line ships hidden and shows once the bundle read has chosen the HMRC account, so a
  // synthetic account never sees the production line first.
  async function showHmrcStatusForService(sentence, ...trailing) {
    const shipped = document.querySelector("p.hint[data-feature-status]");
    if (shipped && !drawn) drawn = shippedProductionStatus(shipped);
    if (drawn) Object.assign(drawn, { sentence, trailing });
    const hmrcAccount = await window.readHmrcAccount();
    let env;
    try {
      env = (await window.envReady) || {};
    } catch {
      env = {};
    }
    showSyntheticMarks(hmrcAccount === "synthetic");
    const banner = document.querySelector("p.hint[data-feature-status]");
    if (!banner) return;
    if (hmrcAccount === "synthetic" || isHmrcTestApi(effectiveHmrcBaseUri(env, hmrcAccount))) {
      showHmrcSandboxStatus(sentence, ...trailing);
    } else if (drawn && banner.getAttribute("data-feature-status") !== "production") {
      banner.setAttribute("data-feature-status", "production");
      banner.replaceChildren(...drawn.production.map((node) => node.cloneNode(true)));
    }
    banner.hidden = false;
  }

  // A second decision of the HMRC account (the bundles changed, or the person signed in again in
  // another tab) draws the line again for the account now decided. The line on show stays until
  // then, so a decision still under way never shows the line of another account.
  window.addEventListener("hmrc-account-decided", () => {
    if (drawn?.sentence) showHmrcStatusForService(drawn.sentence, ...drawn.trailing);
  });

  // The synthetic indicator and the test data link show for a synthetic account, once the bundle read
  // has chosen it, and follow a later decision of the account.
  let followsDecisions = false;
  async function showSyntheticIndicatorForAccount() {
    if (!followsDecisions) {
      followsDecisions = true;
      window.addEventListener("hmrc-account-decided", showSyntheticIndicatorForAccount);
    }
    const synthetic = (await window.readHmrcAccount()) === "synthetic";
    document.getElementById("syntheticIndicator")?.classList.toggle("visible", synthetic);
    document.getElementById("testDataLink")?.classList.toggle("visible", synthetic);
  }

  // developer-mode.js decides the HMRC account. Without it nothing decides, so the account stays
  // undecided: the line says so, and every request waits on a decision that never comes.
  if (typeof window.readHmrcAccount !== "function") {
    window.readHmrcAccount = () => new Promise(() => {});
    window.hmrcAccountUndecided = true;
  }

  window.addEventListener("hmrc-account-undecided", showHmrcAccountUndecided);
  if (window.hmrcAccountUndecided) showHmrcAccountUndecided();

  window.showHmrcSandboxStatus = showHmrcSandboxStatus;
  window.showSyntheticIndicatorForAccount = showSyntheticIndicatorForAccount;
  window.showHmrcStatusForService = showHmrcStatusForService;
})();
