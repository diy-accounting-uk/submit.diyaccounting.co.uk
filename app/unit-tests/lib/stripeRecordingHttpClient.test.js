// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/stripeRecordingHttpClient.test.js

import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";
import { putIntegrationCall } from "@app/data/dynamoDbIntegrationCallRepository.js";
import { StripeRecordingHttpClient, stripeCallTarget } from "@app/lib/stripeRecordingHttpClient.js";

vi.mock("@app/data/dynamoDbIntegrationCallRepository.js", () => ({
  putIntegrationCall: vi.fn().mockResolvedValue(undefined),
}));

const SECRET_KEY = "sk_test_unitTestKeyNotReal123";

class FakeResponse extends Stripe.HttpClientResponse {
  constructor(statusCode, body, headers = { "request-id": "req_abc123" }) {
    super(statusCode, headers);
    this.body = body;
    this.reads = 0;
  }
  getRawResponse() {
    return {};
  }
  toJSON() {
    this.reads += 1;
    if (this.reads > 1) return Promise.reject(new Error("body read twice"));
    return Promise.resolve(this.body);
  }
}

class FakeInnerClient extends Stripe.HttpClient {
  constructor(outcomes) {
    super();
    this.outcomes = outcomes;
    this.calls = [];
  }
  getClientName() {
    return "fake";
  }
  async makeRequest(...args) {
    this.calls.push(args);
    const outcome = this.outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}

function stripeWith(outcomes, options = {}) {
  const inner = new FakeInnerClient(outcomes);
  const stripe = new Stripe(SECRET_KEY, {
    httpClient: new StripeRecordingHttpClient({ target: stripeCallTarget(SECRET_KEY), innerClient: inner }),
    ...options,
  });
  return { stripe, inner };
}

function items() {
  return putIntegrationCall.mock.calls.map(([item]) => item);
}

describe("lib/stripeRecordingHttpClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putIntegrationCall.mockResolvedValue(undefined);
  });

  it("derives the target from the key mode", () => {
    expect(stripeCallTarget("sk_test_abc")).toBe("test");
    expect(stripeCallTarget("rk_test_abc")).toBe("test");
    expect(stripeCallTarget("sk_live_abc")).toBe("live");
  });

  it("records one call for a response, with the path template and no id or key", async () => {
    const { stripe } = stripeWith([new FakeResponse(200, { id: "cus_Abc123", object: "customer", email: "someone@example.com" })]);

    const customer = await stripe.customers.retrieve("cus_Abc123");

    expect(customer.id).toBe("cus_Abc123");
    const [item] = items();
    expect(items()).toHaveLength(1);
    expect(item).toMatchObject({
      pk: expect.stringMatching(/^call#stripe#/),
      org: "stripe",
      target: "test",
      api: "GET /v1/customers/{id}",
      outcome: "response",
      status: 200,
      providerRequestId: "req_abc123",
    });
    const text = JSON.stringify(item);
    expect(text).not.toContain("cus_Abc123");
    expect(text).not.toContain("someone@example.com");
    expect(text).not.toContain(SECRET_KEY);
  });

  it("keeps the Stripe path words of a POST and replaces the id", async () => {
    const { stripe } = stripeWith([new FakeResponse(200, { id: "pi_1", object: "payment_intent" })]);

    await stripe.paymentIntents.cancel("pi_1Nabc");

    expect(items()[0].api).toBe("POST /v1/payment_intents/{id}/cancel");
  });

  it("records the Stripe error code of a 4xx and still gives the SDK the error body", async () => {
    const body = { error: { type: "invalid_request_error", code: "resource_missing", message: "No such customer" } };
    const { stripe } = stripeWith([new FakeResponse(404, body)]);

    await expect(stripe.customers.retrieve("cus_Missing1")).rejects.toMatchObject({ code: "resource_missing" });

    const [item] = items();
    expect(item).toMatchObject({ outcome: "response", status: 404, statusLabel: "404" });
    expect(item.raw.code).toBe("resource_missing");
    expect(item.raw.message).toContain("No such customer");
  });

  it("records one call for each attempt of a retry", async () => {
    const networkError = Object.assign(new TypeError("socket hang up"), { code: "ECONNRESET" });
    const { stripe, inner } = stripeWith(
      [
        networkError,
        new FakeResponse(503, { error: { type: "api_error" } }, { "stripe-should-retry": "true" }),
        new FakeResponse(200, { id: "cus_1" }),
      ],
      {
        maxNetworkRetries: 2,
      },
    );
    await stripe.customers.retrieve("cus_1");

    expect(inner.calls).toHaveLength(3);
    expect(items().map((item) => [item.outcome, item.status])).toEqual([
      ["network-error", undefined],
      ["response", 503],
      ["response", 200],
    ]);
  }, 20000);

  it("records a timeout as a timeout and throws the SDK error", async () => {
    const { stripe } = stripeWith([Stripe.HttpClient.makeTimeoutError()], { maxNetworkRetries: 0 });

    await expect(stripe.customers.retrieve("cus_1")).rejects.toBeDefined();

    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ outcome: "timeout", api: "GET /v1/customers/{id}" });
  });

  it("does not fail the request when the record write fails", async () => {
    putIntegrationCall.mockRejectedValue(new Error("table unavailable"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { stripe } = stripeWith([new FakeResponse(200, { id: "cus_1" })]);

    await expect(stripe.customers.retrieve("cus_1")).resolves.toMatchObject({ id: "cus_1" });
  });
});
