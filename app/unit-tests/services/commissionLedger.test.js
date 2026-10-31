// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

const repo = {
  getAnchor: vi.fn(),
  getChargePointer: vi.fn(),
  getLineByKey: vi.fn(),
  putAnchorWithConversion: vi.fn(),
  putCardPayer: vi.fn(),
  putLineWithPointers: vi.fn(),
  putReversalLine: vi.fn(),
  reverseHeldLine: vi.fn(),
  reversePayableLine: vi.fn(),
};
vi.mock("@app/data/dynamoDbCommissionRepository.js", () => ({
  getAnchor: (...a) => repo.getAnchor(...a),
  getChargePointer: (...a) => repo.getChargePointer(...a),
  getLineByKey: (...a) => repo.getLineByKey(...a),
  putAnchorWithConversion: (...a) => repo.putAnchorWithConversion(...a),
  putCardPayer: (...a) => repo.putCardPayer(...a),
  putLineWithPointers: (...a) => repo.putLineWithPointers(...a),
  putReversalLine: (...a) => repo.putReversalLine(...a),
  reverseHeldLine: (...a) => repo.reverseHeldLine(...a),
  reversePayableLine: (...a) => repo.reversePayableLine(...a),
  reversalSk: (invoiceId) => `line#${invoiceId}#reversal`,
}));

const passes = { getReferralClaim: vi.fn(), getRedemption: vi.fn(), getAffiliate: vi.fn(), getFamilyAffiliate: vi.fn() };
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getReferralClaim: (...a) => passes.getReferralClaim(...a),
  getRedemption: (...a) => passes.getRedemption(...a),
  getAffiliate: (...a) => passes.getAffiliate(...a),
  getFamilyAffiliate: (...a) => passes.getFamilyAffiliate(...a),
}));

const mockConfig = { current: null };
vi.mock("@app/services/referralConfig.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadReferralConfig: () => mockConfig.current ?? actual.loadReferralConfig() };
});

const { wholeMonthsBetween, computeCommission, accrueCommission, reverseCommissionForCharge } =
  await import("@app/services/commissionLedger.js");
const { loadReferralConfig } = await import("@app/services/referralConfig.js");

const JAN_1 = Date.UTC(2026, 0, 1) / 1000;
const FEB_1 = Date.UTC(2026, 1, 1) / 1000;
const JAN_1_NEXT_YEAR = Date.UTC(2027, 0, 1) / 1000;
const NOW = "2026-01-02T00:00:00.000Z";

function iso(seconds) {
  return new Date(seconds * 1000).toISOString();
}

function expandedInvoice({ start = JAN_1, end = FEB_1, net = 1000, chargeOverrides = {}, currency = "gbp" } = {}) {
  return {
    id: "in_test_123",
    livemode: true,
    customer: { id: "cus_test_789", created: JAN_1 + 100 },
    charge: {
      id: "ch_test_dispute_123",
      amount: 1200,
      created: JAN_1 + 3600,
      refunded: false,
      amount_refunded: 0,
      disputed: false,
      payment_method_details: { card: { fingerprint: "fp_1" } },
      balance_transaction: { net, fee: 200, currency },
      ...chargeOverrides,
    },
    lines: { data: [{ type: "subscription", period: { start, end } }] },
  };
}

const subRecord = { pk: "stripe#sub_test_456", hashedSub: "redeemer-hash", bundleId: "resident", actor: "customer" };

function stripeReturning(invoice) {
  return { invoices: { retrieve: vi.fn().mockResolvedValue(invoice) } };
}

