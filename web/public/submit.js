// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-18 Bootstrap the frontend module bundle
// - **Use when:** a new utils, services or widgets module needs wiring into the site's single entry point.
// - **Does:** submit.js is the site's single entry point. It imports every utils, services and widgets module and assigns them onto window for scripts that still call them as globals.
// - **Run:** no command; see Does and Entry
// - **Entry:** `web/public/submit.js`
// - **Files:** web/public/submit.js, web/unit-tests/submit.helpers.test.js
// - **Keywords:** entry point, module bundle, window globals, submit.js, bundling
// - **Related:** SITE-14, SITE-16
// @end-capability

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
import { showStatus, hideStatus, dismissStatus, removeStatusMessage, onDomReady, readMeta } from "./lib/utils/dom-utils.js";
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
import { startStatusBubble } from "./lib/utils/status-bubble.js";

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
  getFilingHistory,
  getFiledAccounts,
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
  renderMicroEntityAccounts,
  submitMicroEntityAccounts,
  pollMicroEntityAccounts,
} from "./lib/services/companies-house-filing-service.js";
import {
  getConfirmationStatementFilingData,
  renderConfirmationStatement,
  submitConfirmationStatement,
  pollConfirmationStatement,
} from "./lib/services/companies-house-confirmation-service.js";
import { submitPscVerificationStatement, pollPscVerificationStatement } from "./lib/services/companies-house-psc-verification-service.js";
import { submitCompaniesHouseForm, pollCompaniesHouseForm } from "./lib/services/companies-house-form-service.js";
import { previewCtReturn, submitCtReturn, pollCtReturn } from "./lib/services/hmrc-ct-return-service.js";
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
    if (params.has("gclid") || params.has("msclkid")) return true;
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
  document.documentElement.style.removeProperty("--consent-banner-height");
  document.removeEventListener("keydown", closeDialogOnEscape);
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

// page-chrome.js gives the text in the reader's language choice; without it the English stands.
function siteText(id, english) {
  return window.siteText ? window.siteText(id, english) : english;
}

// In Welsh the link goes to the Welsh copy of the privacy policy; without a copy it carries the "(yn Saesneg)" mark.
function fillConsentSharedText(element) {
  element.querySelector(".consent-shared-text").textContent = siteText(
    "consent.shared",
    "We use cookies to measure how this site performs and is used, only if you accept. See our",
  );
  const link = element.querySelector('a[href$="/privacy.html"]');
  link.textContent = siteText("consent.privacy-link", "privacy policy");
  const inWelsh = window.siteLanguage?.chrome() === "cy";
  const hasWelshCopy = (window.WELSH_COPIES || []).includes("privacy.html");
  link.setAttribute("href", inWelsh && hasWelshCopy ? "/cy/privacy.html" : "/privacy.html");
  element.querySelector(".consent-in-english").textContent =
    inWelsh && !hasWelshCopy ? ` ${siteText("chrome.in-english", "(in English)")}` : "";
}

function hasAdvertClickId() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has("gclid") || params.has("msclkid");
  } catch {
    return false;
  }
}

function storedConsentChoice() {
  try {
    const stored = localStorage.getItem("consent.rum") ?? localStorage.getItem("consent.analytics");
    if (stored === "granted") return "accept";
    if (stored === "declined") return "reject";
  } catch (error) {
    console.warn("Failed to read the consent choice from localStorage:", error);
  }
  return null;
}

function consentVisitSentence(reopen) {
  if (reopen) return "";
  if (hasAdvertClickId()) {
    return siteText(
      "consent.advert",
      "You arrived from an advert. If you accept, we store which advert brought you here and use Google Ads and Google Analytics to measure whether it led to a purchase. If you reject, we store nothing and the site works the same.",
    );
  }
  if (isPaidVisit()) {
    return siteText(
      "consent.link",
      "A link brought you here. If you accept, we store which link for 90 days, to see which pages lead to sign-ups. If you reject, we store nothing and the site works the same.",
    );
  }
  return "";
}

function setConsentBannerHeight(banner) {
  const publish = () => document.documentElement.style.setProperty("--consent-banner-height", `${banner.offsetHeight}px`);
  publish();
  if (typeof ResizeObserver === "function") new ResizeObserver(publish).observe(banner);
}

function fillConsentButtons(element) {
  element.querySelector("#consent-accept").textContent = siteText("consent.accept", "Accept");
  element.querySelector("#consent-decline").textContent = siteText("consent.reject", "Reject");
}

function buildConsentBanner() {
  const banner = document.createElement("div");
  banner.id = "consent-banner";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", siteText("consent.region", "Cookie consent"));
  banner.className = "consent-banner";
  banner.innerHTML = `
    <p class="consent-banner-text"><span class="consent-shared-text"></span> <a href="/privacy.html"></a><span class="consent-in-english"></span>.</p>
    <div class="consent-banner-actions">
      <button id="consent-accept" class="btn"></button>
      <button id="consent-decline" class="btn btn-secondary"></button>
    </div>`;
  fillConsentSharedText(banner);
  fillConsentButtons(banner);
  return banner;
}

