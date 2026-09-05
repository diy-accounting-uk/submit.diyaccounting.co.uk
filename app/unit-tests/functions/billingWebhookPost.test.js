// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import Stripe from "stripe";

// Mock Stripe SDK
const mockSubscriptionsRetrieve = vi.fn();
const mockWebhooksConstructEvent = vi.fn();
const mockChargesRetrieve = vi.fn();
const mockPaymentIntentsRetrieve = vi.fn();
const mockInvoicesRetrieve = vi.fn();
const mockDisputesClose = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      constructor() {
        this.subscriptions = {
          retrieve: mockSubscriptionsRetrieve,
        };
        this.webhooks = {
          constructEvent: mockWebhooksConstructEvent,
        };
        this.charges = {
          retrieve: mockChargesRetrieve,
        };
        this.paymentIntents = {
          retrieve: mockPaymentIntentsRetrieve,
        };
        this.invoices = {
          retrieve: mockInvoicesRetrieve,
        };
        this.disputes = {
          close: mockDisputesClose,
        };
      }
    },
  };
});

// Mock Secrets Manager (stripeClient.js uses it)
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send() {
      return { SecretString: "sk_test_mock" };
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Mock EventBridge (activityAlert.js uses it), capturing sends so activity-event
// tests can inspect the Detail JSON directly.
const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Mock DynamoDB bundle repository
const mockPutBundleByHashedSub = vi.fn();
const mockUpdateBundleSubscriptionFields = vi.fn();
const mockResetTokensByHashedSub = vi.fn();
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  putBundleByHashedSub: (...args) => mockPutBundleByHashedSub(...args),
  updateBundleSubscriptionFields: (...args) => mockUpdateBundleSubscriptionFields(...args),
  resetTokensByHashedSub: (...args) => mockResetTokensByHashedSub(...args),
}));

// Mock DynamoDB subscription repository
const mockPutSubscription = vi.fn();
const mockGetSubscription = vi.fn();
const mockUpdateSubscription = vi.fn();
vi.mock("@app/data/dynamoDbSubscriptionRepository.js", () => ({
  putSubscription: (...args) => mockPutSubscription(...args),
  getSubscription: (...args) => mockGetSubscription(...args),
  updateSubscription: (...args) => mockUpdateSubscription(...args),
}));

import { ingestHandler } from "@app/functions/billing/billingWebhookPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildWebhookEvent(body, sig = "t=123,v1=abc") {
  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "stripe-signature": sig,
      "content-type": "application/json",
    },
    requestContext: {
      http: { method: "POST", path: "/api/v1/billing/webhook" },
    },
  };
}

function buildCheckoutSessionPayload(overrides = {}) {
  return {
    id: "evt_test_123",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_abc",
        mode: "subscription",
        subscription: "sub_test_456",
        customer: "cus_test_789",
        client_reference_id: "hashed_sub_value",
        customer_email: "user@example.com",
        metadata: {
          hashedSub: "hashed_sub_value",
          bundleId: "resident-pro",
        },
        ...overrides,
      },
    },
  };
}

function activityEventsNamed(name) {
  return mockEventBridgeSend.mock.calls
    .map((call) => JSON.parse(call[0].input.Entries[0].Detail))
    .filter((detail) => detail.event === name);
}

