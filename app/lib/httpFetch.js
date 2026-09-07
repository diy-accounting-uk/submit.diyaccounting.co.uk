// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/httpFetch.js
// Shared HTTP fetch utility with timeout and abort support

import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/httpFetch.js" });

/**
 * Custom error class for HTTP timeout errors
 */
export class HttpTimeoutError extends Error {
  constructor(message = "Request timed out", url = null, timeoutMs = null) {
    super(message);
    this.name = "HttpTimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Perform an HTTP fetch with timeout support
 *
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<{response: Response, duration: number}>} The fetch response and duration
 * @throws {HttpTimeoutError} If the request times out
 *
 * @example
 * const { response, duration } = await fetchWithTimeout(
 *   'https://api.example.com/data',
 *   { method: 'GET', headers: { 'Accept': 'application/json' } },
 *   10000 // 10 second timeout
 * );
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = Date.now();
  let response;

  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return {
      response,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const duration = Date.now() - startTime;
      logger.warn({
        message: "HTTP request timed out",
        url,
        timeoutMs,
        duration,
      });
      throw new HttpTimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`, url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Normalize fetch response headers to a plain object
 * Headers objects are not directly serializable to JSON
 *
 * @param {Headers|Object} headers - The headers object from fetch response
 * @returns {Object} Plain object with header key-value pairs
 */
export function normalizeHeaders(headers) {
  if (!headers) return {};

  const result = {};

  try {
    if (typeof headers.forEach === "function") {
      headers.forEach((value, key) => {
        result[key] = value;
      });
    } else if (typeof headers === "object") {
      Object.assign(result, headers);
    }
  } catch (error) {
    logger.error({
      message: "Error normalizing HTTP response headers",
      error: error.message,
    });
  }

  return result;
}

/**
 * Perform an HTTP fetch and parse JSON response with timeout
 *
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<{ok: boolean, status: number, data: Object, headers: Object, duration: number}>}
 *
 * @example
 * const result = await fetchJsonWithTimeout(
 *   'https://api.example.com/data',
 *   { method: 'GET' },
 *   10000
 * );
 * if (result.ok) {
 *   console.log(result.data);
 * }
 */
export async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 30000) {
  const { response, duration } = await fetchWithTimeout(url, options, timeoutMs);

  // Try to parse JSON body, fallback to empty object
  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data,
    headers: normalizeHeaders(response.headers),
    duration,
    response,
  };
}

/**
 * Perform an HTTP fetch and read the response as text, with timeout. The text sibling of
 * fetchJsonWithTimeout, for endpoints that answer XML or other non-JSON bodies.
 *
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<{ok: boolean, status: number, data: string, headers: Object, duration: number}>}
 */
export async function fetchTextWithTimeout(url, options = {}, timeoutMs = 30000) {
  const { response, duration } = await fetchWithTimeout(url, options, timeoutMs);

  const data = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    data,
    headers: normalizeHeaders(response.headers),
    duration,
    response,
  };
}

// Default timeout values for different use cases
export const DEFAULT_TIMEOUTS = {
  // Quick API calls (validation, lightweight endpoints)
  SHORT: 20000,
  // Standard API calls
  MEDIUM: 30000,
  // Long-running API calls (HMRC GET operations)
  LONG: 115000,
  // Very long API calls (HMRC POST operations, submissions)
  VERY_LONG: 295000,
};
