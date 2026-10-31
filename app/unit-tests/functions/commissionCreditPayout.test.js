// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const repo = {
  getLineByKey: vi.fn(),
  queryPayablePointers: vi.fn(),
  markLinePaid: vi.fn(),
};
vi.mock("@app/data/dynamoDbCommissionRepository.js", () => ({
  getLineByKey: (...a) => repo.getLineByKey(...a),
  queryPayablePointers: (...a) => repo.queryPayablePointers(...a),
  markLinePaid: (...a) => repo.markLinePaid(...a),
}));

const mockGetBundles = vi.fn();
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({ getBundlesByHashedSub: (...a) => mockGetBundles(...a) }));

const config = { ledger: { payCredit: true } };
vi.mock("@app/services/referralConfig.js", () => ({ loadReferralConfig: () => config }));

const stripe = {
  customers: {
    createBalanceTransaction: vi.fn(),
    listBalanceTransactions: vi.fn(),
    retrieve: vi.fn(),
  },
};
const mockGetStripeClient = vi.fn();
vi.mock("@app/lib/stripeClient.js", () => ({ getStripeClient: (...a) => mockGetStripeClient(...a) }));

const { handler } = await import("@app/functions/account/commissionCreditPayout.js");

const NOW = "2026-11-01T04:15:00.000Z";
const REFERRER = "ref1";

const pointer = (sk = "line#in_1") => ({ pk: "payable", sk: `${REFERRER}#${sk}`, linePk: `commission#${REFERRER}`, lineSk: sk });

function line(overrides = {}) {
  return {
    pk: `commission#${REFERRER}`,
    sk: "line#in_1",
    invoiceId: "in_1",
    state: "payable",
    form: "credit",
    livemode: true,
    amountPence: 300,
    ...overrides,
  };
}

const liveBundle = { bundleId: "resident-vat", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: "active" };

