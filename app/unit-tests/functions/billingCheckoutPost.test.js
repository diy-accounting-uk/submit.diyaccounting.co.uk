// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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

// Mock DynamoDB bundle repository (getUserBundles for synthetic auto-detection)
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
    process.env.ENVIRONMENT_NAME = "test";
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_PRICE_ID_RESIDENT_PRO_YEAR = "price_test_123";
    process.env.STRIPE_TEST_PRICE_ID_RESIDENT_PRO_YEAR = "price_test_synthetic_456";
    process.env.DIY_SUBMIT_BASE_URL = "https://test-submit.diyaccounting.co.uk/";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
    process.env.BILLING_RETURN_URL_ORIGINS = "https://ci.diya-gl.co.uk,http://localhost:3001";
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

  test("classifies a real customer's checkout as customer even though every Cognito user carries a cognito:username claim", async () => {
    const realCustomerToken = makeIdToken("real-customer-sub", {
      "email": "real.customer@example.com",
      "cognito:username": "real-customer-sub",
    });
    const event = buildEventWithToken(realCustomerToken);
    await ingestHandler(event);

    const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.actor).toBe("customer");
  });

  test("classifies a synthetic lane's checkout as test-user from its email", async () => {
    const syntheticToken = makeIdToken("synthetic-sub", {
      "email": "synthetic-local@test.diyaccounting.co.uk",
      "cognito:username": "synthetic-sub",
    });
    const event = buildEventWithToken(syntheticToken);
    await ingestHandler(event);

    const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.actor).toBe("test-user");
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
    delete process.env.STRIPE_PRICE_ID_RESIDENT_PRO_YEAR;
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

  test("uses STRIPE_TEST_PRICE_ID_RESIDENT_PRO_YEAR when synthetic flag is set in request body", async () => {
    const event = buildEventWithToken(validToken, { synthetic: true });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_test_synthetic_456");
  });

  test("uses STRIPE_PRICE_ID_RESIDENT_PRO_YEAR by default (annual) when no synthetic flag", async () => {
    const event = buildEventWithToken(validToken, { bundleId: "resident-pro" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_test_123");
  });

  test("uses STRIPE_PRICE_ID_RESIDENT_PRO_MONTH when the interval is monthly", async () => {
    process.env.STRIPE_PRICE_ID_RESIDENT_PRO_MONTH = "price_pro_monthly_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident-pro", interval: "monthly" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_pro_monthly_789");
  });

  test("uses STRIPE_TEST_PRICE_ID_RESIDENT_PRO_YEAR when user has synthetic bundle qualifier (no explicit flag needed)", async () => {
    mockGetUserBundles.mockResolvedValue([{ bundleId: "resident-pro", qualifiers: { synthetic: true } }]);
    const event = buildEventWithToken(validToken, { bundleId: "resident-pro" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_test_synthetic_456");
  });

  test("qualifiers.stripeTestMode on an existing bundle does not affect checkout mode", async () => {
    mockGetUserBundles.mockResolvedValue([{ bundleId: "resident-pro", qualifiers: { synthetic: false, stripeTestMode: true } }]);
    const event = buildEventWithToken(validToken, { bundleId: "resident-pro" });
    await ingestHandler(event);

    // Checkout reads qualifiers.synthetic only — a user in live HMRC mode must never be
    // charged for real just because a past subscription happened to be bought in Stripe test mode.
    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_test_123");
  });

  test("uses STRIPE_PRICE_ID_RESIDENT_VAT for resident-vat checkout", async () => {
    process.env.STRIPE_PRICE_ID_RESIDENT_VAT = "price_vat_live_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident-vat" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_vat_live_789");
    expect(params.metadata.bundleId).toBe("resident-vat");
  });

  test("uses STRIPE_TEST_PRICE_ID_RESIDENT_VAT for resident-vat synthetic checkout", async () => {
    process.env.STRIPE_TEST_PRICE_ID_RESIDENT_VAT = "price_vat_test_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident-vat", synthetic: true });
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

  test("returns bundle-not-listed for a retired bundle id", async () => {
    const event = buildEventWithToken(validToken, { bundleId: "resident-itsa" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("bundle-not-listed");
  });

  test("uses STRIPE_PRICE_ID_RESIDENT_YEAR by default (annual) for resident checkout", async () => {
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.STRIPE_PRICE_ID_RESIDENT_YEAR = "price_resident_annual_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_resident_annual_789");
    expect(params.metadata.bundleId).toBe("resident");
  });

  test("uses STRIPE_PRICE_ID_RESIDENT_MONTH when the interval is monthly", async () => {
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.STRIPE_PRICE_ID_RESIDENT_MONTH = "price_resident_monthly_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident", interval: "monthly" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_resident_monthly_789");
  });

  test("uses STRIPE_TEST_PRICE_ID_RESIDENT_MONTH for a synthetic resident monthly checkout", async () => {
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.STRIPE_TEST_PRICE_ID_RESIDENT_MONTH = "price_resident_monthly_test_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident", interval: "monthly", synthetic: true });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_resident_monthly_test_789");
  });

  test("returns 500 when resident's annual price is not configured", async () => {
    process.env.ENVIRONMENT_NAME = "ci";
    delete process.env.STRIPE_PRICE_ID_RESIDENT_YEAR;
    delete process.env.STRIPE_TEST_PRICE_ID_RESIDENT_YEAR;
    const event = buildEventWithToken(validToken, { bundleId: "resident" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });

  test("returns 400 for an unrecognised checkout interval", async () => {
    process.env.ENVIRONMENT_NAME = "ci";
    const event = buildEventWithToken(validToken, { bundleId: "resident", interval: "weekly" });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe("invalid-interval");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  test("a single-price bundle ignores an interval it does not carry", async () => {
    process.env.STRIPE_PRICE_ID_RESIDENT_VAT = "price_vat_live_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident-vat", interval: "monthly" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_vat_live_789");
  });

  test("uses an allowed returnTo for the checkout success and cancel URLs", async () => {
    const event = buildEventWithToken(validToken, {
      bundleId: "resident-pro",
      returnTo: "https://ci.diya-gl.co.uk/ltd.html",
    });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.success_url).toBe("https://ci.diya-gl.co.uk/ltd.html?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://ci.diya-gl.co.uk/ltd.html?checkout=canceled");
  });

  test("falls back to bundles.html URLs when returnTo's origin is not allowed", async () => {
    const event = buildEventWithToken(validToken, { bundleId: "resident-pro", returnTo: "https://evil.example/steal" });
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.success_url).toBe(
      "https://test-submit.diyaccounting.co.uk/bundles.html?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(params.cancel_url).toBe("https://test-submit.diyaccounting.co.uk/bundles.html?checkout=canceled");
  });

  test("refuses a bundle not listed for the current environment before calling Stripe", async () => {
    process.env.ENVIRONMENT_NAME = "test";
    const event = buildEventWithToken(validToken, { bundleId: "resident" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe("bundle-not-listed");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  test("proceeds when the bundle is listed for the current environment", async () => {
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.STRIPE_PRICE_ID_RESIDENT_YEAR = "price_resident_annual_789";
    const event = buildEventWithToken(validToken, { bundleId: "resident" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
  });

  test("refuses an unknown bundle id before calling Stripe", async () => {
    const event = buildEventWithToken(validToken, { bundleId: "not-a-real-bundle" });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe("bundle-not-listed");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });
});
