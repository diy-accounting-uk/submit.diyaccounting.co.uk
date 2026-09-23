// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/productCatalog.js
import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

export function parseCatalog(tomlString) {
  if (typeof tomlString !== "string") throw new TypeError("tomlString must be a string");
  const catalog = TOML.parse(tomlString);
  return catalog;
}

export function loadCatalogFromRoot() {
  const filePath = path.join(process.cwd(), "web/public/submit.catalogue.toml");
  const raw = fs.readFileSync(filePath, "utf-8");
  return parseCatalog(raw);
}

export function bundlesForActivity(catalog, activityId) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  return activity?.bundles ?? [];
}

export function activitiesForBundle(catalog, bundleId) {
  if (!catalog?.activities) return [];
  return catalog.activities.filter((a) => Array.isArray(a.bundles) && a.bundles.includes(bundleId)).map((a) => a.id);
}

export function isActivityAvailable(catalog, activityId, bundleId) {
  const bundles = bundlesForActivity(catalog, activityId);
  return bundles.includes(bundleId);
}

// An activity may carry an `environments` array (e.g. ["local", "ci"]) restricting it to
// those named environments. Absent or empty means every environment.
export function isActivityListedInEnvironment(activity, environmentName) {
  const listed = activity?.environments;
  if (!Array.isArray(listed) || listed.length === 0) return true;
  return typeof environmentName === "string" && listed.includes(environmentName);
}

// A bundle may carry a `listedInEnvironments` array (e.g. ["ci", "local"]) restricting it to
// those named environments. Absent or empty means every environment.
export function isBundleListedInEnvironment(bundle, environmentName) {
  const listed = bundle?.listedInEnvironments;
  if (!Array.isArray(listed) || listed.length === 0) return true;
  return typeof environmentName === "string" && listed.includes(environmentName);
}

export function getCappedBundleIds(catalog) {
  if (!catalog?.bundles) return [];
  return catalog.bundles.filter((b) => Number.isFinite(b.cap)).map((b) => b.id);
}

export function getCatalogBundleById(catalog, bundleId) {
  if (!catalog?.bundles) return null;
  return catalog.bundles.find((b) => b.id === bundleId) || null;
}

// A bundle's tokensGranted carries this sentinel instead of a number for an unlimited grant
// (the resident-pro practice licence): exempt from token counting rather than a large numeric
// cap. Token enforcement (app/services/tokenEnforcement.js) and the subscription token refresh
// (app/functions/billing/billingWebhookPost.js) both check this before touching the count.
export const UNLIMITED_TOKENS_GRANTED = "unlimited";

export function isUnlimitedTokenGrant(tokensGranted) {
  return tokensGranted === UNLIMITED_TOKENS_GRANTED;
}

// A bundle's Stripe prices from its `[[bundles.prices]]` table: one row per interval, one
// row carrying `default = true`. A row missing its amount, currency or interval is dropped
// rather than surfaced as a price with a missing field.
export function getBundlePrices(bundle) {
  if (!bundle) return [];
  if (Array.isArray(bundle.prices) && bundle.prices.length > 0) {
    return bundle.prices
      .filter((p) => Number.isFinite(p.amount) && typeof p.currency === "string" && typeof p.interval === "string")
      .map((p) => ({ interval: p.interval, amount: p.amount, currency: p.currency, default: p.default === true }));
  }
  return [];
}

// The one price a checkout for this bundle should use for the given interval ("year" or
// "month"). A bundle with a single price ignores the requested interval, since there is no
// choice to make. A bundle with more than one price returns the exact match, the row
// carrying `default = true` when no interval is given, or null when the requested interval
// does not exist for it — callers must not fall back silently to a different price.
export function getBundlePriceForInterval(bundle, interval) {
  const prices = getBundlePrices(bundle);
  if (prices.length === 0) return null;
  if (prices.length === 1) return prices[0];
  if (!interval) return prices.find((p) => p.default) || prices[0];
  return prices.find((p) => p.interval === interval) || null;
}

// A bundle is Stripe-priced when its prices table carries at least one row (resident-vat:
// allocation "on-subscription"; resident-pro: allocation "on-pass-on-subscription";
// resident: "on-subscription" with two prices — all sell through Stripe Checkout).
export function getStripeSubscriptionBundles(catalog) {
  if (!catalog?.bundles) return [];
  return catalog.bundles.filter((b) => getBundlePrices(b).length > 0);
}

export function loadPassTypesFromRoot() {
  const filePath = path.join(process.cwd(), "submit.passes.toml");
  const raw = fs.readFileSync(filePath, "utf-8");
  return TOML.parse(raw);
}

export function getPassTypeById(passTypesConfig, passTypeId) {
  if (!passTypesConfig?.passTypes) return null;
  return passTypesConfig.passTypes.find((p) => p.id === passTypeId) || null;
}
