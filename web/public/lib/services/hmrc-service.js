// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// HMRC service for VAT submission and fraud prevention headers

import { authorizedFetch } from "./api-client.js";

/**
 * HMRC's ITSA cumulative period retrieve (property Business v6.0, and the BSAS retrieve
 * alongside it) is not stateful in the sandbox - its documented default with no Gov-Test-Scenario
 * header is "no data found", so a synthetic run with nothing chosen needs a named scenario to see
 * anything at all. A live account must never carry a sandbox-only header, and an explicit choice
 * (a developer testing panel's own selection) always wins over the fallback.
 * @param {string|null|undefined} explicitTestScenario - the caller's own chosen scenario, if any
 * @param {string|null|undefined} hmrcAccount - "synthetic" or "live" (or unset)
 * @param {string} fallbackScenario - the Gov-Test-Scenario value to send when synthetic and nothing was chosen
 * @returns {string|null}
 */
export function resolveSyntheticTestScenario(explicitTestScenario, hmrcAccount, fallbackScenario) {
  if (explicitTestScenario) return explicitTestScenario;
  return hmrcAccount === "synthetic" ? fallbackScenario : null;
}

/**
 * Check if a string is a valid IPv4 address
 * @param {string} token - String to check
 * @returns {boolean} True if valid IPv4
 */
export function isValidIPv4(token) {
  // Quick pre-check: must have exactly 3 dots
  let dotCount = 0;

  for (let i = 0; i < token.length; i++) if (token[i] === ".") dotCount++;
  if (dotCount !== 3) return false;

  const parts = token.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (p.length === 0 || p.length > 3) return false;
    // no leading zeros like "01" unless the number is exactly 0
    if (p.length > 1 && p[0] === "0") return false;
    let num = 0;

    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch < "0" || ch > "9") return false;
      num = num * 10 + (ch.charCodeAt(0) - 48);
    }

    if (num < 0 || num > 255) return false;
  }
  return true;
}

/**
 * Extract the first IPv4 address from a WebRTC ICE candidate
 * @param {string} candidate - ICE candidate string
 * @returns {string} IPv4 address or empty string
 */
export function extractIPv4FromCandidate(candidate) {
  if (!candidate || typeof candidate !== "string") return "";
  const tokens = [];
  let buf = "";

  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    const isDigit = ch >= "0" && ch <= "9";
    if (isDigit || ch === ".") {
      buf += ch;
    } else if (buf) {
      tokens.push(buf);
      buf = "";
    }
  }

  if (buf) tokens.push(buf);

  for (const t of tokens) {
    if (isValidIPv4(t)) return t;
  }
  return "";
}

/**
 * WebRTC-based IP detection (limited effectiveness in modern browsers)
 * @returns {Promise<string>} IP address
 */
export function getIPViaWebRTC() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebRTC timeout")), 2000);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      pc.createDataChannel("");
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((err) => {
          clearTimeout(timeout);
          pc.close();
          reject(err);
        });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ip = extractIPv4FromCandidate(candidate);
          if (ip) {
            clearTimeout(timeout);
            pc.close();
            resolve(ip);
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          pc.close();
          reject(new Error("No IP found via WebRTC"));
        }
      };
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Enhanced IP detection with multiple fallback methods
 * @returns {Promise<string>} Client IP address or "SERVER_DETECT"
 */
export async function getClientIP() {
  // Method 1: Try WebRTC-based IP detection
  const webRTCIP = await getIPViaWebRTC().catch(() => null);
  if (webRTCIP && !webRTCIP.startsWith("192.168.") && !webRTCIP.startsWith("10.") && !webRTCIP.startsWith("172.")) {
    return webRTCIP;
  }

  // Method 2: Try multiple IP detection services with timeout
  const ipServices = ["https://api.ipify.org", "https://ipapi.co/ip", "https://httpbin.org/ip"];

  for (const service of ipServices) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      let response;
      if (service === "https://httpbin.org/ip") {
        response = await fetch(service, { signal: controller.signal });
        const data = await response.json();
        clearTimeout(timeoutId);
        return data.origin.split(",")[0].trim();
      } else {
        response = await fetch(service, { signal: controller.signal });
        const ip = await response.text();
        clearTimeout(timeoutId);
        return ip.trim();
      }
    } catch (error) {
      console.warn(`Failed to get IP from ${service}:`, error.message);
      continue;
    }
  }

  // Method 3: Fallback - let server detect IP from request headers
  console.warn("All IP detection methods failed, server will detect IP from request headers");
  return "SERVER_DETECT";
}

// Gov-Client-Device-ID must be "a UUID that does not expire, persistently stored on the
// device" (HMRC fraud prevention spec). localStorage, not a cookie: this identifier is never
// sent to HMRC directly by the browser -- it only needs to survive in the one origin that reads
// it back, and the app already keeps every other device-scoped value (tokens, userInfo) there,
// so a cookie would add SameSite/expiry handling for no benefit over the storage the rest of the
// app already uses.
const DEVICE_ID_STORAGE_KEY = "hmrcDeviceId";

