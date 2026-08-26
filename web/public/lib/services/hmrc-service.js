// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
 * @param {boolean} runFraudPreventionHeaderValidation - Whether to validate fraud prevention headers (sandbox only)
 * @returns {Promise<object>} Submission response
 */
export async function submitVat(vatNumber, vatData, accessToken, govClientHeaders = {}, runFraudPreventionHeaderValidation = false) {
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
    const message = `Failed to submit VAT. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
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
}