function buildConsentDialog(reopen) {
  const dialog = document.createElement("div");
  dialog.id = "consent-dialog";
  dialog.className = "consent-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "consent-dialog-title");
  dialog.innerHTML = `
    <div class="consent-dialog-panel">
      <h2 id="consent-dialog-title"></h2>
      <p id="consent-current-choice" class="consent-current-choice" hidden></p>
      <p><span class="consent-shared-text"></span> <a href="/privacy.html"></a><span class="consent-in-english"></span>.</p>
      <p class="consent-visit-sentence" hidden></p>
      <div class="consent-dialog-actions">
        <button id="consent-accept" class="btn consent-dialog-button"></button>
        <button id="consent-decline" class="btn consent-dialog-button"></button>
      </div>
    </div>`;
  dialog.querySelector("#consent-dialog-title").textContent = siteText("consent.dialog-title", "Your cookie choice");
  fillConsentSharedText(dialog);
  fillConsentButtons(dialog);
  const choice = reopen ? storedConsentChoice() : null;
  const choiceLine = dialog.querySelector("#consent-current-choice");
  if (choice) {
    choiceLine.textContent =
      choice === "accept" ? siteText("consent.chose-accept", "You chose: accept") : siteText("consent.chose-reject", "You chose: reject");
    choiceLine.hidden = false;
  } else choiceLine.remove();
  const visitSentence = consentVisitSentence(reopen);
  const visitLine = dialog.querySelector(".consent-visit-sentence");
  if (visitSentence) {
    visitLine.textContent = visitSentence;
    visitLine.hidden = false;
  } else visitLine.remove();
  return dialog;
}

// The banner is the second Tab stop: it follows the skip link in the document, and its
// fixed position keeps it at the bottom of the screen.
function insertConsentBanner(banner) {
  const skipLink = document.querySelector("body > .skip-link");
  if (skipLink) skipLink.insertAdjacentElement("afterend", banner);
  else document.body.insertBefore(banner, document.body.firstChild);
}

function closeDialogOnEscape(event) {
  if (event.key !== "Escape") return;
  const dialog = document.getElementById("consent-dialog");
  if (dialog) dialog.parentNode.removeChild(dialog);
  document.removeEventListener("keydown", closeDialogOnEscape);
}

