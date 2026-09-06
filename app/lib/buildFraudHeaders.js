// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/buildFraudHeaders.js

import { createLogger } from "./logger.js";
import { readFileSync } from "fs";
import { hashSub, isSaltInitialized } from "../services/subHasher.js";
import { fetchWithTimeout } from "./httpFetch.js";

const { name: rawPackageName, version: packageVersion } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url)));
// Strip npm scope prefix (e.g., @org/package -> package) for cleaner HMRC product name
const packageName = rawPackageName.startsWith("@") ? rawPackageName.split("/")[1] : rawPackageName;

const logger = createLogger({ source: "app/lib/buildFraudHeaders.js" });

// Module-level cache for the Lambda's outbound public IP (detected once per cold start)
let cachedVendorPublicIp = null;
let vendorIpDetectionAttempted = false;

/**
 * Reset module-level state. Only for use in tests.
 */
export function _resetForTesting() {
  cachedVendorPublicIp = null;
  vendorIpDetectionAttempted = false;
}

/**
 * Detect this Lambda's outbound public IP by calling checkip.amazonaws.com.
 * Called once per cold start and cached for subsequent warm invocations.
 * @returns {Promise<string|null>} The detected IP or null if detection fails
 */
export async function detectVendorPublicIp() {
  if (vendorIpDetectionAttempted) {
    return cachedVendorPublicIp;
  }
  vendorIpDetectionAttempted = true;

  try {
    const { response } = await fetchWithTimeout("https://checkip.amazonaws.com", {}, 3000);
    if (response.ok) {
      cachedVendorPublicIp = (await response.text()).trim();
      logger.info({ message: "Detected vendor public IP", vendorPublicIp: cachedVendorPublicIp });
    } else {
      logger.warn({ message: "Failed to detect vendor public IP: non-OK response", status: response.status });
    }
  } catch (error) {
    logger.warn({ message: "Failed to detect vendor public IP", error: error.message });
  }

  return cachedVendorPublicIp;
}

/**
 * Build Gov-Client and Gov-Vendor fraud prevention headers from the incoming API Gateway event.
 * Follows HMRC's fraud prevention header specifications for WEB_APP_VIA_SERVER connection method.
 *
 * Gov-Vendor-Public-IP is the Lambda's outbound IP (detected at cold start via checkip.amazonaws.com).
 * Gov-Client-Public-IP is the end user's IP (extracted from X-Forwarded-For set by CloudFront).
 * These MUST be different values — HMRC rejects submissions where they are the same.
 *
 * @param {object} event – Lambda proxy event containing headers and request context
 * @returns {object} – An object containing all required fraud prevention headers
 */
