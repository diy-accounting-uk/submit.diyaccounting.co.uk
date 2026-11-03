// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-22 Check diya-gl retention entitlement
// - **Use when:** code must decide whether a caller's books get resident or sandbox retention.
// - **Does:** The diyaGlEntitlement.js entitlementFor function decides retention tier. An active unexpired resident-pro bundle, or a bundle that includes it, gives resident retention for the caller's own books. A practice's active resident-tax-agent subscription plus a matching client row gives resident retention for a client-scoped request.
// - **Run:** `import { entitlementFor } from "app/services/diyaGlEntitlement.js"`
// - **Entry:** `app/services/diyaGlEntitlement.js:entitlementFor`
// - **Files:** app/services/diyaGlEntitlement.js, app/unit-tests/services/diyaGlEntitlement.test.js, behaviour-tests/diyaGlStorage.behaviour.test.js, app/system-tests/diyaGlStorage.system.test.js
// - **Keywords:** diya-gl, retention, entitlement, resident tier, sandbox tier, resident-pro, resident-tax-agent, entitlementFor
// - **Related:** BILL-17, BILL-21
// @end-capability

// app/services/diyaGlEntitlement.js
//
// Decides a DIYA-GL book's retention tier: "resident" for an active subscriber to resident-pro or
// to a bundle that includes it, "sandbox" for everyone else.
// DIYA_GL_RESIDENT_TIER gates whether the resident tier is offered at all on this environment;
// off, every caller gets the sandbox tier without a bundle read.
//
// A caller passing a clientId is a practice reading or writing a client's book set: the
// retention then turns on the practice's own resident-tax-agent subscription rather than on any
// bundle held on the client's behalf, and on the client row existing under that same practice.
// Neither condition met, the client-scoped request falls back to the sandbox tier exactly as
// an unsubscribed caller's own books do.

import { createLogger } from "../lib/logger.js";
import { initializeSalt } from "./subHasher.js";
import { getUserBundles } from "../data/dynamoDbBundleRepository.js";
import { getClient } from "../data/dynamoDbPracticeClientRepository.js";
import { loadCatalogFromRoot } from "./productCatalog.js";
import { bundleIdsIncluding } from "../../web/public/lib/services/catalogue-aggregates.js";

const logger = createLogger({ source: "app/services/diyaGlEntitlement.js" });

// The one bundle that grants a practice the resident tier for its clients' books.
const PRACTICE_BUNDLE_ID = "resident-tax-agent";

// The bundles that grant the resident tier for a caller's own books: resident-pro and every
// bundle that includes it.
function personalBundleIds() {
  return bundleIdsIncluding(loadCatalogFromRoot(), "resident-pro");
}

// How long a sandbox book stays visible after its last save, or after the billing webhook moves
// a lapsed Resident Pro (or resident-tax-agent client) book onto this tier: the window a resubscribe can
// beat before the bucket's own `expire-sandbox` lifecycle rule (37 days) deletes the objects.
// Shared between diyaGlPut.js (a new sandbox book) and billingWebhookPost.js (a lapsed one), so
// the two can never drift apart.
export const SANDBOX_RETENTION_MS = 35 * 24 * 60 * 60 * 1000;

/**
 * Whether the given bundle list carries an active, unexpired resident-tax-agent subscription: the
 * one rule that decides a practice's own entitlement for client-scoped requests.
 *
 * @param {object[]} bundles - as returned by `getUserBundles`
 * @returns {boolean}
 */
export function hasActivePracticeSubscription(bundles) {
  const practiceBundle = bundles.find((bundle) => bundle.bundleId === PRACTICE_BUNDLE_ID);
  return Boolean(practiceBundle && isActiveAndUnexpired(practiceBundle));
}

function isActiveAndUnexpired(bundle) {
  const isUnexpired = bundle.expiry ? Date.parse(bundle.expiry) > Date.now() : true;
  return bundle.subscriptionStatus === "active" && isUnexpired;
}

/**
 * @param {string} sub - the raw Cognito sub
 * Own books (no clientId): resident when the caller holds an active, unexpired resident-pro bundle
 * or a bundle that includes it; sandbox otherwise.
 *
 * @param {string} [clientId] - when given, decides the tier for that client's book set: the
 *   caller's own resident-tax-agent subscription and the client row belonging to the caller, rather
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

  const diyaGlBundleIds = personalBundleIds();
  const heldBundles = bundles.filter((bundle) => diyaGlBundleIds.includes(bundle.bundleId));
  const matchingBundle = heldBundles.find(isActiveAndUnexpired) ?? heldBundles[0];

  if (!matchingBundle) {
    logger.info({ message: "No matching DIYA-GL bundle", bundleIds: diyaGlBundleIds });
    return { retention: "sandbox", reason: "no-subscription", residentTier: true, bundleId: null, expiry: null, checkedAt };
  }

  if (isActiveAndUnexpired(matchingBundle)) {
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
 * while the practice itself holds an active, unexpired resident-tax-agent subscription and the client
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
  if (!hasActivePracticeSubscription(bundles)) {
    logger.info({ message: "Client-scoped request refused: no active resident-tax-agent subscription", clientId });
    return { retention: "sandbox", reason: "no-practice-subscription", residentTier: true, bundleId: null, expiry: null, checkedAt };
  }

  const client = await getClient(sub, clientId);
  if (!client) {
    logger.info({ message: "Client-scoped request refused: client not found for this practice", clientId });
    return { retention: "sandbox", reason: "client-not-found", residentTier: true, bundleId: null, expiry: null, checkedAt };
  }

  const practiceBundle = bundles.find((bundle) => bundle.bundleId === PRACTICE_BUNDLE_ID);
  return {
    retention: "resident",
    reason: "active-subscription",
    residentTier: true,
    bundleId: PRACTICE_BUNDLE_ID,
    expiry: practiceBundle.expiry || null,
    checkedAt,
  };
}
