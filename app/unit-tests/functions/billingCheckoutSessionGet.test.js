// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock Stripe SDK
const mockCheckoutSessionsRetrieve = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      constructor() {
        this.checkout = {
          sessions: {
            retrieve: mockCheckoutSessionsRetrieve,
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

import { ingestHandler } from "@app/functions/billing/billingCheckoutSessionGet.js";
import { hashSub, initializeSalt } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function resourceMissingError() {
  const error = new Error("No such checkout session");
  error.code = "resource_missing";
  return error;
}

describe("billingCheckoutSessionGet", () => {
  const validToken = makeIdToken("test-user-sub", { email: "user@example.com" });

  beforeEach(async () => {
    mockCheckoutSessionsRetrieve.mockReset();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}';
    await initializeSalt();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 401 when no authorization header", async () => {
    const event = buildEventWithToken(null, {}, { pathParameters: { id: "cs_test_123" } });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });

  test("returns 400 when the checkout session id is missing", async () => {
    const event = buildEventWithToken(validToken, {}, { pathParameters: {} });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(400);
  });

  test("returns 200 with the amount, currency and bundle when the caller owns the session", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({
      amount_total: 999,
      currency: "gbp",
      metadata: { hashedSub: hashSub("test-user-sub"), bundleId: "resident-pro" },
    });

    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "cs_test_123" } });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toEqual({ amountTotal: 999, currency: "gbp", bundleId: "resident-pro" });
    expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledWith("cs_test_123");
  });

  test("returns 404 when the session belongs to a different caller", async () => {
    mockCheckoutSessionsRetrieve.mockResolvedValue({
      amount_total: 999,
      currency: "gbp",
      metadata: { hashedSub: hashSub("someone-else"), bundleId: "resident-pro" },
    });

    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "cs_test_123" } });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(404);
  });

  test("returns 404 when the session does not exist in either Stripe mode", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(resourceMissingError());

    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "cs_test_missing" } });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(404);
    expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledTimes(2);
  });

  test("returns 500 when Stripe fails for a reason other than a missing session", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(new Error("Stripe API error"));

    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "cs_test_123" } });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(500);
  });
});
