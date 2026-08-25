// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// Authentication service for Cognito token management

import { getJwtExpiryMs } from "../utils/jwt-utils.js";
import { fetchWithId } from "../utils/correlation-utils.js";

// Track in-flight session refresh to prevent duplicate requests
let __ensureSessionInflight = null;

/**
 * Check if tokens are expired and notify user
 * @param {string} accessToken - Access token
 * @param {string} idToken - ID token
 */
export function checkTokenExpiry(accessToken, idToken) {
  try {
    const now = Date.now();
    const accessExpMs = getJwtExpiryMs(accessToken);
    const idExpMs = getJwtExpiryMs(idToken);

    // Check if either token is expired
    const accessExpired = accessExpMs && accessExpMs < now;
    const idExpired = idExpMs && idExpMs < now;

    if (accessExpired || idExpired) {
      console.warn("Token(s) expired on page load", { accessExpired, idExpired });

      // Notify user and offer to refresh
      if (typeof window !== "undefined" && window.showStatus) {
        window.showStatus("Your session has expired. Attempting to refresh...", "info");
      }

      // Attempt to refresh tokens (fire-and-forget)
      ensureSession({ force: true })
        .then((newToken) => {
          if (newToken) {
            console.log("Token refresh successful on page load");
            if (typeof window !== "undefined" && window.showStatus) {
              window.showStatus("Session refreshed successfully.", "success");
            }
          } else {
            console.warn("Token refresh failed on page load");
            if (typeof window !== "undefined" && window.showStatus) {
              window.showStatus("Session expired. Please log in again.", "warning");
              setTimeout(() => {
                window.location.href = "/auth/login.html";
              }, 3000);
            }
          }
          return undefined;
        })
        .catch((err) => {
          console.error("Token refresh error on page load:", err);
          if (typeof window !== "undefined" && window.showStatus) {
            window.showStatus("Session expired. Please log in again.", "warning");
            setTimeout(() => {
              window.location.href = "/auth/login.html";
            }, 3000);
          }
        });
      return;
    }

    // Check if tokens are expiring soon (within 5 minutes)
    const fiveMinutes = 5 * 60 * 1000;
    const accessExpiringSoon = accessExpMs && accessExpMs - now < fiveMinutes && accessExpMs - now > 0;
    const idExpiringSoon = idExpMs && idExpMs - now < fiveMinutes && idExpMs - now > 0;

    if (accessExpiringSoon || idExpiringSoon) {
      console.log("Token(s) expiring soon, attempting preemptive refresh");
      // Silently attempt to refresh tokens before they expire (fire-and-forget)
      ensureSession({ force: false, minTTLms: fiveMinutes })
        .then(() => {
          console.log("Preemptive token refresh successful");
          return undefined;
        })
        .catch((err) => {
          console.warn("Preemptive token refresh failed:", err);
        });
    }
  } catch (error) {
    console.warn("Error checking token expiry:", error);
  }
}

/**
 * Check authentication status on page load
 */
export function checkAuthStatus() {
  const accessToken = localStorage.getItem("cognitoAccessToken");
  const idToken = localStorage.getItem("cognitoIdToken");
  const userInfo = localStorage.getItem("userInfo");

  if (accessToken && userInfo) {
    console.log("User is authenticated");

    // Check if tokens are expired or about to expire
    checkTokenExpiry(accessToken, idToken);

    if (typeof window.updateLoginStatus === "function") {
      window.updateLoginStatus();
    }
  } else {
    console.log("User is not authenticated");

    if (typeof window.updateLoginStatus === "function") {
      window.updateLoginStatus();
    }
  }
}

/**
 * Ensure Cognito session freshness
 * Attempts a refresh using refresh_token if available
 * @param {object} options - Options
 * @param {number} options.minTTLms - Minimum TTL in milliseconds before refresh (default 30000)
 * @param {boolean} options.force - Force refresh even if token is fresh
 * @returns {Promise<string|null>} New access token or null
 */
export async function ensureSession({ minTTLms = 30000, force = false } = {}) {
  try {
    const accessToken = localStorage.getItem("cognitoAccessToken");
    const refreshToken = localStorage.getItem("cognitoRefreshToken");
    if (!accessToken) return null;

    // If not forced, and token is fresh enough, skip
    if (!force) {
      const expMs = getJwtExpiryMs(accessToken);
      const now = Date.now();
      if (expMs && expMs - now > minTTLms) return accessToken;
    }

    // No refresh token or already in-flight
    if (!refreshToken) return accessToken;
    if (__ensureSessionInflight) return __ensureSessionInflight;

    // Attempt refresh via backend endpoint
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });

    __ensureSessionInflight = (async () => {
      try {
        const res = await fetchWithId("/api/v1/cognito/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!res.ok) {
          console.warn("Refresh token failed, clearing stale refresh token");
          localStorage.removeItem("cognitoRefreshToken");
          return accessToken;
        }
        const json = await res.json();
        const newAccess = json.accessToken || json.access_token || accessToken;
        const newId = json.idToken || json.id_token || localStorage.getItem("cognitoIdToken");
        const newRefresh = json.refreshToken || json.refresh_token || refreshToken;

        const prevAccess = localStorage.getItem("cognitoAccessToken");
        // Persist
        if (newAccess) localStorage.setItem("cognitoAccessToken", newAccess);
        if (newId) localStorage.setItem("cognitoIdToken", newId);
        if (newRefresh) localStorage.setItem("cognitoRefreshToken", newRefresh);

        // If token changed, invalidate request cache
        if (newAccess && newAccess !== prevAccess) {
          try {
            window.requestCache?.invalidate?.("/api/");
          } catch (err) {
            console.warn("Failed to invalidate request cache:", err.message);
          }
          try {
            localStorage.setItem("auth:lastUpdate", String(Date.now()));
          } catch (err) {
            console.warn("Failed to save auth:lastUpdate to localStorage:", err.message);
          }
        }
        return newAccess;
      } catch (err) {
        console.warn("Failed to refresh access token:", err.message, err.stack);
        return accessToken;
      } finally {
        __ensureSessionInflight = null;
      }
    })();

    return __ensureSessionInflight;
  } catch {
    return localStorage.getItem("cognitoAccessToken");
  }
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.checkAuthStatus = checkAuthStatus;
  window.checkTokenExpiry = checkTokenExpiry;
  window.ensureSession = ensureSession;
}
