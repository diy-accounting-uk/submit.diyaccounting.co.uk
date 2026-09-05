// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// Catalog service for bundle and activity management

/**
 * Get bundles available for an activity
 * @param {object} catalog - Parsed catalog object
 * @param {string} activityId - Activity identifier
 * @returns {string[]} Array of bundle IDs
 */
export function bundlesForActivity(catalog, activityId) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  return activity?.bundles ?? [];
}

/**
 * Get activities available for a bundle
 * @param {object} catalog - Parsed catalog object
 * @param {string} bundleId - Bundle identifier
 * @returns {string[]} Array of activity IDs
 */
export function activitiesForBundle(catalog, bundleId) {
  if (!catalog?.activities) return [];
  return catalog.activities.filter((a) => Array.isArray(a.bundles) && a.bundles.includes(bundleId)).map((a) => a.id);
}

/**
 * Check if an activity is available for a bundle
 * @param {object} catalog - Parsed catalog object
 * @param {string} activityId - Activity identifier
 * @param {string} bundleId - Bundle identifier
 * @returns {boolean} True if activity is available
 */
export function isActivityAvailable(catalog, activityId, bundleId) {
  return bundlesForActivity(catalog, activityId).includes(bundleId);
}

/**
 * Fetch raw TOML catalog from the server
 * @param {string} url - URL to fetch (default "/submit.catalogue.toml")
 * @returns {Promise<string>} Raw TOML content
 */
export async function fetchCatalogText(url = "/submit.catalogue.toml") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Check whether an activity is listed in the given environment.
 * An activity may carry an `environments` array (e.g. ["local", "ci"]) restricting it to
 * those named environments. Absent or empty means every environment.
 * @param {object} activity - An activity entry from the parsed catalog
 * @param {string|null} environmentName - The current environment name, or null if unknown
 * @returns {boolean} True if the activity should be listed in this environment
 */
export function isActivityListedInEnvironment(activity, environmentName) {
  const listed = activity?.environments;
  if (!Array.isArray(listed) || listed.length === 0) return true;
  return typeof environmentName === "string" && listed.includes(environmentName);
}

/**
 * Fetch the current environment's name as recorded at deploy time.
 * @param {string} url - URL to fetch (default "/submit.environment-name.txt")
 * @returns {Promise<string|null>} The environment name, or null if it could not be read
 */
export async function fetchCurrentEnvironmentName(url = "/submit.environment-name.txt") {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.bundlesForActivity = bundlesForActivity;
  window.activitiesForBundle = activitiesForBundle;
  window.isActivityAvailable = isActivityAvailable;
  window.fetchCatalogText = fetchCatalogText;
  window.isActivityListedInEnvironment = isActivityListedInEnvironment;
  window.fetchCurrentEnvironmentName = fetchCurrentEnvironmentName;
}
