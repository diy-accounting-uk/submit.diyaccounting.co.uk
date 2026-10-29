// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/practiceLicence.js
//
// Whether a practice holds the licence that client-scoped requests need: an active, unexpired
// resident-pro subscription, or an unexpired complimentary resident-pro-comp pass. The diya-gl
// book retention rule keeps its own narrower predicate (diyaGlEntitlement.js).

const SUBSCRIBED_LICENCE_BUNDLE_ID = "resident-pro";
const COMPLIMENTARY_LICENCE_BUNDLE_ID = "resident-pro-comp";

function isUnexpired(bundle) {
  return bundle.expiry ? Date.parse(bundle.expiry) > Date.now() : true;
}

/**
 * @param {object[]} bundles - as returned by `getUserBundles`
 * @returns {boolean}
 */
export function holdsPracticeLicence(bundles) {
  return bundles.some((bundle) => {
    if (bundle.bundleId === SUBSCRIBED_LICENCE_BUNDLE_ID) return bundle.subscriptionStatus === "active" && isUnexpired(bundle);
    if (bundle.bundleId === COMPLIMENTARY_LICENCE_BUNDLE_ID) return isUnexpired(bundle);
    return false;
  });
}
