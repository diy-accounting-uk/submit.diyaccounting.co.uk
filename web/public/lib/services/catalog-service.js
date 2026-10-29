// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
 * Whether a bundle or activity serves only operators: every bundle it names is the operator bundle.
 * @param {string[]|undefined} bundleIds - The bundle ids of an activity
 * @returns {boolean} True when the item is for operators only
 */
function isOperatorOnly(bundleIds) {
  return Array.isArray(bundleIds) && bundleIds.length > 0 && bundleIds.every((id) => id === "operator");
}

/**
 * Whether the catalogue shows an activity to this person: listed in the environment, or shown by
 * preview features, and not switched off by the person's own settings. An activity may name an
 * account setting in `accountSetting` (a setting that is false hides it), and an operator who
 * turned operator features off does not see an activity that only the operator bundle serves.
 * @param {object} activity - An activity entry from the parsed catalog
 * @param {string|null} environmentName - The current environment name
 * @param {{preview: boolean, operatorFeatures: boolean, account: object}} viewer - From viewer-settings.js fetchViewer
 * @returns {boolean} True if the activity shows
 */
export function isActivityShown(activity, environmentName, viewer) {
  if (activity?.accountSetting && viewer?.account?.[activity.accountSetting] === false) return false;
  if (viewer?.operatorFeatures === false && isOperatorOnly(activity?.bundles)) return false;
  return viewer?.preview === true || isActivityListedInEnvironment(activity, environmentName);
}

/**
 * Whether the catalogue shows a bundle to this person: listed in the environment, or shown by
 * preview features, and not the operator bundle for an operator who turned operator features off.
 * @param {object} bundle - A bundle entry from the parsed catalog
 * @param {string|null} environmentName - The current environment name
 * @param {{preview: boolean, operatorFeatures: boolean}} viewer - From viewer-settings.js fetchViewer
 * @returns {boolean} True if the bundle shows
 */
export function isBundleShown(bundle, environmentName, viewer) {
  if (viewer?.operatorFeatures === false && bundle?.id === "operator") return false;
  if (viewer?.preview === true) return true;
  const listed = bundle?.listedInEnvironments;
  if (!Array.isArray(listed) || listed.length === 0) return true;
  return typeof environmentName === "string" && listed.includes(environmentName);
}

/**
 * The page an activity's home button opens: the first `.html` entry in its catalogue `paths`.
 * An activity with no page has no button on the home page.
 * @param {object} activity - An activity entry from the parsed catalog
 * @returns {string|null} The page path, or null when the activity has no page
 */
export function activityPagePath(activity) {
  return activity?.paths?.find((entry) => entry.includes(".html")) ?? null;
}

/**
 * The home page group of an activity, taken from the directory of its page path.
 * @param {string} pagePath - The path from activityPagePath
 * @returns {"VAT"|"Income Tax"|"Companies House"|"Passes"|"More"}
 */
export function activityArea(pagePath) {
  if (pagePath.startsWith("hmrc/vat")) return "VAT";
  if (pagePath.startsWith("hmrc/itsa")) return "Income Tax";
  if (pagePath.startsWith("companies-house")) return "Companies House";
  if (pagePath.startsWith("passes")) return "Passes";
  return "More";
}

/**
 * The features the home status box and subtitle name, in display order. `activity` is the
 * catalogue activity id that decides whether the feature is listed and with which status;
 * `filing` is the kind of filing the subtitle names, absent for a feature that files nothing.
 */
export const STATUS_FEATURES = [
  { activity: "submit-vat", label: "HMRC VAT", filing: "VAT returns" },
  { activity: "self-employed", label: "HMRC Income Tax (MTD)", filing: "Income Tax updates" },
  { activity: "vat-assist-check", label: "HMRC Assist for VAT" },
  { activity: "file-company-tax-return", label: "HMRC Company Tax Return (CT600)", filing: "Company Tax Returns" },
  { activity: "company-lookup", label: "company lookup" },
  { activity: "change-registered-office", label: "registered office", filing: "Companies House filings" },
  { activity: "change-registered-email", label: "registered email", filing: "Companies House filings" },
  { activity: "file-confirmation-statement", label: "Companies House confirmation statement", filing: "Companies House filings" },
  { activity: "file-psc-verification-statement", label: "PSC verification statement", filing: "Companies House filings" },
  { activity: "file-micro-entity-accounts", label: "Companies House accounts", filing: "Companies House filings" },
  { activity: "file-small-company-accounts", label: "Companies House accounts", filing: "Companies House filings" },
];

/**
 * The status word of an activity: "production" when it is listed in prod or lists no
 * environments, otherwise the "sandbox" or "preview" its catalogue name carries.
 * @param {object} activity - An activity entry from the parsed catalog
 * @returns {"production"|"sandbox"|"preview"|null} The status, or null when the name carries none
 */
export function activityStatus(activity) {
  const listed = activity?.environments;
  if (!Array.isArray(listed) || listed.length === 0 || listed.includes("prod")) return "production";
  const word = /\b(sandbox|preview)\b/i.exec(activity?.name ?? "");
  return word ? word[1].toLowerCase() : null;
}

/**
 * What the home page says about the features listed in an environment: the labels under each
 * status, and the kinds of filing for the subtitle. A feature the catalogue does not list in
 * the environment appears in neither.
 * @param {object} catalog - The parsed catalog
 * @param {string|null} environmentName - The current environment name
 * @param {object} [viewer] - From viewer-settings.js fetchViewer; preview features list every feature
 * @returns {{groups: {status: string, labels: string[]}[], filings: string[]}}
 */
export function featureStatusSummary(catalog, environmentName, viewer) {
  const byStatus = { production: [], sandbox: [], preview: [] };
  const filings = [];
  for (const feature of STATUS_FEATURES) {
    const activity = (catalog?.activities ?? []).find((candidate) => candidate.id === feature.activity);
    if (!activity || !isActivityShown(activity, environmentName, viewer)) continue;
    const status = activityStatus(activity);
    if (!status) continue;
    if (!byStatus[status].includes(feature.label)) byStatus[status].push(feature.label);
    if (feature.filing && !filings.includes(feature.filing)) filings.push(feature.filing);
  }
  const groups = Object.entries(byStatus)
    .filter(([, labels]) => labels.length > 0)
    .map(([status, labels]) => ({ status, labels }));
  return { groups, filings };
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
  window.isActivityShown = isActivityShown;
  window.isBundleShown = isBundleShown;
  window.activityPagePath = activityPagePath;
  window.activityArea = activityArea;
  window.fetchCurrentEnvironmentName = fetchCurrentEnvironmentName;
  window.featureStatusSummary = featureStatusSummary;
}
