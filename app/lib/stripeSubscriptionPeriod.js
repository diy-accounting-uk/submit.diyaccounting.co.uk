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
