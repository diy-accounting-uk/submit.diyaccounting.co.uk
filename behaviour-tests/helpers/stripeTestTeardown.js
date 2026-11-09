// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/stripeTestTeardown.js
//
// End-of-run teardown for the suites that take a subscription through Stripe checkout. It cancels
// every test-mode subscription held by the run's synthetic lane user, at once, so a probe run
// leaves no active subscription that renews and calls the webhook.

import Stripe from "stripe";
import { readSecret } from "@app/lib/cachedSecret.js";
import { isSyntheticTestUserEmail } from "@app/lib/syntheticTestUser.js";

const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * The Stripe test key this lane resolves: STRIPE_TEST_SECRET_KEY, then the secret named by
 * STRIPE_TEST_SECRET_KEY_ARN. Null when neither is set (the simulator lane).
 */
export async function resolveStripeTestKey(env = process.env) {
  if (env.STRIPE_TEST_SECRET_KEY) return env.STRIPE_TEST_SECRET_KEY.trim();
  if (env.STRIPE_TEST_SECRET_KEY_ARN) {
    const secret = await readSecret(env.STRIPE_TEST_SECRET_KEY_ARN);
    if (!secret) throw new Error("The Stripe test secret key is empty");
    return String(secret).trim();
  }
  return null;
}

/**
 * Cancel, immediately, every live subscription of every Stripe customer whose email is the lane
 * user's. Returns the cancelled subscription ids. Throws on a live key and on any Stripe error.
 *
 * @param {{ email: string|null, log?: Function, secretKey?: string|null, stripe?: object }} options
 *   secretKey and stripe are for tests; a run passes only the email.
 */
export async function cancelLaneTestSubscriptions({ email, log = console.log, secretKey, stripe } = {}) {
  const key = secretKey === undefined ? await resolveStripeTestKey() : secretKey;
  if (!key) {
    log("Stripe test teardown: no Stripe test key on this lane, nothing to cancel");
    return [];
  }
  if (key.startsWith("sk_live_")) {
    throw new Error("Stripe test teardown refuses a live Stripe key");
  }
  if (!isSyntheticTestUserEmail(email)) {
    log(`Stripe test teardown: ${email ?? "no user"} is not a synthetic lane user, nothing to cancel`);
    return [];
  }

  const client = stripe ?? new Stripe(key);
  const cancelled = [];
  for await (const customer of client.customers.list({ email: email.trim().toLowerCase(), limit: 100 })) {
    if (!isSyntheticTestUserEmail(customer.email)) continue;
    for await (const subscription of client.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })) {
      if (ENDED_STATUSES.has(subscription.status)) continue;
      await client.subscriptions.cancel(subscription.id);
      cancelled.push(subscription.id);
    }
  }
  log(`Stripe test teardown: cancelled ${cancelled.length} test subscription(s) for ${email}`);
  return cancelled;
}
