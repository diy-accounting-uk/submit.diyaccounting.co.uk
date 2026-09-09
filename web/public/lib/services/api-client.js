// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// API client for making authorized requests

import { fetchWithId } from "../utils/correlation-utils.js";
import { ensureSession } from "./auth-service.js";

/**
 * Handle 403 Forbidden errors with user guidance
 * @param {Response} response - Fetch response
 */
export async function handle403Error(response) {
  try {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.message || "Access forbidden. You may need to add a bundle to access this feature.";
    console.warn("403 Forbidden:", message);

    // Show user-friendly error and guide to bundles page
    if (typeof window !== "undefined" && window.showStatus) {
      window.showStatus(`${message} Click here to add bundles.`, "error");
      // Add a link to bundles page in the error message
      setTimeout(() => {
        const statusContainer = document.getElementById("statusMessagesContainer");
        if (statusContainer) {
          const lastMessage = statusContainer.lastElementChild;
          if (lastMessage && lastMessage.classList.contains("status-error")) {
            lastMessage.style.cursor = "pointer";
            lastMessage.onclick = () => {
              window.location.href = "/bundles.html";
            };
          }
        }
      }, 100);
    }
  } catch (e) {
    console.warn("Failed to handle 403 error:", e);
  }
}

/**
 * Helper for polling asynchronous requests (HTTP 202 Accepted)
 * @param {Response} res - Initial response
 * @param {string|Request} input - Fetch input
 * @param {object} init - Fetch init options
 * @param {Headers} currentHeaders - Headers to use for polling
 * @returns {Promise<Response>} Final response
 */
export async function executeAsyncRequestPolling(res, input, init, currentHeaders) {
  if (init.fireAndForget) return res;

  // Remove the initial request signal for subsequent polls
  currentHeaders.delete("x-initial-request");

  const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  let urlPath = typeof input === "string" ? input : input.url || input.toString();
  try {
    const parsedUrl = new URL(urlPath, window.location.origin);
    urlPath = parsedUrl.pathname + parsedUrl.search;
  } catch (error) {
    console.error(`Failed to parse URL for async request: ${urlPath}. Using original URL. Error: ${JSON.stringify(error)}`);
  }
  const requestDesc = `[${method} ${urlPath}]`;

  // 1. Set dynamic timeout based on request type
  let timeoutMs = 60000; // Default changed from 90s to 60s
  if (urlPath.includes("/hmrc/vat/return") && method === "POST") {
    timeoutMs = 1_630_000; // 90s + 3 x 300s (Submit VAT) + 2 x 320s (visibility), minutes: 27+
  } else if (urlPath.includes("/hmrc/vat/obligation") || (urlPath.includes("/hmrc/vat/return") && method === "GET")) {
    timeoutMs = 730_000; // 90s + 3 x 120s (Get VAT and Obligations) + 2 x 140s (visibility), minutes: 12+
  }
  console.log(`waiting async request ${requestDesc} (timeout: ${timeoutMs}ms)...`);
  const requestId = res.headers.get("x-request-id");
  if (requestId) {
    currentHeaders.set("x-request-id", requestId);
  }

  let pollCount = 0;
  const startTime = Date.now();

  while (res.status === 202) {
    const elapsed = Date.now() - startTime;
    if (init.signal?.aborted) {
      console.log(`aborted async request ${requestDesc} (poll #${pollCount}, elapsed: ${elapsed}ms)`);
      return res;
    }

    if (elapsed > timeoutMs) {
      console.error(`timed out async request ${requestDesc} (poll #${pollCount}, elapsed: ${elapsed}ms, timeout: ${timeoutMs}ms)`);
      return res;
    }

    pollCount++;
    // 2. Set check frequency: 1s, 2s, 4s, 4s...
    // Only applied to HMRC calls as requested
    const delay = urlPath.includes("/hmrc/") ? Math.min(Math.pow(2, pollCount - 1) * 1000, 4000) : 1000;

    if (typeof window !== "undefined" && window.showStatus) {
      window.showStatus(init.pollPendingMessage || `Still processing... (poll #${pollCount})`, "info");
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, delay);
      if (init.signal) {
        init.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            const abortElapsed = Date.now() - startTime;
            console.log(`aborted async request ${requestDesc} (poll #${pollCount}, elapsed: ${abortElapsed}ms)`);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }
    });

    if (init.signal?.aborted) continue;

    console.log(
      `re-trying async request ${requestDesc} (poll #${pollCount}, elapsed: ${Date.now() - startTime}ms, timeout: ${timeoutMs}ms, last status: ${res.status})...`,
    );
    res = await fetch(input, { ...init, headers: currentHeaders });
  }

  console.log(`finished async request ${requestDesc} (poll #${pollCount}, elapsed: ${Date.now() - startTime}ms, status: ${res.status})`);
  if (typeof window !== "undefined" && window.showStatus) {
    if (res.ok && init.pollSuccessMessage) {
      window.showStatus(init.pollSuccessMessage, "success");
    } else if (!res.ok && init.pollErrorMessage) {
      window.showStatus(init.pollErrorMessage, "error");
    }
  }
  return res;
}