function run(invoice, overrides = {}) {
  const stripe = stripeReturning(invoice);
  return {
    stripe,
    promise: accrueCommission({
      invoice: { id: invoice.id },
      subscriptionId: "sub_test_456",
      subRecord,
      stripe,
      nowIso: NOW,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  for (const fn of [...Object.values(repo), ...Object.values(passes)]) fn.mockReset();
  mockConfig.current = null;
  repo.putAnchorWithConversion.mockResolvedValue(true);
  repo.putLineWithPointers.mockResolvedValue(true);
  passes.getReferralClaim.mockResolvedValue({ code: "code-1" });
  passes.getRedemption.mockResolvedValue({ issuedBy: "referrer-hash", redeemedAt: iso(JAN_1 + 50), passTypeId: "referral" });
  passes.getAffiliate.mockResolvedValue(null);
  passes.getFamilyAffiliate.mockResolvedValue(null);
  repo.getAnchor.mockResolvedValue(null);
});

describe("services/commissionLedger - amounts", () => {
  test("wholeMonthsBetween counts nearest whole months", () => {
    expect(wholeMonthsBetween(iso(JAN_1), iso(FEB_1))).toBe(1);
    expect(wholeMonthsBetween(iso(JAN_1), iso(JAN_1_NEXT_YEAR))).toBe(12);
    expect(wholeMonthsBetween(iso(JAN_1), iso(JAN_1))).toBe(0);
    expect(wholeMonthsBetween(iso(FEB_1), iso(JAN_1))).toBe(0);
    expect(wholeMonthsBetween(iso(Date.UTC(2026, 0, 31) / 1000), iso(Date.UTC(2026, 1, 28) / 1000))).toBe(1);
  });

  const base = { rateBps: 3000, months: 12, windowStart: iso(JAN_1) };
  const monthIndex = (n) => ({
    periodStart: new Date(Date.UTC(2026, n, 1)).toISOString(),
    periodEnd: new Date(Date.UTC(2026, n + 1, 1)).toISOString(),
  });

  test("month 1 pays the full share", () => {
    expect(computeCommission({ ...base, netPence: 1000, ...monthIndex(0) })).toEqual({
      lineMonths: 1,
      eligibleMonths: 1,
      amountPence: 300,
    });
  });

  test("month 12 pays and month 13 pays nothing", () => {
    expect(computeCommission({ ...base, netPence: 1000, ...monthIndex(11) }).amountPence).toBe(300);
    expect(computeCommission({ ...base, netPence: 1000, ...monthIndex(12) })).toEqual({ lineMonths: 1, eligibleMonths: 0, amountPence: 0 });
  });

  test("an annual charge pays 30 percent of the whole charge", () => {
    const result = computeCommission({ ...base, netPence: 12000, periodStart: iso(JAN_1), periodEnd: iso(JAN_1_NEXT_YEAR) });
    expect(result).toEqual({ lineMonths: 12, eligibleMonths: 12, amountPence: 3600 });
  });

  test("a family annual charge pays one twelfth of the net", () => {
    const result = computeCommission({
      netPence: 12000,
      rateBps: 10000,
      months: 1,
      windowStart: iso(JAN_1),
      periodStart: iso(JAN_1),
      periodEnd: iso(JAN_1_NEXT_YEAR),
    });
    expect(result.amountPence).toBe(1000);
  });

  test("a family monthly second invoice pays nothing", () => {
    expect(computeCommission({ netPence: 1000, rateBps: 10000, months: 1, windowStart: iso(JAN_1), ...monthIndex(1) }).amountPence).toBe(0);
  });

  test("the amount rounds down", () => {
    expect(computeCommission({ ...base, netPence: 999, ...monthIndex(0) }).amountPence).toBe(299);
  });
});

describe("services/commissionLedger - accrueCommission", () => {
  test("accrue = false writes nothing and calls no one", async () => {
    const config = structuredClone(loadReferralConfig());
    config.ledger.accrue = false;
    mockConfig.current = config;
    const { stripe, promise } = run(expandedInvoice());
    expect((await promise).status).toBe("off");
    expect(stripe.invoices.retrieve).not.toHaveBeenCalled();
    expect(repo.putCardPayer).not.toHaveBeenCalled();
    expect(repo.putLineWithPointers).not.toHaveBeenCalled();
  });

  test("a synthetic actor writes nothing", async () => {
    const { stripe, promise } = run(expandedInvoice(), { subRecord: { ...subRecord, actor: "test-user" } });
    expect((await promise).status).toBe("not-customer");
    expect(stripe.invoices.retrieve).not.toHaveBeenCalled();
  });

  test("a record without an actor counts only on a live invoice", async () => {
    const { actor, ...legacy } = subRecord;
    expect(actor).toBe("customer");
    const test = expandedInvoice();
    test.livemode = false;
    const stripe = stripeReturning(test);
    const result = await accrueCommission({
      invoice: { id: test.id, livemode: false },
      subscriptionId: "sub_test_456",
      subRecord: legacy,
      stripe,
      nowIso: NOW,
    });
    expect(result.status).toBe("not-customer");
  });

  test("an invoice with a null charge writes nothing", async () => {
    const invoice = expandedInvoice();
    invoice.charge = null;
    expect((await run(invoice).promise).status).toBe("no-charge");
    expect(repo.putCardPayer).not.toHaveBeenCalled();
  });

  test("a charge that is not in pounds writes nothing", async () => {
    expect((await run(expandedInvoice({ currency: "usd" })).promise).status).toBe("not-gbp");
  });

  test("a charge with no balance transaction stops", async () => {
    const invoice = expandedInvoice();
    invoice.charge.balance_transaction = null;
    expect((await run(invoice).promise).status).toBe("no-balance-transaction");
    expect(repo.putLineWithPointers).not.toHaveBeenCalled();
  });

  test("the invoice is retrieved with the charge and customer expanded at the pinned version", async () => {
    const { stripe, promise } = run(expandedInvoice());
    await promise;
    expect(stripe.invoices.retrieve).toHaveBeenCalledWith(
      "in_test_123",
      { expand: ["charge.balance_transaction", "customer"] },
      { apiVersion: "2024-12-18.acacia" },
    );
  });

  test("an unreferred payer gets a card record and nothing else", async () => {
    passes.getReferralClaim.mockResolvedValue(null);
    expect((await run(expandedInvoice()).promise).status).toBe("not-referred");
    expect(repo.putCardPayer).toHaveBeenCalledWith("fp_1", "redeemer-hash", NOW);
    expect(repo.putAnchorWithConversion).not.toHaveBeenCalled();
    expect(repo.putLineWithPointers).not.toHaveBeenCalled();
  });

  test("a referred payer gets an anchor, a conversion and a held line with every attribute", async () => {
    const result = await run(expandedInvoice()).promise;
    expect(result.status).toBe("recorded");

    const anchorCall = repo.putAnchorWithConversion.mock.calls[0][0];
    expect(anchorCall).toMatchObject({
      referrerHash: "referrer-hash",
      redeemerHash: "redeemer-hash",
      referralCode: "code-1",
      day: "2026-01-01",
    });
    expect(anchorCall.anchor).toMatchObject({
      tier: "customer",
      form: "credit",
      months: 12,
      holdDays: 30,
      windowStart: iso(JAN_1),
      subscriptionId: "sub_test_456",
    });

    const line = repo.putLineWithPointers.mock.calls[0][0];
    expect(line).toEqual({
      referrerHash: "referrer-hash",
      invoiceId: "in_test_123",
      chargeId: "ch_test_dispute_123",
      subscriptionId: "sub_test_456",
      redeemerHash: "redeemer-hash",
      referralCode: "code-1",
      tier: "customer",
      form: "credit",
      payout: "customer-balance",
      rateBps: 3000,
      grossPence: 1200,
      feePence: 200,
      netPence: 1000,
      currency: "gbp",
      eligibleMonths: 1,
      lineMonths: 1,
      amountPence: 300,
      state: "held",
      holdReasons: [],
      releaseAt: new Date(Date.parse(iso(JAN_1 + 3600)) + 30 * 86400000).toISOString(),
      chargedAt: iso(JAN_1 + 3600),
      periodStart: iso(JAN_1),
      periodEnd: iso(FEB_1),
      firstPaidAt: iso(JAN_1 + 3600),
      livemode: true,
      cardFingerprint: "fp_1",
      customerCreatedAt: iso(JAN_1 + 100),
      redeemedAt: iso(JAN_1 + 50),
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  test("a family affiliate fixes the family tier on the anchor", async () => {
    passes.getFamilyAffiliate.mockResolvedValue({ pk: "family#referrer-hash" });
    await run(expandedInvoice()).promise;
    expect(passes.getFamilyAffiliate).toHaveBeenCalledWith("referrer-hash");
    expect(repo.putAnchorWithConversion.mock.calls[0][0].anchor).toMatchObject({
      tier: "family",
      rateBps: 10000,
      months: 1,
      payout: "bank-transfer",
      holdDays: 60,
    });
  });

  test("a family affiliate whose affiliate item has an approved tier still earns the family tier", async () => {
    passes.getFamilyAffiliate.mockResolvedValue({ pk: "family#referrer-hash" });
    passes.getAffiliate.mockResolvedValue({ state: "approved", tier: "casual" });
    await run(expandedInvoice()).promise;
    expect(repo.putAnchorWithConversion.mock.calls[0][0].anchor.tier).toBe("family");
  });

  test("a family affiliate whose affiliate item has ended earns the default tier", async () => {
    passes.getFamilyAffiliate.mockResolvedValue({ pk: "family#referrer-hash" });
    passes.getAffiliate.mockResolvedValue({ state: "ended", tier: "family" });
    await run(expandedInvoice()).promise;
    expect(repo.putAnchorWithConversion.mock.calls[0][0].anchor.tier).toBe("customer");
  });

  test("an approved affiliate fixes its tier on the anchor", async () => {
    passes.getAffiliate.mockResolvedValue({ state: "approved", tier: "casual" });
    await run(expandedInvoice()).promise;
    expect(repo.putAnchorWithConversion.mock.calls[0][0].anchor).toMatchObject({ tier: "casual", form: "cash", holdDays: 120 });
  });

  test("a second delivery of the same invoice reports a duplicate and writes no second line", async () => {
    repo.putLineWithPointers.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await run(expandedInvoice()).promise).status).toBe("recorded");
    repo.getAnchor.mockResolvedValue({
      referralCode: "code-1",
      tier: "customer",
      rateBps: 3000,
      form: "credit",
      payout: "customer-balance",
      months: 12,
      holdDays: 30,
      windowStart: iso(JAN_1),
      firstPaidAt: iso(JAN_1),
    });
    expect((await run(expandedInvoice()).promise).status).toBe("duplicate");
    expect(repo.putAnchorWithConversion).toHaveBeenCalledTimes(1);
  });

  test("when another delivery wrote the anchor first the stored anchor is used", async () => {
    repo.putAnchorWithConversion.mockResolvedValue(false);
    repo.getAnchor.mockResolvedValueOnce(null).mockResolvedValueOnce({
      referralCode: "code-1",
      tier: "casual",
      rateBps: 3000,
      form: "cash",
      payout: "connect",
      months: 12,
      holdDays: 120,
      windowStart: iso(JAN_1),
      firstPaidAt: iso(JAN_1),
    });
    await run(expandedInvoice()).promise;
    expect(repo.putLineWithPointers.mock.calls[0][0].tier).toBe("casual");
  });

  test("a month past the window writes no line", async () => {
    repo.getAnchor.mockResolvedValue({
      referralCode: "code-1",
      tier: "customer",
      rateBps: 3000,
      form: "credit",
      payout: "customer-balance",
      months: 12,
      holdDays: 30,
      windowStart: iso(JAN_1),
      firstPaidAt: iso(JAN_1),
    });
    const start = Date.UTC(2027, 0, 1) / 1000;
    const end = Date.UTC(2027, 1, 1) / 1000;
    expect((await run(expandedInvoice({ start, end })).promise).status).toBe("no-commission");
    expect(repo.putLineWithPointers).not.toHaveBeenCalled();
  });

  test("a refunded charge is written reversed with no hold", async () => {
    const result = await run(expandedInvoice({ chargeOverrides: { refunded: true, amount_refunded: 1200 } })).promise;
    expect(result.status).toBe("recorded");
    const line = repo.putLineWithPointers.mock.calls[0][0];
    expect(line.state).toBe("reversed");
    expect(line.reversalReason).toBe("refund");
    expect(line.reversedAt).toBe(NOW);
    expect(line.holdReasons).toBeUndefined();
  });

  test("a disputed charge is written reversed for the dispute", async () => {
    await run(expandedInvoice({ chargeOverrides: { disputed: true } })).promise;
    expect(repo.putLineWithPointers.mock.calls[0][0].reversalReason).toBe("dispute");
  });

  test("a redeemer with no redemption record writes nothing", async () => {
    passes.getRedemption.mockResolvedValue(null);
    expect((await run(expandedInvoice()).promise).status).toBe("no-redemption");
  });
});

describe("services/commissionLedger - reverseCommissionForCharge", () => {
  const pointer = { pk: "charge#ch_1", sk: "line", linePk: "commission#referrer-hash", lineSk: "line#in_1" };
  const baseLine = {
    pk: "commission#referrer-hash",
    sk: "line#in_1",
    invoiceId: "in_1",
    amountPence: 300,
    tier: "customer",
    form: "credit",
    releaseAt: "2026-02-01T00:00:00.000Z",
  };

  beforeEach(() => {
    repo.getChargePointer.mockResolvedValue(pointer);
    repo.reverseHeldLine.mockResolvedValue(true);
    repo.reversePayableLine.mockResolvedValue(true);
    repo.putReversalLine.mockResolvedValue(true);
  });

  test("a held line is reversed", async () => {
    repo.getLineByKey.mockResolvedValue({ ...baseLine, state: "held" });
    const result = await reverseCommissionForCharge("ch_1", "refund", { nowIso: NOW });
    expect(result.status).toBe("reversed");
    expect(repo.reverseHeldLine).toHaveBeenCalledWith(expect.objectContaining({ sk: "line#in_1" }), { reason: "refund", now: NOW });
  });

  test("a payable credit line is reversed and leaves the credit total", async () => {
    repo.getLineByKey.mockResolvedValue({ ...baseLine, state: "payable", payableMonth: "2026-02", payableTaxYear: "2025-26" });
    await reverseCommissionForCharge("ch_1", "dispute", { nowIso: NOW });
    expect(repo.reversePayableLine.mock.calls[0][1].totals).toEqual([{ sk: "totals#credit", field: "creditPence" }]);
  });

  test("a payable cash line leaves the month and tax year totals its tier caps", async () => {
    repo.getLineByKey.mockResolvedValue({
      ...baseLine,
      tier: "casual",
      form: "cash",
      state: "payable",
      payableMonth: "2026-02",
      payableTaxYear: "2025-26",
    });
    await reverseCommissionForCharge("ch_1", "refund", { nowIso: NOW });
    expect(repo.reversePayableLine.mock.calls[0][1].totals).toEqual([
      { sk: "totals#month#2026-02", field: "cashPence" },
      { sk: "totals#taxyear#2025-26", field: "cashPence" },
    ]);
  });

  test("a family line leaves only the tax year total", async () => {
    repo.getLineByKey.mockResolvedValue({
      ...baseLine,
      tier: "family",
      form: "cash",
      state: "payable",
      payableMonth: "2026-02",
      payableTaxYear: "2025-26",
    });
    await reverseCommissionForCharge("ch_1", "refund", { nowIso: NOW });
    expect(repo.reversePayableLine.mock.calls[0][1].totals).toEqual([{ sk: "totals#taxyear#2025-26", field: "cashPence" }]);
  });

  test("a paid line gets a negative reversal line", async () => {
    repo.getLineByKey.mockResolvedValue({ ...baseLine, state: "paid", paidAt: "2026-03-01T00:00:00.000Z" });
    const result = await reverseCommissionForCharge("ch_1", "refund", { nowIso: NOW });
    expect(result.status).toBe("reversal-line");
    const reversal = repo.putReversalLine.mock.calls[0][0];
    expect(reversal).toMatchObject({
      pk: baseLine.pk,
      sk: "line#in_1#reversal",
      amountPence: -300,
      state: "payable",
      reversalOf: "line#in_1",
      reversalReason: "refund",
    });
    expect(reversal.paidAt).toBeUndefined();
  });

  test("a reversed line changes nothing", async () => {
    repo.getLineByKey.mockResolvedValue({ ...baseLine, state: "reversed" });
    const result = await reverseCommissionForCharge("ch_1", "refund", { nowIso: NOW });
    expect(result.status).toBe("already-reversed");
    expect(repo.reverseHeldLine).not.toHaveBeenCalled();
    expect(repo.reversePayableLine).not.toHaveBeenCalled();
    expect(repo.putReversalLine).not.toHaveBeenCalled();
  });

  test("an unknown charge does nothing", async () => {
    repo.getChargePointer.mockResolvedValue(null);
    expect((await reverseCommissionForCharge("ch_unknown", "refund")).status).toBe("no-line");
    expect(repo.getLineByKey).not.toHaveBeenCalled();
  });

  test("reversal runs when accrual is switched off", async () => {
    const config = structuredClone(loadReferralConfig());
    config.ledger.accrue = false;
    mockConfig.current = config;
    repo.getLineByKey.mockResolvedValue({ ...baseLine, state: "held" });
    expect((await reverseCommissionForCharge("ch_1", "refund", { nowIso: NOW })).status).toBe("reversed");
  });
});
