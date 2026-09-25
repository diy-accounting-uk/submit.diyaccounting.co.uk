// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/buildFraudHeaders.js

import { createLogger } from "./logger.js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
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

  // A single transient network hiccup (e.g. a timeout reaching checkip.amazonaws.com) must not
  // permanently disable a legally required fraud-prevention header for the rest of the process's
  // life, so retry once before giving up.
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { response } = await fetchWithTimeout("https://checkip.amazonaws.com", {}, 3000);
      if (response.ok) {
        cachedVendorPublicIp = (await response.text()).trim();
        logger.info({ message: "Detected vendor public IP", vendorPublicIp: cachedVendorPublicIp });
        break;
      } else {
        logger.warn({ message: "Failed to detect vendor public IP: non-OK response", status: response.status, attempt });
      }
    } catch (error) {
      logger.warn({ message: "Failed to detect vendor public IP", error: error.message, attempt });
    }
  }

  vendorIpDetectionAttempted = true;
  return cachedVendorPublicIp;
}

/**
 * Build Gov-Client-Multi-Factor from the authorizer context (O28 step 2b). customAuthorizer.js
 * verifies the caller's ID token and carries its custom:mfa_method and identities claims
 * (mfa_method, mfa_federated) plus auth_time through the flat authorizer context -- a token
 * claim can't be forged, so this is preferred over the client-sent value in
 * getGovClientHeaders() wherever it's available.
 *
 * @param {object} authzCtx - flat authorizer context (event.requestContext.authorizer.lambda)
 * @param {string} userId - the Cognito sub, for the unique-reference hash
 * @returns {string|null} the header value, or null when the context can't produce one
 */
function buildServerMultiFactorHeader(authzCtx, userId) {
  if (!authzCtx || !userId) return null;

  let factorType = null;
  if (authzCtx.mfa_method === "TOTP") {
    factorType = "TOTP";
  } else if (authzCtx.mfa_federated === "true") {
    factorType = "OTHER";
  }
  if (!factorType || !authzCtx.auth_time) return null;

  const timestamp = new Date(Number(authzCtx.auth_time) * 1000).toISOString();
  // Same derivation as the client-side stableUniqueReference() this replaces (loginWithCognitoCallback.html):
  // SHA-256(sub + ":" + factorType), stable per user per factor type.
  const uniqueReference = createHash("sha256").update(`${userId}:${factorType}`).digest("hex");
  return `type=${factorType}&timestamp=${encodeURIComponent(timestamp)}&unique-reference=${encodeURIComponent(uniqueReference)}`;
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

  // 5. Connection method. HMRC's fraud-prevention spec (developer.service.hmrc.gov.uk/guides/
  // fraud-prevention/connection-method/) offers eight values; the two that fit here are
  // WEB_APP_VIA_SERVER ("your application is web based, connecting to HMRC through
  // intermediary servers") for the browser, and DESKTOP_APP_VIA_SERVER ("your application is
  // installed on a desktop connecting to HMRC through intermediary servers") for the
  // submission MCP: a process the user runs on their own machine, which calls this server,
  // which calls HMRC -- never the browser client, and never HMRC directly. The access token's
  // client_id claim (flattened into context by customAuthorizer.js for every route this
  // authorizer protects) names which Cognito app client signed in; only the MCP's own client
  // gets DESKTOP_APP_VIA_SERVER, so a copied Submit token still reads as WEB_APP_VIA_SERVER.
  const mcpClientId = process.env.COGNITO_MCP_CLIENT_ID;
  headers["Gov-Client-Connection-Method"] =
    mcpClientId && authzCtx?.client_id === mcpClientId ? "DESKTOP_APP_VIA_SERVER" : "WEB_APP_VIA_SERVER";

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

  // 12. Gov-Client-Multi-Factor (O28) -- built server-side from the verified ID token claim
  // when the authorizer context has one; the client-sent value (sessionStorage, written at the
  // login callback) is the fallback for a request the authorizer couldn't establish it for.
  // Server wins because it can't be forged; a genuinely absent value on both sides means the
  // user signed in with a password only, which is a real advisory, not a bug -- warn like every
  // other required header this function can't build.
  const serverMultiFactor = buildServerMultiFactorHeader(authzCtx, userId);
  const clientMultiFactor = getHeader("Gov-Client-Multi-Factor");
  const multiFactor =
    serverMultiFactor ||
    (clientMultiFactor && clientMultiFactor !== "undefined" && clientMultiFactor !== "null" ? clientMultiFactor : null);
  if (multiFactor) {
    headers["Gov-Client-Multi-Factor"] = multiFactor;
  } else {
    logger.warn({
      message:
        "HMRC REQUIRED HEADER MISSING: Gov-Client-Multi-Factor — neither the authorizer nor the client supplied an MFA event; likely a password-only sign-in with no second factor",
    });
  }

  logger.debug({ message: "Built fraud prevention headers", headers });
  return { govClientHeaders: headers, govClientErrorMessages: [] };
}
