// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// JWT utility functions for token handling

/**
 * Decode a base64url encoded string
 * @param {string} str - Base64url encoded string
 * @returns {string} Decoded string
 */
export function base64UrlDecode(str) {
  try {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = str.length % 4;
    if (pad) str += "=".repeat(4 - pad);
    return atob(str);
  } catch {
    return "";
  }
}

/**
 * Parse JWT claims from a token
 * @param {string} jwt - JWT token string
 * @returns {object|null} Parsed claims or null if invalid
 */
export function parseJwtClaims(jwt) {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

/**
 * Get JWT expiry time in milliseconds
 * @param {string} jwt - JWT token string
 * @returns {number} Expiry time in milliseconds, or 0 if invalid
 */
export function getJwtExpiryMs(jwt) {
  const claims = parseJwtClaims(jwt);
  const exp = claims && claims.exp ? Number(claims.exp) : 0;
  return exp ? exp * 1000 : 0;
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.base64UrlDecode = base64UrlDecode;
  window.parseJwtClaims = parseJwtClaims;
  window.getJwtExpiryMs = getJwtExpiryMs;
}
