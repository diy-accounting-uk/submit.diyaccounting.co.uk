// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/tokenEnforcement.js

import { createLogger } from "../lib/logger.js";
import { consumeToken, getUserBundles, recordTokenEvent } from "../data/dynamoDbBundleRepository.js";
import { isUnlimitedTokenGrant } from "./productCatalog.js";

const logger = createLogger({ source: "app/services/tokenEnforcement.js" });

/**
 * Find a bundle owned by the user that both grants an activity and still has enough
 * tokens remaining to cover its cost. A bundle carrying an unlimited grant (the resident-pro
 * practice licence) always qualifies, regardless of how many tokens it has recorded as consumed.
 *
 * @param {Array<Object>} userBundles - Bundles returned by getUserBundles
 * @param {Object} activity - Activity entry from the catalogue
 * @param {number} tokenCost - Tokens the activity costs
 * @returns {Object|undefined} The qualifying bundle, or undefined if none qualifies
 */
function findQualifyingBundle(userBundles, activity, tokenCost) {
  const activityBundleIds = new Set(activity.bundles || []);
  return userBundles.find((b) => {
    if (!activityBundleIds.has(b.bundleId)) return false;
    if (b.tokensGranted === undefined) return false;
    if (isUnlimitedTokenGrant(b.tokensGranted)) return true;
    const remaining = b.tokensGranted - (b.tokensConsumed || 0);
    return remaining >= tokenCost;
  });
}

/**
 * Check whether a qualifying bundle currently has enough tokens for an activity, without
 * consuming one. Used as a reservation gate: block a caller with no tokens before any HMRC
 * request is made, while the actual charge happens only once HMRC confirms success - a
 * submission HMRC rejects must not cost a token, so nothing is decremented here.
 *
 * @param {string} userId - User sub
 * @param {string} activityId - Activity ID from catalogue (e.g. "submit-vat")
 * @param {Object} catalog - Parsed catalogue
 * @returns {Promise<Object>} { available: true, cost } or { available: false, reason, tokensRemaining }
 */
export async function hasTokensForActivity(userId, activityId, catalog) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  if (!activity) {
    return { available: true, cost: 0 };
  }

  const tokenCost = activity.tokenCost || 0;
  if (tokenCost === 0) {
    return { available: true, cost: 0 };
  }

  const userBundles = await getUserBundles(userId);
  const qualifyingBundle = findQualifyingBundle(userBundles, activity, tokenCost);

  if (!qualifyingBundle) {
    logger.info({ message: "No qualifying bundle with tokens remaining", userId, activityId });
    return { available: false, reason: "tokens_exhausted", tokensRemaining: 0 };
  }

  return { available: true, cost: tokenCost };
}

/**
 * Consume a token for an activity, if the activity costs tokens.
 *
 * Looks up the activity in the catalogue to determine token cost,
 * finds a qualifying user bundle with remaining tokens, and
 * atomically decrements the token counter. Called only once an HMRC request has
 * succeeded - see hasTokensForActivity for the pre-flight check that runs beforehand.
 *
 * @param {string} userId - User sub
 * @param {string} activityId - Activity ID from catalogue (e.g. "submit-vat")
 * @param {Object} catalog - Parsed catalogue
 * @returns {Promise<Object>} { consumed: true, tokensRemaining, cost } or { consumed: false, reason }
 */
export async function consumeTokenForActivity(userId, activityId, catalog) {
  const activity = catalog?.activities?.find((a) => a.id === activityId);
  if (!activity) {
    logger.info({ message: "Activity not found in catalog, treating as free", activityId });
    return { consumed: true, cost: 0 };
  }

  const tokenCost = activity.tokenCost || 0;
  if (tokenCost === 0) {
    logger.info({ message: "Activity is free (no token cost)", activityId });
    return { consumed: true, cost: 0 };
  }

  // Load user's bundles to find one that qualifies for this activity and has tokens
  const userBundles = await getUserBundles(userId);

  // Find a qualifying bundle: must be in the activity's bundle list and have tokens remaining
  const qualifyingBundle = findQualifyingBundle(userBundles, activity, tokenCost);

  if (!qualifyingBundle) {
    logger.info({ message: "No qualifying bundle with tokens remaining", userId, activityId });
    return { consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 };
  }

  // An unlimited grant (the resident-pro practice licence) is exempt from the token count:
  // no DynamoDB decrement, no consumption event, no possibility of exhaustion.
  if (isUnlimitedTokenGrant(qualifyingBundle.tokensGranted)) {
    logger.info({ message: "Unlimited grant - no token consumption recorded", userId, activityId, bundleId: qualifyingBundle.bundleId });
    return { consumed: true, cost: tokenCost };
  }

  // Atomically consume a token from the qualifying bundle
  const result = await consumeToken(userId, qualifyingBundle.bundleId, tokenCost);
  logger.info({
    message: "Token consumption result",
    userId,
    activityId,
    bundleId: qualifyingBundle.bundleId,
    consumed: result.consumed,
    tokensRemaining: result.tokensRemaining,
  });

  if (result.consumed) {
    recordTokenEvent(userId, qualifyingBundle.bundleId, {
      activity: activityId,
      tokensUsed: tokenCost,
    }).catch((err) => {
      logger.warn({ message: "Failed to record token event", error: err.message, userId, activityId });
    });
  }

  return { ...result, cost: tokenCost };
}

/**
 * Charge the token for an activity once HMRC has confirmed success. Loads the catalogue
 * itself so every calling handler shares one lookup path. Never throws: a write failure
 * here must not turn an HMRC submission that already succeeded into a failed response, so
 * it is logged and swallowed - the customer keeps their receipt, and the shortfall shows up
 * as an under-charged bundle rather than a broken submission.
 *
 * @param {string} userId - User sub
 * @param {string} activityId - Activity ID from catalogue (e.g. "submit-vat")
 * @returns {Promise<Object>} The consumeTokenForActivity result, or { consumed: false, reason: "charge_error" } on failure
 */
export async function chargeTokenOnSuccess(userId, activityId) {
  try {
    const { loadCatalogFromRoot } = await import("./productCatalog.js");
    const catalog = loadCatalogFromRoot();
    const result = await consumeTokenForActivity(userId, activityId, catalog);
    if (!result.consumed) {
      logger.warn({
        message: "Token charge skipped after HMRC success - no qualifying bundle at charge time",
        userId,
        activityId,
        reason: result.reason,
      });
    }
    return result;
  } catch (error) {
    logger.error({ message: "Token charge failed after HMRC success", userId, activityId, error: error.message });
    return { consumed: false, reason: "charge_error" };
  }
}