/**
 * Return this device's persistent Gov-Client-Device-ID, generating and storing one on first use.
 * Never regenerated while a stored value exists, so it stays stable across requests, tabs and
 * signed-out/signed-in cycles -- it identifies the device, not the signed-in user.
 * @returns {string} UUID
 */
export function getOrCreateDeviceId() {
  try {
    const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored) return stored;
    const generated = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch (err) {
    console.warn("Failed to persist Gov-Client-Device-ID, falling back to a per-request value:", err);
    return crypto.randomUUID();
  }
}

/**
 * Build Gov-Client headers for HMRC API calls
 * Note: Vendor headers (Gov-Vendor-*) are generated server-side
 * @returns {Promise<object>} Headers object
 */
export async function getGovClientHeaders() {
  // Try to detect client IP
  let detectedIP = "SERVER_DETECT";
  try {
    detectedIP = await getClientIP();
  } catch (error) {
    console.warn("Client IP detection failed, server will detect:", error.message);
  }

  const govClientPublicIPHeader = detectedIP;
  const govClientBrowserJSUserAgentHeader = navigator.userAgent;
  const govClientDeviceIDHeader = getOrCreateDeviceId();

  // Gov-Client-Multi-Factor: Extract from sessionStorage if MFA was detected during login.
  // This is the fallback the server-built header (customAuthorizer.js + buildFraudHeaders.js,
  // from the verified ID token) uses when it has nothing -- the server value wins whenever it's
  // present.
  let govClientMultiFactorHeader;
  try {
    const mfaMetadata = sessionStorage.getItem("mfaMetadata");
    if (mfaMetadata) {
      const mfa = JSON.parse(mfaMetadata);
      govClientMultiFactorHeader = `type=${mfa.type}&timestamp=${encodeURIComponent(mfa.timestamp)}&unique-reference=${encodeURIComponent(mfa.uniqueReference)}`;
    }
  } catch (err) {
    console.warn("Failed to read MFA metadata from sessionStorage:", err);
  }

  // X-Id-Token: carries the Cognito ID token to the custom authorizer alongside the access
  // token in X-Authorization, so it can verify the caller's custom:mfa_method and identities
  // claims and build Gov-Client-Multi-Factor server-side. Not itself a Gov-Client-* header.
  let govIdTokenHeader;
  try {
    govIdTokenHeader = localStorage.getItem("cognitoIdToken") || undefined;
  } catch (err) {
    console.warn("Failed to read the Cognito ID token from localStorage:", err);
  }

  const govClientPublicIPTimestampHeader = new Date().toISOString();

  // Gov-Client-Screens
  const govClientScreensHeader = [
    { width: window.screen.width },
    { height: window.screen.height },
    { "colour-depth": window.screen.colorDepth },
    { "scaling-factor": window.devicePixelRatio },
  ]
    .map((obj) => Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`))
    .join("&");

  // Gov-Client-Timezone: Must be in UTC+/-<hh>:<mm> format
  const timezoneOffset = -new Date().getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
  const offsetMinutes = Math.abs(timezoneOffset) % 60;
  const offsetSign = timezoneOffset >= 0 ? "+" : "-";
  const govClientTimezoneHeader = `UTC${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

  // Gov-Client-Window-Size
  const govClientWindowSizeHeader = [{ width: window.innerWidth }, { height: window.innerHeight }]
    .map((obj) => Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`))
    .join("&");

  // Get current user ID from localStorage if available
  const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const userId = userInfo.sub || "browser-unknown";
  const govClientUserIDsHeader = `cognito=${encodeURIComponent(userId)}`;

  // Build client headers only (no vendor headers)
  const headers = {
    "Gov-Client-Browser-JS-User-Agent": govClientBrowserJSUserAgentHeader,
    "Gov-Client-Device-ID": govClientDeviceIDHeader,
    "Gov-Client-Public-IP": govClientPublicIPHeader,
    "Gov-Client-Public-IP-Timestamp": govClientPublicIPTimestampHeader,
    "Gov-Client-Screens": govClientScreensHeader,
    "Gov-Client-Timezone": govClientTimezoneHeader,
    "Gov-Client-User-IDs": govClientUserIDsHeader,
    "Gov-Client-Window-Size": govClientWindowSizeHeader,
  };
  if (govClientMultiFactorHeader) {
    headers["Gov-Client-Multi-Factor"] = govClientMultiFactorHeader;
  }
  if (govIdTokenHeader) {
    headers["X-Id-Token"] = govIdTokenHeader;
  }

  return headers;
}

/**
 * Submit VAT return to HMRC
 * @param {string} vatNumber - VAT registration number
 * @param {object} vatData - VAT submission data containing periodStart, periodEnd, and 9-box fields
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (synthetic only)
 * @param {boolean} allowSyntheticObligations - Synthetic-only option: use any available open obligation if dates don't match
 * @returns {Promise<object>} Submission response
 */
export async function submitVat(
  vatNumber,
  vatData,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  allowSyntheticObligations = false,
) {
  const url = "/api/v1/hmrc/vat/return";

  // Get Cognito JWT token for custom authorizer
  const cognitoAccessToken = localStorage.getItem("cognitoAccessToken");
  const headers = {
    "Content-Type": "application/json",
    ...govClientHeaders,
  };
  if (cognitoAccessToken) {
    headers["X-Authorization"] = `Bearer ${cognitoAccessToken}`;
  }

  // Build request body with period dates and all 9-box fields
  const body = JSON.stringify({
    vatNumber,
    periodStart: vatData.periodStart,
    periodEnd: vatData.periodEnd,
    // Include all 9-box fields
    vatDueSales: vatData.vatDueSales,
    vatDueAcquisitions: vatData.vatDueAcquisitions,
    totalVatDue: vatData.totalVatDue,
    vatReclaimedCurrPeriod: vatData.vatReclaimedCurrPeriod,
    netVatDue: vatData.netVatDue,
    totalValueSalesExVAT: vatData.totalValueSalesExVAT,
    totalValuePurchasesExVAT: vatData.totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT: vatData.totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT: vatData.totalAcquisitionsExVAT,
    finalised: vatData.finalised,
    accessToken,
    runFraudPreventionHeaderValidation,
    allowSyntheticObligations,
  });
  console.log(`Submitting VAT. Remote call initiated: POST ${url} ++ Body: ${body}`);

  const response = await authorizedFetch(url, {
    method: "POST",
    headers,
    body,
  });
  const responseJson = await response.json();
  if (!response.ok) {
    // A period HMRC has already accepted is a specific, actionable answer — say it plainly
    // instead of showing the customer the raw response.
    if (responseJson?.reason === "obligation_already_fulfilled") {
      const message = `${responseJson.userMessage} ${responseJson.actionAdvice}`.trim();
      console.warn(message);
      throw new Error(message);
    }
    // Token allowance used up — tell the customer plainly instead of showing the raw response.
    if (responseJson?.reason === "tokens_exhausted") {
      const message =
        "No tokens remaining. Your token allowance has been used. Tokens refresh at the start of the next period. Visit the Bundles page for more options.";
      console.warn(message);
      throw new Error(message);
    }
    // The HMRC authorization is missing a required scope — clear the stale token so the
    // customer re-authorizes instead of retrying with the same token.
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to submit VAT. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to submit VAT.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve the authenticated user's ITSA business list from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing listOfBusinesses
 */
export async function getBusinessDetails(
  nino,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/business/details?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    // The HMRC authorization is missing a required scope - clear the stale token so the
    // customer re-authorizes instead of retrying with the same token.
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to retrieve business details. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to retrieve business details.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve the authenticated user's ITSA quarterly update obligations from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @param {object} [filters] - Optional typeOfBusiness, businessId, fromDate, toDate, status filters
 * @returns {Promise<object>} Response containing obligations
 */
export async function getObligations(
  nino,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
  filters = {},
) {
  const params = new URLSearchParams({ nino });
  if (filters.typeOfBusiness) params.append("typeOfBusiness", filters.typeOfBusiness);
  if (filters.businessId) params.append("businessId", filters.businessId);
  if (filters.fromDate) params.append("fromDate", filters.fromDate);
  if (filters.toDate) params.append("toDate", filters.toDate);
  if (filters.status) params.append("status", filters.status);
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/obligations?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    // The HMRC authorization is missing a required scope - clear the stale token so the
    // customer re-authorizes instead of retrying with the same token.
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to retrieve obligations. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to retrieve obligations.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * File an ITSA self-employment quarterly update (create a period summary) with HMRC.
 * @param {object} periodData - { nino, businessId, periodStartDate, periodEndDate, periodIncome, periodExpenses, periodDisallowableExpenses }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing periodId
 */
export async function postSelfEmploymentPeriod(
  periodData,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/self-employment/period";

  // Gov-Test-Scenario is a real HTTP header on every write endpoint (see submitVat's
  // shape), never a query parameter - it becomes the header HMRC itself reads.
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: periodData.nino,
    businessId: periodData.businessId,
    periodStartDate: periodData.periodStartDate,
    periodEndDate: periodData.periodEndDate,
    runFraudPreventionHeaderValidation,
    periodIncome: periodData.periodIncome,
    periodExpenses: periodData.periodExpenses,
    periodDisallowableExpenses: periodData.periodDisallowableExpenses,
  });

  const response = await authorizedFetch(url, { method: "POST", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    // The HMRC authorization is missing a required scope - clear the stale token so the
    // customer re-authorizes instead of retrying with the same token.
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to file the quarterly update. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to file the quarterly update.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve an ITSA self-employment annual submission (adjustments, allowances, nonFinancials) from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} businessId - HMRC business ID
 * @param {string} taxYear - Tax year, e.g. "2024-25"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing adjustments, allowances, nonFinancials
 */
export async function getSelfEmploymentAnnual(
  nino,
  businessId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/self-employment/annual?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to retrieve the annual submission. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to retrieve the annual submission.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Create or amend an ITSA self-employment annual submission with HMRC.
 * @param {object} annualDetails - { nino, businessId, taxYear, adjustments, allowances, nonFinancials }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty on success
 */
export async function putSelfEmploymentAnnual(
  annualDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/self-employment/annual";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: annualDetails.nino,
    businessId: annualDetails.businessId,
    taxYear: annualDetails.taxYear,
    runFraudPreventionHeaderValidation,
    adjustments: annualDetails.adjustments,
    allowances: annualDetails.allowances,
    nonFinancials: annualDetails.nonFinancials,
  });

  const response = await authorizedFetch(url, { method: "PUT", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to save the annual submission. Remote call failed: PUT ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to save the annual submission.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Trigger an ITSA business source adjustable summary (BSAS) for an accounting period.
 * @param {object} triggerDetails - { nino, businessId, accountingPeriodStartDate, accountingPeriodEndDate, typeOfBusiness }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing calculationId
 */
export async function triggerBsas(
  triggerDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/bsas/trigger";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: triggerDetails.nino,
    businessId: triggerDetails.businessId,
    accountingPeriodStartDate: triggerDetails.accountingPeriodStartDate,
    accountingPeriodEndDate: triggerDetails.accountingPeriodEndDate,
    typeOfBusiness: triggerDetails.typeOfBusiness,
    runFraudPreventionHeaderValidation,
  });

  const response = await authorizedFetch(url, { method: "POST", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to trigger the year-end summary. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to trigger the year-end summary.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve a triggered ITSA business source adjustable summary (BSAS) for self-employment.
 * @param {string} nino - National Insurance number
 * @param {string} calculationId - The BSAS calculation ID from the trigger response
 * @param {string} taxYear - Tax year, e.g. "2024-25"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing metadata, inputs and adjustableSummaryCalculation
 */
export async function getBsasSelfEmployment(
  nino,
  calculationId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, calculationId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/bsas/self-employment?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to retrieve the year-end summary. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return responseJson;
}

/**
 * Submit an adjustment (or zeroAdjustments) to a triggered ITSA business source adjustable summary.
 * @param {object} adjustDetails - { nino, calculationId, taxYear, income, expenses, additions, zeroAdjustments }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty on success
 */
export async function adjustBsasSelfEmployment(
  adjustDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/bsas/self-employment/adjust";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: adjustDetails.nino,
    calculationId: adjustDetails.calculationId,
    taxYear: adjustDetails.taxYear,
    runFraudPreventionHeaderValidation,
    income: adjustDetails.income,
    expenses: adjustDetails.expenses,
    additions: adjustDetails.additions,
    zeroAdjustments: adjustDetails.zeroAdjustments,
  });

  const response = await authorizedFetch(url, { method: "POST", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to submit the year-end adjustment. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to submit the year-end adjustment.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve an ITSA UK property annual submission (adjustments, allowances) from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} businessId - HMRC business ID
 * @param {string} taxYear - Tax year, e.g. "2024-25"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing ukProperty.adjustments and ukProperty.allowances
 */
export async function getUkPropertyAnnual(
  nino,
  businessId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/uk-property/annual?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to retrieve the annual submission. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to retrieve the annual submission.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Create or amend an ITSA UK property annual submission with HMRC.
 * @param {object} annualDetails - { nino, businessId, taxYear, adjustments, allowances }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty on success
 */
export async function putUkPropertyAnnual(
  annualDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/uk-property/annual";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: annualDetails.nino,
    businessId: annualDetails.businessId,
    taxYear: annualDetails.taxYear,
    runFraudPreventionHeaderValidation,
    adjustments: annualDetails.adjustments,
    allowances: annualDetails.allowances,
  });

  const response = await authorizedFetch(url, { method: "PUT", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to save the annual submission. Remote call failed: PUT ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to save the annual submission.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Sends one foreign property request (details or period) and returns HMRC's answer, or throws
 * with a message the page can show.
 * @param {string} action - Words for the failure message, e.g. "retrieve the property list"
 * @param {string} method - "GET", "POST" or "PUT"
 * @param {string} url - The Submit route, with its query string for a GET
 * @param {object|null} body - The JSON body for a POST or PUT
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value, sent as a header
 * @returns {Promise<object>} The response body
 */
async function foreignPropertyRequest(action, method, url, body, accessToken, govClientHeaders, testScenario) {
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario && method !== "GET") headers["Gov-Test-Scenario"] = testScenario;

  const response = await authorizedFetch(url, { method, headers, ...(body && { body: JSON.stringify(body) }) });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to ${action}. Remote call failed: ${method} ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to ${action}.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve the foreign properties of a business for a tax year (2026-27 on) from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} businessId - HMRC business ID
 * @param {string} taxYear - Tax year, e.g. "2026-27"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value, sent as a query parameter
 * @returns {Promise<object>} Response containing foreignPropertyDetails
 */
export async function getForeignPropertyDetails(
  nino,
  businessId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/foreign-property/details?${params}`;
  return foreignPropertyRequest("retrieve the properties", "GET", url, null, accessToken, govClientHeaders, null);
}

/**
 * Create a foreign property for a tax year (2026-27 on) with HMRC.
 * @param {object} details - { nino, businessId, taxYear, propertyName, countryCode, endDate?, endReason? }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing propertyId
 */
export async function postForeignPropertyDetails(
  details,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const body = {
    nino: details.nino,
    businessId: details.businessId,
    taxYear: details.taxYear,
    runFraudPreventionHeaderValidation,
    propertyName: details.propertyName,
    countryCode: details.countryCode,
    endDate: details.endDate,
    endReason: details.endReason,
  };
  return foreignPropertyRequest(
    "add the property",
    "POST",
    "/api/v1/hmrc/itsa/foreign-property/details",
    body,
    accessToken,
    govClientHeaders,
    testScenario,
  );
}

/**
 * Change the name of a foreign property, or end it with a date and a reason, with HMRC.
 * @param {object} details - { nino, taxYear, propertyId, propertyName, endDate?, endReason? }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty on success
 */
export async function putForeignPropertyDetails(
  details,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const body = {
    nino: details.nino,
    taxYear: details.taxYear,
    runFraudPreventionHeaderValidation,
    propertyId: details.propertyId,
    propertyName: details.propertyName,
    endDate: details.endDate,
    endReason: details.endReason,
  };
  return foreignPropertyRequest(
    "save the property",
    "PUT",
    "/api/v1/hmrc/itsa/foreign-property/details",
    body,
    accessToken,
    govClientHeaders,
    testScenario,
  );
}

/**
 * Build the body of a foreign property period request from the figures a page read.
 * @param {object} period - { nino, businessId, taxYear, fromDate?, toDate?, submissionId?, foreignFhlEea?, foreignNonFhlProperty?, foreignProperty? }
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @returns {object} The JSON body for the Submit route
 */
function foreignPropertyPeriodBody(period, runFraudPreventionHeaderValidation) {
  return {
    nino: period.nino,
    businessId: period.businessId,
    taxYear: period.taxYear,
    runFraudPreventionHeaderValidation,
    fromDate: period.fromDate,
    toDate: period.toDate,
    submissionId: period.submissionId,
    foreignFhlEea: period.foreignFhlEea,
    foreignNonFhlProperty: period.foreignNonFhlProperty,
    foreignProperty: period.foreignProperty,
  };
}

/**
 * File a dated foreign property period summary with HMRC (2024-25 and before). From 2025-26 the
 * cumulative summary is sent with putForeignPropertyPeriod.
 * @param {object} period - See foreignPropertyPeriodBody
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing submissionId
 */
export async function postForeignPropertyPeriod(
  period,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  return foreignPropertyRequest(
    "file the quarterly update",
    "POST",
    "/api/v1/hmrc/itsa/foreign-property/period",
    foreignPropertyPeriodBody(period, runFraudPreventionHeaderValidation),
    accessToken,
    govClientHeaders,
    testScenario,
  );
}

/**
 * Send a foreign property period to HMRC as an amendment: a dated period (2024-25 and before,
 * addressed by submissionId) or the year's cumulative summary (2025-26 on, which also creates it).
 * @param {object} period - See foreignPropertyPeriodBody
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty for the cumulative summary
 */
export async function putForeignPropertyPeriod(
  period,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  return foreignPropertyRequest(
    "save the period summary",
    "PUT",
    "/api/v1/hmrc/itsa/foreign-property/period",
    foreignPropertyPeriodBody(period, runFraudPreventionHeaderValidation),
    accessToken,
    govClientHeaders,
    testScenario,
  );
}

/**
 * Retrieve one foreign property period summary (dated, by submissionId) or the cumulative summary
 * of a tax year (2025-26 on) from HMRC.
 * @param {object} query - { nino, businessId, taxYear, submissionId? }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value, sent as a query parameter
 * @returns {Promise<object>} The period summary
 */
export async function getForeignPropertyPeriod(
  query,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino: query.nino, businessId: query.businessId, taxYear: query.taxYear });
  if (query.submissionId) params.append("submissionId", query.submissionId);
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  return foreignPropertyRequest(
    "retrieve the period summary",
    "GET",
    `/api/v1/hmrc/itsa/foreign-property/period?${params}`,
    null,
    accessToken,
    govClientHeaders,
    null,
  );
}

/**
 * List the period summaries of a property business for a tax year (2024-25 and before). The route
 * serves UK and foreign property businesses: HMRC's list path has no property type.
 * @param {string} nino - National Insurance number
 * @param {string} businessId - HMRC business ID
 * @param {string} taxYear - Tax year, e.g. "2024-25"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value, sent as a query parameter
 * @returns {Promise<object>} Response containing periods
 */
export async function getPropertyPeriods(
  nino,
  businessId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  return foreignPropertyRequest(
    "retrieve the period summaries",
    "GET",
    `/api/v1/hmrc/itsa/uk-property/periods?${params}`,
    null,
    accessToken,
    govClientHeaders,
    null,
  );
}

/**
 * Retrieve a triggered ITSA business source adjustable summary (BSAS) for UK property.
 * @param {string} nino - National Insurance number
 * @param {string} calculationId - The BSAS calculation ID from the trigger response
 * @param {string} taxYear - Tax year, e.g. "2024-25"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing metadata, inputs and adjustableSummaryCalculation
 */
export async function getBsasUkProperty(
  nino,
  calculationId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, calculationId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/bsas/uk-property?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to retrieve the year-end summary. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return responseJson;
}

/**
 * Submit an adjustment (or zeroAdjustments) to a triggered ITSA UK property adjustable summary.
 * @param {object} adjustDetails - { nino, calculationId, taxYear, income, expenses, zeroAdjustments }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty on success
 */
export async function adjustBsasUkProperty(
  adjustDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/bsas/uk-property/adjust";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: adjustDetails.nino,
    calculationId: adjustDetails.calculationId,
    taxYear: adjustDetails.taxYear,
    runFraudPreventionHeaderValidation,
    income: adjustDetails.income,
    expenses: adjustDetails.expenses,
    zeroAdjustments: adjustDetails.zeroAdjustments,
  });

  const response = await authorizedFetch(url, { method: "POST", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to submit the year-end adjustment. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to submit the year-end adjustment.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve the annual submission of a foreign property business from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} businessId - HMRC business ID
 * @param {string} taxYear - Tax year, e.g. "2025-26"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value, sent as a query parameter
 * @returns {Promise<object>} Response containing foreignFhlEea (2024-25 and before) and foreignProperty
 */
export async function getForeignPropertyAnnual(
  nino,
  businessId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  return foreignPropertyRequest(
    "retrieve the annual submission",
    "GET",
    `/api/v1/hmrc/itsa/foreign-property/annual?${params}`,
    null,
    accessToken,
    govClientHeaders,
    null,
  );
}

/**
 * Create or amend the annual submission of a foreign property business with HMRC.
 * @param {object} annualDetails - { nino, businessId, taxYear, foreignFhlEea?, foreignProperty? }. foreignProperty holds
 *   one entry for each country (2025-26 and before) or property (2026-27 on), each with adjustments and allowances.
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value, sent as a header
 * @returns {Promise<object>} Response, empty on success
 */
export async function putForeignPropertyAnnual(
  annualDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  return foreignPropertyRequest(
    "save the annual submission",
    "PUT",
    "/api/v1/hmrc/itsa/foreign-property/annual",
    {
      nino: annualDetails.nino,
      businessId: annualDetails.businessId,
      taxYear: annualDetails.taxYear,
      runFraudPreventionHeaderValidation,
      foreignFhlEea: annualDetails.foreignFhlEea,
      foreignProperty: annualDetails.foreignProperty,
    },
    accessToken,
    govClientHeaders,
    testScenario,
  );
}

/**
 * Retrieve a triggered ITSA business source adjustable summary (BSAS) for foreign property.
 * @param {string} nino - National Insurance number
 * @param {string} calculationId - The BSAS calculation ID from the trigger response
 * @param {string} taxYear - Tax year, e.g. "2025-26"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value, sent as a query parameter
 * @returns {Promise<object>} Response containing metadata, inputs and adjustableSummaryCalculation with one
 *   countryLevelDetail entry for each country
 */
export async function getBsasForeignProperty(
  nino,
  calculationId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, calculationId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  return foreignPropertyRequest(
    "retrieve the year-end summary",
    "GET",
    `/api/v1/hmrc/itsa/bsas/foreign-property?${params}`,
    null,
    accessToken,
    govClientHeaders,
    null,
  );
}

/**
 * Submit adjustments (or zeroAdjustments) to a triggered ITSA foreign property adjustable summary.
 * @param {object} adjustDetails - { nino, calculationId, taxYear, foreignProperty?, zeroAdjustments? }. foreignProperty holds one
 *   entry for each country (2025-26 and before) or property (2026-27 on), each with income and expenses.
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value, sent as a header
 * @returns {Promise<object>} Response, empty on success
 */
export async function adjustBsasForeignProperty(
  adjustDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  return foreignPropertyRequest(
    "submit the year-end adjustment",
    "POST",
    "/api/v1/hmrc/itsa/bsas/foreign-property/adjust",
    {
      nino: adjustDetails.nino,
      calculationId: adjustDetails.calculationId,
      taxYear: adjustDetails.taxYear,
      runFraudPreventionHeaderValidation,
      foreignProperty: adjustDetails.foreignProperty,
      zeroAdjustments: adjustDetails.zeroAdjustments,
    },
    accessToken,
    govClientHeaders,
    testScenario,
  );
}

/**
 * Trigger an ITSA tax calculation (in-year estimate or intent-to-finalise) with HMRC. HMRC's
 * calculation runs asynchronously; the worker behind this endpoint waits and retrieves it, so
 * this call answers with the finished calculation body.
 * @param {object} calculationDetails - { nino, taxYear, calculationType }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing metadata, inputs, calculation and messages
 */
export async function triggerCalculation(
  calculationDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/calculation/trigger";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: calculationDetails.nino,
    taxYear: calculationDetails.taxYear,
    calculationType: calculationDetails.calculationType,
    runFraudPreventionHeaderValidation,
  });

  const response = await authorizedFetch(url, {
    method: "POST",
    headers,
    body,
    pollPendingMessage: "Calculating...",
    pollSuccessMessage: "Calculation ready.",
    pollErrorMessage: "Failed to calculate.",
  });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to trigger the tax calculation. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to trigger the tax calculation.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve a previously triggered ITSA tax calculation from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} taxYear - Tax year, e.g. "2024-25"
 * @param {string} calculationId - The calculation ID from the trigger response
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing metadata, inputs, calculation and messages
 */
