// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/diyaGlEntitlement.js
//
// Decides a DIYA-GL book's retention tier: "resident" for an active resident-diya-gl subscriber,
// "sandbox" for everyone else. DIYA_GL_RESIDENT_TIER gates whether the resident tier is offered
// at all on this environment; off, every caller gets the sandbox tier without a bundle read.

import { createLogger } from "../lib/logger.js";
import { initializeSalt } from "./subHasher.js";
import { getUserBundles } from "../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/services/diyaGlEntitlement.js" });

const DEFAULT_DIYA_GL_BUNDLE_ID = "resident-diya-gl";

const LAPSED_RESIDENT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A lapsed subscriber's resident books expire 30 days after the bundle's own expiry, rather than
 * immediately: the grace period a resubscribe can beat before the sweeper (DG-3c) removes them.
 *
 * @param {string} bundleExpiry - an entitlement's `expiry` field, an ISO date string
 * @returns {string} an ISO date string, `bundleExpiry` plus 30 days
 */
export function lapsedResidentExpiresAt(bundleExpiry) {
  return new Date(Date.parse(bundleExpiry) + LAPSED_RESIDENT_GRACE_MS).toISOString();
}

/**
 * @param {string} sub - the raw Cognito sub
 * @returns {Promise<{retention: "sandbox"|"resident",
 *   reason: "tier-disabled"|"active-subscription"|"no-subscription"|"expired",
 *   residentTier: boolean, bundleId: string|null, expiry: string|null, checkedAt: string}>}
 */
export async function entitlementFor(sub) {
  const checkedAt = new Date().toISOString();

  if (process.env.DIYA_GL_RESIDENT_TIER !== "true") {
    return { retention: "sandbox", reason: "tier-disabled", residentTier: false, bundleId: null, expiry: null, checkedAt };
  }

  await initializeSalt();
  const diyaGlBundleId = process.env.DIYA_GL_BUNDLE_ID || DEFAULT_DIYA_GL_BUNDLE_ID;
  const bundles = await getUserBundles(sub);
  const matchingBundle = bundles.find((bundle) => bundle.bundleId === diyaGlBundleId);

  if (!matchingBundle) {
    logger.info({ message: "No matching DIYA-GL bundle", bundleId: diyaGlBundleId });
    return { retention: "sandbox", reason: "no-subscription", residentTier: true, bundleId: null, expiry: null, checkedAt };
  }

  const isActive = matchingBundle.subscriptionStatus === "active";
  const isUnexpired = matchingBundle.expiry ? Date.parse(matchingBundle.expiry) > Date.now() : true;

  if (isActive && isUnexpired) {
    return {
      retention: "resident",
      reason: "active-subscription",
      residentTier: true,
      bundleId: matchingBundle.bundleId,
      expiry: matchingBundle.expiry || null,
      checkedAt,
    };
  }

  logger.info({
    message: "DIYA-GL bundle found but not active",
    bundleId: matchingBundle.bundleId,
    subscriptionStatus: matchingBundle.subscriptionStatus,
    expiry: matchingBundle.expiry,
  });
  return {
    retention: "sandbox",
    reason: "expired",
    residentTier: true,
    bundleId: matchingBundle.bundleId,
    expiry: matchingBundle.expiry || null,
    checkedAt,
  };
}
