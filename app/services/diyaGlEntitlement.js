// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/diyaGlEntitlement.js
//
// Decides a DIYA-GL book's retention tier: "resident" for an active subscriber to the resident
// bundle or the resident-diya-gl bundle it replaced, "sandbox" for everyone else.
// DIYA_GL_RESIDENT_TIER gates whether the resident tier is offered at all on this environment;
// off, every caller gets the sandbox tier without a bundle read.
//
// A caller passing a clientId is a practice reading or writing a client's book set
// (PLAN_PRICE_UPDATE.md (d)): the retention then turns on the practice's own resident-pro
// subscription rather than on any bundle held on the client's behalf, and on the client row
// existing under that same practice. Neither condition met, the client-scoped request falls back
// to the sandbox tier exactly as an unsubscribed caller's own books do.

import { createLogger } from "../lib/logger.js";
import { initializeSalt } from "./subHasher.js";
import { getUserBundles } from "../data/dynamoDbBundleRepository.js";
import { getClient } from "../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/services/diyaGlEntitlement.js" });

// resident first: the current bundle. resident-diya-gl second: honours a subscriber who has not
// migrated off the bundle it replaced. Either grants the resident tier.
const DEFAULT_DIYA_GL_BUNDLE_IDS = ["resident", "resident-diya-gl"];

// The one bundle that grants a practice the resident tier for its clients' books.
const PRACTICE_BUNDLE_ID = "resident-pro";

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
 * @param {string} [clientId] - when given, decides the tier for that client's book set: the
 *   caller's own resident-pro subscription and the client row belonging to the caller, rather
 *   than any bundle held against the client
 * @returns {Promise<{retention: "sandbox"|"resident",
 *   reason: "tier-disabled"|"active-subscription"|"no-subscription"|"expired"|
 *     "no-practice-subscription"|"client-not-found",
 *   residentTier: boolean, bundleId: string|null, expiry: string|null, checkedAt: string}>}
 */
export async function entitlementFor(sub, clientId) {
  const checkedAt = new Date().toISOString();

  if (process.env.DIYA_GL_RESIDENT_TIER !== "true") {
    return { retention: "sandbox", reason: "tier-disabled", residentTier: false, bundleId: null, expiry: null, checkedAt };
  }

  await initializeSalt();
  const bundles = await getUserBundles(sub);

  if (clientId) {
    return entitlementForClient(sub, clientId, bundles, checkedAt);
  }

  const diyaGlBundleIds = process.env.DIYA_GL_BUNDLE_ID ? [process.env.DIYA_GL_BUNDLE_ID] : DEFAULT_DIYA_GL_BUNDLE_IDS;
  const matchingBundle = diyaGlBundleIds.map((id) => bundles.find((bundle) => bundle.bundleId === id)).find(Boolean);

  if (!matchingBundle) {
    logger.info({ message: "No matching DIYA-GL bundle", bundleIds: diyaGlBundleIds });
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

/**
 * The client-scoped half of `entitlementFor`: a client's book set gets the resident tier only
 * while the practice itself holds an active, unexpired resident-pro subscription and the client
 * row exists under that same practice (`getClient` is keyed by the caller's own hashed sub, so a
 * client id belonging to another practice, or archived, reads as not found here exactly as it
 * does at the calling route). Either condition failing falls back to the sandbox tier rather than
 * granting a bundle read on the client's own account, since a client carries no bundle of its own.
 *
 * @param {string} sub - the practice's raw Cognito sub
 * @param {string} clientId
 * @param {object[]} bundles - the caller's bundles, already read by `entitlementFor`
 * @param {string} checkedAt
 * @returns {Promise<object>} the same shape `entitlementFor` returns
 */
async function entitlementForClient(sub, clientId, bundles, checkedAt) {
  const practiceBundle = bundles.find((bundle) => bundle.bundleId === PRACTICE_BUNDLE_ID);
  const isActive = practiceBundle?.subscriptionStatus === "active";
  const isUnexpired = practiceBundle?.expiry ? Date.parse(practiceBundle.expiry) > Date.now() : true;

  if (!practiceBundle || !isActive || !isUnexpired) {
    logger.info({ message: "Client-scoped request refused: no active resident-pro subscription", clientId });
    return { retention: "sandbox", reason: "no-practice-subscription", residentTier: true, bundleId: null, expiry: null, checkedAt };
  }

  const client = await getClient(sub, clientId);
  if (!client) {
    logger.info({ message: "Client-scoped request refused: client not found for this practice", clientId });
    return { retention: "sandbox", reason: "client-not-found", residentTier: true, bundleId: null, expiry: null, checkedAt };
  }

  return {
    retention: "resident",
    reason: "active-subscription",
    residentTier: true,
    bundleId: PRACTICE_BUNDLE_ID,
    expiry: practiceBundle.expiry || null,
    checkedAt,
  };
}
