// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/booksEntitlement.js
//
// Gates the books PUT route on an active subscription. A stub until the billing row wires up the
// DIYA-GL bundle: BOOKS_ENTITLEMENT_ENFORCED stays unset (or "false") until then, so every caller
// passes.

import { createLogger } from "../lib/logger.js";
import { initializeSalt } from "./subHasher.js";
import { getUserBundles } from "../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/services/booksEntitlement.js" });

const DEFAULT_BOOKS_BUNDLE_ID = "resident-diya-gl";

/**
 * @param {string} sub - the raw Cognito sub
 * @returns {Promise<{allowed: boolean, reason: "not-enforced"|"active-subscription"|"no-subscription"|"expired",
 *   bundleId: string|null, expiry: string|null, checkedAt: string}>}
 */
export async function entitlementFor(sub) {
  const checkedAt = new Date().toISOString();

  if (process.env.BOOKS_ENTITLEMENT_ENFORCED !== "true") {
    return { allowed: true, reason: "not-enforced", bundleId: null, expiry: null, checkedAt };
  }

  await initializeSalt();
  const booksBundleId = process.env.BOOKS_BUNDLE_ID || DEFAULT_BOOKS_BUNDLE_ID;
  const bundles = await getUserBundles(sub);
  const matchingBundle = bundles.find((bundle) => bundle.bundleId === booksBundleId);

  if (!matchingBundle) {
    logger.info({ message: "No matching DIYA-GL bundle", bundleId: booksBundleId });
    return { allowed: false, reason: "no-subscription", bundleId: null, expiry: null, checkedAt };
  }

  const isActive = matchingBundle.subscriptionStatus === "active";
  const isUnexpired = matchingBundle.expiry ? Date.parse(matchingBundle.expiry) > Date.now() : true;

  if (isActive && isUnexpired) {
    return {
      allowed: true,
      reason: "active-subscription",
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
    allowed: false,
    reason: "expired",
    bundleId: matchingBundle.bundleId,
    expiry: matchingBundle.expiry || null,
    checkedAt,
  };
}
