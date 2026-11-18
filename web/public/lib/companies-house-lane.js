// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-lane.js
// Sets the status banner of a Companies House filing page from the filing service the deployment
// uses: the live register when COMPANIES_HOUSE_FILING_BASE_URI is a non-sandbox address, the
// Companies House test service otherwise.

(function () {
  "use strict";

  // page-chrome.js gives the text in the chosen language; without it the English stands.
  function siteText(id, english) {
    return window.siteText ? window.siteText(id, english) : english;
  }

  // A function, so the banner is read in the chrome's language when it is set.
  const banners = () => ({
    production: {
      status: siteText("ch.lane.status-production", "Status: production."),
      text: siteText("ch.lane.production", "A change you file here reaches the live Companies House register."),
    },
    sandbox: {
      status: siteText("ch.lane.status-sandbox", "Status: sandbox."),
      text: siteText(
        "ch.lane.sandbox",
        "This runs against Companies House's test service. Nothing you file here reaches the live register.",
      ),
    },
  });

  function laneFromEnv(env) {
    const base = String(env.COMPANIES_HOUSE_FILING_BASE_URI || "");
    return base && !base.includes("sandbox") ? "production" : "sandbox";
  }

  async function applyCompaniesHouseLaneBanner() {
    const banner = document.querySelector("p.hint[data-feature-status]");
    if (!banner) return;
    const env = await window.envReady;
    const lane = laneFromEnv(env);
    banner.setAttribute("data-feature-status", lane);
    banner.replaceChildren();
    const strong = document.createElement("strong");
    const { status, text } = banners()[lane];
    strong.textContent = status;
    banner.append(strong, ` ${text}`);
  }

  window.applyCompaniesHouseLaneBanner = applyCompaniesHouseLaneBanner;
  document.addEventListener("DOMContentLoaded", () => {
    applyCompaniesHouseLaneBanner().catch((error) => console.error("Failed to set the Companies House lane banner:", error));
  });
})();
