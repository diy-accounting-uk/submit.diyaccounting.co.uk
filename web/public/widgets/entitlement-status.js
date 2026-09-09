// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Entitlement Status Widget
// Shows the current page's activity entitlement status in the header

(function () {
  "use strict";

  // Cache for catalog and bundles to avoid multiple API calls on same page
  let catalogCache = null;
  let bundlesCache = null;
  const fetchPromises = { catalog: null, bundles: null };

  /**
   * Fetch catalog with caching
   * @returns {Promise<Object>} The catalog object
   */
  async function fetchCatalog() {
    if (catalogCache) {
      return catalogCache;
    }

    if (fetchPromises.catalog) {
      return fetchPromises.catalog;
    }

    fetchPromises.catalog = (async () => {
      try {
        const response = await fetch("/submit.catalogue.toml");
        if (response.ok) {
          const text = await response.text();
          try {
            if (window.TOML) {
              catalogCache = window.TOML.parse(text);
            } else {
              try {
                catalogCache = JSON.parse(text);
              } catch (jsonErr) {
                console.warn("Failed to parse catalog as JSON, and TOML parser is not available.");
                throw jsonErr;
              }
            }
          } catch (e) {
            console.warn("Failed to parse catalog:", e);
            catalogCache = null;
          }
          return catalogCache;
        }
      } catch (err) {
        console.warn("Failed to fetch catalog for entitlement status:", err);
      }
      return null;
    })();

    return fetchPromises.catalog;
  }

  /**
   * Fetch user bundles with caching
   * @returns {Promise<Array<string>>} Array of bundle IDs the user has access to
   */
  async function fetchUserBundles() {
    if (bundlesCache) {
      return bundlesCache;
    }

    if (fetchPromises.bundles) {
      return fetchPromises.bundles;
    }

    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) {
      bundlesCache = [];
      return bundlesCache;
    }

    fetchPromises.bundles = (async () => {
      try {
        const rc = window.requestCache;
        let data;
        if (rc && typeof rc.getJSON === "function") {
          data = await rc.getJSON("/api/v1/bundle", {
            ttlMs: 5000,
            init: { headers: { Authorization: `Bearer ${idToken}` } },
          });
        } else {
          const response = await window.fetchWithIdToken("/api/v1/bundle", {});
          if (response.ok) {
            data = await response.json();
          }
        }

        if (data && data.bundles && Array.isArray(data.bundles)) {
          bundlesCache = data.bundles.filter((b) => b.allocated).map((b) => (typeof b === "string" ? b : b.bundleId));
          return bundlesCache;
        }
      } catch (err) {
        console.warn("Failed to fetch bundles for entitlement status:", err);
      }
      bundlesCache = [];
      return bundlesCache;
    })();

    return fetchPromises.bundles;
  }

  /**
   * Get automatic bundles from catalog (always available)
   * @param {Object} catalog - The catalog object
   * @returns {Array<string>} Array of automatic bundle IDs
   */
  function getAutomaticBundles(catalog) {
    if (!catalog?.bundles) return [];
    return catalog.bundles.filter((bundle) => bundle.allocation === "automatic").map((bundle) => bundle.id);
  }

  /**
   * Check if a path matches using regex
   * @param {string} pattern - Regex pattern
   * @param {string} normalizedPath - Normalized path to check
   * @returns {boolean} True if matches
   */
  function matchesRegexPattern(pattern, normalizedPath) {
    try {
      const regex = new RegExp(pattern);
      return regex.test(normalizedPath) || regex.test("/" + normalizedPath);
    } catch (err) {
      console.warn("Invalid regex pattern in catalog:", pattern, err);
      return false;
    }
  }

  /**
   * Check if a path matches using simple string comparison
   * @param {string} path - Path pattern
   * @param {string} normalizedPath - Normalized path to check
   * @returns {boolean} True if matches
   */
  function matchesSimplePath(path, normalizedPath) {
    const normalizedActivityPath = path.replace(/^\//, "");
    return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
  }

  /**
   * Find activity that matches the current page path
   * @param {Object} catalog - The catalog object
   * @param {string} currentPath - Current page path
   * @returns {Object|null} Matching activity or null
   */
  function findMatchingActivity(catalog, currentPath) {
    if (!catalog?.activities) return null;

    // Normalize path - remove leading slash and query parameters
    const normalizedPath = currentPath.replace(/^\//, "").split("?")[0];

    for (const activity of catalog.activities) {
      // Check both 'path' and 'paths' properties
      const paths = activity.paths || (activity.path ? [activity.path] : []);

      for (const path of paths) {
        const isMatch = path.startsWith("^") ? matchesRegexPattern(path, normalizedPath) : matchesSimplePath(path, normalizedPath);

        if (isMatch) {
          return activity;
        }
      }
    }

    return null;
  }

  /**
   * Get activity names from bundles
   * @param {Object} catalog - The catalog object
   * @param {Array<string>} bundleIds - Array of bundle IDs
   * @returns {Array<string>} Array of bundle names
   */
  function getBundleNames(catalog, bundleIds) {
    if (!catalog?.bundles || !bundleIds?.length) return [];
    const bundleMap = new Map(catalog.bundles.map((b) => [b.id, b.name || b.id]));
    return bundleIds.map((id) => bundleMap.get(id) || id);
  }

  /**
   * Determine entitlement status for current page
   * @returns {Promise<Object>} Status object with text and style
   */
  async function determineEntitlementStatus() {
    const currentPath = window.location.pathname;

    // Fetch catalog and user bundles in parallel
    const [catalog, userBundles] = await Promise.all([fetchCatalog(), fetchUserBundles()]);

    if (!catalog) {
      return { text: "Activity: unrestricted", style: "unrestricted" };
    }

    // Find matching activity
    const matchingActivity = findMatchingActivity(catalog, currentPath);

    // If no matching activity, page is unrestricted (doesn't require any bundle)
    if (!matchingActivity) {
      return { text: "Activity: unrestricted", style: "unrestricted" };
    }

    // Get all bundles user has access to (automatic + granted)
    const automaticBundles = getAutomaticBundles(catalog);
    const allUserBundles = [...new Set([...automaticBundles, ...userBundles])];

    // Check if user has any required bundle
    const requiredBundles = matchingActivity.bundles || [];
    const hasAccess = requiredBundles.some((bundleId) => allUserBundles.includes(bundleId));

    if (hasAccess) {
      return { text: "Activity: access granted", style: "granted" };
    }

    // User doesn't have access - show which activities are required
    const bundleNames = getBundleNames(catalog, requiredBundles);
    const activityList = bundleNames.length > 0 ? bundleNames.join(", ") : requiredBundles.join(", ");

    return { text: `Activity: requires ${activityList}`, style: "requires" };
  }

  /**
   * Update entitlement status display in header
   */
  async function updateEntitlementStatus() {
    const statusElement = document.querySelector(".entitlement-status");
    if (!statusElement) {
      return; // Element not found, skip
    }

    const status = await determineEntitlementStatus();
    statusElement.textContent = status.text;

    // Update styling based on status
    statusElement.className = "entitlement-status";
    if (status.style === "granted") {
      statusElement.classList.add("status-granted");
    } else if (status.style === "requires") {
      statusElement.classList.add("status-requires");
    }
  }

  /**
   * Initialize entitlement status on page load
   */
  function initEntitlementStatus() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", updateEntitlementStatus);
    } else {
      updateEntitlementStatus();
    }
  }

  // Expose functions globally for backward compatibility and testing
  if (typeof window !== "undefined") {
    window.EntitlementStatus = {
      update: updateEntitlementStatus,
      initialize: initEntitlementStatus,
    };
    // Expose internal functions for testing
    window.__entitlementStatus = {
      determineEntitlementStatus,
      fetchCatalog,
      fetchUserBundles,
      findMatchingActivity,
      getAutomaticBundles,
      getBundleNames,
    };
  }

  // Initialize when script loads
  initEntitlementStatus();
})();
