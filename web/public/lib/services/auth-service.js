// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Authentication service for Cognito token management

import { getJwtExpiryMs } from "../utils/jwt-utils.js";
import { fetchWithId } from "../utils/correlation-utils.js";

// Track in-flight session refresh to prevent duplicate requests
let __ensureSessionInflight = null;

// One sign-in redirect per page load, so a burst of failed calls does not start several.
let __signInRedirectStarted = false;

const SESSION_STORAGE_KEYS = ["cognitoAccessToken", "cognitoIdToken", "cognitoRefreshToken", "userInfo"];

/**
 * True when the token carries an expiry that has passed. A token with no readable expiry is not expired.
 * @param {string|null} jwt - JWT string
 * @returns {boolean}
 */
export function isTokenExpired(jwt) {
  if (!jwt) return false;
  const expMs = getJwtExpiryMs(jwt);
  return Boolean(expMs) && expMs < Date.now();
}

/**
 * Remove every stored sign-in token and the stored user, then refresh the header.
 */
export function clearSession() {
  for (const key of SESSION_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage unavailable: nothing to clear
    }
  }
  try {
    window.requestCache?.invalidate?.("/api/");
  } catch {
    // no cache to invalidate
  }
  if (typeof window !== "undefined" && typeof window.updateLoginStatus === "function") {
    try {
      window.updateLoginStatus();
    } catch {
      // header not on this page
    }
  }
}

/**
 * Clear the dead session and go to the sign-in page, which returns to this page. Runs once per page load
 * and never on a sign-in page, so it cannot loop.
 * @param {string} [message] - Notice shown before the page changes
 * @returns {boolean} True when this call started the redirect
 */
/** True once sendToSignIn has started this page's way to sign in. */
export function isSignInRedirectStarted() {
  return __signInRedirectStarted;
}

// window.signInRefused is set when a request on this page was answered 401, by developer-mode.js's
// bundle read among others: the sign-in it carried was refused, so it is refreshed before the next
// request uses it.

/** True once a request on this page was answered 401 and no refresh has replaced the sign-in since. */
export function isSignInRefused() {
  return typeof window !== "undefined" && window.signInRefused === true;
}

/** The sign-in this page holds was refused, or was replaced by a refresh that worked. */
export function setSignInRefused(refused) {
  if (typeof window !== "undefined") window.signInRefused = refused;
}

export function sendToSignIn(message = "Your session has expired. Please sign in again.") {
  if (typeof window === "undefined") return false;
  if (__signInRedirectStarted) return false;
  if (/^\/(cy\/)?auth\//.test(window.location.pathname || "")) return false;
  __signInRedirectStarted = true;
  clearSession();
  if (window.showStatus) window.showStatus(message, "warning");
  window.location.href = window.signInHref("/auth/login.html");
  return true;
}

/**
 * Make sure the page holds a live id token before an action that needs one. A dead token is refreshed
 * once; when that cannot give a live session the user goes to sign in.
 * @returns {Promise<boolean>} True when the session is live
 */
export async function requireSession() {
  let idToken;
  try {
    idToken = localStorage.getItem("cognitoIdToken");
  } catch {
    idToken = null;
  }
  if (idToken && !isTokenExpired(idToken)) return true;
  if (idToken) {
    const refreshed = await ensureSession({ force: true });
    if (refreshed) return true;
  }
  sendToSignIn(idToken ? undefined : "Please sign in first.");
  return false;
}

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
      const hasRefreshToken = Boolean(localStorage.getItem("cognitoRefreshToken"));

      if (!hasRefreshToken) {
        // Nothing can renew it: show the visitor as signed out. The sign-in page is offered by the header
        // and by any action that needs a session.
        clearSession();
        return;
      }

      if (typeof window !== "undefined" && window.showStatus) {
        window.showStatus("Your session has expired. Attempting to refresh...", "info");
      }

      // Attempt to refresh tokens (fire-and-forget); a token comes back only from a real refresh
      ensureSession({ force: true })
        .then((newToken) => {
          if (newToken) {
            console.log("Token refresh successful on page load");
            if (typeof window !== "undefined" && window.showStatus) {
              window.showStatus("Session refreshed successfully.", "success");
            }
            if (typeof window !== "undefined" && typeof window.updateLoginStatus === "function") window.updateLoginStatus();
          } else {
            console.warn("Token refresh failed on page load");
            clearSession();
            if (typeof window !== "undefined" && window.showStatus) {
              window.showStatus("Session expired. Please sign in again.", "warning");
            }
          }
          return undefined;
        })
        .catch((err) => {
          console.error("Token refresh error on page load:", err);
          clearSession();
          if (typeof window !== "undefined" && window.showStatus) {
            window.showStatus("Session expired. Please sign in again.", "warning");
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

    // A token that is still unexpired can be used when no refresh is possible or forced
    const usable = () => (!isTokenExpired(accessToken) && !isTokenExpired(localStorage.getItem("cognitoIdToken")) ? accessToken : null);

    // If not forced, and token is fresh enough, skip
    if (!force) {
      const expMs = getJwtExpiryMs(accessToken);
      const now = Date.now();
      if (expMs && expMs - now > minTTLms && usable()) return accessToken;
    }

    // No refresh token: the session ends with the token
    if (!refreshToken) return force ? null : usable();
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
          return force ? null : usable();
        }
        const json = await res.json();
        const newAccess = json.accessToken || json.access_token;
        const newId = json.idToken || json.id_token || localStorage.getItem("cognitoIdToken");
        const newRefresh = json.refreshToken || json.refresh_token || refreshToken;
        if (!newAccess) return force ? null : usable();

        const prevAccess = localStorage.getItem("cognitoAccessToken");
        // Persist
        localStorage.setItem("cognitoAccessToken", newAccess);
        if (newId) localStorage.setItem("cognitoIdToken", newId);
        if (newRefresh) localStorage.setItem("cognitoRefreshToken", newRefresh);

        // If token changed, invalidate request cache
        if (newAccess !== prevAccess) {
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
        return force ? null : usable();
      } finally {
        __ensureSessionInflight = null;
      }
    })();

    return __ensureSessionInflight;
  } catch {
    return null;
  }
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.checkAuthStatus = checkAuthStatus;
  window.checkTokenExpiry = checkTokenExpiry;
  window.ensureSession = ensureSession;
  window.isTokenExpired = isTokenExpired;
  window.clearSession = clearSession;
  window.sendToSignIn = sendToSignIn;
  window.requireSession = requireSession;
}
