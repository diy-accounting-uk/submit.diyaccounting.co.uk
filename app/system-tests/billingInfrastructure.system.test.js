// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/billingInfrastructure.system.test.js

import { describe, test, expect, afterAll } from "vitest";
import { startStripeSimulator } from "../test-support/stripeSimulator.js";

describe("System: Billing Infrastructure", () => {
  let simulatorServer;

  afterAll(async () => {
    if (simulatorServer) {
      await new Promise((resolve) => simulatorServer.close(resolve));
    }
  });

  test("billing Lambda modules can be imported", async () => {
    const checkoutPost = await import("../functions/billing/billingCheckoutPost.js");
    expect(checkoutPost.ingestHandler).toBeDefined();
    expect(checkoutPost.apiEndpoint).toBeDefined();

    const portalGet = await import("../functions/billing/billingPortalGet.js");
    expect(portalGet.ingestHandler).toBeDefined();
    expect(portalGet.apiEndpoint).toBeDefined();

    const recoverPost = await import("../functions/billing/billingRecoverPost.js");
    expect(recoverPost.ingestHandler).toBeDefined();
    expect(recoverPost.apiEndpoint).toBeDefined();

    const webhookPost = await import("../functions/billing/billingWebhookPost.js");
    expect(webhookPost.ingestHandler).toBeDefined();
    expect(webhookPost.apiEndpoint).toBeDefined();
  });

  test("billingCheckoutPost returns 401 without auth", async () => {
    const { ingestHandler } = await import("../functions/billing/billingCheckoutPost.js");
    const result = await ingestHandler({
      headers: { host: "test" },
      requestContext: { requestId: "test-req" },
    });
    expect(result.statusCode).toBe(401);
  });

  test("billingWebhookPost returns 400 without stripe-signature", async () => {
    const { ingestHandler } = await import("../functions/billing/billingWebhookPost.js");
    const result = await ingestHandler({
      body: "{}",
      headers: { "host": "test", "content-type": "application/json" },
      requestContext: { http: { method: "POST", path: "/api/v1/billing/webhook" } },
    });
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("stripe-signature");
  });

  test("Stripe simulator starts and responds", async () => {
    simulatorServer = await startStripeSimulator(0); // random port
    const port = simulatorServer.address().port;

    // Test checkout session endpoint
    const checkoutResponse = await fetch(`http://127.0.0.1:${port}/v1/checkout/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "subscription" }),
    });
    const checkoutData = await checkoutResponse.json();
    expect(checkoutData.object).toBe("checkout.session");
    expect(checkoutData.id).toMatch(/^cs_test_/);
    expect(checkoutData.url).toContain("checkout.stripe.com");

    // Test subscription list endpoint
    const subsResponse = await fetch(`http://127.0.0.1:${port}/v1/subscriptions`);
    const subsData = await subsResponse.json();
    expect(subsData.object).toBe("list");
    expect(subsData.data).toEqual([]);

    // Test billing portal endpoint
    const portalResponse = await fetch(`http://127.0.0.1:${port}/v1/billing_portal/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer: "cus_test_123" }),
    });
    const portalData = await portalResponse.json();
    expect(portalData.object).toBe("billing_portal.session");
    expect(portalData.url).toContain("billing.stripe.com");
  });

  test("subscription repository module can be imported", async () => {
    const repo = await import("../data/dynamoDbSubscriptionRepository.js");
    expect(repo.putSubscription).toBeDefined();
    expect(repo.getSubscription).toBeDefined();
    expect(repo.updateSubscription).toBeDefined();
  });
});
