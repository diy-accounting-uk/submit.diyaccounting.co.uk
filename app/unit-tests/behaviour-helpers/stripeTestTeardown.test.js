// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi } from "vitest";
import { cancelLaneTestSubscriptions, resolveStripeTestKey } from "../../../behaviour-tests/helpers/stripeTestTeardown.js";

function stubStripe({ customers, subscriptionsByCustomer }) {
  const cancel = vi.fn(async (id) => ({ id, status: "canceled" }));
  const listCustomers = vi.fn(async function* ({ email }) {
    for (const customer of customers.filter((c) => c.email === email)) yield customer;
  });
  const listSubscriptions = vi.fn(async function* ({ customer }) {
    for (const subscription of subscriptionsByCustomer[customer] ?? []) yield subscription;
  });
  return {
    stripe: { customers: { list: listCustomers }, subscriptions: { list: listSubscriptions, cancel } },
    cancel,
    listCustomers,
  };
}

const LANE = "synthetic-local@test.diyaccounting.co.uk";

describe("behaviour-tests/helpers/stripeTestTeardown", () => {
  test("cancels the live subscriptions of the lane user and skips ended ones", async () => {
    const { stripe, cancel } = stubStripe({
      customers: [{ id: "cus_1", email: LANE }],
      subscriptionsByCustomer: {
        cus_1: [
          { id: "sub_active", status: "active" },
          { id: "sub_trial", status: "trialing" },
          { id: "sub_ended", status: "canceled" },
        ],
      },
    });
    const cancelled = await cancelLaneTestSubscriptions({ email: LANE, secretKey: "sk_test_x", stripe, log: () => {} });
    expect(cancelled).toEqual(["sub_active", "sub_trial"]);
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(["sub_active", "sub_trial"]);
  });

  test("never lists or cancels for an email that is not a synthetic lane user", async () => {
    const { stripe, cancel, listCustomers } = stubStripe({ customers: [], subscriptionsByCustomer: {} });
    const cancelled = await cancelLaneTestSubscriptions({
      email: "real.person@example.com",
      secretKey: "sk_test_x",
      stripe,
      log: () => {},
    });
    expect(cancelled).toEqual([]);
    expect(listCustomers).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  test("skips a customer whose email is not synthetic", async () => {
    const { stripe, cancel } = stubStripe({
      customers: [{ id: "cus_real", email: LANE.replace("synthetic-local", "someone") }],
      subscriptionsByCustomer: { cus_real: [{ id: "sub_real", status: "active" }] },
    });
    await cancelLaneTestSubscriptions({ email: LANE, secretKey: "sk_test_x", stripe, log: () => {} });
    expect(cancel).not.toHaveBeenCalled();
  });

  test("refuses a live key", async () => {
    const { stripe, cancel } = stubStripe({ customers: [], subscriptionsByCustomer: {} });
    await expect(cancelLaneTestSubscriptions({ email: LANE, secretKey: "sk_live_x", stripe, log: () => {} })).rejects.toThrow(/live/);
    expect(cancel).not.toHaveBeenCalled();
  });

  test("is a no-op that logs one line without a key", async () => {
    const log = vi.fn();
    const { stripe, cancel } = stubStripe({ customers: [], subscriptionsByCustomer: {} });
    const cancelled = await cancelLaneTestSubscriptions({ email: LANE, secretKey: null, stripe, log });
    expect(cancelled).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  test("a Stripe failure rejects", async () => {
    const stripe = {
      customers: {
        list: async function* () {
          throw new Error("stripe down");
        },
      },
    };
    await expect(cancelLaneTestSubscriptions({ email: LANE, secretKey: "sk_test_x", stripe, log: () => {} })).rejects.toThrow(
      "stripe down",
    );
  });

  test("resolves the key from the environment, and null when none is set", async () => {
    expect(await resolveStripeTestKey({ STRIPE_TEST_SECRET_KEY: " sk_test_env " })).toBe("sk_test_env");
    expect(await resolveStripeTestKey({})).toBeNull();
  });
});