export function buildFraudHeaders(event, options = {}) {
  const headers = {};
  const eventHeaders = event.headers || {};

  // Helper to get header case-insensitively
  const getHeader = (name) => {
    if (!eventHeaders || !name) return null;
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(eventHeaders)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }
    return null;
  };

  // 1. Client public IP – extract the first non-private IP from X-Forwarded-For header
  const xff = getHeader("x-forwarded-for") || "";
  const clientIps = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Find first public IP (excluding private IP ranges)
  const publicClientIp = clientIps.find((ip) => {
    // Exclude private IP ranges: 10.x.x.x, 192.168.x.x, 172.16-31.x.x, and localhost
    return (
      !ip.startsWith("10.") &&
      !ip.startsWith("192.168.") &&
      !ip.match(/^172\.(1\d|2\d|3[0-1])\./) &&
      !ip.startsWith("127.") &&
      !ip.startsWith("::1") &&
      !ip.startsWith("fe80:")
    );
  });

  if (publicClientIp) {
    headers["Gov-Client-Public-IP"] = publicClientIp;
    logger.debug({ message: "Detected public client IP", publicClientIp, xff });
  } else {
    logger.warn({
      message: "HMRC REQUIRED HEADER MISSING: Gov-Client-Public-IP — no public IP found in X-Forwarded-For",
      xff,
    });
  }

  // 2. Client public port – extract from CloudFront-Viewer-Address header (format: "ip:port" or "[ipv6]:port")
  const viewerAddress = getHeader("cloudfront-viewer-address");
  if (viewerAddress) {
    const port = viewerAddress.split(":").pop();
    if (port && /^\d+$/.test(port)) {
      headers["Gov-Client-Public-Port"] = port;
    }
  } else {
    logger.warn({
      message:
        "HMRC REQUIRED HEADER MISSING: Gov-Client-Public-Port — CloudFront-Viewer-Address header not present. Ensure CloudFront Origin Request Policy forwards this header.",
    });
  }

  // 3. Client device ID – from custom header sent by browser
  const deviceId = getHeader("x-device-id") || getHeader("Gov-Client-Device-ID");
  if (deviceId && deviceId !== "unknown-device") {
    headers["Gov-Client-Device-ID"] = deviceId;
  } else {
    logger.warn({ message: "HMRC REQUIRED HEADER MISSING: Gov-Client-Device-ID — not provided by client" });
  }

  // 4. Client user IDs – from authenticated user (Cognito sub)
  // Custom Lambda authorizer (customAuthorizer.js) returns flat context: { sub, username, email, ... }
  // API Gateway places this at event.requestContext.authorizer.lambda
  const authz = event.requestContext?.authorizer;
  const authzCtx = authz?.lambda ?? authz;
  const userId = authzCtx?.sub;
  if (userId) {
    headers["Gov-Client-User-IDs"] = `cognito=${encodeURIComponent(userId)}`;
  } else {
    logger.warn({
      message:
        "HMRC REQUIRED HEADER MISSING: Gov-Client-User-IDs — no Cognito sub found in authorizer context. The custom authorizer should reject unauthenticated requests before this point.",
    });
  }

  // 5. Connection method – WEB_APP_VIA_SERVER for both client and vendor
  headers["Gov-Client-Connection-Method"] = "WEB_APP_VIA_SERVER";

  // 6. Vendor public IP – the Lambda's outbound IP (detected at cold start)
  // MUST NOT fall back to publicClientIp — HMRC rejects submissions where vendor IP = client IP
  const vendorPublicIp = cachedVendorPublicIp;
  if (vendorPublicIp) {
    headers["Gov-Vendor-Public-IP"] = vendorPublicIp;
  } else {
    logger.warn({
      message:
        "HMRC REQUIRED HEADER MISSING: Gov-Vendor-Public-IP — vendor IP not detected. Call detectVendorPublicIp() during Lambda initialization.",
    });
  }

  // 7. Vendor forwarded chain – build from X-Forwarded-For
  if (vendorPublicIp && clientIps.length > 0) {
    headers["Gov-Vendor-Forwarded"] = clientIps
      .map((ip) => `by=${encodeURIComponent(vendorPublicIp)}&for=${encodeURIComponent(ip)}`)
      .join(",");
  } else if (clientIps.length > 0) {
    logger.warn({
      message: "HMRC REQUIRED HEADER MISSING: Gov-Vendor-Forwarded — cannot build without vendor public IP",
    });
  }

  // 8. Vendor license IDs – the user's active bundle IDs from the product catalog (hashed per HMRC spec)
  if (options.bundleIds && options.bundleIds.length > 0 && isSaltInitialized()) {
    headers["Gov-Vendor-License-IDs"] = options.bundleIds.map((id) => `diyaccounting=${encodeURIComponent(hashSub(id))}`).join("&");
  }

  // 9. Vendor product name – from package.json (must be percent-encoded)
  headers["Gov-Vendor-Product-Name"] = encodeURIComponent(packageName);

  // 10. Vendor version – from package.json (must be key-value structure)
  headers["Gov-Vendor-Version"] = `${encodeURIComponent(packageName)}=${encodeURIComponent(packageVersion)}`;

  // 11. Pass through any client-side headers from the browser
  const clientHeaderNames = [
    "Gov-Client-Browser-JS-User-Agent",
    "Gov-Client-Multi-Factor",
    "Gov-Client-Public-IP-Timestamp",
    "Gov-Client-Screens",
    "Gov-Client-Timezone",
    "Gov-Client-Window-Size",
    "Gov-Client-Browser-Do-Not-Track",
    "Gov-Test-Scenario",
  ];

  for (const headerName of clientHeaderNames) {
    const value = getHeader(headerName);
    if (value && value !== "undefined" && value !== "null") {
      headers[headerName] = value;
    }
  }

  logger.debug({ message: "Built fraud prevention headers", headers });
  return { govClientHeaders: headers, govClientErrorMessages: [] };
}
