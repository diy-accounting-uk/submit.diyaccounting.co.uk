// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-24 Load GA4 analytics on site pages
// - **Use when:** a site page must load gtag.js with the correct measurement id, consent state and cross-domain linking.
// - **Does:** web/public/lib/analytics.js loads gtag.js with the environment's measurement id read from /submit.env. It defaults consent to denied and reapplies a returning visitor's saved localStorage consent. It links the three diyaccounting.co.uk hosts as one cross-domain session and sets a visitor_kind property.
// - **Run:** no command; see Does and Entry
// - **Entry:** `web/public/lib/analytics.js:startGa4`
// - **Files:** web/public/lib/analytics.js, web/unit-tests/analytics.test.js
// - **Keywords:** gtag.js, ga4 measurement id, consent denied default, cross-domain session, visitor_kind property, submit.env
// - **Related:** DATA-23, SS-31
// @end-capability

// @capability SITE-15 Show and persist cookie consent
// - **Use when:** GA4 analytics consent must be gated behind a visible cookie-consent banner.
// - **Does:** A consent banner with id consent-banner shows on first visit and gates GA4's analytics_storage consent, denied by default. The visitor's accept or decline choice persists across page loads. lib/analytics.js implements the consent calls; the browser test in this capability drives the real static site end to end against it.
// - **Run:** `npm run test:browser`
// - **Entry:** `web/public/lib/analytics.js`
// - **Files:** web/browser-tests/cookieConsent.browser.test.js
// - **Keywords:** cookie consent, consent banner, ga4, analytics_storage, consent mode, privacy banner
// - **Related:** SITE-10, SS-31
// @end-capability

// Google Analytics 4 and Microsoft Advertising UET — Submit (submit.diyaccounting.co.uk)
// The measurement id is per environment, not hardcoded: it comes from /submit.env's
// GA4_MEASUREMENT_ID key, generated at deploy time (see web/public/submit.env). The UET tag id
// comes from the UET_TAG_ID key the same way; a blank id keeps UET off. This script loads in
// <head>, before lib/env-loader.js runs, so it reads /submit.env itself rather than waiting on
// window.envReady.
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
  mirrorGtagEventToUet(arguments);
}
gtag("consent", "default", {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
});

function hasStoredAnalyticsConsent() {
  try {
    return localStorage.getItem("consent.analytics") === "granted";
  } catch (error) {
    console.warn("Failed to read analytics consent from localStorage:", error);
    return false;
  }
}

// The three hosts sharing GA4 property 523400333 (infra/google/ga4/analytics.toml), so a visit that
// starts on one and continues on another stays one session instead of two. Kept in step with
// that file by web/unit-tests/analytics.test.js.
const GA4_LINKER_DOMAINS = ["diyaccounting.co.uk", "spreadsheets.diyaccounting.co.uk", "submit.diyaccounting.co.uk"];

// This is a plain script, loaded before any module, so it keeps its own copy of the rule in
// web/public/lib/utils/visitor-kind.js rather than importing it; web/unit-tests/analytics.test.js
// checks the two stay in step.
const GA4_BOT_USER_AGENT_PATTERNS = [
  "googlebot",
  "bingbot",
  "applebot",
  "slurp",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "claudedesktop",
  "chatgpt-user",
  "perplexity-user",
  "google-extended",
  "diyaccounting-probe-monitor",
];

// Classifies this session for the visitor panels: "bot" for crawlers, AI agents and the
// canaries; "synthetic" for the behaviour-test suites, which mark themselves by setting
// requestIdPrefix in sessionStorage; "operator" for a browser that has fetched the operator
// bundle (widgets/entitlement-status.js sets the flag), so the operator's pages after that
// fetch classify as operator, signed in or not; "authenticated" for a browser holding the
// sign-in token that is not an operator's; "human" otherwise. The first page after sign-in
// has already sent its kind by the time the token or the flag is set.
const GA4_OPERATOR_LOCAL_STORAGE_KEY = "visitorKind.operator";
const GA4_SIGN_IN_LOCAL_STORAGE_KEY = "cognitoIdToken";

function classifyVisitorKindForGa4() {
  let userAgent = "";
  try {
    userAgent = (navigator.userAgent || "").toLowerCase();
  } catch {
    userAgent = "";
  }
  if (GA4_BOT_USER_AGENT_PATTERNS.some((pattern) => userAgent.includes(pattern))) {
    return "bot";
  }
  try {
    if (sessionStorage.getItem("requestIdPrefix") === "test_") {
      return "synthetic";
    }
  } catch {
    // sessionStorage unavailable: fall through to operator and human
  }
  try {
    if (localStorage.getItem(GA4_OPERATOR_LOCAL_STORAGE_KEY) === "1") {
      return "operator";
    }
    if (localStorage.getItem(GA4_SIGN_IN_LOCAL_STORAGE_KEY)) {
      return "authenticated";
    }
  } catch {
    // localStorage unavailable: fall through to human
  }
  return "human";
}

gtag("set", "user_properties", { visitor_kind: classifyVisitorKindForGa4() });

