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

// Mock the activity charges service (hasPaidCharge guards a second charge for the same filing)
const mockHasPaidCharge = vi.fn();
vi.mock("@app/services/activityCharges.js", () => ({
  hasPaidCharge: (...args) => mockHasPaidCharge(...args),
}));

// Mock EventBridge (activityAlert.js uses it)
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

import { ingestHandler } from "@app/functions/billing/billingActivityCheckoutPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("billingActivityCheckoutPost", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(() => {
    mockGetUserBundles.mockReset();
    mockGetUserBundles.mockResolvedValue([]);
    mockHasPaidCharge.mockReset();
    mockHasPaidCharge.mockResolvedValue(false);
    mockCheckoutSessionsCreate.mockReset();
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_test_activity_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_activity_123",
    });
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_PRICE_ID_FILE_CONFIRMATION_STATEMENT = "price_fcs_live_123";
    process.env.STRIPE_TEST_PRICE_ID_FILE_CONFIRMATION_STATEMENT = "price_fcs_test_456";
    process.env.DIY_SUBMIT_BASE_URL = "https://test-submit.diyaccounting.co.uk/";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
    process.env.BILLING_RETURN_URL_ORIGINS = "https://ci.diya-gl.co.uk,http://localhost:3001";
    mockEventBridgeSend.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildBody(overrides = {}) {
    return {
      activityId: "file-confirmation-statement",
      subjectKey: "12345678#2026-01-01",
      ...overrides,
    };
  }

  test("returns 200 with checkout URL on success", async () => {
    const event = buildEventWithToken(validToken, buildBody());
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_activity_123");
  });

  test("creates a payment-mode checkout session carrying activityId, subjectKey and the hashed sub", async () => {
    const event = buildEventWithToken(validToken, buildBody());
    await ingestHandler(event);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockCheckoutSessionsCreate.mock.calls[0][0];

    expect(params.mode).toBe("payment");
    expect(params.customer_email).toBe("user@example.com");
    expect(params.metadata.activityId).toBe("file-confirmation-statement");
    expect(params.metadata.subjectKey).toBe("12345678#2026-01-01");
    expect(params.metadata.hashedSub).toBeDefined();
    expect(params.metadata.hashedSub.length).toBe(64);
    expect(params.line_items).toEqual([{ price: "price_fcs_live_123", quantity: 1 }]);
  });

  test("uses the test price id when the request is synthetic", async () => {
    const event = buildEventWithToken(validToken, buildBody({ synthetic: true }));
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_fcs_test_456");
  });

  test("returns 401 when no authorization header", async () => {
    const event = buildEventWithToken(null, buildBody());
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 400 for a missing activity id", async () => {
    const event = buildEventWithToken(validToken, buildBody({ activityId: undefined }));
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("missing-activity-id");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  test("returns 400 for a missing subject key", async () => {
    const event = buildEventWithToken(validToken, buildBody({ subjectKey: undefined }));
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("missing-subject-key");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  test("returns activity-not-listed for an unknown activity id", async () => {
    const event = buildEventWithToken(validToken, buildBody({ activityId: "not-a-real-activity" }));
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("activity-not-listed");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  test("returns activity-not-listed for an activity not listed in the current environment", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    const event = buildEventWithToken(validToken, buildBody());
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("activity-not-listed");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  test("returns 409 already-paid when the activity/subject pair is already paid for", async () => {
    mockHasPaidCharge.mockResolvedValue(true);
    const event = buildEventWithToken(validToken, buildBody());
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).code).toBe("already-paid");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  test("returns 500 when no price ID configured", async () => {
    delete process.env.STRIPE_PRICE_ID_FILE_CONFIRMATION_STATEMENT;
    const event = buildEventWithToken(validToken, buildBody());
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });

  test("returns 500 when Stripe API fails", async () => {
    mockCheckoutSessionsCreate.mockRejectedValue(new Error("Stripe API error"));
    const event = buildEventWithToken(validToken, buildBody());
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(500);
  });

  test("uses an allowed returnTo for the checkout success and cancel URLs", async () => {
    const event = buildEventWithToken(validToken, buildBody({ returnTo: "https://ci.diya-gl.co.uk/ltd.html" }));
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.success_url).toBe("https://ci.diya-gl.co.uk/ltd.html?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://ci.diya-gl.co.uk/ltd.html?checkout=canceled");
  });

  test("falls back to the base URL when returnTo's origin is not allowed", async () => {
    const event = buildEventWithToken(validToken, buildBody({ returnTo: "https://evil.example/steal" }));
    await ingestHandler(event);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.success_url).toBe("https://test-submit.diyaccounting.co.uk/?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://test-submit.diyaccounting.co.uk/?checkout=canceled");
  });

  test("publishes the activity-checkout-session-created event", async () => {
    const event = buildEventWithToken(validToken, buildBody());
    await ingestHandler(event);

    expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
    const detail = JSON.parse(mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail);
    expect(detail.event).toBe("activity-checkout-session-created");
    expect(detail.activityId).toBe("file-confirmation-statement");
  });
});