describe("functions/account/commissionCreditPayout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    for (const fn of Object.values(repo)) fn.mockReset();
    for (const fn of Object.values(stripe.customers)) fn.mockReset();
    config.ledger.payCredit = true;
    mockGetStripeClient.mockReset().mockResolvedValue(stripe);
    mockGetBundles.mockReset().mockResolvedValue([liveBundle]);
    repo.queryPayablePointers.mockResolvedValue([pointer()]);
    repo.getLineByKey.mockResolvedValue(line());
    repo.markLinePaid.mockResolvedValue(true);
    stripe.customers.listBalanceTransactions.mockResolvedValue({ data: [] });
    stripe.customers.createBalanceTransaction.mockResolvedValue({ id: "cbtxn_1" });
    stripe.customers.retrieve.mockResolvedValue({ balance: -1000 });
    process.env.COMMISSIONS_DYNAMODB_TABLE_NAME = "test-commissions-table";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundle-table";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a payable credit line is credited once with an idempotency key and marked paid", async () => {
    const summary = await handler();
    expect(summary).toMatchObject({ status: "ran", considered: 1, paid: 1 });
    expect(stripe.customers.createBalanceTransaction).toHaveBeenCalledTimes(1);
    expect(stripe.customers.createBalanceTransaction).toHaveBeenCalledWith(
      "cus_1",
      { amount: -300, currency: "gbp", description: "Referral credit", metadata: { invoiceId: "in_1", line: "line#in_1" } },
      { idempotencyKey: "commission-credit#ref1#line#in_1" },
    );
    expect(repo.markLinePaid).toHaveBeenCalledWith(line(), { now: NOW, fields: { balanceTransactionId: "cbtxn_1" } });
  });

  test("the referrer's customer is read from the live bundle by key", async () => {
    await handler();
    expect(mockGetBundles).toHaveBeenCalledWith(REFERRER);
  });

  test("does nothing while payCredit is false", async () => {
    config.ledger.payCredit = false;
    expect(await handler()).toEqual({ status: "off" });
    expect(repo.queryPayablePointers).not.toHaveBeenCalled();
    expect(mockGetStripeClient).not.toHaveBeenCalled();
    expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
  });

  test("skips cash lines and test-mode lines", async () => {
    repo.queryPayablePointers.mockResolvedValue([pointer("line#in_1"), pointer("line#in_2")]);
    repo.getLineByKey.mockResolvedValueOnce(line({ form: "cash" })).mockResolvedValueOnce(line({ sk: "line#in_2", livemode: false }));
    const summary = await handler();
    expect(summary).toMatchObject({ considered: 2, skipped: 2, paid: 0 });
    expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
    expect(repo.markLinePaid).not.toHaveBeenCalled();
  });

  test("a line that is no longer payable is skipped", async () => {
    repo.getLineByKey.mockResolvedValue(line({ state: "paid" }));
    expect((await handler()).skipped).toBe(1);
    expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
  });

  test("a reversal debits the credit back", async () => {
    repo.getLineByKey.mockResolvedValue(line({ sk: "line#in_1#reversal", amountPence: -300 }));
    const summary = await handler();
    expect(summary).toMatchObject({ debited: 1, paid: 0 });
    expect(stripe.customers.createBalanceTransaction).toHaveBeenCalledWith(
      "cus_1",
      expect.objectContaining({ amount: 300, description: "Referral credit returned" }),
      { idempotencyKey: "commission-credit#ref1#line#in_1#reversal" },
    );
    expect(repo.markLinePaid.mock.calls[0][1].fields).toEqual({ balanceTransactionId: "cbtxn_1", shortfallPence: 0 });
  });

  test("a reversal debits only the credit left and records the shortfall", async () => {
    stripe.customers.retrieve.mockResolvedValue({ balance: -120 });
    repo.getLineByKey.mockResolvedValue(line({ sk: "line#in_1#reversal", amountPence: -300 }));
    await handler();
    expect(stripe.customers.createBalanceTransaction.mock.calls[0][1].amount).toBe(120);
    expect(repo.markLinePaid.mock.calls[0][1].fields).toEqual({ balanceTransactionId: "cbtxn_1", shortfallPence: 180 });
  });

  test("a reversal with no credit left makes no Stripe debit and records the whole shortfall", async () => {
    stripe.customers.retrieve.mockResolvedValue({ balance: 500 });
    repo.getLineByKey.mockResolvedValue(line({ sk: "line#in_1#reversal", amountPence: -300 }));
    await handler();
    expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
    expect(repo.markLinePaid.mock.calls[0][1].fields).toEqual({ shortfallPence: 300 });
  });

  test("a referrer with no live subscription keeps the line payable and is reported", async () => {
    mockGetBundles.mockResolvedValue([{ ...liveBundle, subscriptionStatus: "canceled" }]);
    const summary = await handler();
    expect(summary).toMatchObject({ noCustomer: 1, paid: 0 });
    expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
    expect(repo.markLinePaid).not.toHaveBeenCalled();
  });

  test("a referrer with no Stripe customer keeps the line payable", async () => {
    mockGetBundles.mockResolvedValue([]);
    expect((await handler()).noCustomer).toBe(1);
    expect(repo.markLinePaid).not.toHaveBeenCalled();
  });

  test("a lost conditional update means the line was already paid", async () => {
    repo.markLinePaid.mockResolvedValue(false);
    const summary = await handler();
    expect(summary).toMatchObject({ alreadyPaid: 1, paid: 0 });
  });

  test("a balance transaction already on the customer for the line is recorded without a second credit", async () => {
    stripe.customers.listBalanceTransactions.mockResolvedValue({ data: [{ id: "cbtxn_old", metadata: { line: "line#in_1" } }] });
    await handler();
    expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
    expect(repo.markLinePaid.mock.calls[0][1].fields).toEqual({ balanceTransactionId: "cbtxn_old" });
  });

  test("a Stripe failure leaves the line payable and the run goes on", async () => {
    repo.queryPayablePointers.mockResolvedValue([pointer("line#in_1"), pointer("line#in_2")]);
    repo.getLineByKey.mockResolvedValueOnce(line()).mockResolvedValueOnce(line({ sk: "line#in_2", invoiceId: "in_2" }));
    stripe.customers.createBalanceTransaction.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "idempotency_error" }));
    const summary = await handler();
    expect(summary).toMatchObject({ failed: 1, paid: 1 });
    expect(repo.markLinePaid).toHaveBeenCalledTimes(1);
  });
});
