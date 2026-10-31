// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const repo = {
  getLine: vi.fn(),
  queryDueHeldPointers: vi.fn(),
  deleteHeldPointer: vi.fn(),
  queryConversions: vi.fn(),
  queryCardPayers: vi.fn(),
  setHoldReasons: vi.fn(),
  releaseLine: vi.fn(),
};
vi.mock("@app/data/dynamoDbCommissionRepository.js", () => ({
  getLine: (...a) => repo.getLine(...a),
  queryDueHeldPointers: (...a) => repo.queryDueHeldPointers(...a),
  deleteHeldPointer: (...a) => repo.deleteHeldPointer(...a),
  queryConversions: (...a) => repo.queryConversions(...a),
  queryCardPayers: (...a) => repo.queryCardPayers(...a),
  setHoldReasons: (...a) => repo.setHoldReasons(...a),
  releaseLine: (...a) => repo.releaseLine(...a),
}));

const mockGetAffiliate = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({ getAffiliate: (...a) => mockGetAffiliate(...a) }));

const mockGetSubscription = vi.fn();
vi.mock("@app/data/dynamoDbSubscriptionRepository.js", () => ({ getSubscription: (...a) => mockGetSubscription(...a) }));

const mockGetBundles = vi.fn();
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({ getBundlesByHashedSub: (...a) => mockGetBundles(...a) }));

const { handler, taxYearOf } = await import("@app/functions/account/commissionRelease.js");

const NOW = "2026-10-31T03:15:00.000Z";
const REFERRER = "ref1";
const REDEEMER = "red1";

function pointer(invoiceId = "in_1") {
  return {
    pk: "held",
    sk: `2026-10-30T00:00:00.000Z#${REFERRER}#${invoiceId}`,
    linePk: `commission#${REFERRER}`,
    lineSk: `line#${invoiceId}`,
  };
}

