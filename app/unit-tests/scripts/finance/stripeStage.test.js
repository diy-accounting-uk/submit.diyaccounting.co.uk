// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/finance/stripeStage.test.js

import { describe, test, expect } from "vitest";

import {
  parseArgs,
  computeMonthRange,
  formatDateStamp,
  fetchBalanceTransactions,
  fetchPayouts,
} from "../../../../scripts/finance/stripe-stage.js";

describe("parseArgs", () => {
  test("reads --month", () => {
    expect(parseArgs(["--month", "2026-03"])).toEqual({ month: "2026-03" });
  });

  test("throws when --month is missing", () => {
    expect(() => parseArgs([])).toThrow(/--month is required/);
  });

  test("throws when --month is not YYYY-MM", () => {
    expect(() => parseArgs(["--month", "March 2026"])).toThrow(/--month is required/);
  });

  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("computeMonthRange", () => {
  test("bounds March 2026 from its first instant to April's first instant", () => {
    const { start, end, lastDay } = computeMonthRange("2026-03");
    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(lastDay.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  test("bounds a 30-day month", () => {
    const { end, lastDay } = computeMonthRange("2026-04");
    expect(end.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(lastDay.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });
});

describe("formatDateStamp", () => {
  test("formats a UTC date as yyyy-mm-dd", () => {
    expect(formatDateStamp(new Date(Date.UTC(2026, 2, 31)))).toBe("2026-03-31");
  });
});

// A recorded page of balance_transactions: a Stripe charge and its fee in one balance
// transaction (the shape stripe.balanceTransactions.list with expand: ["data.source"] returns),
// redacted to round amounts and synthetic ids.
const RECORDED_BALANCE_TRANSACTION_PAGE = {
  object: "list",
  data: [
    {
      id: "txn_test000000000001",
      object: "balance_transaction",
      amount: 5000,
      fee: 175,
      net: 4825,
      currency: "gbp",
      type: "charge",
      created: 1772496000,
      source: {
        id: "ch_test000000000001",
        object: "charge",
        amount: 5000,
        currency: "gbp",
        paid: true,
        status: "succeeded",
      },
    },
  ],
  has_more: false,
};

const RECORDED_PAYOUT_PAGE = {
  object: "list",
  data: [
    {
      id: "po_test000000000001",
      object: "payout",
      amount: 4825,
      currency: "gbp",
      created: 1772496000,
      status: "paid",
    },
  ],
  has_more: false,
};

function fakeStripe({ balanceTransactionPages, payoutPages }) {
  let balanceCallCount = 0;
  let payoutCallCount = 0;
  return {
    balanceTransactions: {
      list: async () => balanceTransactionPages[balanceCallCount++],
    },
    payouts: {
      list: async () => payoutPages[payoutCallCount++],
    },
  };
}

describe("fetchBalanceTransactions", () => {
  test("returns the recorded page's transactions with source expanded", async () => {
    const stripe = fakeStripe({ balanceTransactionPages: [RECORDED_BALANCE_TRANSACTION_PAGE], payoutPages: [] });
    const transactions = await fetchBalanceTransactions(stripe, new Date("2026-03-01T00:00:00.000Z"), new Date("2026-04-01T00:00:00.000Z"));
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ id: "txn_test000000000001", amount: 5000, fee: 175, net: 4825 });
    expect(transactions[0].source).toMatchObject({ id: "ch_test000000000001", status: "succeeded" });
  });

  test("follows has_more across pages", async () => {
    const firstPage = { ...RECORDED_BALANCE_TRANSACTION_PAGE, has_more: true };
    const secondPage = {
      object: "list",
      data: [{ ...RECORDED_BALANCE_TRANSACTION_PAGE.data[0], id: "txn_test000000000002" }],
      has_more: false,
    };
    const stripe = fakeStripe({ balanceTransactionPages: [firstPage, secondPage], payoutPages: [] });
    const transactions = await fetchBalanceTransactions(stripe, new Date("2026-03-01T00:00:00.000Z"), new Date("2026-04-01T00:00:00.000Z"));
    expect(transactions.map((t) => t.id)).toEqual(["txn_test000000000001", "txn_test000000000002"]);
  });
});

describe("fetchPayouts", () => {
  test("returns the recorded page's payouts", async () => {
    const stripe = fakeStripe({ balanceTransactionPages: [], payoutPages: [RECORDED_PAYOUT_PAGE] });
    const payouts = await fetchPayouts(stripe, new Date("2026-03-01T00:00:00.000Z"), new Date("2026-04-01T00:00:00.000Z"));
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ id: "po_test000000000001", amount: 4825, status: "paid" });
  });
});
