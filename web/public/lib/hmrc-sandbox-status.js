// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-sandbox-status.js
// A synthetic account reaches HMRC's test service, so each VAT page calls showHmrcSandboxStatus for
// one: its status line says sandbox in place of the production line the page ships with.

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

  window.showHmrcSandboxStatus = showHmrcSandboxStatus;
})();
