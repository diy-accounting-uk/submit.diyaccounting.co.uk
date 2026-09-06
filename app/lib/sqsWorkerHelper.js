// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/sqsWorkerHelper.js
// Shared helpers for SQS worker Lambda handlers

/**
 * Determine if an error is retryable (transient) or terminal.
 * @param {Error} error
 * @returns {boolean}
 */
export function isRetryableError(error) {
  // Explicitly marked retryable HMRC errors
  if (error.message?.includes("HMRC temporary error")) return true;

  // Fetch timeout
  if (error.name === "AbortError") return true;

  // Standard Node.js network errors
  const retryableCodes = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ESOCKETTIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH"];
  if (error.code && retryableCodes.includes(error.code)) return true;

  // DynamoDB throughput or other transient AWS errors might have retryable: true
  if (error.retryable) return true;

  return false;
}
