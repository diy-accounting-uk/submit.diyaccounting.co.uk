// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-lane.js
// Sets the status banner of a Companies House filing page from the service the deployment files
// through. A page that files through the filing API: the live register when
// COMPANIES_HOUSE_FILING_BASE_URI is a non-sandbox address, the Companies House test service
// otherwise. A page whose banner says data-companies-house-service="xml-gateway" files through the
// XML gateway: the test gateway when COMPANIES_HOUSE_GATEWAY_TEST is "true", the live register when
// it is "false"; on the live register the page keeps its own production banner.

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
    gatewaySandbox: {
      status: siteText("ch.lane.status-sandbox", "Status: sandbox."),
      text: siteText(
        "ch.lane.gateway-sandbox",
        "Companies House checks what you file here in test mode and records nothing. Nothing you file here reaches the live register.",
      ),
    },
  });

  function laneFromEnv(env) {
    const base = String(env.COMPANIES_HOUSE_FILING_BASE_URI || "");
    return base && !base.includes("sandbox") ? "production" : "sandbox";
  }

  // submit.env carries the flag the accounts and confirmation statement Lambdas run with; a value
  // other than "true" or "false" is a deployment that did not write it.
  function gatewayLaneFromEnv(env) {
    const flag = env.COMPANIES_HOUSE_GATEWAY_TEST;
    if (flag === "true") return "sandbox";
    if (flag === "false") return "production";
    throw new Error(`COMPANIES_HOUSE_GATEWAY_TEST in submit.env is "${flag}", not "true" or "false"`);
  }

  function setBanner(banner, lane, { status, text }) {
    banner.setAttribute("data-feature-status", lane);
    banner.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = status;
    banner.append(strong, ` ${text}`);
  }

  async function applyCompaniesHouseLaneBanner() {
    const banner = document.querySelector("p.hint[data-feature-status]");
    if (!banner) return;
    const env = await window.envReady;
    if (banner.getAttribute("data-companies-house-service") === "xml-gateway") {
      const lane = gatewayLaneFromEnv(env);
      if (lane === "sandbox") setBanner(banner, lane, banners().gatewaySandbox);
      return;
    }
    const lane = laneFromEnv(env);
    setBanner(banner, lane, banners()[lane]);
  }

  window.applyCompaniesHouseLaneBanner = applyCompaniesHouseLaneBanner;
  document.addEventListener("DOMContentLoaded", () => {
    applyCompaniesHouseLaneBanner().catch((error) => console.error("Failed to set the Companies House lane banner:", error));
  });
})();
