// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability HMRC-25 Build HMRC fraud-prevention headers
// - **Use when:** a call to any HMRC API needs Gov-Client or Gov-Vendor fraud-prevention headers.
// - **Does:** buildFraudHeaders.js constructs the Gov-Client and Gov-Vendor headers HMRC's fraud-prevention spec requires. It detects the vendor's public IP via checkip.amazonaws.com and caches it per Lambda cold start. It sends WEB_APP_VIA_SERVER for the browser, DESKTOP_APP_VIA_SERVER for the stdio MCP server and OTHER_VIA_SERVER for the hosted MCP endpoint, whose caller's address arrives signed in x-mcp-hosted-client.
// - **Run:** `import { buildFraudHeaders } from "app/lib/buildFraudHeaders.js"`
// - **Entry:** `app/lib/buildFraudHeaders.js:buildFraudHeaders`
// - **Files:** app/lib/buildFraudHeaders.js, app/lib/hostedClientAddress.js, app/unit-tests/lib/buildFraudHeaders.test.js, app/unit-tests/lib/hostedClientAddress.test.js
// - **Keywords:** fraud prevention headers, gov-client, gov-vendor, device id, vendor ip, checkip
// - **Related:** HMRC-26, HMRC-29
// @end-capability

// app/lib/buildFraudHeaders.js

import { createLogger } from "./logger.js";
import { createHash } from "crypto";
import { hashSub, isSaltInitialized } from "../services/subHasher.js";
import { fetchWithTimeout } from "./httpFetch.js";
import {
  HOSTED_CLIENT_ADDRESS_HEADER,
  firstPublicIp,
  forwardedIpsOf,
  readHostedClientAddress,
  viewerPortOf,
} from "./hostedClientAddress.js";
import { PACKAGE_NAME as packageName, PRODUCT_VERSION as packageVersion } from "./productVersion.js";

const logger = createLogger({ source: "app/lib/buildFraudHeaders.js" });

// Module-level cache for the Lambda's outbound public IP (detected once per cold start)
let cachedVendorPublicIp = null;
let vendorIpDetectionAttempted = false;

// The headers only the stdio MCP server can read from the machine it runs on.
const DESKTOP_CLIENT_HEADER_NAMES = [
  "Gov-Client-Local-IPs",
  "Gov-Client-Local-IPs-Timestamp",
  "Gov-Client-MAC-Addresses",
  "Gov-Client-User-Agent",
];
const ENCODED_PAIR = /^[A-Za-z0-9\-._~%]+=[A-Za-z0-9\-._~%]+$/;

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

// HMRC's fraud-prevention spec (developer.service.hmrc.gov.uk/guides/fraud-prevention/
// connection-method/) offers eight values, and three fit here. WEB_APP_VIA_SERVER ("your
// application is web based, connecting to HMRC through intermediary servers") is the browser.
// DESKTOP_APP_VIA_SERVER ("your application is installed on a desktop connecting to HMRC through
// intermediary servers") is the stdio MCP server: a process the user runs on their own machine,
// which calls this server, which calls HMRC. OTHER_VIA_SERVER ("not covered by the common
// architectures") is the hosted MCP endpoint: nothing of ours is installed on the user's device,
// and no page of ours runs in a browser. The access token's client_id claim names the Cognito app
// client, and both MCP surfaces share one client, so only a value that the hosted Lambda signed
// marks a request as hosted. A copied Submit token still reads as WEB_APP_VIA_SERVER.
function resolveConnection(authzCtx, signedAddress) {
  const mcpClientId = process.env.COGNITO_MCP_CLIENT_ID;
  const mcpClient = Boolean(mcpClientId) && authzCtx?.client_id === mcpClientId;
  if (!mcpClient) return { mcpClient, desktopClient: false, hostedClient: null, connectionMethod: "WEB_APP_VIA_SERVER" };
  const hostedClient = readHostedClientAddress(signedAddress, authzCtx.sub);
  return {
    mcpClient,
    desktopClient: !hostedClient,
    hostedClient,
    connectionMethod: hostedClient ? "OTHER_VIA_SERVER" : "DESKTOP_APP_VIA_SERVER",
  };
}

// The server's value with one percent-encoded pair the client sent, when it sent one.
function withClientPair(serverValue, clientPair) {
  return clientPair && ENCODED_PAIR.test(clientPair) ? `${serverValue}&${clientPair}` : serverValue;
}

