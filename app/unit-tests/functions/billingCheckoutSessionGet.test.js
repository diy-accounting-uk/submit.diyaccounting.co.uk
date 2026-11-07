// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

// Mock the Stripe client factory so each test sees which mode's client was requested
const mockCheckoutSessionsRetrieve = vi.fn();
const mockGetStripeClient = vi.fn(async () => ({ checkout: { sessions: { retrieve: mockCheckoutSessionsRetrieve } } }));
vi.mock("@app/lib/stripeClient.js", () => ({ getStripeClient: (options) => mockGetStripeClient(options) }));

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
    mockGetStripeClient.mockClear();
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

  test("returns 404 when the session does not exist in either Stripe mode, for an id with no mode prefix", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(resourceMissingError());

    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "cs_unprefixed_missing" } });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(404);
    expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledTimes(2);
  });

  test("a test-mode session id is read with the test client only", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(resourceMissingError());
    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "cs_test_only" } });
    await ingestHandler(event);
    expect(mockGetStripeClient.mock.calls.map(([options]) => options.test)).toEqual([true]);
    expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledTimes(1);
  });

  test("a live-mode session id is read with the live client only", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(resourceMissingError());
    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "cs_live_only" } });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(404);
    expect(mockGetStripeClient.mock.calls.map(([options]) => options.test)).toEqual([false]);
    expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledTimes(1);
  });

  test("a session id with neither prefix is tried with the live client and then the test client", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(resourceMissingError());
    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "abc123" } });
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(404);
    expect(mockGetStripeClient.mock.calls.map(([options]) => options.test)).toEqual([false, true]);
  });

  test("returns 500 when Stripe fails for a reason other than a missing session", async () => {
    mockCheckoutSessionsRetrieve.mockRejectedValue(new Error("Stripe API error"));

    const event = buildEventWithToken(validToken, {}, { pathParameters: { id: "cs_test_123" } });
    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(500);
  });
});
