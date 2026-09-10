// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// HMRC service for VAT submission and fraud prevention headers

import { authorizedFetch } from "./api-client.js";

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
  const govClientDeviceIDHeader = crypto.randomUUID();

  // Gov-Client-Multi-Factor: Extract from sessionStorage if MFA was detected during login
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to submit VAT. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to retrieve business details. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to retrieve obligations. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to file the quarterly update. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to retrieve the annual submission. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to save the annual submission. Remote call failed: PUT ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }
  return responseJson;
}

/**
 * Trigger an ITSA business source adjustable summary (BSAS) for an accounting period.
 * @param {object} triggerDetails - { nino, businessId, accountingPeriodStartDate, accountingPeriodEndDate }
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
    runFraudPreventionHeaderValidation,
  });

  const response = await authorizedFetch(url, { method: "POST", headers, body });
  const responseJson = await response.json();
  if (!response.ok) {
    if (responseJson?.reason === "hmrc_scope_insufficient") {
      const message =
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to trigger the year-end summary. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to retrieve the year-end summary. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to submit the year-end adjustment. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }
  return responseJson;
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to trigger the tax calculation. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
      console.warn(message);
      if (typeof window !== "undefined" && window.hmrcScopeCheck) {
        window.hmrcScopeCheck.clearHmrcToken();
      }
      throw new Error(message);
    }
    const message = `Failed to retrieve the tax calculation. Remote call failed: GET ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
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
        responseJson.userMessage ||
        "Your HMRC authorization does not include the required permissions. Please try again to re-authorize.";
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
    const message = `Failed to submit the final declaration. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }
  return responseJson;
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.submitVat = submitVat;
  window.getGovClientHeaders = getGovClientHeaders;
  window.getClientIP = getClientIP;
  window.getIPViaWebRTC = getIPViaWebRTC;
  window.getBusinessDetails = getBusinessDetails;
  window.getObligations = getObligations;
  window.postSelfEmploymentPeriod = postSelfEmploymentPeriod;
  window.getSelfEmploymentAnnual = getSelfEmploymentAnnual;
  window.putSelfEmploymentAnnual = putSelfEmploymentAnnual;
  window.triggerBsas = triggerBsas;
  window.getBsasSelfEmployment = getBsasSelfEmployment;
  window.adjustBsasSelfEmployment = adjustBsasSelfEmployment;
  window.triggerCalculation = triggerCalculation;
  window.getCalculation = getCalculation;
  window.postFinalDeclaration = postFinalDeclaration;
}