/**
 * Build Gov-Client and Gov-Vendor fraud prevention headers from the incoming API Gateway event.
 * Follows HMRC's fraud prevention header specifications for the caller's connection method.
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

  // Custom Lambda authorizer (customAuthorizer.js) returns flat context: { sub, username, email, ... }
  // API Gateway places this at event.requestContext.authorizer.lambda, and the claims of a route
  // behind the JWT authorizer at event.requestContext.authorizer.jwt.claims
  const authz = event.requestContext?.authorizer;
  const authzCtx = authz?.lambda ?? authz?.jwt?.claims ?? authz;
  const userId = authzCtx?.sub;

  const { mcpClient, desktopClient, hostedClient, connectionMethod } = resolveConnection(authzCtx, getHeader(HOSTED_CLIENT_ADDRESS_HEADER));

  // 1. Client public IP – the signed address of the caller at /mcp, otherwise the first public IP
  // in the X-Forwarded-For header set by CloudFront
  const xff = getHeader("x-forwarded-for") || "";
  const clientIps = forwardedIpsOf(xff);
  const publicClientIp = hostedClient ? hostedClient.ip : firstPublicIp(clientIps);

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
  const publicClientPort = hostedClient ? hostedClient.port : viewerPortOf(viewerAddress);
  if (publicClientPort) {
    headers["Gov-Client-Public-Port"] = publicClientPort;
  } else if (!viewerAddress) {
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

  // 4. Client user IDs – from authenticated user (Cognito sub), and the operating system user the
  // stdio MCP server reads from its own machine
  if (userId) {
    const osUser = desktopClient ? getHeader("Gov-Client-User-IDs") : null;
    headers["Gov-Client-User-IDs"] = withClientPair(`cognito=${encodeURIComponent(userId)}`, osUser?.startsWith("os=") ? osUser : null);
  } else {
    logger.warn({
      message:
        "HMRC REQUIRED HEADER MISSING: Gov-Client-User-IDs — no Cognito sub found in authorizer context. The custom authorizer should reject unauthenticated requests before this point.",
    });
  }

  // 5. Connection method
  headers["Gov-Client-Connection-Method"] = connectionMethod;

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
  // A hosted MCP request has one more hop: the caller reaches the MCP Lambda, and that Lambda reaches
  // this API, so the caller's signed address comes first.
  const forwardedIps = hostedClient?.ip ? [hostedClient.ip, ...clientIps] : clientIps;
  if (vendorPublicIp && forwardedIps.length > 0) {
    headers["Gov-Vendor-Forwarded"] = forwardedIps
      .map((ip) => `by=${encodeURIComponent(vendorPublicIp)}&for=${encodeURIComponent(ip)}`)
      .join(",");
  } else if (forwardedIps.length > 0) {
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

  // 10. Vendor version – from package.json (must be key-value structure). HMRC's desktop and other
  // connection method pages ask for a pair for the server and a pair for the client application,
  // and the MCP sends its own pair.
  const serverVersion = `${encodeURIComponent(packageName)}=${encodeURIComponent(packageVersion)}`;
  headers["Gov-Vendor-Version"] = withClientPair(serverVersion, mcpClient ? getHeader("Gov-Vendor-Version") : null);

  // 11. Pass through any client-side headers from the browser
  const clientHeaderNames = [
    "Gov-Client-Browser-JS-User-Agent",
    "Gov-Client-Public-IP-Timestamp",
    "Gov-Client-Screens",
    "Gov-Client-Timezone",
    "Gov-Client-Window-Size",
    "Gov-Client-Browser-Do-Not-Track",
    "Gov-Test-Scenario",
    ...(desktopClient ? DESKTOP_CLIENT_HEADER_NAMES : []),
  ];

  for (const headerName of clientHeaderNames) {
    const value = getHeader(headerName);
    if (value && value !== "undefined" && value !== "null") {
      headers[headerName] = value;
    }
  }

  // The browser collects its own timestamp. For an MCP request this server is where the public IP
  // is collected, and for a hosted request the MCP Lambda is.
  if (mcpClient) {
    headers["Gov-Client-Public-IP-Timestamp"] = hostedClient ? hostedClient.collectedAt : new Date().toISOString();
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
