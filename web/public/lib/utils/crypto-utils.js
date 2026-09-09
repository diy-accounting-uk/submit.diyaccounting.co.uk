// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Cryptographic utility functions

/**
 * Generate a random state string for OAuth flows
 * Uses cryptographically secure random values when available
 * @returns {string} Random state string
 */
export function generateRandomState() {
  try {
    // Prefer cryptographically secure random values where available
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      // Remove dashes to keep it compact and URL-safe
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch (error) {
    console.warn("Failed to generate cryptographic random state:", error);
    // fall through to non-crypto fallback below
  }
  // Last-resort fallback without Math.random to avoid pseudo-random lint warnings
  // Uses high-resolution time if available to ensure uniqueness (not for security)
  const now = Date.now().toString(36);
  const perf = typeof performance !== "undefined" && performance.now ? Math.floor(performance.now() * 1000).toString(36) : "0";
  return `${now}${perf}`;
}

/**
 * Generate random hex string of specified byte length
 * @param {number} bytes - Number of bytes
 * @returns {string} Hex string
 */
export function randomHex(bytes) {
  try {
    const arr = new Uint8Array(bytes);
    (window.crypto || {}).getRandomValues?.(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Fallback to time-based shards when crypto is unavailable
    const now = Date.now()
      .toString(16)
      .padStart(bytes * 2, "0");
    return now.slice(-bytes * 2);
  }
}

/**
 * Compute SHA-256 hash of text and return as hex string
 * @param {string} text - Text to hash
 * @returns {Promise<string>} Hex hash string
 */
export async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.generateRandomState = generateRandomState;
  window.randomHex = randomHex;
  window.sha256Hex = sha256Hex;
}