function line(overrides = {}) {
  return {
    pk: `commission#${REFERRER}`,
    sk: "line#in_1",
    invoiceId: "in_1",
    state: "held",
    tier: "casual",
    form: "cash",
    amountPence: 300,
    referralCode: "CODE1",
    redeemerHash: REDEEMER,
    subscriptionId: "sub_1",
    cardFingerprint: "fp1",
    customerCreatedAt: "2026-09-01T00:00:00.000Z",
    redeemedAt: "2026-08-01T00:00:00.000Z",
    firstPaidAt: "2026-09-02T00:00:00.000Z",
    releaseAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("functions/account/commissionRelease", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    for (const fn of Object.values(repo)) fn.mockReset();
    mockGetAffiliate.mockReset().mockResolvedValue({ state: "approved", tier: "casual" });
    mockGetSubscription.mockReset().mockResolvedValue({ status: "active" });
    mockGetBundles.mockReset().mockResolvedValue([]);
    repo.queryDueHeldPointers.mockResolvedValue([pointer()]);
    repo.getLine.mockResolvedValue(line());
    repo.queryConversions.mockResolvedValue([{ conversions: 1 }]);
    repo.queryCardPayers.mockResolvedValue([{ sk: `payer#${REDEEMER}` }]);
    repo.setHoldReasons.mockResolvedValue(true);
    repo.releaseLine.mockResolvedValue({ released: true });
    process.env.COMMISSIONS_DYNAMODB_TABLE_NAME = "test-commissions-table";
    process.env.SUBSCRIPTIONS_DYNAMODB_TABLE_NAME = "test-subscriptions-table";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundle-table";
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes-table";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a clean cash line is released with month and tax-year totals", async () => {
    const summary = await handler();
    expect(summary).toEqual({ evaluated: 1, released: 1, held: 0, stale: 0 });
    expect(repo.queryDueHeldPointers).toHaveBeenCalledWith(NOW);
    expect(repo.releaseLine).toHaveBeenCalledWith(expect.objectContaining({ sk: "line#in_1" }), {
      now: NOW,
      payableMonth: "2026-10",
      payableTaxYear: "2026-27",
      totals: [
        { sk: "totals#month#2026-10", field: "cashPence", cap: 10000 },
        { sk: "totals#taxyear#2026-27", field: "cashPence", cap: 100000 },
      ],
    });
    expect(repo.setHoldReasons).not.toHaveBeenCalled();
  });

  test("a family line counts only the tax-year total", async () => {
    repo.getLine.mockResolvedValue(line({ tier: "family" }));
    await handler();
    expect(repo.releaseLine.mock.calls[0][1].totals).toEqual([{ sk: "totals#taxyear#2026-27", field: "cashPence", cap: 100000 }]);
  });

  test("a stale pointer is deleted and nothing else happens", async () => {
    repo.getLine.mockResolvedValue(line({ state: "reversed" }));
    const summary = await handler();
    expect(summary.stale).toBe(1);
    expect(repo.deleteHeldPointer).toHaveBeenCalledWith(pointer().sk);
    expect(repo.releaseLine).not.toHaveBeenCalled();
  });

  test("a missing line is a stale pointer", async () => {
    repo.getLine.mockResolvedValue(null);
    expect((await handler()).stale).toBe(1);
    expect(repo.deleteHeldPointer).toHaveBeenCalled();
  });

  test.each([
    ["volume", () => repo.queryConversions.mockResolvedValue([{ conversions: 1 }, { conversions: 6 }])],
    ["card_referrer", () => repo.queryCardPayers.mockResolvedValue([{ sk: `payer#${REDEEMER}` }, { sk: `payer#${REFERRER}` }])],
    ["card_shared", () => repo.queryCardPayers.mockResolvedValue([{ sk: `payer#${REDEEMER}` }, { sk: "payer#other" }])],
    ["customer_predates_referral", () => repo.getLine.mockResolvedValue(line({ customerCreatedAt: "2026-07-01T00:00:00.000Z" }))],
    ["early_cancel", () => mockGetSubscription.mockResolvedValue({ status: "canceled", canceledAt: "2026-09-20T00:00:00.000Z" })],
    ["affiliate_not_approved", () => mockGetAffiliate.mockResolvedValue({ state: "applied" })],
  ])("hold reason %s keeps the line held and the pointer", async (reason, arrange) => {
    arrange();
    const summary = await handler();
    expect(summary).toEqual({ evaluated: 1, released: 0, held: 1, stale: 0 });
    expect(repo.setHoldReasons).toHaveBeenCalledWith(expect.objectContaining({ sk: "line#in_1" }), expect.arrayContaining([reason]), NOW);
    expect(repo.releaseLine).not.toHaveBeenCalled();
    expect(repo.deleteHeldPointer).not.toHaveBeenCalled();
  });

  test("a cancel after the early-cancel window does not hold", async () => {
    mockGetSubscription.mockResolvedValue({ status: "canceled", canceledAt: "2026-10-20T00:00:00.000Z" });
    expect((await handler()).released).toBe(1);
  });

  test("a line with no card fingerprint skips both card holds", async () => {
    repo.getLine.mockResolvedValue(line({ cardFingerprint: undefined }));
    repo.queryCardPayers.mockResolvedValue([{ sk: `payer#${REFERRER}` }]);
    await handler();
    expect(repo.queryCardPayers).not.toHaveBeenCalled();
    expect(repo.releaseLine).toHaveBeenCalled();
  });

  test("a credit line with no live subscription is held as no_subscription", async () => {
    repo.getLine.mockResolvedValue(line({ tier: "customer", form: "credit", amountPence: 100 }));
    mockGetBundles.mockResolvedValue([{ bundleId: "resident", subscriptionStatus: "canceled", stripeSubscriptionId: "sub_x" }]);
    await handler();
    expect(repo.setHoldReasons).toHaveBeenCalledWith(expect.anything(), ["no_subscription"], NOW);
    expect(mockGetAffiliate).not.toHaveBeenCalled();
  });

  test("a credit line is released against twelve months of the dearest live bundle", async () => {
    repo.getLine.mockResolvedValue(line({ tier: "customer", form: "credit", amountPence: 100 }));
    mockGetBundles.mockResolvedValue([
      { bundleId: "resident-vat", subscriptionStatus: "active", stripeSubscriptionId: "sub_a" },
      { bundleId: "resident", subscriptionStatus: "active", stripeSubscriptionId: "sub_b" },
    ]);
    await handler();
    const { totals } = repo.releaseLine.mock.calls[0][1];
    expect(totals).toHaveLength(1);
    expect(totals[0]).toMatchObject({ sk: "totals#credit", field: "creditPence" });
    expect(totals[0].cap).toBe(12 * 399);
  });

  test("an amount over the cap is held before any transaction", async () => {
    repo.getLine.mockResolvedValue(line({ amountPence: 10001 }));
    await handler();
    expect(repo.setHoldReasons).toHaveBeenCalledWith(expect.anything(), ["cap_month"], NOW);
    expect(repo.releaseLine).not.toHaveBeenCalled();
  });

  test.each([
    [2, "cap_month"],
    [3, "cap_tax_year"],
  ])("a transaction cancelled at index %i holds the line as %s", async (cancelledIndex, reason) => {
    repo.releaseLine.mockResolvedValue({ released: false, cancelledIndex, totalsIndex: cancelledIndex - 2 });
    const summary = await handler();
    expect(summary).toEqual({ evaluated: 1, released: 0, held: 1, stale: 0 });
    expect(repo.setHoldReasons).toHaveBeenCalledWith(expect.anything(), [reason], NOW);
  });

  test("a credit cap refusal holds the line as cap_credit", async () => {
    repo.getLine.mockResolvedValue(line({ tier: "customer", form: "credit", amountPence: 100 }));
    mockGetBundles.mockResolvedValue([{ bundleId: "resident", subscriptionStatus: "active", stripeSubscriptionId: "sub_b" }]);
    repo.releaseLine.mockResolvedValue({ released: false, cancelledIndex: 2, totalsIndex: 0 });
    await handler();
    expect(repo.setHoldReasons).toHaveBeenCalledWith(expect.anything(), ["cap_credit"], NOW);
  });

  test("a transaction cancelled on the line itself counts as stale", async () => {
    repo.releaseLine.mockResolvedValue({ released: false, cancelledIndex: 0, totalsIndex: -1 });
    const summary = await handler();
    expect(summary.stale).toBe(1);
    expect(repo.setHoldReasons).not.toHaveBeenCalled();
  });

  test("an empty queue evaluates nothing", async () => {
    repo.queryDueHeldPointers.mockResolvedValue([]);
    expect(await handler()).toEqual({ evaluated: 0, released: 0, held: 0, stale: 0 });
  });

  test("a missing table name fails the run", async () => {
    delete process.env.COMMISSIONS_DYNAMODB_TABLE_NAME;
    await expect(handler()).rejects.toThrow(/COMMISSIONS_DYNAMODB_TABLE_NAME/);
  });
});

describe("taxYearOf", () => {
  test("5 April and 6 April fall in different tax years", () => {
    expect(taxYearOf(new Date("2027-04-05T23:59:59.000Z"))).toBe("2026-27");
    expect(taxYearOf(new Date("2027-04-06T00:00:00.000Z"))).toBe("2027-28");
  });

  test("January belongs to the tax year that began the April before", () => {
    expect(taxYearOf(new Date("2027-01-15T00:00:00.000Z"))).toBe("2026-27");
  });

  test("the century rollover pads the short year", () => {
    expect(taxYearOf(new Date("2099-06-01T00:00:00.000Z"))).toBe("2099-00");
  });
});
