// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Main entry point for submit application
// Imports all modules and exposes them on window for backward compatibility

// Utils layer
import { base64UrlDecode, parseJwtClaims, getJwtExpiryMs } from "./lib/utils/jwt-utils.js";
import { generateRandomState, randomHex, sha256Hex } from "./lib/utils/crypto-utils.js";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
  getSessionStorageItem,
  setSessionStorageItem,
  removeSessionStorageItem,
  getLocalStorageJson,
  setLocalStorageJson,
} from "./lib/utils/storage-utils.js";
import { showStatus, hideStatus, removeStatusMessage, onDomReady, readMeta } from "./lib/utils/dom-utils.js";
import {
  getTraceparent,
  getLastXRequestId,
  fetchWithId,
  generateTraceparent,
  getOrCreateTraceparent,
  generateRequestId,
  prepareRedirect,
} from "./lib/utils/correlation-utils.js";
import { classifyVisitorKind } from "./lib/utils/visitor-kind.js";

// Services layer
import { checkAuthStatus, checkTokenExpiry, ensureSession } from "./lib/services/auth-service.js";
import { authorizedFetch, fetchWithIdToken, handle403Error, executeAsyncRequestPolling } from "./lib/services/api-client.js";
import { submitVat, getGovClientHeaders, getClientIP, getIPViaWebRTC } from "./lib/services/hmrc-service.js";
import { bundlesForActivity, activitiesForBundle, isActivityAvailable, fetchCatalogText } from "./lib/services/catalog-service.js";
import {
  searchCompanies,
  getCompanyProfile,
  getOfficers,
  getPscs,
  normaliseCompanyNumber,
} from "./lib/services/companies-house-service.js";
// Not aliased on import: scripts/bundle-for-tests.js strips import statements with a plain
// regex rather than a real module resolver, so an "as" rename here would vanish along with the
// import line while the window assignments below (which need the DIY Accounting Submit name)
// still referenced it. Import under the original names and rename only on the window assignment.
import {
  companiesHouseScope,
  hasUsableToken,
  clearToken,
  getRegisteredOfficeAddress,
  getRegisteredEmailEligibility,
  openTransaction,
  putRegisteredOfficeAddress,
  putRegisteredEmailAddress,
  closeTransaction,
  getTransaction,
  previewMicroEntityAccounts,
  submitMicroEntityAccounts,
  pollMicroEntityAccounts,
} from "./lib/services/companies-house-filing-service.js";
import {
  getConfirmationStatementFilingData,
  previewConfirmationStatement,
  submitConfirmationStatement,
  pollConfirmationStatement,
} from "./lib/services/companies-house-confirmation-service.js";
import { submitPscVerificationStatement, pollPscVerificationStatement } from "./lib/services/companies-house-psc-verification-service.js";
import { describeGovTalkError, describeGovTalkErrors } from "./lib/services/companies-house-error-messages.js";

// Debug widgets initial setup
// Visibility is controlled by developer-mode.js toggle, but we set up hrefs here
(function debugWidgetsSetup() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function setDisplay(el, value) {
    if (el) el.style.display = value;
  }

  function setupWidgets() {
    try {
      // Check if developer mode is enabled from sessionStorage
      const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";

      const entitlement = document.querySelector(".entitlement-status");
      const viewSrc = document.getElementById("viewSourceLink");
      const tests = document.getElementById("latestTestsLink");
      const apiDocs = document.getElementById("apiDocsLink");

      // Set up hrefs for links
      if (viewSrc && !viewSrc.getAttribute("data-href-initialized")) {
        viewSrc.href = viewSrc.href || "#";
        viewSrc.setAttribute("data-href-initialized", "true");
      }
      if (tests) tests.href = "/tests/index.html";
      if (apiDocs) apiDocs.href = "/docs/api/index.html";

      // Apply initial visibility based on developer mode state
      setDisplay(entitlement, developerModeEnabled ? "inline" : "none");
      setDisplay(viewSrc, developerModeEnabled ? "inline" : "none");
      setDisplay(tests, developerModeEnabled ? "inline" : "none");
      setDisplay(apiDocs, developerModeEnabled ? "inline" : "none");
    } catch (e) {
      console.warn("Failed to setup debug widgets:", e);
    }
  }

  onDomReady(setupWidgets);
})();

