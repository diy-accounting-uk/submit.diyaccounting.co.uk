// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Correlation and tracing utilities for request tracking

import { randomHex } from "./crypto-utils.js";

/**
 * Generate a W3C traceparent header value
 * @returns {string} Traceparent header value
 */
export function generateTraceparent() {
  const version = "00";
  const traceId = randomHex(16); // 16 bytes = 32 hex
  const parentId = randomHex(8); // 8 bytes = 16 hex
  const flags = "01"; // sampled
  return `${version}-${traceId}-${parentId}-${flags}`;
}

/**
 * Get or create traceparent from session storage
 * @returns {string} Traceparent value
 */
export function getOrCreateTraceparent() {
  const ss = typeof window !== "undefined" ? window.sessionStorage : undefined;
  let tp = ss?.getItem?.("traceparent");
  if (!tp) {
    tp = generateTraceparent();
    try {
      ss?.setItem?.("traceparent", tp);
    } catch (err) {
      console.warn("Failed to save traceparent to sessionStorage:", err.message);
    }
  }
  return tp;
}

/**
 * Generate a unique request ID
 * @returns {string} Request ID
 */
export function generateRequestId() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch (err) {
    console.warn("Failed to use crypto.randomUUID for request ID generation:", err.message);
  }
  // Fallback to 32-hex entropy
  return randomHex(16) + randomHex(16);
}

/**
 * Get and clear redirect request ID from session storage
 * @returns {string|null} Request ID or null
 */
export function nextRedirectRequestId() {
  const ss = typeof window !== "undefined" ? window.sessionStorage : undefined;
  const carried = ss?.getItem?.("redirectXRequestId");
  if (carried) {
    try {
      ss?.removeItem?.("redirectXRequestId");
    } catch (err) {
      console.warn("Failed to remove redirectXRequestId from sessionStorage:", err.message);
    }
    return carried;
  }
  return null;
}

// State for tracking last request ID
let lastXRequestId = "";
let lastXRequestIdSeenAt = "";

// Initialize from session storage
if (typeof window !== "undefined") {
  lastXRequestId = window.sessionStorage?.getItem?.("lastXRequestId") || "";
  lastXRequestIdSeenAt = window.sessionStorage?.getItem?.("lastXRequestIdSeenAt") || "";
}

/**
 * Set the last seen request ID
 * @param {string} v - Request ID value
 */
export function setLastXRequestId(v) {
  lastXRequestId = v || "";
  try {
    if (v) window.sessionStorage?.setItem?.("lastXRequestId", v);
  } catch (err) {
    console.warn("Failed to save lastXRequestId to sessionStorage:", err.message);
  }
  // Record the time we last saw an x-request-id so the UI can display it
  try {
    lastXRequestIdSeenAt = new Date().toISOString();
    window.sessionStorage?.setItem?.("lastXRequestIdSeenAt", lastXRequestIdSeenAt);
  } catch (err) {
    console.warn("Failed to save lastXRequestIdSeenAt to sessionStorage:", err.message);
  }
  try {
    window.dispatchEvent(
      new CustomEvent("correlation:update", { detail: { lastXRequestId: lastXRequestId, seenAt: lastXRequestIdSeenAt } }),
    );
  } catch (err) {
    console.warn("Failed to dispatch correlation:update event:", err.message);
  }
}

/**
 * Get the current traceparent
 * @returns {string} Traceparent value
 */
export function getTraceparent() {
  return getOrCreateTraceparent();
}

/**
 * Get the last seen request ID
 * @returns {string} Last request ID
 */
export function getLastXRequestId() {
  return lastXRequestId;
}

/**
 * Get timestamp when last request ID was seen
 * @returns {string} ISO timestamp
 */
export function getLastXRequestIdSeenAt() {
  return lastXRequestIdSeenAt;
}

/**
 * Prepare a request ID for a redirect
 * @returns {string} Request ID
 */
