// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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

export function getCappedBundleIds(catalog) {
  if (!catalog?.bundles) return [];
  return catalog.bundles.filter((b) => Number.isFinite(b.cap)).map((b) => b.id);
}

export function getCatalogBundleById(catalog, bundleId) {
  if (!catalog?.bundles) return null;
  return catalog.bundles.find((b) => b.id === bundleId) || null;
}

// A bundle is Stripe-priced when the catalogue carries stripePriceAmount, stripeCurrency
// and stripeInterval for it (resident-vat, resident-itsa: allocation "on-subscription";
// resident-pro: allocation "on-pass-on-subscription" — both sell through Stripe Checkout).
export function getStripeSubscriptionBundles(catalog) {
  if (!catalog?.bundles) return [];
  return catalog.bundles.filter((b) => Number.isFinite(b.stripePriceAmount) && typeof b.stripeCurrency === "string" && typeof b.stripeInterval === "string");
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