// Cookie consent (RUM performance monitoring + GA4 analytics) + RUM init
function hasRumConsent() {
  try {
    return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
  } catch (error) {
    console.warn("Failed to read RUM consent from localStorage:", error);
    return false;
  }
}

function hasConsentChoice() {
  try {
    return localStorage.getItem("consent.rum") !== null || localStorage.getItem("consent.analytics") !== null;
  } catch (error) {
    console.warn("Failed to read consent choice from localStorage:", error);
    return false;
  }
}

function isPaidVisit() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("gclid")) return true;
    return Array.from(params.keys()).some((name) => name.startsWith("utm_"));
  } catch (error) {
    console.warn("Failed to read the URL for a paid visit:", error);
    return false;
  }
}

// Counts each answer with no identifier: no cookie, no storage, no page, no attribution fields.
function postConsentAnswer(answer, surface) {
  try {
    fetch("/api/v1/session/beacon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentAnswer: answer, consentSurface: surface }),
      keepalive: true,
    }).catch(() => {
      // Best-effort: ad blockers and offline never block the answer itself.
    });
  } catch {
    // Best-effort, as above.
  }
}

function storeConsentAnswer(value) {
  try {
    localStorage.setItem("consent.rum", value);
    localStorage.setItem("consent.analytics", value);
  } catch (error) {
    console.warn("Failed to store consent in localStorage:", error);
  }
}

function removeConsentSurfaces() {
  for (const id of ["consent-banner", "consent-dialog"]) {
    const element = document.getElementById(id);
    if (element) element.parentNode.removeChild(element);
  }
}

function answerConsent(value, surface) {
  storeConsentAnswer(value);
  removeConsentSurfaces();
  postConsentAnswer(value === "granted" ? "accepted" : "rejected", surface);
  if (value === "granted") {
    document.dispatchEvent(new CustomEvent("consent-granted", { detail: { type: "rum" } }));
    maybeInitRum();
  } else {
    document.dispatchEvent(new CustomEvent("consent-declined"));
  }
}

function buildConsentBanner() {
  const banner = document.createElement("div");
  banner.id = "consent-banner";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Cookie consent");
  banner.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;background:#ddd;color:#111;padding:12px 16px;z-index:9999;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center;font-size:14px";
  banner.innerHTML = `
    <span>We use cookies to monitor performance and understand how people use this site. We'll only turn them on if you say yes. See our <a href="/privacy.html" style="color:#316497">privacy policy</a>.</span>
    <div style="display:flex;gap:8px">
      <button id="consent-accept" class="btn" style="padding:6px 10px;min-height:44px">Accept</button>
      <button id="consent-decline" class="btn" style="padding:6px 10px;min-height:44px;background:#555;border-color:#555">Decline</button>
    </div>`;
  return banner;
}

function buildConsentDialog() {
  const dialog = document.createElement("div");
  dialog.id = "consent-dialog";
  dialog.className = "consent-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "consent-dialog-title");
  dialog.innerHTML = `
    <div class="consent-dialog-panel">
      <h2 id="consent-dialog-title">Your cookie choice</h2>
      <p>You arrived from an advert. If you accept, we store which advert brought you here and use Google Ads and Google Analytics to measure whether it led to a purchase. If you reject, we store nothing and the site works the same. See our <a href="/privacy.html">privacy policy</a>.</p>
      <div class="consent-dialog-actions">
        <button id="consent-accept" class="btn consent-dialog-button">Accept</button>
        <button id="consent-decline" class="btn consent-dialog-button">Reject</button>
      </div>
    </div>`;
  return dialog;
}

function showConsentBannerIfNeeded({ reopen = false } = {}) {
  if (!reopen && hasConsentChoice()) return;
  if (document.getElementById("consent-banner") || document.getElementById("consent-dialog")) return;
  const asDialog = reopen || isPaidVisit();
  const surface = asDialog ? "dialog" : "banner";
  const element = asDialog ? buildConsentDialog() : buildConsentBanner();
  document.body.appendChild(element);
  document.getElementById("consent-accept").onclick = () => answerConsent("granted", surface);
  document.getElementById("consent-decline").onclick = () => answerConsent("declined", surface);
  if (asDialog) document.getElementById("consent-accept").focus();
}