function showConsentBannerIfNeeded({ reopen = false } = {}) {
  if (!reopen && hasConsentChoice()) return;
  if (document.getElementById("consent-banner") || document.getElementById("consent-dialog")) return;
  const asDialog = reopen || isPaidVisit();
  const surface = asDialog ? "dialog" : "banner";
  if (asDialog) document.body.appendChild(buildConsentDialog(reopen));
  else {
    const banner = buildConsentBanner();
    insertConsentBanner(banner);
    setConsentBannerHeight(banner);
  }
  document.getElementById("consent-accept").onclick = () => answerConsent("granted", surface);
  document.getElementById("consent-decline").onclick = () => answerConsent("declined", surface);
  if (asDialog) document.getElementById("consent-accept").focus();
  if (reopen) document.addEventListener("keydown", closeDialogOnEscape);
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

// Operator pages send no RUM telemetry, so the web vitals alarms measure customer pages only.
const OPERATOR_PATH_PREFIX = /^\/operator\//;

async function maybeInitRum() {
  if (!hasConsentChoice()) showConsentBannerIfNeeded();
  if (!window.__RUM_CONFIG__) return;
  if (!hasRumConsent()) return;
  if (window.__RUM_INIT_DONE__) return;
  if (OPERATOR_PATH_PREFIX.test(window.location.pathname)) return;
  const c = window.__RUM_CONFIG__;
  if (!c.appMonitorId || !c.region) return;

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
      signing: false,
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
    if (cfg && cfg.appMonitorId && cfg.region) {
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
  if (appMonitorId && region) {
    window.__RUM_CONFIG__ = { appMonitorId, region, sessionSampleRate: 1 };
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
function postActivityEvent(activityId, phase) {
  let accessToken;
  try {
    accessToken = localStorage.getItem("cognitoAccessToken");
  } catch (error) {
    console.warn("Failed to read access token for activity beacon:", error);
    return;
  }
  if (!accessToken) return;

  fetch("/api/v1/activity/started", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
    body: JSON.stringify({ activityId, phase }),
    keepalive: true,
  }).catch(() => {
    // Best-effort: an activity beacon failure (offline, ad blockers) never blocks the
    // button's own action.
  });
}

function handleActivityStartClick(event) {
  const target = event.target && event.target.closest ? event.target.closest("[data-activity-start]") : null;
  if (!target) return;
  const activityId = target.getAttribute("data-activity-start");
  if (!activityId) return;
  postActivityEvent(activityId, "started");
}

// A page-only activity (help, the operator dashboard) starts when its page loads: the element
// carrying data-activity-view="<id>" names it. A page that shows its content at once also
// carries data-activity-complete="load"; one that fetches its content dispatches an
// "activity-completed" document event with the id as detail once the content is shown.
function recordActivityViewOnLoad() {
  const target = document.querySelector("[data-activity-view]");
  if (!target) return;
  const activityId = target.getAttribute("data-activity-view");
  postActivityEvent(activityId, "started");
  if (target.getAttribute("data-activity-complete") === "load") postActivityEvent(activityId, "completed");
}

function handleActivityCompletedEvent(event) {
  postActivityEvent(event.detail, "completed");
}

// The landing fields analytics.js stores under attribution.landing; click ids stay in the browser.
const ACQUISITION_FIELDS = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "ref", "landedAt"];
const ACQUISITION_POSTED_KEY = "attribution.landing.posted";
const ACQUISITION_SIGN_IN_KEY = "attribution.landing.signIn";

function readLandingForAccountAcquisition() {
  if (sessionStorage.getItem(ACQUISITION_SIGN_IN_KEY) !== "1") return null;
  sessionStorage.removeItem(ACQUISITION_SIGN_IN_KEY);
  const accessToken = localStorage.getItem("cognitoAccessToken");
  const landing = JSON.parse(localStorage.getItem("attribution.landing") || "null");
  if (!accessToken || !landing || typeof landing !== "object") return null;
  if (localStorage.getItem(ACQUISITION_POSTED_KEY) === String(landing.landedAt)) return null;
  return { accessToken, landing };
}

function handleAccountAcquisitionAnswer(answer, landing) {
  try {
    localStorage.setItem(ACQUISITION_POSTED_KEY, String(landing.landedAt));
  } catch (error) {
    console.warn("Failed to store that the landing was posted:", error);
  }
  if (answer.firstRecord === true && typeof gtag === "function") {
    let method = "cognito";
    try {
      method = localStorage.getItem("loginProvider") || method;
    } catch {
      // no storage: the default method
    }
    gtag("event", "sign_up", { method });
  }
}

// Posts the stored landing as the account's source on the first page after a sign-in, once per
// sign-in until a post succeeds. The landing counts as posted only when the route answers with
// success, so a post that fails or is cut off by a page change is sent again at the next sign-in.
// sign_up is sent only when the route answers that this is the account's first record.
function recordAccountAcquisitionAfterSignIn() {
  let pending;
  try {
    pending = readLandingForAccountAcquisition();
  } catch {
    return;
  }
  if (!pending) return;
  const { accessToken, landing } = pending;
  const body = {};
  for (const field of ACQUISITION_FIELDS) {
    if (typeof landing[field] === "string" && landing[field]) body[field] = landing[field];
  }
  fetch("/api/v1/account/acquisition", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
    body: JSON.stringify(body),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((answer) => (answer ? handleAccountAcquisitionAnswer(answer, landing) : undefined))
    .catch(() => {
      // Best-effort: the landing stays unposted and the next sign-in sends it again.
    });
}

function ensurePrivacyLink() {
  const anchors = Array.from(document.querySelectorAll('body > footer a[href$="privacy.html"]'));
  if (anchors.length) return;
  const footer = document.querySelector("body > footer .footer-links") || document.querySelector("body > footer");
  if (!footer) return;
  const link = document.createElement("a");
  link.href = "/privacy.html";
  link.textContent = "Privacy";
  footer.appendChild(link);
}

// The bubble repeats status messages; a browser that cannot start it still starts the page.
function startStatusBubbleSafely() {
  try {
    startStatusBubble();
  } catch (err) {
    console.warn("Failed to start the status bubble:", err.message);
  }
}

// Wire up on load
if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("click", handleActivityStartClick);
  document.addEventListener("activity-completed", handleActivityCompletedEvent);
  document.addEventListener("click", reopenConsentChoice);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startStatusBubbleSafely();
      recordActivityViewOnLoad();
      recordAccountAcquisitionAfterSignIn();
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
    startStatusBubbleSafely();
    recordActivityViewOnLoad();
    recordAccountAcquisitionAfterSignIn();
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
  window.dismissStatus = dismissStatus;
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
  window.getFilingHistory = getFilingHistory;
  window.getFiledAccounts = getFiledAccounts;
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
  window.renderMicroEntityAccounts = renderMicroEntityAccounts;
  window.submitMicroEntityAccounts = submitMicroEntityAccounts;
  window.pollMicroEntityAccounts = pollMicroEntityAccounts;

  // HMRC Company Tax Return service
  window.previewCtReturn = previewCtReturn;
  window.submitCtReturn = submitCtReturn;
  window.pollCtReturn = pollCtReturn;

  // Companies House confirmation statement service
  window.getConfirmationStatementFilingData = getConfirmationStatementFilingData;
  window.renderConfirmationStatement = renderConfirmationStatement;
  window.submitConfirmationStatement = submitConfirmationStatement;
  window.pollConfirmationStatement = pollConfirmationStatement;

  // Companies House PSC verification statement service
  window.submitPscVerificationStatement = submitPscVerificationStatement;
  window.pollPscVerificationStatement = pollPscVerificationStatement;
  window.submitCompaniesHouseForm = submitCompaniesHouseForm;
  window.pollCompaniesHouseForm = pollCompaniesHouseForm;

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
    sessionStorage.removeItem("hmrcAccessToken");
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
