// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Google Analytics 4 — Submit (submit.diyaccounting.co.uk)
// The measurement id is per environment, not hardcoded: it comes from /submit.env's
// GA4_MEASUREMENT_ID key, generated at deploy time (see web/public/submit.env). This script
// loads in <head>, before lib/env-loader.js runs, so it reads /submit.env itself rather than
// waiting on window.envReady.
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag("consent", "default", { analytics_storage: "denied" });
// A returning visitor who already accepted the cookie banner shouldn't have
// to accept it again on every page — apply their saved choice straight away.
try {
  if (localStorage.getItem("consent.analytics") === "granted") {
    gtag("consent", "update", { analytics_storage: "granted" });
  }
} catch (error) {
  console.warn("Failed to read analytics consent from localStorage:", error);
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
// fetch classify as operator, signed in or not; "human" otherwise. The first page after
// sign-in has already sent its kind by the time the flag is set.
const GA4_OPERATOR_LOCAL_STORAGE_KEY = "visitorKind.operator";

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
  } catch {
    // localStorage unavailable: fall through to human
  }
  return "human";
}

gtag("set", "user_properties", { visitor_kind: classifyVisitorKindForGa4() });

// Landing-source capture (M1). Independent of the GA4 consent above: this is first-party
// analytics under the site's own consent model, the same basis session-beacon.js already
// fires on. session-beacon.js reads this same key to carry the source to the server, since
// both load as plain scripts with no shared module to import a constant from.
const ATTRIBUTION_STORAGE_KEY = "attribution.landing";
const ATTRIBUTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_URL_PARAMS = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
  ["gclid", "gclid"],
  ["ref", "ref"],
];

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
// an existing one within the 90-day window.
function captureLandingAttribution() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }

  const landing = {};
  for (const [param, key] of ATTRIBUTION_URL_PARAMS) {
    const value = params.get(param);
    if (value) landing[key] = value;
  }

  const isTaggedLanding = Object.keys(landing).length > 0;
  if (!isTaggedLanding && readStoredLandingAttribution()) return;

  landing.landedAt = new Date().toISOString();
  try {
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(landing));
  } catch (error) {
    console.warn("Failed to store landing attribution:", error);
  }
}

captureLandingAttribution();

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

fetch("/submit.env", { cache: "no-store" })
  .then((response) => (response.ok ? response.text() : ""))
  .then((envText) => {
    const measurementId = readSubmitEnvValue(envText, "GA4_MEASUREMENT_ID");
    if (measurementId) {
      startGa4(measurementId);
    }
    return null;
  })
  .catch((error) => console.warn("Failed to read GA4_MEASUREMENT_ID from /submit.env:", error));
