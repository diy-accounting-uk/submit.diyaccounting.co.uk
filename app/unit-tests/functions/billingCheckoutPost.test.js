// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock Stripe SDK
const mockCheckoutSessionsCreate = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      constructor() {
        this.checkout = {
          sessions: {
            create: mockCheckoutSessionsCreate,
          },
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

// Mock DynamoDB bundle repository (getUserBundles for sandbox auto-detection)
const mockGetUserBundles = vi.fn();
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: (...args) => mockGetUserBundles(...args),
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

import { ingestHandler } from "@app/functions/billing/billingCheckoutPost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("billingCheckoutPost", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockGetUserBundles.mockReset();
    mockGetUserBundles.mockResolvedValue([]); // No bundles by default
    mockCheckoutSessionsCreate.mockReset();
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_PRICE_ID_RESIDENT_PRO = "price_test_123";
    process.env.STRIPE_TEST_PRICE_ID_RESIDENT_PRO = "price_test_sandbox_456";
    process.env.DIY_SUBMIT_BASE_URL = "https://test-submit.diyaccounting.co.uk/";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
    mockEventBridgeSend.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 200 with checkout URL on success", async () => {
    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
  });

  test("creates checkout session with correct parameters", async () => {
    const event = buildEventWithToken(validToken);
    await ingestHandler(event);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockCheckoutSessionsCreate.mock.calls[0][0];

    expect(params.mode).toBe("subscription");
    expect(params.customer_email).toBe("user@example.com");
    expect(params.metadata.bundleId).toBe("resident-pro");
    expect(params.metadata.hashedSub).toBeDefined();
    expect(params.metadata.hashedSub.length).toBe(64); // SHA-256 hex
    expect(params.subscription_data.metadata.hashedSub).toBe(params.metadata.hashedSub);
    expect(params.subscription_data.metadata.bundleId).toBe("resident-pro");
    expect(params.line_items).toEqual([{ price: "price_test_123", quantity: 1 }]);
    expect(params.success_url).toBe(
      "https://test-submit.diyaccounting.co.uk/bundles.html?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(params.cancel_url).toBe("https://test-submit.diyaccounting.co.uk/bundles.html?checkout=canceled");
  });

  test("publishes the checkout-session-created event with the hashed sub, never the raw sub", async () => {
    const event = buildEventWithToken(validToken);
    await ingestHandler(event);

    expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
    const rawDetail = mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-user-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.event).toBe("checkout-session-created");
    expect(detail.hashedSub).toBe(hashSub("test-user-sub"));
  });

  test("returns 401 when no authorization header", async () => {
    const event = buildEventWithToken(null);
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 401 for invalid token", async () => {
    const event = buildEventWithToken("not-a-jwt");
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 500 when no price ID configured", async () => {
    delete process.env.STRIPE_PRICE_ID_RESIDENT_PRO;
    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("configuration");
  });

  test("returns 500 when Stripe API fails", async () => {
    mockCheckoutSessionsCreate.mockRejectedValue(new Error("Stripe API error"));
    const event = buildEventWithToken(validToken);
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });

  test("uses STRIPE_TEST_PRICE_ID_RESIDENT_PRO when sandbox flag is set in request body", async () => {
    const event = buildEventWithToken(validToken, { sandbox: true });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_test_sandbox_456");
  });

  test("uses STRIPE_PRICE_ID_RESIDENT_PRO when no sandbox flag", async () => {
    const event = buildEventWithToken(validToken, { bundleId: "resident-pro" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_test_123");
  });

  test("uses STRIPE_TEST_PRICE_ID_RESIDENT_PRO when user has sandbox bundle qualifier (no explicit flag needed)", async () => {
    mockGetUserBundles.mockResolvedValue([{ bundleId: "resident-pro", qualifiers: { sandbox: true } }]);
    const event = buildEventWithToken(validToken, { bundleId: "resident-pro" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_test_sandbox_456");
  });

  test("uses STRIPE_PRICE_ID_RESIDENT_VAT for resident-vat checkout", async () => {
    process.env.STRIPE_PRICE_ID_RESIDENT_VAT = "price_vat_live_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident-vat" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_vat_live_789");
    expect(params.metadata.bundleId).toBe("resident-vat");
  });

  test("uses STRIPE_TEST_PRICE_ID_RESIDENT_VAT for resident-vat sandbox checkout", async () => {
    process.env.STRIPE_TEST_PRICE_ID_RESIDENT_VAT = "price_vat_test_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident-vat", sandbox: true });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_vat_test_789");
    expect(params.metadata.bundleId).toBe("resident-vat");
  });

  test("returns 500 when resident-vat price ID is not configured", async () => {
    delete process.env.STRIPE_PRICE_ID_RESIDENT_VAT;
    delete process.env.STRIPE_TEST_PRICE_ID_RESIDENT_VAT;
    const event = buildEventWithToken(validToken, { bundleId: "resident-vat" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });

  test("uses STRIPE_PRICE_ID_RESIDENT_ITSA for resident-itsa checkout", async () => {
    process.env.STRIPE_PRICE_ID_RESIDENT_ITSA = "price_itsa_live_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident-itsa" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_itsa_live_789");
    expect(params.metadata.bundleId).toBe("resident-itsa");
  });

  test("uses STRIPE_TEST_PRICE_ID_RESIDENT_ITSA for resident-itsa sandbox checkout", async () => {
    process.env.STRIPE_TEST_PRICE_ID_RESIDENT_ITSA = "price_itsa_test_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident-itsa", sandbox: true });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_itsa_test_789");
    expect(params.metadata.bundleId).toBe("resident-itsa");
  });

  test("returns 500 when resident-itsa price ID is not configured", async () => {
    delete process.env.STRIPE_PRICE_ID_RESIDENT_ITSA;
    delete process.env.STRIPE_TEST_PRICE_ID_RESIDENT_ITSA;
    const event = buildEventWithToken(validToken, { bundleId: "resident-itsa" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });
});
