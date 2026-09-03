// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockCheckoutSessionsRetrieve = vi.fn();
const mockStripeConstructor = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      constructor(...args) {
        mockStripeConstructor(...args);
        this.checkout = {
          sessions: {
            retrieve: mockCheckoutSessionsRetrieve,
          },
        };
      }
    },
  };
});

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

import { ingestHandler } from "@app/functions/billing/billingCheckoutSessionGet.js";
import { initializeSalt, hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildGetEvent(token, sessionId) {
  return buildLambdaEvent({
    method: "GET",
    path: `/api/v1/billing/checkout-session/${sessionId}`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    pathParameters: sessionId ? { id: sessionId } : null,
  });
}

describe("billingCheckoutSessionGet", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_mock";
    process.env.STRIPE_TEST_SECRET_KEY = "sk_test_mock";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
    await initializeSalt();
    mockStripeConstructor.mockReset();
    mockCheckoutSessionsRetrieve.mockReset();
    mockCheckoutSessionsRetrieve.mockResolvedValue({
      id: "cs_test_123",
      amount_total: 999,
      currency: "gbp",
      metadata: { hashedSub: hashSub("test-user-sub"), bundleId: "resident-pro" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns the amount, currency and bundle of the caller's session", async () => {
    const result = await ingestHandler(buildGetEvent(validToken, "cs_test_123"));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.amountTotal).toBe(999);
    expect(body.currency).toBe("gbp");
    expect(body.bundleId).toBe("resident-pro");
    expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledWith("cs_test_123");
  });

  test("returns 404 when the session belongs to another user", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({
      id: "cs_test_123",
      amount_total: 999,
      currency: "gbp",
      metadata: { hashedSub: hashSub("someone-else"), bundleId: "resident-pro" },
    });

    const result = await ingestHandler(buildGetEvent(validToken, "cs_test_123"));
    expect(result.statusCode).toBe(404);
  });

  test("returns 404 when the session carries no hashed sub", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({ id: "cs_test_123", amount_total: 999, currency: "gbp" });

    const result = await ingestHandler(buildGetEvent(validToken, "cs_test_123"));
    expect(result.statusCode).toBe(404);
  });

  test("returns 401 when no authorization header", async () => {
    const result = await ingestHandler(buildGetEvent(null, "cs_test_123"));
    expect(result.statusCode).toBe(401);
  });

  test("returns 400 when the session id is missing", async () => {
    const result = await ingestHandler(buildGetEvent(validToken, ""));
    expect(result.statusCode).toBe(400);
  });

  test("returns 400 when the session id is not a checkout session id", async () => {
    const result = await ingestHandler(buildGetEvent(validToken, "sub_123"));
    expect(result.statusCode).toBe(400);
    expect(mockCheckoutSessionsRetrieve).not.toHaveBeenCalled();
  });

  test("returns 500 when Stripe fails", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(new Error("Stripe API error"));
    const result = await ingestHandler(buildGetEvent(validToken, "cs_test_123"));
    expect(result.statusCode).toBe(500);
  });

  test("a live session id uses the live Stripe key", async () => {
    process.env.STRIPE_SECRET_KEY = `sk_live_mock_${Date.now()}`;
    mockCheckoutSessionsRetrieve.mockResolvedValue({
      id: "cs_live_456",
      amount_total: 999,
      currency: "gbp",
      metadata: { hashedSub: hashSub("test-user-sub"), bundleId: "resident-pro" },
    });

    const result = await ingestHandler(buildGetEvent(validToken, "cs_live_456"));
    expect(result.statusCode).toBe(200);
    expect(mockStripeConstructor).toHaveBeenCalledWith(process.env.STRIPE_SECRET_KEY, expect.anything());
  });

  test("a test session id uses the test Stripe key", async () => {
    process.env.STRIPE_TEST_SECRET_KEY = `sk_test_mock_${Date.now()}`;
    await ingestHandler(buildGetEvent(validToken, "cs_test_123"));
    expect(mockStripeConstructor).toHaveBeenCalledWith(process.env.STRIPE_TEST_SECRET_KEY, expect.anything());
  });
});
