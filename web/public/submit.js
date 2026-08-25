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

// Services layer
import { checkAuthStatus, checkTokenExpiry, ensureSession } from "./lib/services/auth-service.js";
import { authorizedFetch, fetchWithIdToken, handle403Error, executeAsyncRequestPolling } from "./lib/services/api-client.js";
import { submitVat, getGovClientHeaders, getClientIP, getIPViaWebRTC } from "./lib/services/hmrc-service.js";
import { bundlesForActivity, activitiesForBundle, isActivityAvailable, fetchCatalogText } from "./lib/services/catalog-service.js";

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

// RUM consent + init
function hasRumConsent() {
  try {
    return localStorage.getItem("consent.rum") === "granted" || localStorage.getItem("consent.analytics") === "granted";
  } catch (error) {
    console.warn("Failed to read RUM consent from localStorage:", error);
    return false;
  }
}

function showConsentBannerIfNeeded() {
  if (hasRumConsent()) return;
  if (document.getElementById("consent-banner")) return;
  const banner = document.createElement("div");
  banner.id = "consent-banner";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Cookie consent");
  banner.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;background:#ddd;color:#111;padding:12px 16px;z-index:9999;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center;font-size:14px";
  banner.innerHTML = `
    <span>We use minimal analytics to improve performance (CloudWatch RUM). We'll only start after you consent. See our <a href="/privacy.html" style="color:#316497">privacy policy</a>.</span>
    <div style="display:flex;gap:8px">
      <button id="consent-accept" class="btn" style="padding:6px 10px">Accept</button>
      <button id="consent-decline" class="btn" style="padding:6px 10px;background:#555;border-color:#555">Decline</button>
    </div>`;
  document.body.appendChild(banner);
  document.getElementById("consent-accept").onclick = () => {
    try {
      localStorage.setItem("consent.rum", "granted");
    } catch (error) {
      console.warn("Failed to store RUM consent in localStorage:", error);
    }
    document.body.removeChild(banner);
    document.dispatchEvent(new CustomEvent("consent-granted", { detail: { type: "rum" } }));
    maybeInitRum();
  };
  document.getElementById("consent-decline").onclick = () => {
    try {
      localStorage.setItem("consent.rum", "declined");
    } catch (error) {
      console.warn("Failed to store RUM consent in localStorage:", error);
    }
    document.body.removeChild(banner);
  };
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
  if (!window.__RUM_CONFIG__) return;
  if (!hasRumConsent()) {
    showConsentBannerIfNeeded();
    return;
  }
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

function ensurePrivacyLink() {
  const anchors = Array.from(document.querySelectorAll('footer a[href$="privacy.html"]'));
  if (anchors.length) return;
  const footer = document.querySelector("footer .footer-left") || document.querySelector("footer");
  if (!footer) return;
  const link = document.createElement("a");
  link.href = "/privacy.html";
  link.textContent = "privacy";
  link.style.marginLeft = "8px";
  footer.appendChild(link);
}

// Wire up on load
if (typeof window !== "undefined" && typeof document !== "undefined") {
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
  // RUM
  hasRumConsent,
  maybeInitRum,
};
