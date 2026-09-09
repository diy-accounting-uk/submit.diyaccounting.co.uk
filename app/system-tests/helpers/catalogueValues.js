// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Shared helper to read configurable values from the catalogue.
// System tests should use these instead of hardcoding values like tokensGranted,
// tokenCost, cap, maxUses, etc. so tests don't break when the config changes.

import { loadCatalogFromRoot } from "@app/services/productCatalog.js";

let _catalog = null;

export function getCatalog() {
  if (!_catalog) _catalog = loadCatalogFromRoot();
  return _catalog;
}

export function getBundle(bundleId) {
  const catalog = getCatalog();
  const bundle = catalog.bundles.find((b) => b.id === bundleId);
  if (!bundle) throw new Error(`Bundle '${bundleId}' not found in catalogue`);
  return bundle;
}

export function getActivity(activityId) {
  const catalog = getCatalog();
  const activity = catalog.activities.find((a) => a.id === activityId);
  if (!activity) throw new Error(`Activity '${activityId}' not found in catalogue`);
  return activity;
}