export function prepareRedirect() {
  const id = generateRequestId();
  try {
    window.sessionStorage?.setItem?.("redirectXRequestId", id);
  } catch (err) {
    console.warn("Failed to save redirectXRequestId to sessionStorage:", err.message);
  }
  return id;
}

/**
 * Install the correlation fetch interceptor
 * Adds traceparent and x-request-id headers to all backend requests
 */
export function installCorrelationInterceptor() {
  try {
    if (typeof window === "undefined") return;
    if (window.__fetchInterceptorInstalled) return;

    // Install fetch wrapper
    const originalFetch = window.fetch?.bind(window);
    if (typeof originalFetch !== "function") return; // Defer if fetch not available

    window.fetch = async function (input, init) {
      const req = init || {};
      const url = typeof input === "string" ? input : input?.url || "";
      const isRelative = typeof url === "string" && (url.startsWith("/") || url.startsWith("./") || url.startsWith("../"));
      const isSameOrigin = typeof url === "string" && url.startsWith(window.location.origin);
      const isBackendCall = isRelative || isSameOrigin;

      // Normalize headers
      const existingHeaders = req.headers || (typeof input !== "string" ? input?.headers : undefined) || {};
      let headerObject;
      if (typeof Headers !== "undefined" && existingHeaders instanceof Headers) {
        headerObject = {};
        existingHeaders.forEach((value, key) => {
          headerObject[key] = value;
        });
      } else if (Array.isArray(existingHeaders)) {
        headerObject = Object.fromEntries(existingHeaders);
      } else {
        headerObject = { ...existingHeaders };
      }

      if (isBackendCall) {
        // Always send traceparent for backend calls
        headerObject["traceparent"] = getOrCreateTraceparent();

        // Generate a fresh x-request-id, unless one is already present or carried
        const existingRid = headerObject["x-request-id"] || headerObject["X-Request-Id"];
        if (!existingRid) {
          let requestId = nextRedirectRequestId();
          if (!requestId) {
            const prefix = window.sessionStorage?.getItem?.("requestIdPrefix") || "";
            requestId = prefix + generateRequestId();
          }
          headerObject["x-request-id"] = requestId;
        }
      }

      const response = await originalFetch(input, { ...req, headers: headerObject });

      try {
        const rid = response?.headers?.get?.("x-request-id");
        if (rid) setLastXRequestId(rid);
      } catch {
        // ignore header read issues
      }

      return response;
    };

    window.__fetchInterceptorInstalled = true;
  } catch (e) {
    console.warn("Failed to install correlation fetch interceptor", e);
  }
}

/**
 * Fetch with client request ID header
 * @param {string} url - URL to fetch
 * @param {object} opts - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export function fetchWithId(url, opts = {}) {
  const headers = opts.headers instanceof Headers ? opts.headers : new Headers(opts.headers || {});
  try {
    let rid;
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      rid = window.crypto.randomUUID();
    } else if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      rid = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } else {
      // fallback to time-based unique-ish id (not cryptographically secure)
      rid = `${Date.now().toString(36)}-${
        typeof performance !== "undefined" && performance.now ? Math.floor(performance.now() * 1000).toString(36) : "0"
      }`;
    }
    headers.set("X-Client-Request-Id", rid);
  } catch (error) {
    console.warn("Failed to generate X-Client-Request-Id:", error);
  }

  // Add hmrcAccount header if present in sessionStorage
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");
  if (hmrcAccount) {
    headers.set("hmrcAccount", hmrcAccount);
  }

  return fetch(url, { ...opts, headers });
}

// Install interceptor on load
installCorrelationInterceptor();

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.getTraceparent = getTraceparent;
  window.getLastXRequestId = getLastXRequestId;
  window.fetchWithId = fetchWithId;
  window.__correlation = Object.assign(window.__correlation || {}, {
    prepareRedirect,
    getTraceparent,
    getLastXRequestId,
    getLastXRequestIdSeenAt,
  });
}
