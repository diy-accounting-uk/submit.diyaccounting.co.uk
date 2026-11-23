// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/activityCharges.js
//
// One payment covers one filing: billingActivityCheckoutPost.js opens a Stripe Checkout Session
// in `payment` mode for an activityId/subjectKey pair; billingWebhookPost.js records the paid
// charge idempotently on checkout.session.completed; the activity's own consuming route marks it
// used so a later attempt at the same filing cannot spend the same payment twice.

import { subHashCandidates } from "./subHasher.js";
import {
  buildChargeKey,
  putActivityChargeIfAbsent,
  getActivityCharge,
  markActivityChargeUsed,
  markActivityChargeRefunded,
} from "../data/dynamoDbActivityChargeRepository.js";
import { getStripeClient } from "../lib/stripeClient.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/activityCharges.js" });

export async function hasPaidCharge(userSub, activityId, subjectKey) {
  for (const { hashedSub } of subHashCandidates(userSub)) {
    const charge = await getActivityCharge(hashedSub, buildChargeKey(activityId, subjectKey));
    if (charge) return charge.status === "paid";
  }
  return false;
}

/**
 * The user's paid charge for an activity and subject, or null: one not yet used or refunded.
 * @returns {Promise<object|null>} the charge, with its priceKey when the activity's prices carry keys
 */
export async function paidCharge(userSub, activityId, subjectKey) {
  for (const { hashedSub } of subHashCandidates(userSub)) {
    const charge = await getActivityCharge(hashedSub, buildChargeKey(activityId, subjectKey));
    if (charge) return charge.status === "paid" ? charge : null;
  }
  return null;
}

/**
 * Refund a charge in full through Stripe, in the mode it was paid in, and mark it refunded. A
 * charge already refunded, or one with no payment to refund, is left as it is. Stripe's
 * idempotency key makes a retried refund of the same charge return the first refund.
 * @returns {Promise<{refunded: boolean, refundId?: string, reason?: string}>}
 */
export async function refundCharge(userSub, activityId, subjectKey) {
  for (const { hashedSub } of subHashCandidates(userSub)) {
    const chargeKey = buildChargeKey(activityId, subjectKey);
    const charge = await getActivityCharge(hashedSub, chargeKey);
    if (!charge) continue;
    if (charge.status === "refunded") return { refunded: false, reason: "already-refunded" };
    if (!charge.stripePaymentIntentId) {
      logger.warn({ message: "Activity charge has no payment to refund", hashedSub, chargeKey });
      return { refunded: false, reason: "no-payment" };
    }
    const stripe = await getStripeClient({ test: charge.stripeLivemode !== true });
    const refund = await stripe.refunds.create(
      { payment_intent: charge.stripePaymentIntentId, metadata: { activityId, subjectKey } },
      { idempotencyKey: `refund-${hashedSub}-${chargeKey}` },
    );
    await markActivityChargeRefunded(hashedSub, chargeKey, refund.id);
    logger.info({ message: "Activity charge refunded", hashedSub, chargeKey, refundId: refund.id });
    return { refunded: true, refundId: refund.id };
  }
  return { refunded: false, reason: "no-charge" };
}

// The webhook only ever has the hashed sub from the checkout session's own metadata, never the
// raw Cognito sub — same constraint as putBundleByHashedSub in dynamoDbBundleRepository.js.
export async function recordPaidChargeByHashedSub(hashedSub, activityId, subjectKey, details = {}) {
  return putActivityChargeIfAbsent(hashedSub, buildChargeKey(activityId, subjectKey), {
    activityId,
    subjectKey,
    status: "paid",
    ...details,
  });
}

export async function markChargeUsed(userSub, activityId, subjectKey) {
  for (const { hashedSub } of subHashCandidates(userSub)) {
    if (await markActivityChargeUsed(hashedSub, buildChargeKey(activityId, subjectKey))) return true;
  }
  return false;
}
