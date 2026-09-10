// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/diyaGlEntitlement.js
//
// Gates the DIYA-GL PUT route on an active subscription. A stub until the billing row wires up
// the DIYA-GL bundle: DIYA_GL_ENTITLEMENT_ENFORCED stays unset (or "false") until then, so every
// caller passes.

import { createLogger } from "../lib/logger.js";
import { initializeSalt } from "./subHasher.js";
import { getUserBundles } from "../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/services/diyaGlEntitlement.js" });

const DEFAULT_DIYA_GL_BUNDLE_ID = "resident-diya-gl";

/**
 * @param {string} sub - the raw Cognito sub
 * @returns {Promise<{allowed: boolean, reason: "not-enforced"|"active-subscription"|"no-subscription"|"expired",
 *   bundleId: string|null, expiry: string|null, checkedAt: string}>}
 */
export async function entitlementFor(sub) {
  const checkedAt = new Date().toISOString();

  if (process.env.DIYA_GL_ENTITLEMENT_ENFORCED !== "true") {
    return { allowed: true, reason: "not-enforced", bundleId: null, expiry: null, checkedAt };
  }

  await initializeSalt();
  const diyaGlBundleId = process.env.DIYA_GL_BUNDLE_ID || DEFAULT_DIYA_GL_BUNDLE_ID;
  const bundles = await getUserBundles(sub);
  const matchingBundle = bundles.find((bundle) => bundle.bundleId === diyaGlBundleId);

  if (!matchingBundle) {
    logger.info({ message: "No matching DIYA-GL bundle", bundleId: diyaGlBundleId });
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
