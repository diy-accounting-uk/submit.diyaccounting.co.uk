// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { startStripeSimulator } from "@app/test-support/stripeSimulator.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// In-memory commission and passes tables.
const store = { lines: new Map(), payouts: new Map(), affiliates: new Map(), pointers: [] };
const lineKey = (pk, sk) => `${pk}|${sk}`;

const repo = {
  queryPayablePointers: vi.fn(async (partition) => store.pointers.filter((pointer) => pointer.pk === partition)),
  getLineByKey: vi.fn(async (pk, sk) => {
    const line = store.lines.get(lineKey(pk, sk));
    return line ? { ...line } : null;
  }),
  markLinePaid: vi.fn(async (line, { now, fields }) => {
    const stored = store.lines.get(lineKey(line.pk, line.sk));
    if (stored?.state !== "payable") return false;
    Object.assign(stored, { state: "paid", paidAt: now, ...fields });
    store.pointers = store.pointers.filter((pointer) => !(pointer.linePk === line.pk && pointer.lineSk === line.sk));
    return true;
  }),
  queryPayouts: vi.fn(async (referrerHash) => [...store.payouts.values()].filter((payout) => payout.referrerHash === referrerHash)),
  putPendingPayout: vi.fn(async (payout) => {
    const key = `${payout.referrerHash}|${payout.month}`;
    if (store.payouts.has(key)) return false;
    store.payouts.set(key, { ...payout, state: "pending" });
    return true;
  }),
  markPayoutPaid: vi.fn(async ({ referrerHash, month, transferId }) => {
    const payout = store.payouts.get(`${referrerHash}|${month}`);
    if (payout?.state !== "pending") return false;
    Object.assign(payout, { state: "paid", transferId });
    return true;
  }),
};
vi.mock("@app/data/dynamoDbCommissionRepository.js", () => ({
  commissionPk: (referrerHash) => `commission#${referrerHash}`,
  PAYABLE_CONNECT_PARTITION: "payable#connect",
  queryPayablePointers: (...a) => repo.queryPayablePointers(...a),
  getLineByKey: (...a) => repo.getLineByKey(...a),
  markLinePaid: (...a) => repo.markLinePaid(...a),
  queryPayouts: (...a) => repo.queryPayouts(...a),
  putPendingPayout: (...a) => repo.putPendingPayout(...a),
  markPayoutPaid: (...a) => repo.markPayoutPaid(...a),
}));

const mockRecordStatus = vi.fn(async () => ({}));
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getAffiliate: async (referrerHash) => store.affiliates.get(referrerHash) ?? null,
  recordAffiliateAccountStatus: (...a) => mockRecordStatus(...a),
}));

const config = {
  ledger: { payCash: true },
  tiers: [
    { id: "customer", form: "credit", payout: "customer-balance" },
    { id: "casual", form: "cash", payout: "connect", capMonthPence: 10000, capTaxYearPence: 100000, minPayoutPence: 2000 },
    { id: "family", form: "cash", payout: "bank-transfer", capTaxYearPence: 100000 },
  ],
};
vi.mock("@app/services/referralConfig.js", () => ({ loadReferralConfig: () => config }));

const stripeState = { accounts: {}, transfers: [] };
let simulator;

beforeAll(async () => {
  simulator = await startStripeSimulator(0, { state: stripeState });
  process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${simulator.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => simulator.close(resolve));
});

const { handler, selectPayout, transferIdempotencyKey } = await import("@app/functions/account/commissionCashPayout.js");

const NOW = "2026-11-01T05:15:00.000Z";

function approve(referrerHash, overrides = {}) {
  store.affiliates.set(referrerHash, {
    pk: `affiliate#${referrerHash}`,
    tier: "casual",
    state: "approved",
    stripeAccountId: `acct_${referrerHash}`,
    transfersActive: true,
    ...overrides,
  });
}

function addLine(referrerHash, invoiceId, amountPence, overrides = {}) {
  const line = {
    pk: `commission#${referrerHash}`,
    sk: `line#${invoiceId}`,
    invoiceId,
    tier: "casual",
    form: "cash",
    payout: "connect",
    livemode: true,
    state: "payable",
    amountPence,
    payableAt: `2026-10-${String(10 + store.lines.size).padStart(2, "0")}T03:15:00.000Z`,
    ...overrides,
  };
  store.lines.set(lineKey(line.pk, line.sk), line);
  if (line.state === "payable") {
    store.pointers.push({ pk: "payable#connect", sk: `${referrerHash}#${line.sk}`, linePk: line.pk, lineSk: line.sk });
  }
  return line;
}

