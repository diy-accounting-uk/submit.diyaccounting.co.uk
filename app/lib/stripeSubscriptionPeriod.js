// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/stripeSubscriptionPeriod.js

/**
 * The billing period of a Stripe Subscription, in epoch seconds. Current API versions carry it
 * on the subscription item; earlier replies carry it on the subscription itself.
 *
 * @param {object} subscription
 * @returns {{ start: number|null, end: number|null }}
 */
export function subscriptionPeriod(subscription) {
  const item = subscription?.items?.data?.[0];
  return {
    start: item?.current_period_start ?? subscription?.current_period_start ?? null,
    end: item?.current_period_end ?? subscription?.current_period_end ?? null,
  };
}

/**
 * Whether a Stripe Subscription is scheduled to cancel at the end of its current period. The
 * customer portal schedules that either with cancel_at_period_end or with cancel_at set to the
 * period end. A cancel_at after the period end cancels a later period, so it is not this one.
 *
 * @param {object} subscription
 * @returns {boolean}
 */
export function cancelsAtPeriodEnd(subscription) {
  if (subscription?.cancel_at_period_end) return true;
  const { end } = subscriptionPeriod(subscription);
  return Boolean(subscription?.cancel_at && end && subscription.cancel_at <= end);
}