function reopenConsentChoice(event) {
  const link = event.target.closest?.("[data-cookie-choices]");
  if (!link) return;
  event.preventDefault();
  showConsentBannerIfNeeded({ reopen: true });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function rumReady() {
  document.dispatchEvent(new CustomEvent("rum-ready"));
}

async function maybeInitRum() {
  if (!hasConsentChoice()) showConsentBannerIfNeeded();
  if (!window.__RUM_CONFIG__) return;
  if (!hasRumConsent()) return;
  if (window.__RUM_INIT_DONE__) return;
  const c = window.__RUM_CONFIG__;
  if (!c.appMonitorId || !c.region || !c.identityPoolId || !c.guestRoleArn) return;

  try {
    /* eslint-disable sonarjs/no-parameter-reassignment */
    (function (n, i, v, r, s, config, u, x, z) {
      x = window.AwsRumClient = { q: [], n: n, i: i, v: v, r: r, c: config, u: u };
      window[n] = function (c, p) {
        x.q.push({ c: c, p: p });
      };
      z = document.createElement("script");
      z.async = true;
      z.src = s;
      z.onload = function () {
        window.__RUM_INIT_DONE__ = true;
        rumReady();
      };
      z.onerror = function (e) {
        console.warn("Failed to load RUM client:", e);
      };
      document.head.appendChild(z);
    })("cwr", c.appMonitorId, "0.1.0", c.region, "https://client.rum.us-east-1.amazonaws.com/1.25.0/cwr.js", {
      sessionSampleRate: c.sessionSampleRate ?? 1,
      guestRoleArn: c.guestRoleArn,
      identityPoolId: c.identityPoolId,
      endpoint: `https://dataplane.rum.${c.region}.amazonaws.com`,
      telemetries: ["performance", "errors", "http"],
      allowCookies: true,
      enableXRay: true,
    });
    /* eslint-enable sonarjs/no-parameter-reassignment */

    // Tags the session so the visitor panels can exclude synthetic traffic; queued on the
    // cwr stub above, so it applies once the real RUM client has loaded.
    window.cwr("addSessionAttributes", { visitor_kind: classifyVisitorKind() });
  } catch (e) {
    console.warn("Failed to init RUM:", e);
  }
}

function bootstrapRumConfigFromStorage() {
  if (window.__RUM_CONFIG__) return;
  try {
    const raw = localStorage.getItem("rum.config");
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (cfg && cfg.appMonitorId && cfg.region && cfg.identityPoolId && cfg.guestRoleArn) {
      window.__RUM_CONFIG__ = cfg;
    }
  } catch (error) {
    console.warn("Failed to read RUM config from localStorage:", error);
  }
}

function bootstrapRumConfigFromMeta() {
  if (window.__RUM_CONFIG__) return;
  const appMonitorId = readMeta("rum:appMonitorId");
  const region = readMeta("rum:region");
  const identityPoolId = readMeta("rum:identityPoolId");
  const guestRoleArn = readMeta("rum:guestRoleArn");
  if (appMonitorId && region && identityPoolId && guestRoleArn) {
    window.__RUM_CONFIG__ = { appMonitorId, region, identityPoolId, guestRoleArn, sessionSampleRate: 1 };
    try {
      localStorage.setItem("rum.config", JSON.stringify(window.__RUM_CONFIG__));
    } catch (error) {
      console.warn("Failed to store RUM config in localStorage:", error);
    }
  }
}

// Fires "activity-started" for the operator dashboard's started/completed table
// (activityStartedPost.js) when an activity's primary button is clicked. Listens at the
// document level (delegated, not per-button) so a page's own JS never needs to wire this up.
// Fire-and-forget, keepalive: this must never delay or block the button's own click handler --
// a previous change elsewhere in this app awaited a fetch before navigating and hung headless
// Chrome, so this neither awaits the fetch nor calls preventDefault.
function handleActivityStartClick(event) {
  const target = event.target && event.target.closest ? event.target.closest("[data-activity-start]") : null;
  if (!target) return;
  const activityId = target.getAttribute("data-activity-start");
  if (!activityId) return;

  let accessToken;
  try {
    accessToken = localStorage.getItem("cognitoAccessToken");
  } catch (error) {
    console.warn("Failed to read access token for activity-started beacon:", error);
    return;
  }
  if (!accessToken) return;

  fetch("/api/v1/activity/started", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
    body: JSON.stringify({ activityId }),
    keepalive: true,
  }).catch(() => {
    // Best-effort: an activity-started beacon failure (offline, ad blockers) never blocks the
    // button's own action.
  });
}

