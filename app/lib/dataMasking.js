// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/dataMasking.js

/**
 * Utility for masking sensitive data in requests and responses before persistence.
 * Prevents leakage of credentials, tokens, and other sensitive information.
 */

const MASK_VALUE = "***MASKED***";

/**
 * Sensitive field names that should always be masked (case-insensitive exact matches)
 */
const SENSITIVE_FIELD_NAMES = [
  "authorization",
  "access_token",
  "refresh_token",
  "hmrctestpassword",
  "password",
  "client_secret",
  "clientsecret",
  "code", // OAuth authorization codes
];

/**
 * Field name patterns that indicate sensitive data (case-insensitive)
 * Fields ending with these patterns will be masked unless they're in the allowlist
 */
const SENSITIVE_PATTERNS = ["password", "secret", "token"];

/**
 * Known non-sensitive fields that might match sensitive patterns
 * These will NOT be masked even if they match patterns
 */
const NON_SENSITIVE_ALLOWLIST = [
  "periodkey", // HMRC period identifier - not sensitive
  "tokeninfo", // Metadata about tokens - not the token itself
  "hasaccesstoken", // Boolean flag - not the token itself
  "accesstokenlength", // Length metadata - not the token itself
  "accesstokenprefix", // Truncated prefix for logging - already safe
];

/**
 * Determines if a field name represents sensitive data that should be masked
 * @param {string} fieldName - The field name to check
 * @returns {boolean} True if the field should be masked
 */
export function isSensitiveField(fieldName) {
  if (!fieldName || typeof fieldName !== "string") {
    return false;
  }

  const lowerFieldName = fieldName.toLowerCase();

  // Check allowlist first - these are never sensitive
  if (NON_SENSITIVE_ALLOWLIST.includes(lowerFieldName)) {
    return false;
  }

  // Check exact matches
  if (SENSITIVE_FIELD_NAMES.includes(lowerFieldName)) {
    return true;
  }

  // Check pattern matches (field ends with sensitive pattern)
  return SENSITIVE_PATTERNS.some((pattern) => lowerFieldName.endsWith(pattern));
}

/**
 * Mask sensitive values in URL-encoded form body strings.
 * Handles patterns like "client_secret=xxx&code=yyy"
 *
 * @param {string} body - URL-encoded form body string
 * @returns {string} Body with sensitive values masked
 */
export function maskUrlEncodedBody(body) {
  if (!body || typeof body !== "string") {
    return body;
  }

  let masked = body;

  // Mask client_secret (UUID format)
  masked = masked.replace(/client_secret=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, `client_secret=${MASK_VALUE}`);

  // Mask authorization code (32-char hex)
  masked = masked.replace(/([&?])code=[a-f0-9]{32}/gi, `$1code=${MASK_VALUE}`);

  // Mask code at start of string (no leading & or ?)
  masked = masked.replace(/^code=[a-f0-9]{32}/gi, `code=${MASK_VALUE}`);

  return masked;
}

/**
 * Deep clone and mask sensitive data in an object or array.
 * Creates a new copy with sensitive field values replaced with MASK_VALUE.
 *
 * @param {*} data - The data to mask (object, array, or primitive)
 * @param {Set} [visited] - Set of visited objects for circular reference detection
 * @returns {*} A deep clone of the data with sensitive values masked
 */
export function maskSensitiveData(data, visited = new Set()) {
  // Handle null, undefined, and primitives
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  // Detect circular references
  if (visited.has(data)) {
    return "[Circular Reference]";
  }

  visited.add(data);

  try {
    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => maskSensitiveData(item, visited));
    }

    // Handle objects
    const masked = {};

    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveField(key)) {
        // Mask sensitive field - only if value exists and is not empty
        if (value !== null && value !== undefined && value !== "") {
          masked[key] = MASK_VALUE;
        } else {
          masked[key] = value;
        }
      } else if (value !== null && typeof value === "object") {
        // Recursively mask nested objects and arrays
        masked[key] = maskSensitiveData(value, visited);
      } else if (typeof value === "string" && key.toLowerCase() === "body") {
        // Apply URL-encoded masking to body fields
        masked[key] = maskUrlEncodedBody(value);
      } else {
        // Copy non-sensitive primitives as-is
        masked[key] = value;
      }
    }

    return masked;
  } finally {
    visited.delete(data);
  }
}

/**
 * Mask sensitive data in HTTP request/response objects before persistence.
 * Specifically designed for HMRC API request audit trail.
 *
 * @param {Object} httpData - HTTP request or response object with headers and body
 * @returns {Object} A masked copy safe for persistence
 */
export function maskHttpData(httpData) {
  if (!httpData || typeof httpData !== "object") {
    return httpData;
  }

  return maskSensitiveData(httpData);
}