// Landing-source capture. Nothing is stored until the visitor accepts the banner, because the
// click id and campaign tags are advertising measurement. The tags read from the URL at page
// load are held in memory so an Accept on a later step of the same page view still records them.
// session-beacon.js reads the stored key to carry the source to the server, since both load as
// plain scripts with no shared module to import a constant from.
const ATTRIBUTION_STORAGE_KEY = "attribution.landing";
const ATTRIBUTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_URL_PARAMS = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
  ["gclid", "gclid"],
  ["msclkid", "msclkid"],
  ["ref", "ref"],
];

function readLandingParamsFromUrl() {
  const landing = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const [param, key] of ATTRIBUTION_URL_PARAMS) {
      const value = params.get(param);
      if (value) landing[key] = value;
    }
  } catch {
    // no readable URL: no params
  }
  return landing;
}

const landingParamsThisPageView = readLandingParamsFromUrl();

// The stored landing is read back only to decide whether it still applies, so an expired
// or unparsable record is treated as absent rather than surfaced to the caller.
function readStoredLandingAttribution() {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const landedAtMs = Date.parse(stored?.landedAt);
    if (Number.isNaN(landedAtMs) || Date.now() - landedAtMs > ATTRIBUTION_WINDOW_MS) return null;
    return stored;
  } catch {
    return null;
  }
}

// First touch wins: a bare visit (no tagged params) never overwrites a still-valid stored
// landing. A tagged landing always writes, so it both starts the first record and replaces
// an existing one within the 90-day window. Runs only after consent is granted.
function captureLandingAttribution() {
  const urlParams = readLandingParamsFromUrl();
  const landing = Object.keys(urlParams).length > 0 ? urlParams : { ...landingParamsThisPageView };

  const isTaggedLanding = Object.keys(landing).length > 0;
  if (!isTaggedLanding && readStoredLandingAttribution()) return;

  landing.landedAt = new Date().toISOString();
  try {
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(landing));
  } catch (error) {
    console.warn("Failed to store landing attribution:", error);
  }
}

function deleteLandingAttribution() {
  try {
    localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to delete landing attribution:", error);
  }
}

// Reads one KEY=value line out of the plain-text /submit.env body. Blank when the key is
// missing or its value is empty, which happens on any environment without its own GA4 property.
function readSubmitEnvValue(envText, key) {
  const prefix = `${key}=`;
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return "";
}

function startGa4(measurementId) {
  gtag("js", new Date());
  gtag("config", measurementId, { linker: { domains: GA4_LINKER_DOMAINS } });

  // Dynamically load gtag.js (CSP: no inline scripts allowed)
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

// The GA4 events that infra/microsoft/ads/ads.toml declares as UET event goals. Each is sent to
// UET under the same name when a GA4 event of that name fires and UET has started.
const UET_GOAL_EVENTS = ["purchase", "submit_vat_return", "runner_download", "donate"];
const UET_SCRIPT_URL = "https://bat.bing.com/bat.js";

function mirrorGtagEventToUet(args) {
  if (args[0] !== "event" || !UET_GOAL_EVENTS.includes(args[1]) || !window.uetq) return;
  const params = args[2] || {};
  const uetParams = {};
  if (typeof params.value === "number" && params.value > 0) {
    uetParams.revenue_value = params.value;
    uetParams.currency = params.currency || "GBP";
  }
  window.uetq.push("event", args[1], uetParams);
}

// Microsoft Advertising UET, loaded only after the visitor accepts. The consent default is
// denied and the accept moves ad_storage to granted before the first page view is sent, so UET
// sets no cookie before the choice. The queue UET reads on load is window.uetq.
function startUet(tagId) {
  window.uetq = window.uetq || [];
  window.uetq.push("consent", "default", { ad_storage: "denied" });
  window.uetq.push("consent", "update", { ad_storage: "granted" });
  const script = document.createElement("script");
  script.async = true;
  script.src = UET_SCRIPT_URL;
  script.onload = () => {
    window.uetq = new window.UET({ ti: tagId, enableAutoSpaTracking: true, q: window.uetq });
    window.uetq.push("pageLoad");
  };
  document.head.appendChild(script);
}

let ga4Started = false;

// Basic consent mode: gtag.js is requested only after the visitor accepts, so Google receives
// nothing before then.
function startAnalyticsAfterConsent() {
  gtag("consent", "update", { analytics_storage: "granted" });
  captureLandingAttribution();
  if (ga4Started) return;
  ga4Started = true;
  fetch("/submit.env", { cache: "no-store" })
    .then((response) => (response.ok ? response.text() : ""))
    .then((envText) => {
      const measurementId = readSubmitEnvValue(envText, "GA4_MEASUREMENT_ID");
      if (measurementId) {
        startGa4(measurementId);
      }
      const uetTagId = readSubmitEnvValue(envText, "UET_TAG_ID");
      if (uetTagId) {
        startUet(uetTagId);
      }
      return null;
    })
    .catch((error) => console.warn("Failed to read GA4_MEASUREMENT_ID or UET_TAG_ID from /submit.env:", error));
}

document.addEventListener("consent-granted", startAnalyticsAfterConsent);
document.addEventListener("consent-declined", deleteLandingAttribution);

// A returning visitor who already accepted the cookie banner shouldn't have
// to accept it again on every page, so their saved choice applies straight away.
if (hasStoredAnalyticsConsent()) {
  startAnalyticsAfterConsent();
}