function ensurePrivacyLink() {
  const anchors = Array.from(document.querySelectorAll('body > footer a[href$="privacy.html"]'));
  if (anchors.length) return;
  const footer = document.querySelector("body > footer .footer-left") || document.querySelector("body > footer");
  if (!footer) return;
  const link = document.createElement("a");
  link.href = "/privacy.html";
  link.textContent = "privacy";
  link.style.marginLeft = "8px";
  footer.appendChild(link);
}

// Wire up on load
if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("click", handleActivityStartClick);
  document.addEventListener("click", reopenConsentChoice);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensurePrivacyLink();
      bootstrapRumConfigFromMeta();
      maybeInitRum();
      document.addEventListener("consent-granted", (event) => {
        if (event.detail.type === "rum") {
          maybeInitRum();
        }
      });
    });
  } else {
    ensurePrivacyLink();
    bootstrapRumConfigFromMeta();
    maybeInitRum();
    document.addEventListener("consent-granted", (event) => {
      if (event.detail.type === "rum") {
        maybeInitRum();
      }
    });
  }
}

// Invalidate request cache across tabs when Cognito token changes
try {
  window.addEventListener?.("storage", (e) => {
    if (e.key === "cognitoAccessToken") {
      try {
        window.requestCache?.invalidate?.("/api/");
      } catch (err) {
        console.warn("Failed to invalidate request cache on storage change:", err.message);
      }
    }
  });
} catch (err) {
  console.warn("Failed to initialize token expiry check:", err.message, err.stack);
}

// Re-export everything on window for backward compatibility
// (Most are already exported by the individual modules, but we ensure they're all available)
if (typeof window !== "undefined") {
  // JWT utils
  window.base64UrlDecode = base64UrlDecode;
  window.parseJwtClaims = parseJwtClaims;
  window.getJwtExpiryMs = getJwtExpiryMs;

  // Crypto utils
  window.generateRandomState = generateRandomState;
  window.randomHex = randomHex;
  window.sha256Hex = sha256Hex;

  // Storage utils
  window.getLocalStorageItem = getLocalStorageItem;
  window.setLocalStorageItem = setLocalStorageItem;
  window.removeLocalStorageItem = removeLocalStorageItem;
  window.getSessionStorageItem = getSessionStorageItem;
  window.setSessionStorageItem = setSessionStorageItem;
  window.removeSessionStorageItem = removeSessionStorageItem;
  window.getLocalStorageJson = getLocalStorageJson;
  window.setLocalStorageJson = setLocalStorageJson;

  // DOM utils
  window.showStatus = showStatus;
  window.hideStatus = hideStatus;
  window.removeStatusMessage = removeStatusMessage;
  window.onDomReady = onDomReady;
  window.readMeta = readMeta;

  // Correlation utils
  window.getTraceparent = getTraceparent;
  window.getLastXRequestId = getLastXRequestId;
  window.fetchWithId = fetchWithId;
  window.generateTraceparent = generateTraceparent;
  window.getOrCreateTraceparent = getOrCreateTraceparent;
  window.generateRequestId = generateRequestId;

  // Auth service
  window.checkAuthStatus = checkAuthStatus;
  window.checkTokenExpiry = checkTokenExpiry;
  window.ensureSession = ensureSession;

  // API client
  window.authorizedFetch = authorizedFetch;
  window.fetchWithIdToken = fetchWithIdToken;
  window.handle403Error = handle403Error;
  window.executeAsyncRequestPolling = executeAsyncRequestPolling;

  // HMRC service
  window.submitVat = submitVat;
  window.getGovClientHeaders = getGovClientHeaders;
  window.getClientIP = getClientIP;
  window.getIPViaWebRTC = getIPViaWebRTC;

  // Catalog service
  window.bundlesForActivity = bundlesForActivity;
  window.activitiesForBundle = activitiesForBundle;
  window.isActivityAvailable = isActivityAvailable;
  window.fetchCatalogText = fetchCatalogText;

  // Companies House service
  window.searchCompanies = searchCompanies;
  window.getCompanyProfile = getCompanyProfile;
  window.getOfficers = getOfficers;
  window.getPscs = getPscs;
  window.normaliseCompanyNumber = normaliseCompanyNumber;

  // Companies House filing service
  window.companiesHouseScope = companiesHouseScope;
  window.hasUsableCompaniesHouseToken = hasUsableToken;
  window.clearCompaniesHouseToken = clearToken;
  window.getRegisteredOfficeAddress = getRegisteredOfficeAddress;
  window.getRegisteredEmailEligibility = getRegisteredEmailEligibility;
  window.openCompaniesHouseTransaction = openTransaction;
  window.putRegisteredOfficeAddress = putRegisteredOfficeAddress;
  window.putRegisteredEmailAddress = putRegisteredEmailAddress;
  window.closeCompaniesHouseTransaction = closeTransaction;
  window.getCompaniesHouseTransaction = getTransaction;
  window.previewMicroEntityAccounts = previewMicroEntityAccounts;
  window.submitMicroEntityAccounts = submitMicroEntityAccounts;
  window.pollMicroEntityAccounts = pollMicroEntityAccounts;

  // Companies House confirmation statement service
  window.getConfirmationStatementFilingData = getConfirmationStatementFilingData;
  window.previewConfirmationStatement = previewConfirmationStatement;
  window.submitConfirmationStatement = submitConfirmationStatement;
  window.pollConfirmationStatement = pollConfirmationStatement;

  // Companies House PSC verification statement service
  window.submitPscVerificationStatement = submitPscVerificationStatement;
  window.pollPscVerificationStatement = pollPscVerificationStatement;

  // Companies House GovTalkErrors plain-word map
  window.describeGovTalkError = describeGovTalkError;
  window.describeGovTalkErrors = describeGovTalkErrors;

  // RUM functions
  window.hasRumConsent = hasRumConsent;
  window.maybeInitRum = maybeInitRum;
  window.loadScript = loadScript;
  window.bootstrapRumConfigFromStorage = bootstrapRumConfigFromStorage;
  window.bootstrapRumConfigFromMeta = bootstrapRumConfigFromMeta;

  // Correlation object
  window.__correlation = Object.assign(window.__correlation || {}, {
    prepareRedirect,
    getTraceparent,
    getLastXRequestId,
  });
}

