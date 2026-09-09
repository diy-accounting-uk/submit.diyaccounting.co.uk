// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-scope-check.js
// Client-side utility for HMRC OAuth scope enforcement.
// Reads hmrcScopesRequired from the catalogue and checks whether the stored
// HMRC token scope (in sessionStorage) satisfies the current page's needs.

(function () {
  "use strict";

  let catalogCache = null;
  let catalogPromise = null;

  async function fetchCatalog() {
    if (catalogCache) return catalogCache;
    if (catalogPromise) return catalogPromise;

    catalogPromise = (async () => {
      try {
        const response = await fetch("/submit.catalogue.toml");
        if (response.ok) {
          const text = await response.text();
          if (window.TOML) {
            catalogCache = window.TOML.parse(text);
          }
        }
      } catch (err) {
        console.warn("hmrc-scope-check: Failed to fetch catalog:", err);
      }
      return catalogCache;
    })();

    return catalogPromise;
  }

  function findActivityByPath(catalog, pagePath) {
    if (!catalog?.activities) return null;
    const normalizedPath = pagePath.replace(/^\//, "").split("?")[0];

    for (const activity of catalog.activities) {
      const paths = activity.paths || (activity.path ? [activity.path] : []);
      for (const p of paths) {
        if (p.startsWith("^")) {
          try {
            const regex = new RegExp(p);
            if (regex.test(normalizedPath) || regex.test("/" + normalizedPath)) return activity;
          } catch {
            // skip invalid regex pattern from catalogue
          }
        } else {
          const norm = p.replace(/^\//, "");
          if (normalizedPath === norm || normalizedPath.endsWith("/" + norm)) return activity;
        }
      }
    }
    return null;
  }

  /**
   * Get the HMRC scopes required by the current page's activity.
   * @param {string} [pagePath] - Override path (defaults to window.location.pathname)
   * @returns {Promise<string[]>} Array of required scope strings, e.g. ["write:vat", "read:vat"]
   */
  async function getRequiredScopes(pagePath) {
    const catalog = await fetchCatalog();
    if (!catalog) return [];
    const activity = findActivityByPath(catalog, pagePath || window.location.pathname);
    return activity?.hmrcScopesRequired || [];
  }

  /**
   * Check whether the stored HMRC token scope satisfies the required scopes.
   * @param {string[]} requiredScopes - Scopes the current activity needs
   * @returns {boolean} true if the stored scope covers all required scopes
   */
  function hasRequiredScopes(requiredScopes) {
    if (!requiredScopes || requiredScopes.length === 0) return true;
    const storedScope = sessionStorage.getItem("hmrcTokenScope") || "";
    const grantedScopes = storedScope.split(/\s+/).filter(Boolean);
    return requiredScopes.every(function (s) {
      return grantedScopes.includes(s);
    });
  }

  /**
   * Build the OAuth scope string from the catalogue for the current page.
   * @param {string} [pagePath] - Override path (defaults to window.location.pathname)
   * @returns {Promise<string>} Space-separated scope string, e.g. "write:vat read:vat"
   */
  async function getOAuthScopeString(pagePath) {
    const scopes = await getRequiredScopes(pagePath);
    return scopes.length > 0 ? scopes.join(" ") : "read:vat";
  }

  /**
   * Check if the current HMRC token is usable for this page's activity.
   * Returns true if there is a token AND it has sufficient scope.
   * @param {string} [pagePath] - Override path
   * @returns {Promise<boolean>}
   */
  async function isTokenSufficient(pagePath) {
    const token = sessionStorage.getItem("hmrcAccessToken");
    if (!token) return false;
    const required = await getRequiredScopes(pagePath);
    return hasRequiredScopes(required);
  }

  /**
   * Clear the stored HMRC token and scope (e.g. when re-authorization is needed).
   */
  function clearHmrcToken() {
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcTokenScope");
  }

  window.hmrcScopeCheck = {
    getRequiredScopes,
    hasRequiredScopes,
    getOAuthScopeString,
    isTokenSufficient,
    clearHmrcToken,
  };
})();
