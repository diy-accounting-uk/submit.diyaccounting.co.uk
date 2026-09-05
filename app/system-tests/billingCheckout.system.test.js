// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/billingCheckout.system.test.js

import { describe, test, expect, vi, beforeAll, afterAll } from "vitest";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { startStripeSimulator } from "../test-support/stripeSimulator.js";
import { makeIdToken, buildEventWithToken } from "../test-helpers/eventBuilders.js";

// Mock DynamoDB bundle repository (getUserBundles for synthetic auto-detection)
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn().mockResolvedValue([]),
}));

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("System: Billing Checkout against Stripe Simulator", () => {
  let simulatorServer;
  let simulatorPort;

  beforeAll(async () => {
    simulatorServer = await startStripeSimulator(0); // random port
    simulatorPort = simulatorServer.address().port;

    // Point Stripe SDK at the local simulator
    process.env.STRIPE_SECRET_KEY = "sk_test_system_test";
    process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${simulatorPort}`;
    process.env.STRIPE_PRICE_ID_RESIDENT_PRO = "price_test_system";
    process.env.DIY_SUBMIT_BASE_URL = "https://test-submit.diyaccounting.co.uk/";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-system-tests"}}';
  });

  afterAll(async () => {
    if (simulatorServer) {
      await new Promise((resolve) => simulatorServer.close(resolve));
    }
  });

  test("billingCheckoutPost creates checkout session via Stripe simulator", async () => {
    const { ingestHandler } = await import("../functions/billing/billingCheckoutPost.js");
    const token = makeIdToken("system-test-user", { email: "system@test.diyaccounting.co.uk" });
    const event = buildEventWithToken(token);

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.checkoutUrl).toContain("checkout.stripe.com");
  });

  test("billingCheckoutPost returns 401 without auth", async () => {
    const { ingestHandler } = await import("../functions/billing/billingCheckoutPost.js");
    const event = buildEventWithToken(null);

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
  });
});