describe("billingWebhookPost", () => {
  beforeEach(() => {
    mockWebhooksConstructEvent.mockReset();
    mockSubscriptionsRetrieve.mockReset();
    mockChargesRetrieve.mockReset();
    mockPaymentIntentsRetrieve.mockReset();
    mockInvoicesRetrieve.mockReset();
    mockPutBundleByHashedSub.mockReset();
    mockPutSubscription.mockReset();
    mockGetSubscription.mockReset();
    mockUpdateSubscription.mockReset();
    mockUpdateBundleSubscriptionFields.mockReset();
    mockResetTokensByHashedSub.mockReset();
    mockEventBridgeSend.mockClear();

    mockPutBundleByHashedSub.mockResolvedValue(undefined);
    mockPutSubscription.mockResolvedValue(undefined);
    mockUpdateSubscription.mockResolvedValue(undefined);
    mockUpdateBundleSubscriptionFields.mockResolvedValue(undefined);
    mockResetTokensByHashedSub.mockResolvedValue(undefined);
    mockGetSubscription.mockResolvedValue(null);
    mockChargesRetrieve.mockResolvedValue({ id: "ch_test", billing_details: { email: "user@example.com" }, payment_intent: "pi_test" });
    mockPaymentIntentsRetrieve.mockResolvedValue({ id: "pi_test", invoice: "in_test" });
    mockInvoicesRetrieve.mockResolvedValue({ id: "in_test", parent: { subscription_details: { subscription: "sub_test_456" } } });
    mockDisputesClose.mockResolvedValue({ id: "dp_test", status: "lost" });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_test_456",
      status: "active",
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });

    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_live_mock";
    process.env.STRIPE_TEST_WEBHOOK_SECRET = "whsec_test_mock";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 400 when stripe-signature header is missing", async () => {
    const event = {
      body: "{}",
      headers: { "content-type": "application/json" },
      requestContext: { http: { method: "POST", path: "/api/v1/billing/webhook" } },
    };

    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("stripe-signature");
  });

  test("returns 400 when signature verification fails", async () => {
    mockWebhooksConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });

    const event = buildWebhookEvent({ type: "test" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Invalid webhook signature");
  });

  test("returns 200 and grants bundle on checkout.session.completed", async () => {
    const checkoutPayload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(checkoutPayload);

    const event = buildWebhookEvent(checkoutPayload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.received).toBe(true);

    // Verify bundle was granted
    expect(mockPutBundleByHashedSub).toHaveBeenCalledTimes(1);
    const [hashedSub, bundle] = mockPutBundleByHashedSub.mock.calls[0];
    expect(hashedSub).toBe("hashed_sub_value");
    expect(bundle.bundleId).toBe("resident-pro");
    expect(bundle.tokensGranted).toBe(100);
    expect(bundle.tokensConsumed).toBe(0);
    expect(bundle.subscriptionStatus).toBe("active");
    expect(bundle.stripeSubscriptionId).toBe("sub_test_456");
    expect(bundle.stripeCustomerId).toBe("cus_test_789");
    expect(bundle.cancelAtPeriodEnd).toBe(false);
    expect(bundle.qualifiers).toEqual({ synthetic: false, stripeTestMode: false });

    // Verify subscription record was stored
    expect(mockPutSubscription).toHaveBeenCalledTimes(1);
    const subRecord = mockPutSubscription.mock.calls[0][0];
    expect(subRecord.pk).toBe("stripe#sub_test_456");
    expect(subRecord.hashedSub).toBe("hashed_sub_value");
    expect(subRecord.bundleId).toBe("resident-pro");
    expect(subRecord.status).toBe("active");
  });

  test("uses client_reference_id as fallback when metadata.hashedSub is missing", async () => {
    const payload = buildCheckoutSessionPayload();
    delete payload.data.object.metadata.hashedSub;
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).toHaveBeenCalledTimes(1);
    const [hashedSub] = mockPutBundleByHashedSub.mock.calls[0];
    expect(hashedSub).toBe("hashed_sub_value");
  });

  test("skips bundle grant when hashedSub is missing from both metadata and client_reference_id", async () => {
    const payload = buildCheckoutSessionPayload({
      client_reference_id: null,
      metadata: { bundleId: "resident-pro" },
    });
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).not.toHaveBeenCalled();
    expect(mockPutSubscription).not.toHaveBeenCalled();
  });

  test("grants bundle even when subscription retrieval fails", async () => {
    mockSubscriptionsRetrieve.mockRejectedValue(new Error("Stripe API error"));
    const payload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).toHaveBeenCalledTimes(1);
    // Bundle should still have subscription fields with fallback values
    const [, bundle] = mockPutBundleByHashedSub.mock.calls[0];
    expect(bundle.bundleId).toBe("resident-pro");
    expect(bundle.currentPeriodEnd).toBeNull();
  });

  test("invoice.paid refreshes tokens when subscription record exists", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_test_456",
      current_period_end: periodEnd,
    });

    const payload = {
      id: "evt_test_invoice",
      type: "invoice.paid",
      data: {
        object: { id: "in_test_123", parent: { subscription_details: { subscription: "sub_test_456" } } },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockResetTokensByHashedSub).toHaveBeenCalledTimes(1);
    expect(mockResetTokensByHashedSub).toHaveBeenCalledWith("hashed_sub_value", "resident-pro", 100, expect.any(String));
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledTimes(1);
    expect(mockUpdateSubscription).toHaveBeenCalledTimes(1);
  });

  test("invoice.paid refreshes tokens when the subscription is an expanded object", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_test_456",
      current_period_end: periodEnd,
    });

    const payload = {
      id: "evt_test_invoice_expanded",
      type: "invoice.paid",
      data: {
        object: { id: "in_test_expanded", parent: { subscription_details: { subscription: { id: "sub_test_456", status: "active" } } } },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockGetSubscription).toHaveBeenCalledWith("stripe#sub_test_456");
    expect(mockResetTokensByHashedSub).toHaveBeenCalledTimes(1);
    expect(mockResetTokensByHashedSub).toHaveBeenCalledWith("hashed_sub_value", "resident-pro", 100, expect.any(String));
  });

  test("invoice.paid skips when no subscription record found", async () => {
    mockGetSubscription.mockResolvedValue(null);

    const payload = {
      id: "evt_test_invoice",
      type: "invoice.paid",
      data: {
        object: { id: "in_test_123", parent: { subscription_details: { subscription: "sub_test_456" } } },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockResetTokensByHashedSub).not.toHaveBeenCalled();
  });

  test("invoice.paid skips when invoice carries no subscription id", async () => {
    const payload = {
      id: "evt_test_invoice_no_sub",
      type: "invoice.paid",
      data: {
        object: { id: "in_test_no_sub", parent: { subscription_details: null } },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(mockResetTokensByHashedSub).not.toHaveBeenCalled();
  });

  test("customer.subscription.updated updates bundle status", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_sub_update",
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_test_456", status: "past_due", cancel_at_period_end: false },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledWith("hashed_sub_value", "resident-pro", {
      subscriptionStatus: "past_due",
      cancelAtPeriodEnd: false,
    });
    expect(mockUpdateSubscription).toHaveBeenCalledWith("stripe#sub_test_456", { status: "past_due", cancelAtPeriodEnd: false });
  });

  test("customer.subscription.deleted marks bundle as canceled", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_sub_delete",
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_test_456" },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledWith("hashed_sub_value", "resident-pro", {
      subscriptionStatus: "canceled",
      cancelAtPeriodEnd: false,
    });
    expect(mockUpdateSubscription).toHaveBeenCalledWith("stripe#sub_test_456", expect.objectContaining({ status: "canceled" }));
  });

  test("returns 200 for unhandled event types", async () => {
    const payload = {
      id: "evt_test_unknown",
      type: "customer.created",
      data: { object: { id: "cus_test_new" } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).not.toHaveBeenCalled();
  });

  test("logs unhandled event types without tripping the log-error-metric alarm's trigger words", async () => {
    // The prod-env-billing-webhook-log-errors alarm's metric filter matches any log
    // line containing ERROR, Error, Exception, Unhandled, "Task timed out", SEVERE, or
    // FATAL — regardless of pino log level. An expected, no-op event type (e.g.
    // customer.subscription.created, which routinely accompanies checkout.session.completed)
    // must not emit a line matching any of those terms, or every occurrence pages as a
    // false-positive error alarm.
    const payload = {
      id: "evt_test_subscription_created",
      type: "customer.subscription.created",
      data: { object: { id: "sub_test_new" } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const event = buildWebhookEvent(payload);
      const result = await ingestHandler(event);

      expect(result.statusCode).toBe(200);
      const loggedLines = writeSpy.mock.calls.map((call) => call[0]).join("");
      const triggerWords = ["ERROR", "Error", "Exception", "Unhandled", "Task timed out", "SEVERE", "FATAL"];
      for (const word of triggerWords) {
        expect(loggedLines).not.toContain(word);
      }
    } finally {
      writeSpy.mockRestore();
    }
  });

  test("uses test webhook secret for test-mode events (livemode: false)", async () => {
    const payload = {
      ...buildCheckoutSessionPayload(),
      livemode: false,
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    // constructEvent should have been called with the test webhook secret
    expect(mockWebhooksConstructEvent.mock.calls[0][2]).toBe("whsec_test_mock");

    const bundle = mockPutBundleByHashedSub.mock.calls[0][1];
    expect(bundle.qualifiers).toEqual({ synthetic: true, stripeTestMode: true });
  });

  test("uses live webhook secret for live-mode events (livemode: true)", async () => {
    const payload = {
      ...buildCheckoutSessionPayload(),
      livemode: true,
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    // constructEvent should have been called with the live webhook secret
    expect(mockWebhooksConstructEvent.mock.calls[0][2]).toBe("whsec_live_mock");

    const bundle = mockPutBundleByHashedSub.mock.calls[0][1];
    expect(bundle.qualifiers).toEqual({ synthetic: false, stripeTestMode: false });
  });

  test("returns 500 when bundle grant fails", async () => {
    mockPutBundleByHashedSub.mockRejectedValue(new Error("DynamoDB error"));
    const payload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("processing error");
  });

  test("invoice.payment_failed updates bundle and subscription status to past_due", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_payment_failed",
      type: "invoice.payment_failed",
      data: {
        object: { id: "in_test_fail", parent: { subscription_details: { subscription: "sub_test_456" } } },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledWith("hashed_sub_value", "resident-pro", {
      subscriptionStatus: "past_due",
    });
    expect(mockUpdateSubscription).toHaveBeenCalledWith("stripe#sub_test_456", { status: "past_due" });
  });

  test("invoice.payment_failed updates bundle when the subscription is an expanded object", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_payment_failed_expanded",
      type: "invoice.payment_failed",
      data: {
        object: { id: "in_test_fail_expanded", parent: { subscription_details: { subscription: { id: "sub_test_456", status: "past_due" } } } },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockGetSubscription).toHaveBeenCalledWith("stripe#sub_test_456");
    expect(mockUpdateSubscription).toHaveBeenCalledWith("stripe#sub_test_456", { status: "past_due" });
  });

  test("invoice.payment_failed skips when no subscription record found", async () => {
    mockGetSubscription.mockResolvedValue(null);

    const payload = {
      id: "evt_test_payment_failed",
      type: "invoice.payment_failed",
      data: {
        object: { id: "in_test_fail", parent: { subscription_details: { subscription: "sub_test_456" } } },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockUpdateBundleSubscriptionFields).not.toHaveBeenCalled();
    expect(mockUpdateSubscription).not.toHaveBeenCalled();
  });

  test("invoice.payment_failed skips when no subscription ID in invoice", async () => {
    const payload = {
      id: "evt_test_payment_failed_no_sub",
      type: "invoice.payment_failed",
      data: {
        object: { id: "in_test_fail_no_sub", parent: { subscription_details: null } },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockGetSubscription).not.toHaveBeenCalled();
  });

  test("customer.subscription.updated with cancel_at_period_end writes cancellation intent", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_sub_cancel_intent",
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_test_456", status: "active", cancel_at_period_end: true },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledWith("hashed_sub_value", "resident-pro", {
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
    });
    expect(mockUpdateSubscription).toHaveBeenCalledWith("stripe#sub_test_456", {
      status: "active",
      cancelAtPeriodEnd: true,
    });
  });

  test("charge.refunded returns 200 and logs", async () => {
    const payload = {
      id: "evt_test_refund",
      type: "charge.refunded",
      data: {
        object: { id: "ch_test_refund_123" },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockPutBundleByHashedSub).not.toHaveBeenCalled();
  });

  test("charge.dispute.created flags subscription and bundle records", async () => {
    // Set up the chain: dispute -> charge -> payment_intent -> invoice -> subscription
    mockChargesRetrieve.mockResolvedValue({
      id: "ch_test_dispute_123",
      billing_details: { email: "disputed@example.com" },
      payment_intent: "pi_test_dispute",
    });
    mockPaymentIntentsRetrieve.mockResolvedValue({
      id: "pi_test_dispute",
      invoice: "in_test_dispute",
    });
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_test_dispute",
      parent: { subscription_details: { subscription: "sub_test_dispute_456" } },
    });
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_dispute_456",
      hashedSub: "hashed_sub_dispute",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_dispute",
      type: "charge.dispute.created",
      data: {
        object: { id: "dp_test_dispute_789", charge: "ch_test_dispute_123" },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);

    // Verify subscription record was flagged
    expect(mockUpdateSubscription).toHaveBeenCalledWith("stripe#sub_test_dispute_456", {
      disputed: true,
      disputeId: "dp_test_dispute_789",
    });

    // Verify bundle record was flagged
    expect(mockUpdateBundleSubscriptionFields).toHaveBeenCalledWith("hashed_sub_dispute", "resident-pro", {
      disputed: true,
    });

    // Verify dispute was auto-accepted (no-quibble policy)
    expect(mockDisputesClose).toHaveBeenCalledWith("dp_test_dispute_789");
  });

  test("charge.dispute.created handles gracefully when no subscription record found", async () => {
    mockChargesRetrieve.mockResolvedValue({
      id: "ch_test_dispute_no_sub",
      billing_details: { email: "nosub@example.com" },
      payment_intent: "pi_test_no_sub",
    });
    mockPaymentIntentsRetrieve.mockResolvedValue({
      id: "pi_test_no_sub",
      invoice: "in_test_no_sub",
    });
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_test_no_sub",
      parent: { subscription_details: { subscription: "sub_test_not_found" } },
    });
    mockGetSubscription.mockResolvedValue(null);

    const payload = {
      id: "evt_test_dispute_no_sub",
      type: "charge.dispute.created",
      data: {
        object: { id: "dp_test_no_sub", charge: "ch_test_dispute_no_sub" },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    // Should not attempt to update subscription or bundle
    expect(mockUpdateSubscription).not.toHaveBeenCalled();
    expect(mockUpdateBundleSubscriptionFields).not.toHaveBeenCalled();
  });

  test("charge.dispute.closed returns 200 and logs", async () => {
    const payload = {
      id: "evt_test_dispute_closed",
      type: "charge.dispute.closed",
      data: {
        object: { id: "dp_test_closed_123", status: "lost", reason: "product_not_received" },
      },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
  });

  test("sets currentPeriodEnd from Stripe subscription when available", async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_test_456",
      status: "active",
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: periodEnd,
    });

    const payload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(payload);

    const event = buildWebhookEvent(payload);
    await ingestHandler(event);

    const [, bundle] = mockPutBundleByHashedSub.mock.calls[0];
    expect(bundle.currentPeriodEnd).toBe(new Date(periodEnd * 1000).toISOString());
    expect(bundle.expiry).toBe(new Date(periodEnd * 1000).toISOString());
  });

  // ---------------------------------------------------------------------------
  // Activity events carry the pre-hashed sub from Stripe metadata/subscription
  // records — the webhook never sees the raw Cognito sub, so it can't pass a
  // `userSub` for activityAlert.js to hash; it must pass the already-hashed
  // value straight through in `detail`.
  // ---------------------------------------------------------------------------

  test("checkout.session.completed publishes subscription-activated with hashedSub in detail", async () => {
    const payload = buildCheckoutSessionPayload();
    mockWebhooksConstructEvent.mockReturnValue(payload);

    await ingestHandler(buildWebhookEvent(payload));

    const events = activityEventsNamed("subscription-activated");
    expect(events).toHaveLength(1);
    expect(events[0].hashedSub).toBe("hashed_sub_value");
  });

  test("invoice.paid publishes subscription-renewed with hashedSub in detail", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });
    const payload = {
      id: "evt_test_invoice_activity",
      type: "invoice.paid",
      data: { object: { id: "in_test_activity", parent: { subscription_details: { subscription: "sub_test_456" } } } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    await ingestHandler(buildWebhookEvent(payload));

    const events = activityEventsNamed("subscription-renewed");
    expect(events).toHaveLength(1);
    expect(events[0].hashedSub).toBe("hashed_sub_value");
  });

  test("customer.subscription.updated with cancel_at_period_end publishes cancellation-scheduled with hashedSub in detail", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });
    const payload = {
      id: "evt_test_sub_cancel_activity",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_test_456", status: "active", cancel_at_period_end: true } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    await ingestHandler(buildWebhookEvent(payload));

    const events = activityEventsNamed("subscription-cancellation-scheduled");
    expect(events).toHaveLength(1);
    expect(events[0].hashedSub).toBe("hashed_sub_value");
  });

  test("customer.subscription.deleted publishes subscription-canceled with hashedSub in detail", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });
    const payload = {
      id: "evt_test_sub_delete_activity",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_test_456" } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    await ingestHandler(buildWebhookEvent(payload));

    const events = activityEventsNamed("subscription-canceled");
    expect(events).toHaveLength(1);
    expect(events[0].hashedSub).toBe("hashed_sub_value");
  });

  test("invoice.payment_failed publishes payment-failed with hashedSub in detail", async () => {
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_456",
      hashedSub: "hashed_sub_value",
      bundleId: "resident-pro",
    });
    const payload = {
      id: "evt_test_payment_failed_activity",
      type: "invoice.payment_failed",
      data: { object: { id: "in_test_fail_activity", parent: { subscription_details: { subscription: "sub_test_456" } } } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    await ingestHandler(buildWebhookEvent(payload));

    const events = activityEventsNamed("payment-failed");
    expect(events).toHaveLength(1);
    expect(events[0].hashedSub).toBe("hashed_sub_value");
  });

  test("charge.dispute.created publishes dispute-created with hashedSub in detail when a subscription is resolved", async () => {
    mockChargesRetrieve.mockResolvedValue({
      id: "ch_test_dispute_activity",
      billing_details: { email: "disputed@example.com" },
      payment_intent: "pi_test_dispute_activity",
    });
    mockPaymentIntentsRetrieve.mockResolvedValue({ id: "pi_test_dispute_activity", invoice: "in_test_dispute_activity" });
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_test_dispute_activity",
      parent: { subscription_details: { subscription: "sub_test_dispute_activity" } },
    });
    mockGetSubscription.mockResolvedValue({
      pk: "stripe#sub_test_dispute_activity",
      hashedSub: "hashed_sub_dispute",
      bundleId: "resident-pro",
    });

    const payload = {
      id: "evt_test_dispute_activity",
      type: "charge.dispute.created",
      data: { object: { id: "dp_test_dispute_activity", charge: "ch_test_dispute_activity" } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    await ingestHandler(buildWebhookEvent(payload));

    const events = activityEventsNamed("dispute-created");
    expect(events).toHaveLength(1);
    expect(events[0].hashedSub).toBe("hashed_sub_dispute");
  });

  test("charge.dispute.created omits hashedSub when no subscription can be resolved", async () => {
    mockChargesRetrieve.mockResolvedValue({
      id: "ch_test_dispute_no_sub_activity",
      billing_details: { email: "nosub@example.com" },
      payment_intent: "pi_test_no_sub_activity",
    });
    mockPaymentIntentsRetrieve.mockResolvedValue({ id: "pi_test_no_sub_activity", invoice: "in_test_no_sub_activity" });
    mockInvoicesRetrieve.mockResolvedValue({
      id: "in_test_no_sub_activity",
      parent: { subscription_details: { subscription: "sub_test_not_found_activity" } },
    });
    mockGetSubscription.mockResolvedValue(null);

    const payload = {
      id: "evt_test_dispute_no_sub_activity",
      type: "charge.dispute.created",
      data: { object: { id: "dp_test_no_sub_activity", charge: "ch_test_dispute_no_sub_activity" } },
    };
    mockWebhooksConstructEvent.mockReturnValue(payload);

    await ingestHandler(buildWebhookEvent(payload));

    const events = activityEventsNamed("dispute-created");
    expect(events).toHaveLength(1);
    expect(events[0].hashedSub).toBeNull();
  });
});
