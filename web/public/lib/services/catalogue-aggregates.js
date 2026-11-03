// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Bundle aggregation. A bundle may carry `includes = ["<bundle id>", ...]`: it then holds every
// activity of each bundle it includes, transitively, plus the activities that name it directly.
// Pure functions over a parsed catalogue; no window, no DOM and no imports, so the Lambda image,
// the scripts and the browser all load the same file.

function bundleList(catalog) {
  return Array.isArray(catalog?.bundles) ? catalog.bundles : [];
}

function includesOf(bundle) {
  return Array.isArray(bundle?.includes) ? bundle.includes : [];
}

/**
 * The transitive parts of a bundle, without the bundle itself. Unknown ids are ignored and a
 * cycle stops at the first repeated id.
 * @param {object} catalog - Parsed catalogue
 * @param {string} bundleId - The aggregate's id
 * @returns {string[]} Bundle ids, in the order they are first reached
 */
export function includedBundleIds(catalog, bundleId) {
  const byId = new Map(bundleList(catalog).map((bundle) => [bundle.id, bundle]));
  const visited = new Set([bundleId]);
  const parts = [];
  const queue = [...includesOf(byId.get(bundleId))];
  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id) || !byId.has(id)) continue;
    visited.add(id);
    parts.push(id);
    queue.push(...includesOf(byId.get(id)));
  }
  return parts;
}

/**
 * A bundle id and every bundle whose transitive `includes` holds it.
 * @param {object} catalog - Parsed catalogue
 * @param {string} bundleId - The part's id
 * @returns {string[]} The id first, then the aggregates in catalogue order
 */
export function bundleIdsIncluding(catalog, bundleId) {
  const aggregates = bundleList(catalog)
    .filter((bundle) => bundle.id !== bundleId && includedBundleIds(catalog, bundle.id).includes(bundleId))
    .map((bundle) => bundle.id);
  return [bundleId, ...aggregates];
}

/**
 * A new catalogue in which each activity's `bundles` is its declared list, then every aggregate
 * that includes a declared id (transitively), in catalogue order, with no duplicates. Bundles are
 * copied unchanged. Resolving a resolved catalogue returns the same lists.
 * @param {object} catalog - Parsed catalogue
 * @returns {object} The resolved catalogue
 */
export function resolveAggregateBundles(catalog) {
  if (!catalog || !Array.isArray(catalog.activities)) return catalog;
  const bundles = bundleList(catalog);
  const holders = new Map();
  for (const bundle of bundles) {
    for (const id of includedBundleIds(catalog, bundle.id)) {
      if (!holders.has(id)) holders.set(id, new Set());
      holders.get(id).add(bundle.id);
    }
  }
  const activities = catalog.activities.map((activity) => {
    if (!Array.isArray(activity.bundles)) return { ...activity };
    const declared = new Set(activity.bundles);
    const reached = new Set(activity.bundles);
    for (const id of declared) {
      for (const holder of holders.get(id) ?? []) reached.add(holder);
    }
    const added = bundles.map((bundle) => bundle.id).filter((id) => reached.has(id) && !declared.has(id));
    return { ...activity, bundles: [...activity.bundles, ...added] };
  });
  return { ...catalog, bundles: bundles.map((bundle) => ({ ...bundle })), activities };
}

function reachesItself(catalog, bundleId) {
  const byId = new Map(bundleList(catalog).map((bundle) => [bundle.id, bundle]));
  const visited = new Set();
  const queue = [...includesOf(byId.get(bundleId))];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === bundleId) return true;
    if (visited.has(id) || !byId.has(id)) continue;
    visited.add(id);
    queue.push(...includesOf(byId.get(id)));
  }
  return false;
}

function listsEnvironments(bundle) {
  const listed = bundle?.listedInEnvironments;
  return Array.isArray(listed) && listed.length > 0 ? listed : null;
}

/**
 * What is wrong with the catalogue's `includes` fields.
 * @param {object} catalog - Parsed catalogue
 * @returns {string[]} One message per fault: an unknown id, a self include, a cycle, or an
 * aggregate listed in an environment where one of its parts is not listed
 */
export function aggregateBundleErrors(catalog) {
  const errors = [];
  const bundles = bundleList(catalog);
  const known = new Set(bundles.map((bundle) => bundle.id));
  for (const bundle of bundles) {
    for (const id of includesOf(bundle)) {
      if (id === bundle.id) errors.push(`bundle ${bundle.id} includes itself`);
      else if (!known.has(id)) errors.push(`bundle ${bundle.id} includes unknown bundle ${id}`);
    }
    if (!includesOf(bundle).includes(bundle.id) && reachesItself(catalog, bundle.id)) {
      errors.push(`bundle ${bundle.id} is part of an includes cycle`);
    }
  }
  const byId = new Map(bundles.map((bundle) => [bundle.id, bundle]));
  for (const bundle of bundles) {
    const aggregateEnvironments = listsEnvironments(bundle);
    for (const partId of includedBundleIds(catalog, bundle.id)) {
      const partEnvironments = listsEnvironments(byId.get(partId));
      if (!partEnvironments) continue;
      const missing = aggregateEnvironments
        ? aggregateEnvironments.filter((name) => !partEnvironments.includes(name))
        : ["every environment"];
      if (missing.length > 0) {
        errors.push(`bundle ${bundle.id} is listed in ${missing.join(", ")} where its part ${partId} is not listed`);
      }
    }
  }
  return errors;
}