/**
 * Centralized fetch with Cognito header injection and 401/403 handling
 * @param {string|Request} input - Fetch input
 * @param {object} init - Fetch init options
 * @returns {Promise<Response>} Fetch response
 */
export async function authorizedFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const accessToken = localStorage.getItem("cognitoAccessToken");
  // Uses X-Authorization (not Authorization) to match API Gateway Lambda authorizer configuration
  // See ApiStack.java identitySource("$request.header.X-Authorization")
  if (accessToken) headers.set("X-Authorization", `Bearer ${accessToken}`);
  if (init.fireAndForget) headers.set("x-wait-time-ms", "0");
  headers.set("x-initial-request", "true");

  let first = await fetchWithId(input, { ...init, headers });

  // Handle async polling for 202 Accepted
  if (first.status === 202) {
    const rid = first.headers.get("x-request-id");
    if (rid) headers.set("x-request-id", rid);
    first = await executeAsyncRequestPolling(first, input, init, headers);
  }

  // Handle 403 Forbidden - likely missing bundle entitlement
  if (first.status === 403) {
    await handle403Error(first.clone());
    return first; // Return the 403 response with body still readable for caller
  }

  // Handle 401 Unauthorized - token expired or invalid
  if (first.status !== 401) return first;

  // One-time retry after forcing refresh
  console.log("Received 401, attempting token refresh...");
  try {
    const refreshed = await ensureSession({ force: true });
    if (!refreshed) {
      console.warn("Token refresh failed, user needs to re-authenticate");
      if (typeof window !== "undefined" && window.showStatus) {
        window.showStatus("Your session has expired. Please log in again.", "warning");
        setTimeout(() => {
          window.location.href = "/auth/login.html";
        }, 2000);
      }
      return first;
    }
  } catch (e) {
    console.warn("Token refresh error:", e);
    return first;
  }

  const headers2 = new Headers(init.headers || {});
  const at2 = localStorage.getItem("cognitoAccessToken");
  if (at2) headers2.set("X-Authorization", `Bearer ${at2}`);
  headers2.set("x-initial-request", "true");

  // Carry over requestId if we had one from a previous 202 poll
  const lastRequestId = headers.get("x-request-id");
  if (lastRequestId) {
    headers2.set("x-request-id", lastRequestId);
    headers2.delete("x-initial-request");
  }

  let second = await fetchWithId(input, { ...init, headers: headers2 });

  if (second.status === 202) {
    const rid = second.headers.get("x-request-id");
    if (rid) headers2.set("x-request-id", rid);
    second = await executeAsyncRequestPolling(second, input, init, headers2);
  }

  return second;
}

/**
 * Fetch with ID token and automatic 401/403 handling
 * This is specifically for endpoints that use the Authorization header with idToken
 * @param {string|Request} input - Fetch input
 * @param {object} init - Fetch init options
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithIdToken(input, init = {}) {
  // Helper to get the current idToken
  const getIdToken = () => {
    try {
      return localStorage.getItem("cognitoIdToken");
    } catch {
      return null;
    }
  };

  const headers = new Headers(init.headers || {});
  const idToken = getIdToken();
  if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
  if (init.fireAndForget) headers.set("x-wait-time-ms", "0");
  headers.set("x-initial-request", "true");

  const executeFetch = async (currentHeaders) => {
    let res = await fetch(input, { ...init, headers: currentHeaders });

    if (res.status === 202) {
      res = await executeAsyncRequestPolling(res, input, init, currentHeaders);
    }
    return res;
  };

  const response = await executeFetch(headers);

  // Handle 403 Forbidden - likely missing bundle entitlement
  if (response.status === 403) {
    await handle403Error(response.clone());
    return response; // Return the 403 response with body still readable for caller
  }

  // Handle 401 Unauthorized - token expired or invalid
  if (response.status !== 401) return response;

  // One-time retry after forcing refresh
  console.log("Received 401, attempting token refresh...");
  try {
    const refreshed = await ensureSession({ force: true });
    if (!refreshed) {
      console.warn("Token refresh failed, user needs to re-authenticate");
      if (typeof window !== "undefined" && window.showStatus) {
        window.showStatus("Your session has expired. Please log in again.", "warning");
        setTimeout(() => {
          window.location.href = "/auth/login.html";
        }, 2000);
      }
      return response;
    }
  } catch (e) {
    console.warn("Token refresh error:", e);
    return response;
  }

  const headers2 = new Headers(init.headers || {});
  const idToken2 = getIdToken();
  if (idToken2) headers2.set("Authorization", `Bearer ${idToken2}`);
  if (init.fireAndForget) headers2.set("x-wait-time-ms", "0");
  headers2.set("x-initial-request", "true");

  // Carry over requestId if we had one from a previous 202 poll
  const lastRequestId = headers.get("x-request-id");
  if (lastRequestId) {
    headers2.set("x-request-id", lastRequestId);
    headers2.delete("x-initial-request");
  }

  return executeFetch(headers2);
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.authorizedFetch = authorizedFetch;
  window.fetchWithIdToken = fetchWithIdToken;
  window.handle403Error = handle403Error;
  window.executeAsyncRequestPolling = executeAsyncRequestPolling;
}
