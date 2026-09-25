// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/activityCharges.js
//
// One payment covers one filing: billingActivityCheckoutPost.js opens a Stripe Checkout Session
// in `payment` mode for an activityId/subjectKey pair; billingWebhookPost.js records the paid
// charge idempotently on checkout.session.completed; the activity's own consuming route marks it
// used so a later attempt at the same filing cannot spend the same payment twice.

import { hashSub } from "./subHasher.js";
import {
  buildChargeKey,
  putActivityChargeIfAbsent,
  getActivityCharge,
  markActivityChargeUsed,
} from "../data/dynamoDbActivityChargeRepository.js";

export async function hasPaidCharge(userSub, activityId, subjectKey) {
  const hashedSub = hashSub(userSub);
  const charge = await getActivityCharge(hashedSub, buildChargeKey(activityId, subjectKey));
  return charge?.status === "paid";
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
  const hashedSub = hashSub(userSub);
  return markActivityChargeUsed(hashedSub, buildChargeKey(activityId, subjectKey));
}
