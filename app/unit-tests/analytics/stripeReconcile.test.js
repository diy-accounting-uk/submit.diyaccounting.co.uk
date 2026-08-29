// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { gunzipSync } from "zlib";

const mockBalanceTransactionsList = vi.fn();
const mockChargesList = vi.fn();
const mockSubscriptionsList = vi.fn();

// stripeReconcile.js reuses the same getStripeClient() the billing Lambdas use; mocking it
// directly (rather than "stripe" and Secrets Manager underneath it) both simplifies the test
// and lets it assert exactly what stripeReconcile.js controls: the {test} flag it passes.
const mockGetStripeClient = vi.fn();
vi.mock("@app/lib/stripeClient.js", () => ({
  getStripeClient: (...args) => mockGetStripeClient(...args),
}));

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  handler,
  computeDateWindow,
  defaultTargetDate,
  listAllPages,
  sanitizeBalanceTransaction,
  sanitizeCharge,
  sanitizeSubscription,
  toNdjsonGzip,
} from "@app/functions/analytics/stripeReconcile.js";
import { _setTestSalt, _clearSalt, hashSub } from "@app/services/subHasher.js";

function emptyPage() {
  return { data: [], has_more: false };
}

describe("stripeReconcile", () => {
  beforeEach(() => {
    mockBalanceTransactionsList.mockReset();
    mockChargesList.mockReset();
    mockSubscriptionsList.mockReset();
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});

    mockBalanceTransactionsList.mockResolvedValue(emptyPage());
    mockChargesList.mockResolvedValue(emptyPage());
    mockSubscriptionsList.mockResolvedValue(emptyPage());

    mockGetStripeClient.mockReset();
    mockGetStripeClient.mockResolvedValue({
      balanceTransactions: { list: mockBalanceTransactionsList },
      charges: { list: mockChargesList },
      subscriptions: { list: mockSubscriptionsList },
    });

    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake-bucket";
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt"}}';

    _setTestSalt("test-salt", "v1");
  });

  afterEach(() => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.ENVIRONMENT_NAME;
    delete process.env.USER_SUB_HASH_SALT;
    _clearSalt();
    vi.restoreAllMocks();
  });

  describe("computeDateWindow", () => {
    test("returns the half-open [00:00:00Z, next 00:00:00Z) window in epoch seconds", () => {
      const { gte, lt } = computeDateWindow("2026-08-20");

      expect(gte).toBe(Date.UTC(2026, 7, 20, 0, 0, 0) / 1000);
      expect(lt).toBe(Date.UTC(2026, 7, 21, 0, 0, 0) / 1000);
      expect(lt - gte).toBe(86400);
    });
  });

  describe("defaultTargetDate", () => {
    test("returns yesterday in UTC as YYYY-MM-DD", () => {
      const now = new Date();
      const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
        .toISOString()
        .slice(0, 10);

      expect(defaultTargetDate()).toBe(expected);
    });
  });

  describe("listAllPages", () => {
    test("follows has_more with starting_after until exhausted", async () => {
      const listFn = vi
        .fn()
        .mockResolvedValueOnce({ data: [{ id: "a1" }, { id: "a2" }], has_more: true })
        .mockResolvedValueOnce({ data: [{ id: "a3" }], has_more: false });

      const results = await listAllPages(listFn, { created: { gte: 1, lt: 2 } });

      expect(results).toEqual([{ id: "a1" }, { id: "a2" }, { id: "a3" }]);
      expect(listFn).toHaveBeenCalledTimes(2);
      expect(listFn).toHaveBeenNthCalledWith(1, { created: { gte: 1, lt: 2 }, limit: 100 });
      expect(listFn).toHaveBeenNthCalledWith(2, {
        created: { gte: 1, lt: 2 },
        limit: 100,
        starting_after: "a2",
      });
    });

    test("stops after one page when has_more is false", async () => {
      const listFn = vi.fn().mockResolvedValue({ data: [{ id: "only" }], has_more: false });

      const results = await listAllPages(listFn, {});

      expect(results).toEqual([{ id: "only" }]);
      expect(listFn).toHaveBeenCalledTimes(1);
    });

    test("stops on an empty page even if has_more is (incorrectly) true", async () => {
      const listFn = vi.fn().mockResolvedValue({ data: [], has_more: true });

      const results = await listAllPages(listFn, {});

      expect(results).toEqual([]);
      expect(listFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("sanitizeBalanceTransaction", () => {
    test("keeps only the documented fields", () => {
      const row = sanitizeBalanceTransaction({
        id: "txn_1",
        type: "charge",
        amount: 1000,
        net: 950,
        fee: 50,
        currency: "gbp",
        created: 1700000000,
        available_on: 1700100000,
        source: { id: "ch_1", object: "charge" },
        description: "Resident Pro",
        extraneous: "should not appear",
      });

      expect(row).toEqual({
        id: "txn_1",
        type: "charge",
        amount: 1000,
        net: 950,
        fee: 50,
        currency: "gbp",
        created: 1700000000,
        available_on: 1700100000,
        source_id: "ch_1",
        description: "Resident Pro",
      });
    });

    test("reads a plain string source id when not expanded", () => {
      const row = sanitizeBalanceTransaction({ id: "txn_1", source: "ch_1" });
      expect(row.source_id).toBe("ch_1");
    });
  });

  describe("sanitizeCharge", () => {
    test("hashes the customer id and never emits the raw id", () => {
      const row = sanitizeCharge({
        id: "ch_1",
        amount: 500,
        amount_refunded: 0,
        currency: "gbp",
        created: 1700000000,
        paid: true,
        refunded: false,
        status: "succeeded",
        failure_code: null,
        customer: "cus_rawid123",
        invoice: "in_1",
        metadata: { bundleId: "resident-pro" },
        email: "should-not-appear@example.com",
      });

      expect(row.customer).toBe(hashSub("cus_rawid123"));
      expect(JSON.stringify(row)).not.toContain("cus_rawid123");
      expect(JSON.stringify(row)).not.toContain("example.com");
      expect(row.bundle_id).toBe("resident-pro");
      expect(row.invoice).toBe("in_1");
    });

    test("handles an expanded customer object and a missing customer", () => {
      const withObject = sanitizeCharge({ id: "ch_1", customer: { id: "cus_expanded" } });
      expect(withObject.customer).toBe(hashSub("cus_expanded"));

      const withoutCustomer = sanitizeCharge({ id: "ch_2", customer: null });
      expect(withoutCustomer.customer).toBeNull();
    });
  });

  describe("sanitizeSubscription", () => {
    test("keeps the documented fields and hashes the customer", () => {
      const row = sanitizeSubscription({
        id: "sub_1",
        status: "active",
        created: 1700000000,
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: false,
        canceled_at: null,
        customer: "cus_rawid456",
        metadata: { bundleId: "resident-vat" },
        items: {
          data: [{ price: { id: "price_123", unit_amount: 999 } }],
        },
      });

      expect(row.customer).toBe(hashSub("cus_rawid456"));
      expect(JSON.stringify(row)).not.toContain("cus_rawid456");
      expect(row.price_id).toBe("price_123");
      expect(row.unit_amount).toBe(999);
      expect(row.bundle_id).toBe("resident-vat");
    });

    test("tolerates a subscription with no items", () => {
      const row = sanitizeSubscription({ id: "sub_1", status: "canceled", customer: null, items: { data: [] } });
      expect(row.price_id).toBeNull();
      expect(row.unit_amount).toBeNull();
    });
  });

  describe("toNdjsonGzip", () => {
    test("produces gzip whose decompressed body is one JSON object per line", () => {
      const buffer = toNdjsonGzip([{ a: 1 }, { b: 2 }]);
      const text = gunzipSync(buffer).toString("utf8");
      const lines = text.trimEnd().split("\n");

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual({ a: 1 });
      expect(JSON.parse(lines[1])).toEqual({ b: 2 });
    });

    test("an empty record list still gzips to a valid, empty body", () => {
      const buffer = toNdjsonGzip([]);
      expect(gunzipSync(buffer).toString("utf8")).toBe("");
    });
  });

  describe("handler", () => {
    test("uses yesterday by default and writes three date-partitioned objects", async () => {
      const result = await handler();

      expect(result.date).toBe(defaultTargetDate());
      expect(mockS3Send).toHaveBeenCalledTimes(3);

      const keys = mockS3Send.mock.calls.map((call) => call[0].input.Key);
      expect(keys).toEqual([
        `curated/stripe/balance_transactions/dt=${result.date}/balance_transactions.json.gz`,
        `curated/stripe/charges/dt=${result.date}/charges.json.gz`,
        `curated/stripe/subscriptions/dt=${result.date}/subscriptions.json.gz`,
      ]);
      for (const call of mockS3Send.mock.calls) {
        expect(call[0].input.Bucket).toBe("test-lake-bucket");
      }
    });

    test("an explicit date in the event overrides the default and sets the Stripe date window", async () => {
      const result = await handler({ date: "2026-08-20" });

      expect(result.date).toBe("2026-08-20");
      const expectedWindow = computeDateWindow("2026-08-20");
      expect(mockBalanceTransactionsList).toHaveBeenCalledWith(
        expect.objectContaining({ created: { gte: expectedWindow.gte, lt: expectedWindow.lt } }),
      );
      expect(mockChargesList).toHaveBeenCalledWith(
        expect.objectContaining({ created: { gte: expectedWindow.gte, lt: expectedWindow.lt } }),
      );

      const keys = mockS3Send.mock.calls.map((call) => call[0].input.Key);
      expect(keys).toEqual([
        "curated/stripe/balance_transactions/dt=2026-08-20/balance_transactions.json.gz",
        "curated/stripe/charges/dt=2026-08-20/charges.json.gz",
        "curated/stripe/subscriptions/dt=2026-08-20/subscriptions.json.gz",
      ]);
    });

    test("subscriptions list is a full snapshot, not date-filtered", async () => {
      await handler({ date: "2026-08-20" });

      expect(mockSubscriptionsList).toHaveBeenCalledWith(expect.objectContaining({ status: "all" }));
      expect(mockSubscriptionsList.mock.calls[0][0].created).toBeUndefined();
    });

    test("throws when the lake bucket name is not configured", async () => {
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
    });

    test("counts and gzip bodies reflect a real page of records", async () => {
      mockChargesList.mockResolvedValueOnce({
        data: [{ id: "ch_1", customer: "cus_1", amount: 100, metadata: {} }],
        has_more: false,
      });

      const result = await handler({ date: "2026-08-20" });

      expect(result.counts.charges).toBe(1);
      const chargesCall = mockS3Send.mock.calls.find((call) => call[0].input.Key.includes("/charges/"));
      const body = gunzipSync(chargesCall[0].input.Body).toString("utf8");
      const row = JSON.parse(body.trimEnd());
      expect(row.id).toBe("ch_1");
      expect(row.customer).toBe(hashSub("cus_1"));
    });

    test("requests the live Stripe client in prod and the test client elsewhere", async () => {
      await handler({ date: "2026-08-20" });
      expect(mockGetStripeClient).toHaveBeenCalledWith({ test: true });

      mockGetStripeClient.mockClear();
      process.env.ENVIRONMENT_NAME = "prod";
      await handler({ date: "2026-08-20" });
      expect(mockGetStripeClient).toHaveBeenCalledWith({ test: false });
    });
  });
});