export async function getCalculation(
  nino,
  taxYear,
  calculationId,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, taxYear, calculationId });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/calculation?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to retrieve the tax calculation. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to retrieve the tax calculation.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Submit an ITSA final declaration with HMRC, confirming a previously retrieved
 * intent-to-finalise calculation.
 * @param {object} declarationDetails - { nino, taxYear, calculationId, calculationType, totalIncomeTaxAndNicsDue }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty on success
 */
export async function postFinalDeclaration(
  declarationDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/final-declaration";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: declarationDetails.nino,
    taxYear: declarationDetails.taxYear,
    calculationId: declarationDetails.calculationId,
    calculationType: declarationDetails.calculationType,
    totalIncomeTaxAndNicsDue: declarationDetails.totalIncomeTaxAndNicsDue,
    runFraudPreventionHeaderValidation,
  });

  const response = await authorizedFetch(url, { method: "POST", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    // Token allowance used up - carry the reason and status so the caller can show the
    // submission-cost widget's own exhausted-balance sentence instead of a generic one.
    if (responseJson?.reason === "tokens_exhausted") {
      console.warn("Final declaration blocked: token allowance used up");
      const error = new Error("Token limit reached");
      error.status = response.status;
      error.reason = responseJson.reason;
      error.tokensRemaining = responseJson.tokensRemaining;
      throw error;
    }
    console.error(
      `Failed to submit the final declaration. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to submit the final declaration.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve a business's losses and claims for a tax year from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} businessId - HMRC business ID
 * @param {string} taxYear - Tax year, e.g. "2024-25"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing losses and claims
 */
export async function getLossesAndClaims(
  nino,
  businessId,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/losses-and-claims?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to retrieve losses and claims. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to retrieve losses and claims.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Create or amend a business's losses and claims for a tax year with HMRC.
 * @param {object} lossesDetails - { nino, businessId, taxYear, typeOfBusiness, losses, claims, suspendTemporalValidations }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty on success
 */
export async function putLossesAndClaims(
  lossesDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/losses-and-claims";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: lossesDetails.nino,
    businessId: lossesDetails.businessId,
    taxYear: lossesDetails.taxYear,
    typeOfBusiness: lossesDetails.typeOfBusiness,
    runFraudPreventionHeaderValidation,
    losses: lossesDetails.losses,
    claims: lossesDetails.claims,
    suspendTemporalValidations: lossesDetails.suspendTemporalValidations,
  });

  const response = await authorizedFetch(url, { method: "PUT", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to save losses and claims. Remote call failed: PUT ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to save losses and claims.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Retrieve a person's tax liability adjustments for a tax year from HMRC.
 * @param {string} nino - National Insurance number
 * @param {string} taxYear - Tax year, e.g. "2024-25"
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response containing carryBackLossesDecrease and taxRefundedOrSetOff
 */
export async function getTaxLiabilityAdjustments(
  nino,
  taxYear,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const params = new URLSearchParams({ nino, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
  const url = `/api/v1/hmrc/itsa/tax-liability-adjustments?${params}`;

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };

  const response = await authorizedFetch(url, { method: "GET", headers });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to retrieve tax liability adjustments. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to retrieve tax liability adjustments.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

/**
 * Create or amend a person's tax liability adjustments for a tax year with HMRC.
 * @param {object} adjustmentsDetails - { nino, taxYear, carryBackLossesDecrease, suspendTemporalValidations }
 * @param {string} accessToken - HMRC access token
 * @param {object} govClientHeaders - Gov-Client headers
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @param {string|null} testScenario - Optional HMRC sandbox Gov-Test-Scenario value
 * @returns {Promise<object>} Response, empty on success
 */
export async function putTaxLiabilityAdjustments(
  adjustmentsDetails,
  accessToken,
  govClientHeaders = {},
  runFraudPreventionHeaderValidation = false,
  testScenario = null,
) {
  const url = "/api/v1/hmrc/itsa/tax-liability-adjustments";

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
    "x-wait-time-ms": "0",
  };
  if (testScenario) headers["Gov-Test-Scenario"] = testScenario;

  const body = JSON.stringify({
    nino: adjustmentsDetails.nino,
    taxYear: adjustmentsDetails.taxYear,
    runFraudPreventionHeaderValidation,
    carryBackLossesDecrease: adjustmentsDetails.carryBackLossesDecrease,
    suspendTemporalValidations: adjustmentsDetails.suspendTemporalValidations,
  });

  const response = await authorizedFetch(url, { method: "PUT", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage || "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    console.error(
      `Failed to save tax liability adjustments. Remote call failed: PUT ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`,
    );
    throw requestFailure(`Failed to save tax liability adjustments.${failureReason(responseJson)}`, response, responseJson);
  }
  return responseJson;
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.resolveSyntheticTestScenario = resolveSyntheticTestScenario;
  window.submitVat = submitVat;
  window.getGovClientHeaders = getGovClientHeaders;
  window.getClientIP = getClientIP;
  window.getIPViaWebRTC = getIPViaWebRTC;
  window.getBusinessDetails = getBusinessDetails;
  window.getObligations = getObligations;
  window.postSelfEmploymentPeriod = postSelfEmploymentPeriod;
  window.getSelfEmploymentAnnual = getSelfEmploymentAnnual;
  window.putSelfEmploymentAnnual = putSelfEmploymentAnnual;
  window.getUkPropertyAnnual = getUkPropertyAnnual;
  window.putUkPropertyAnnual = putUkPropertyAnnual;
  window.getForeignPropertyDetails = getForeignPropertyDetails;
  window.postForeignPropertyDetails = postForeignPropertyDetails;
  window.putForeignPropertyDetails = putForeignPropertyDetails;
  window.getForeignPropertyAnnual = getForeignPropertyAnnual;
  window.putForeignPropertyAnnual = putForeignPropertyAnnual;
  window.getBsasForeignProperty = getBsasForeignProperty;
  window.adjustBsasForeignProperty = adjustBsasForeignProperty;
  window.postForeignPropertyPeriod = postForeignPropertyPeriod;
  window.putForeignPropertyPeriod = putForeignPropertyPeriod;
  window.getForeignPropertyPeriod = getForeignPropertyPeriod;
  window.getPropertyPeriods = getPropertyPeriods;
  window.triggerBsas = triggerBsas;
  window.getBsasSelfEmployment = getBsasSelfEmployment;
  window.adjustBsasSelfEmployment = adjustBsasSelfEmployment;
  window.getBsasUkProperty = getBsasUkProperty;
  window.adjustBsasUkProperty = adjustBsasUkProperty;
  window.triggerCalculation = triggerCalculation;
  window.getCalculation = getCalculation;
  window.postFinalDeclaration = postFinalDeclaration;
  window.getLossesAndClaims = getLossesAndClaims;
  window.putLossesAndClaims = putLossesAndClaims;
  window.getTaxLiabilityAdjustments = getTaxLiabilityAdjustments;
  window.putTaxLiabilityAdjustments = putTaxLiabilityAdjustments;
}

function requestFailure(message, response, responseJson) {
  const error = new Error(message);
  error.status = response.status;
  error.code = responseJson?.responseBody?.code || responseJson?.code || "";
  error.reason = responseJson?.reason;
  return error;
}

function failureReason(responseJson) {
  const reason = responseJson?.userMessage || responseJson?.message || responseJson?.error;
  return typeof reason === "string" && reason.trim() ? ` ${reason.trim()}` : "";
}
