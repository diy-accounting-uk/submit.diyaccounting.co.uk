// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-10 Fetch HTTP with a timeout
// - **Use when:** any outbound Companies House API call needs a bounded wait instead of hanging.
// - **Does:** httpFetch.js wraps the native fetch function with a configurable timeout. Every Companies House API, filing and XML Gateway service uses it for outbound calls.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/lib/httpFetch.js:fetchWithTimeout`
// - **Files:** app/lib/httpFetch.js
// - **Keywords:** fetch, timeout, http client, companies house, outbound call, abort
// - **Related:** CH-11
// @end-capability

// app/lib/httpFetch.js
// Shared HTTP fetch utility with timeout and abort support

import { createLogger } from "./logger.js";
import { loggedOutboundPathOf } from "./loggedPath.js";

const logger = createLogger({ source: "app/lib/httpFetch.js" });

/**
 * A URL as this module logs it and puts in an error: the origin and the path, with each company,
 * transaction, document or agent id in the path named in braces, and no query string or fragment,
 * because a query can carry a signed credential or an identifier.
 * @param {string|URL} url
 * @returns {string}
 */
export function urlWithoutQuery(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return "[unparsable URL]";
  }
  return `${parsed.origin}${loggedOutboundPathOf(parsed.pathname)}`;
}

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
      const loggedUrl = urlWithoutQuery(url);
      logger.warn({
        message: "HTTP request timed out",
        url: loggedUrl,
        timeoutMs,
        duration,
      });
      throw new HttpTimeoutError(`Request to ${loggedUrl} timed out after ${timeoutMs}ms`, loggedUrl, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Perform an HTTP fetch and read its body as text, with one timeout over the headers and the whole
 * body, and a limit on the body's bytes as the response stream gives them (after any content
 * decoding, so a small compressed body that expands past the limit stops too). The read stops at the
 * limit and the request is aborted, so no more of the body is read.
 *
 * @param {string} url
 * @param {Object} options - fetch options
 * @param {number} timeoutMs - the time allowed for the headers and the body together
 * @param {{maxBytes: number}} limits - the most bytes of body read
 * @returns {Promise<{response: Response, text: string|null, tooLarge: boolean, duration: number}>} text is
 *   null when the body passed maxBytes
 * @throws {HttpTimeoutError} If the headers or the body do not arrive in time
 */
export async function fetchTextWithTimeout(url, options, timeoutMs, { maxBytes }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const chunks = [];
    let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          controller.abort();
          return { response, text: null, tooLarge: true, duration: Date.now() - startTime };
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    return { response, text, tooLarge: false, duration: Date.now() - startTime };
  } catch (error) {
    if (error.name === "AbortError") {
      const loggedUrl = urlWithoutQuery(url);
      logger.warn({ message: "HTTP request timed out", url: loggedUrl, timeoutMs, duration: Date.now() - startTime });
      throw new HttpTimeoutError(`Request to ${loggedUrl} timed out after ${timeoutMs}ms`, loggedUrl, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Perform an HTTP fetch, retrying when the network layer fails. Node's fetch throws a TypeError
 * for a connection failure; a returned Response of any status is never retried, and any other
 * error type is rethrown at once. The last failure is rethrown unchanged.
 *
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @param {Object} [retry] - Retry settings
 * @param {number} [retry.attempts=3] - Total attempts, including the first
 * @param {number} [retry.backoffMs=500] - Wait before the second attempt; doubles for each later one
 * @param {function(number): Promise<void>} [retry.sleep] - Wait function, replaceable in tests
 * @returns {Promise<Response>} The fetch response
 *
 * @example
 * const response = await fetchRetryingNetworkErrors('https://api.example.com/data', { method: 'GET' });
 */
export async function fetchRetryingNetworkErrors(
  url,
  options = {},
  { attempts = 3, backoffMs = 500, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (!(error instanceof TypeError) || attempt >= attempts) throw error;
      logger.warn({
        message: "HTTP request failed at the network layer, retrying",
        url: urlWithoutQuery(url),
        attempt,
        error: error.message,
      });
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
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