const lineOf = (referrerHash, invoiceId) => store.lines.get(lineKey(`commission#${referrerHash}`, `line#${invoiceId}`));

describe("functions/account/commissionCashPayout", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    store.lines.clear();
    store.payouts.clear();
    store.affiliates.clear();
    store.pointers = [];
    stripeState.accounts = {};
    stripeState.transfers.length = 0;
    config.ledger.payCash = true;
    mockRecordStatus.mockClear();
    for (const fn of Object.values(repo)) fn.mockClear();
    process.env.COMMISSIONS_DYNAMODB_TABLE_NAME = "test-commissions-table";
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes-table";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("does nothing while payCash is false", async () => {
    config.ledger.payCash = false;
    approve("r1");
    addLine("r1", "in_1", 5000);
    expect(await handler()).toEqual({ status: "off" });
    expect(repo.queryPayablePointers).not.toHaveBeenCalled();
    expect(stripeState.transfers).toHaveLength(0);
  });

  test("payable lines at or above the minimum are paid in one GBP transfer to the Connect account", async () => {
    approve("r1");
    addLine("r1", "in_1", 1500);
    addLine("r1", "in_2", 1000);
    const summary = await handler();
    expect(summary).toMatchObject({ status: "ran", affiliates: 1, paid: 1, paidPence: 2500 });
    expect(repo.queryPayablePointers).toHaveBeenCalledWith("payable#connect");
    expect(stripeState.transfers).toHaveLength(1);
    const { transfer, idempotencyKey } = stripeState.transfers[0];
    expect(transfer).toMatchObject({ amount: 2500, currency: "gbp", destination: "acct_r1" });
    expect(idempotencyKey).toBe("commission-cash#r1#2026-11");
    expect(lineOf("r1", "in_1")).toMatchObject({ state: "paid", transferId: transfer.id, payoutMonth: "2026-11" });
    expect(lineOf("r1", "in_2")).toMatchObject({ state: "paid", transferId: transfer.id });
    expect(store.payouts.get("r1|2026-11")).toMatchObject({
      state: "paid",
      transferId: transfer.id,
      amountPence: 2500,
      taxYear: "2026-27",
    });
  });

  test("a total below the minimum is held for a later run", async () => {
    approve("r1");
    addLine("r1", "in_1", 1999);
    const summary = await handler();
    expect(summary).toMatchObject({ belowMinimum: 1, paid: 0 });
    expect(stripeState.transfers).toHaveLength(0);
    expect(lineOf("r1", "in_1").state).toBe("payable");
    expect(store.payouts.size).toBe(0);
  });

  test("the monthly cap pays the oldest lines and leaves the rest payable", async () => {
    approve("r1");
    addLine("r1", "in_1", 6000, { payableAt: "2026-10-01T03:15:00.000Z" });
    addLine("r1", "in_2", 5000, { payableAt: "2026-10-02T03:15:00.000Z" });
    addLine("r1", "in_3", 4000, { payableAt: "2026-10-03T03:15:00.000Z" });
    const summary = await handler();
    expect(summary).toMatchObject({ paid: 1, paidPence: 10000, cappedLines: 1 });
    expect(stripeState.transfers[0].transfer.amount).toBe(10000);
    expect(lineOf("r1", "in_1").state).toBe("paid");
    expect(lineOf("r1", "in_2").state).toBe("payable");
    expect(lineOf("r1", "in_3").state).toBe("paid");
  });

  test("the tax-year cap counts what earlier months of the same tax year paid", async () => {
    approve("r1");
    store.payouts.set("r1|2026-10", { referrerHash: "r1", month: "2026-10", taxYear: "2026-27", amountPence: 97000, state: "paid" });
    store.payouts.set("r1|2026-03", { referrerHash: "r1", month: "2026-03", taxYear: "2025-26", amountPence: 9000, state: "paid" });
    addLine("r1", "in_1", 2500);
    addLine("r1", "in_2", 3500);
    const summary = await handler();
    expect(summary).toMatchObject({ paid: 1, paidPence: 2500, cappedLines: 1 });
    expect(lineOf("r1", "in_2").state).toBe("payable");
  });

  test("a full tax year leaves every line payable and makes no transfer", async () => {
    approve("r1");
    store.payouts.set("r1|2026-10", { referrerHash: "r1", month: "2026-10", taxYear: "2026-27", amountPence: 100000, state: "paid" });
    addLine("r1", "in_1", 2500);
    expect(await handler()).toMatchObject({ nothingDue: 1, cappedLines: 1 });
    expect(stripeState.transfers).toHaveLength(0);
  });

  test("a negative reversal line is netted against the next payout", async () => {
    approve("r1");
    addLine("r1", "in_1#reversal", -1000);
    addLine("r1", "in_2", 4000);
    const summary = await handler();
    expect(summary).toMatchObject({ paid: 1, paidPence: 3000 });
    expect(stripeState.transfers[0].transfer.amount).toBe(3000);
    expect(lineOf("r1", "in_1#reversal")).toMatchObject({ state: "paid", transferId: stripeState.transfers[0].transfer.id });
    expect(lineOf("r1", "in_2").state).toBe("paid");
  });

  test("a negative net is never transferred and every line stays payable", async () => {
    approve("r1");
    addLine("r1", "in_1#reversal", -3000);
    addLine("r1", "in_2", 2500);
    expect(await handler()).toMatchObject({ nothingDue: 1, paid: 0 });
    expect(stripeState.transfers).toHaveLength(0);
    expect(lineOf("r1", "in_1#reversal").state).toBe("payable");
    expect(lineOf("r1", "in_2").state).toBe("payable");
  });

  test("a net that the reversal brings under the minimum is held", async () => {
    approve("r1");
    addLine("r1", "in_1#reversal", -1000);
    addLine("r1", "in_2", 2500);
    expect(await handler()).toMatchObject({ belowMinimum: 1 });
    expect(stripeState.transfers).toHaveLength(0);
  });

  test("skips an affiliate with no Connect account, inactive transfers, an ended state or a bank-transfer tier", async () => {
    approve("none", { stripeAccountId: undefined });
    approve("inactive", { transfersActive: false });
    stripeState.accounts.acct_inactive = { capabilities: { transfers: "inactive" }, details_submitted: true };
    approve("ended", { state: "ended" });
    approve("applied", { state: "applied" });
    approve("family", { tier: "family" });
    for (const hash of ["none", "inactive", "ended", "applied", "family"]) addLine(hash, `in_${hash}`, 5000);
    addLine("nobody", "in_nobody", 5000);
    const summary = await handler();
    expect(summary).toMatchObject({ affiliates: 6, noAccount: 1, transfersInactive: 1, notApproved: 3, notConnect: 1, paid: 0 });
    expect(stripeState.transfers).toHaveLength(0);
  });

  test("a family tier line is never paid even under an approved connect affiliate", async () => {
    approve("r1");
    addLine("r1", "in_1", 5000, { tier: "family" });
    expect(await handler()).toMatchObject({ nothingDue: 1 });
    expect(stripeState.transfers).toHaveLength(0);
  });

  test("transfers that Stripe now reports active are recorded and paid", async () => {
    approve("r1", { transfersActive: false });
    addLine("r1", "in_1", 5000);
    expect(await handler()).toMatchObject({ paid: 1 });
    expect(mockRecordStatus).toHaveBeenCalledWith({ referrerHash: "r1", detailsSubmitted: true, transfersActive: true, now: NOW });
  });

  test("transfers that Stripe reports inactive are recorded and nothing is paid", async () => {
    approve("r1");
    stripeState.accounts.acct_r1 = { capabilities: { transfers: "pending" } };
    addLine("r1", "in_1", 5000);
    expect(await handler()).toMatchObject({ transfersInactive: 1 });
    expect(mockRecordStatus).toHaveBeenCalledWith(expect.objectContaining({ referrerHash: "r1", transfersActive: false }));
    expect(stripeState.transfers).toHaveLength(0);
  });

  test("test-mode lines are paid only to a test-mode affiliate", async () => {
    approve("live");
    approve("test", { stripeTest: true });
    addLine("live", "in_live", 5000, { livemode: false });
    addLine("test", "in_test", 5000, { livemode: false });
    const summary = await handler();
    expect(summary).toMatchObject({ paid: 1, nothingDue: 1 });
    expect(stripeState.transfers[0].transfer.destination).toBe("acct_test");
  });

  test("the idempotency key is fixed by the affiliate and the month", () => {
    expect(transferIdempotencyKey("r1", "2026-11")).toBe("commission-cash#r1#2026-11");
    expect(transferIdempotencyKey("r1", "2026-11")).toBe(transferIdempotencyKey("r1", "2026-11"));
    expect(transferIdempotencyKey("r1", "2026-12")).not.toBe(transferIdempotencyKey("r1", "2026-11"));
  });

  test("a second run in the same month makes no second transfer", async () => {
    approve("r1");
    addLine("r1", "in_1", 5000);
    await handler();
    addLine("r1", "in_2", 5000);
    expect(await handler()).toMatchObject({ alreadyPaid: 1, paid: 0 });
    expect(stripeState.transfers).toHaveLength(1);
    expect(lineOf("r1", "in_2").state).toBe("payable");
  });

  test("a pending payout whose transfer was made is completed without a second transfer", async () => {
    approve("r1");
    addLine("r1", "in_1", 5000);
    store.payouts.set("r1|2026-10", {
      referrerHash: "r1",
      month: "2026-10",
      taxYear: "2026-27",
      amountPence: 5000,
      lineSks: ["line#in_1"],
      stripeAccountId: "acct_r1",
      state: "pending",
    });
    stripeState.transfers.push({
      idempotencyKey: "commission-cash#r1#2026-10",
      transfer: { id: "tr_earlier", amount: 5000, currency: "gbp", destination: "acct_r1", transfer_group: "commission-cash-r1-2026-10" },
    });
    const summary = await handler();
    expect(summary).toMatchObject({ resumed: 1, nothingDue: 1 });
    expect(stripeState.transfers).toHaveLength(1);
    expect(lineOf("r1", "in_1")).toMatchObject({ state: "paid", transferId: "tr_earlier" });
    expect(store.payouts.get("r1|2026-10")).toMatchObject({ state: "paid", transferId: "tr_earlier" });
  });

  test("a pending payout whose transfer was never made is transferred with its own month's key", async () => {
    approve("r1");
    addLine("r1", "in_1", 5000);
    store.payouts.set("r1|2026-10", {
      referrerHash: "r1",
      month: "2026-10",
      taxYear: "2026-27",
      amountPence: 5000,
      lineSks: ["line#in_1"],
      stripeAccountId: "acct_r1",
      state: "pending",
    });
    await handler();
    expect(stripeState.transfers).toHaveLength(1);
    expect(stripeState.transfers[0].idempotencyKey).toBe("commission-cash#r1#2026-10");
    expect(lineOf("r1", "in_1").state).toBe("paid");
  });

  test("a Stripe failure for one affiliate leaves its lines payable and the run goes on", async () => {
    approve("broken", { stripeAccountId: "acct_broken" });
    approve("r1");
    addLine("broken", "in_b", 5000);
    addLine("r1", "in_1", 5000);
    stripeState.transfers.push({
      idempotencyKey: "commission-cash#broken#2026-11",
      transfer: { id: "tr_other", amount: 1, currency: "gbp", destination: "acct_elsewhere", transfer_group: null },
    });
    const summary = await handler();
    expect(summary).toMatchObject({ failed: 1, paid: 1 });
    expect(lineOf("broken", "in_b").state).toBe("payable");
    expect(lineOf("r1", "in_1").state).toBe("paid");
  });
});

describe("selectPayout", () => {
  test("nets every negative line and adds positive lines oldest first within the room", () => {
    const lines = [
      { sk: "c", amountPence: 3000, payableAt: "2026-10-03" },
      { sk: "a", amountPence: 4000, payableAt: "2026-10-01" },
      { sk: "r", amountPence: -500, payableAt: "2026-10-05" },
      { sk: "b", amountPence: 5000, payableAt: "2026-10-02" },
    ];
    const { chosen, netPence, left } = selectPayout(lines, { roomPence: 7000 });
    expect(chosen.map((line) => line.sk)).toEqual(["r", "a", "c"]);
    expect(netPence).toBe(6500);
    expect(left.map((line) => line.sk)).toEqual(["b"]);
  });

  test("with no cap every line is chosen", () => {
    const { netPence, left } = selectPayout([{ sk: "a", amountPence: 1 }], { roomPence: Number.POSITIVE_INFINITY });
    expect(netPence).toBe(1);
    expect(left).toEqual([]);
  });
});