// Migration: Clean up stale localStorage keys that should be in sessionStorage
// These keys were moved from localStorage to sessionStorage to prevent form data retention issues
// This migration runs once per page load and cleans up any stale data from previous sessions
(function migrateStorageKeys() {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    const keysToMigrate = ["submission_data", "currentActivity", "hmrcAccount", "pendingObligationsRequest", "pendingReturnRequest"];
    keysToMigrate.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        // Ignore storage errors
        console.warn(`Failed to remove stale localStorage key "${key}":`, error);
      }
    });
  } catch (error) {
    // Ignore errors in test environments
    console.warn("Failed to run storage migration:", error);
  }
})();

// Signal that submit.js module is ready
// This is needed because ES modules are deferred and inline scripts may run before the module loads
if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.__submitReady__ = true;
  document.dispatchEvent(new CustomEvent("submit-ready"));
}

// Export for ES module usage
export {
  // JWT utils
  base64UrlDecode,
  parseJwtClaims,
  getJwtExpiryMs,
  // Crypto utils
  generateRandomState,
  randomHex,
  sha256Hex,
  // DOM utils
  showStatus,
  hideStatus,
  removeStatusMessage,
  onDomReady,
  readMeta,
  // Correlation utils
  getTraceparent,
  getLastXRequestId,
  fetchWithId,
  // Auth service
  checkAuthStatus,
  checkTokenExpiry,
  ensureSession,
  // API client
  authorizedFetch,
  fetchWithIdToken,
  // HMRC service
  submitVat,
  getGovClientHeaders,
  getClientIP,
  getIPViaWebRTC,
  // Catalog service
  bundlesForActivity,
  activitiesForBundle,
  isActivityAvailable,
  fetchCatalogText,
  // Companies House service
  searchCompanies,
  getCompanyProfile,
  normaliseCompanyNumber,
  // Companies House filing service
  companiesHouseScope,
  hasUsableToken,
  clearToken,
  getRegisteredOfficeAddress,
  getRegisteredEmailEligibility,
  openTransaction,
  putRegisteredOfficeAddress,
  putRegisteredEmailAddress,
  closeTransaction,
  getTransaction,
  // RUM
  hasRumConsent,
  maybeInitRum,
};
