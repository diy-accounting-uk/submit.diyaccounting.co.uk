// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

// One in-memory table behind the four repository modules. Keys are `${pk}|${sk}`, as in the real table.
const db = {
  items: new Map(),
  claims: new Map(),
  redemptions: new Map(),
  affiliates: new Map(),
  family: new Set(),
  subs: new Map(),
  bundles: new Map(),
};

const keyOf = (pk, sk) => `${pk}|${sk}`;
const read = (pk, sk) => {
  const item = db.items.get(keyOf(pk, sk));
  return item ? structuredClone(item) : null;
};
const write = (item) => db.items.set(keyOf(item.pk, item.sk), structuredClone(item));
const itemsInPartition = (pk) => [...db.items.values()].filter((item) => item.pk === pk).map((item) => structuredClone(item));
const heldPointerSk = (line) => `${line.releaseAt}#${line.pk.slice("commission#".length)}#${line.invoiceId}`;

vi.mock("@app/data/dynamoDbCommissionRepository.js", () => ({
  reversalSk: (invoiceId) => `line#${invoiceId}#reversal`,
  getLine: async (referrerHash, invoiceId) => read(`commission#${referrerHash}`, `line#${invoiceId}`),
  getLineByKey: async (pk, sk) => read(pk, sk),
  getAnchor: async (referrerHash, redeemerHash) => read(`commission#${referrerHash}`, `redeemer#${redeemerHash}`),
  getChargePointer: async (chargeId) => read(`charge#${chargeId}`, "line"),
  putAnchorWithConversion: async ({ referrerHash, redeemerHash, anchor, referralCode, day }) => {
    const pk = `commission#${referrerHash}`;
    if (db.items.has(keyOf(pk, `redeemer#${redeemerHash}`))) return false;
    write({ pk, sk: `redeemer#${redeemerHash}`, ...anchor });
    const counter = read(pk, `conversions#${referralCode}#${day}`) ?? { pk, sk: `conversions#${referralCode}#${day}`, conversions: 0 };
    counter.conversions += 1;
    write(counter);
    return true;
  },
  putCardPayer: async (fingerprint, hashedSub, now) => {
    const existing = read(`card#${fingerprint}`, `payer#${hashedSub}`);
    write({ pk: `card#${fingerprint}`, sk: `payer#${hashedSub}`, firstSeenAt: existing?.firstSeenAt ?? now, lastSeenAt: now });
  },
  putLineWithPointers: async (line) => {
    const pk = `commission#${line.referrerHash}`;
    const sk = `line#${line.invoiceId}`;
    if (db.items.has(keyOf(pk, sk))) return false;
    const { referrerHash, ...item } = line;
    write({ pk, sk, ...item });
    write({ pk: `charge#${line.chargeId}`, sk: "line", linePk: pk, lineSk: sk });
    if (line.state === "held") {
      write({ pk: "held", sk: `${line.releaseAt}#${referrerHash}#${line.invoiceId}`, linePk: pk, lineSk: sk });
    }
    return true;
  },
  putReversalLine: async (reversal) => {
    if (db.items.has(keyOf(reversal.pk, reversal.sk))) return false;
    write(reversal);
    return true;
  },
  reverseHeldLine: async (line, { reason, now }) => {
    const current = read(line.pk, line.sk);
    if (current?.state !== "held") return false;
    write({ ...current, state: "reversed", reversedAt: now, reversalReason: reason, updatedAt: now, holdReasons: undefined });
    db.items.delete(keyOf("held", heldPointerSk(line)));
    return true;
  },
  reversePayableLine: async (line, { reason, now }) => {
    const current = read(line.pk, line.sk);
    if (current?.state !== "payable") return false;
    write({ ...current, state: "reversed", reversedAt: now, reversalReason: reason, updatedAt: now });
    return true;
  },
  queryDueHeldPointers: async (nowIso) =>
    itemsInPartition("held")
      .filter((pointer) => pointer.sk <= `${nowIso}~`)
      .sort((a, b) => (a.sk < b.sk ? -1 : 1)),
  deleteHeldPointer: async (sk) => {
    db.items.delete(keyOf("held", sk));
  },
  queryConversions: async (referrerHash, code) =>
    itemsInPartition(`commission#${referrerHash}`).filter((item) => item.sk.startsWith(`conversions#${code}#`)),
  queryCardPayers: async (fingerprint) => itemsInPartition(`card#${fingerprint}`),
  setHoldReasons: async (line, reasons, now) => {
    const current = read(line.pk, line.sk);
    if (current?.state !== "held") return false;
    write({ ...current, holdReasons: reasons, updatedAt: now });
    return true;
  },
  releaseLine: async (line, { now, payableMonth, payableTaxYear, totals }) => {
    const current = read(line.pk, line.sk);
    if (current?.state !== "held") return { released: false, cancelledIndex: 0, totalsIndex: -1 };
    for (const [index, total] of totals.entries()) {
      const counted = read(line.pk, total.sk)?.[total.field] ?? 0;
      if (total.cap !== null && total.cap !== undefined && counted > total.cap - line.amountPence) {
        return { released: false, cancelledIndex: index + 2, totalsIndex: index };
      }
    }
    const { holdReasons, ...rest } = current;
    write({ ...rest, state: "payable", payableAt: now, payableMonth, payableTaxYear, updatedAt: now });
    db.items.delete(keyOf("held", heldPointerSk(line)));
    for (const total of totals) {
      const counted = read(line.pk, total.sk) ?? { pk: line.pk, sk: total.sk };
      counted[total.field] = (counted[total.field] ?? 0) + line.amountPence;
      write(counted);
    }
    return { released: true };
  },
}));

vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getReferralClaim: async (hashedSub) => db.claims.get(hashedSub) ?? null,
  getRedemption: async (code, hashedSub) => db.redemptions.get(`${code}|${hashedSub}`) ?? null,
  getAffiliate: async (referrerHash) => db.affiliates.get(referrerHash) ?? null,
  getFamilyAffiliate: async (referrerHash) => (db.family.has(referrerHash) ? { marker: true } : null),
}));

vi.mock("@app/data/dynamoDbSubscriptionRepository.js", () => ({
  getSubscription: async (pk) => db.subs.get(pk) ?? null,
}));

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getBundlesByHashedSub: async (hashedSub) => db.bundles.get(hashedSub) ?? [],
}));

const { accrueCommission, reverseCommissionForCharge } = await import("@app/services/commissionLedger.js");
const { releaseCommissions } = await import("@app/functions/account/commissionRelease.js");

const REFERRER = "referrer-hash";
const REDEEMER = "redeemer-hash";
const OTHER = "other-hash";
const CODE = "CODE1";
const SUBSCRIPTION = "sub_1";
const CARD = "fp_shared";
const NET_PENCE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_STARTS = [Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1), Date.UTC(2026, 2, 1), Date.UTC(2026, 3, 1), Date.UTC(2026, 4, 1)];
const seconds = (ms) => ms / 1000;
const chargedAtOf = (monthIndex) => MONTH_STARTS[monthIndex] + 3600 * 1000;

const liveBundle = [{ bundleId: "resident", stripeSubscriptionId: "sub_referrer", subscriptionStatus: "active" }];
const lapsedBundle = [{ bundleId: "resident", stripeSubscriptionId: "sub_referrer", subscriptionStatus: "canceled" }];

function invoiceFor(monthIndex, { fingerprint = CARD, tag = "" } = {}) {
  const n = monthIndex + 1;
  return {
    id: `in_${tag}${n}`,
    livemode: true,
    customer: { id: "cus_1", created: seconds(MONTH_STARTS[0]) + 100 },
    charge: {
      id: `ch_${tag}${n}`,
      amount: 1200,
      created: seconds(chargedAtOf(monthIndex)),
      refunded: false,
      amount_refunded: 0,
      disputed: false,
      payment_method_details: { card: { fingerprint } },
      balance_transaction: { net: NET_PENCE, fee: 200, currency: "gbp" },
    },
    lines: {
      data: [{ type: "subscription", period: { start: seconds(MONTH_STARTS[monthIndex]), end: seconds(MONTH_STARTS[monthIndex + 1]) } }],
    },
  };
}

async function accrueMonth(monthIndex, { hashedSub = REDEEMER, fingerprint = CARD, tag = "" } = {}) {
  const invoice = invoiceFor(monthIndex, { fingerprint, tag });
  const stripe = { invoices: { retrieve: vi.fn().mockResolvedValue(invoice) } };
  const subRecord = { hashedSub, actor: "customer" };
  return accrueCommission({
    invoice,
    subscriptionId: SUBSCRIPTION,
    subRecord,
    stripe,
    nowIso: new Date(chargedAtOf(monthIndex)).toISOString(),
  });
}

const lineOf = (monthIndex) => read(`commission#${REFERRER}`, `line#in_${monthIndex + 1}`);

/** The first moment at which every line accrued so far is due. */
function holdEnd(monthIndexes) {
  return new Date(Math.max(...monthIndexes.map((index) => new Date(lineOf(index).releaseAt).getTime())));
}

const JOURNEYS = {
  J1: {
    name: "customer credit",
    arrange: () => {},
    tier: "customer",
    form: "credit",
    holdDays: 30,
    amountPence: 330,
  },
  J2: {
    name: "family",
    arrange: () => db.family.add(REFERRER),
    tier: "family",
    form: "cash",
    holdDays: 60,
    amountPence: 1000,
  },
  J3: {
    name: "affiliate applied, not approved",
    arrange: () => db.affiliates.set(REFERRER, { state: "applied", tier: "casual" }),
    tier: "customer",
    form: "credit",
    holdDays: 30,
    amountPence: 330,
  },
  J4: {
    name: "affiliate approved casual",
    arrange: () => db.affiliates.set(REFERRER, { state: "approved", tier: "casual" }),
    tier: "casual",
    form: "cash",
    holdDays: 120,
    amountPence: 330,
  },
};

beforeEach(() => {
  for (const collection of Object.values(db)) collection.clear();
  db.claims.set(REDEEMER, { code: CODE });
  db.redemptions.set(`${CODE}|${REDEEMER}`, { issuedBy: REFERRER, redeemedAt: "2025-12-01T00:00:00.000Z" });
  db.subs.set(`stripe#${SUBSCRIPTION}`, { status: "active" });
  db.bundles.set(REFERRER, liveBundle);
});

const payable = (amountPence) => ({ state: "payable", amountPence, holdReasons: undefined });
const held = (amountPence, holdReasons) => ({ state: "held", amountPence, holdReasons });
const reversed = (amountPence, reversalReason) => ({ state: "reversed", amountPence, holdReasons: undefined, reversalReason });

const NOT_APPROVED = "affiliate_not_approved";

const EVENTS = {
  E1: {
    name: "first payment, released at the end of the hold",
    run: async () => {
      await accrueMonth(0);
      return { months: [0] };
    },
    expected: {
      J1: [payable(330)],
      J2: [held(1000, [NOT_APPROVED])],
      J3: [payable(330)],
      J4: [payable(330)],
    },
    summary: {
      J1: { evaluated: 1, released: 1, held: 0, stale: 0 },
      J2: { evaluated: 1, released: 0, held: 1, stale: 0 },
      J3: { evaluated: 1, released: 1, held: 0, stale: 0 },
      J4: { evaluated: 1, released: 1, held: 0, stale: 0 },
    },
  },
  E2: {
    name: "refund before the hold ends",
    run: async () => {
      await accrueMonth(0);
      const result = await reverseCommissionForCharge("ch_1", "refund", { nowIso: "2026-01-05T00:00:00.000Z" });
      expect(result).toEqual({ status: "reversed" });
      return { months: [0] };
    },
    expected: {
      J1: [reversed(330, "refund")],
      J2: [reversed(1000, "refund")],
      J3: [reversed(330, "refund")],
      J4: [reversed(330, "refund")],
    },
    summary: "nothing due",
  },
  E3: {
    name: "dispute before the hold ends",
    run: async () => {
      await accrueMonth(0);
      const result = await reverseCommissionForCharge("ch_1", "dispute", { nowIso: "2026-01-05T00:00:00.000Z" });
      expect(result).toEqual({ status: "reversed" });
      return { months: [0] };
    },
    expected: {
      J1: [reversed(330, "dispute")],
      J2: [reversed(1000, "dispute")],
      J3: [reversed(330, "dispute")],
      J4: [reversed(330, "dispute")],
    },
    summary: "nothing due",
  },
  E4: {
    name: "cancel inside 30 days",
    run: async () => {
      await accrueMonth(0);
      db.subs.set(`stripe#${SUBSCRIPTION}`, { status: "canceled", canceledAt: "2026-01-11T00:00:00.000Z" });
      return { months: [0] };
    },
    expected: {
      J1: [held(330, ["early_cancel"])],
      J2: [held(1000, ["early_cancel", NOT_APPROVED])],
      J3: [held(330, ["early_cancel"])],
      J4: [held(330, ["early_cancel"])],
    },
  },
  E5: {
    name: "cancel after 30 days",
    run: async () => {
      await accrueMonth(0);
      db.subs.set(`stripe#${SUBSCRIPTION}`, { status: "canceled", canceledAt: "2026-02-15T00:00:00.000Z" });
      return { months: [0] };
    },
    expected: {
      J1: [payable(330)],
      J2: [held(1000, [NOT_APPROVED])],
      J3: [payable(330)],
      J4: [payable(330)],
    },
  },
  E6: {
    name: "renewals in months 2 and 3, and a month 4 that earns nothing",
    run: async (journeyId) => {
      const statuses = [await accrueMonth(0)];
      if (journeyId === "J3") db.affiliates.set(REFERRER, { state: "approved", tier: "casual" });
      statuses.push(await accrueMonth(1), await accrueMonth(2), await accrueMonth(3));
      const expectedStatuses = {
        J1: ["recorded", "recorded", "recorded", "no-commission"],
        J2: ["recorded", "no-commission", "no-commission", "no-commission"],
        J3: ["recorded", "recorded", "recorded", "no-commission"],
        J4: ["recorded", "recorded", "recorded", "no-commission"],
      };
      expect(statuses.map((result) => result.status)).toEqual(expectedStatuses[journeyId]);
      return { months: [0, 1, 2] };
    },
    expected: {
      J1: [payable(330), payable(330), payable(330)],
      J2: [held(1000, [NOT_APPROVED])],
      J3: [payable(330), payable(330), payable(330)],
      J4: [payable(330), payable(330), payable(330)],
    },
  },
  E7: {
    name: "the referrer's own subscription lapses",
    run: async () => {
      await accrueMonth(0);
      db.bundles.set(REFERRER, lapsedBundle);
      return { months: [0] };
    },
    expected: {
      J1: [held(330, ["no_subscription"])],
      J2: [held(1000, [NOT_APPROVED])],
      J3: [held(330, ["no_subscription"])],
      J4: [payable(330)],
    },
  },
  E8a: {
    name: "one card on two accounts",
    run: async () => {
      await accrueMonth(0);
      expect(await accrueMonth(0, { hashedSub: OTHER, tag: "other-" })).toEqual({ status: "not-referred" });
      return { months: [0] };
    },
    expected: {
      J1: [held(330, ["card_shared"])],
      J2: [held(1000, ["card_shared", NOT_APPROVED])],
      J3: [held(330, ["card_shared"])],
      J4: [held(330, ["card_shared"])],
    },
  },
  E8b: {
    name: "the referrer's own account pays with the same card",
    run: async () => {
      await accrueMonth(0);
      expect(await accrueMonth(0, { hashedSub: REFERRER, tag: "referrer-" })).toEqual({ status: "not-referred" });
      return { months: [0] };
    },
    expected: {
      J1: [held(330, ["card_referrer", "card_shared"])],
      J2: [held(1000, ["card_referrer", "card_shared", NOT_APPROVED])],
      J3: [held(330, ["card_referrer", "card_shared"])],
      J4: [held(330, ["card_referrer", "card_shared"])],
    },
  },
};

const cases = Object.entries(EVENTS).flatMap(([eventId, event]) =>
  Object.entries(JOURNEYS).map(([journeyId, journey]) => [`${journeyId} ${journey.name} x ${eventId} ${event.name}`, journeyId, eventId]),
);

describe("commission journeys against events", () => {
  test.each(cases)("%s", async (_title, journeyId, eventId) => {
    const journey = JOURNEYS[journeyId];
    const event = EVENTS[eventId];
    journey.arrange();

    const { months } = await event.run(journeyId);

    const expectedLines = event.expected[journeyId];
    const accruedMonths = months.slice(0, expectedLines.length);

    for (const index of accruedMonths) {
      const accrued = lineOf(index);
      expect(accrued.tier).toBe(journey.tier);
      expect(accrued.form).toBe(journey.form);
      expect(accrued.releaseAt).toBe(new Date(chargedAtOf(index) + journey.holdDays * DAY_MS).toISOString());
    }

    const summary = await releaseCommissions(holdEnd(accruedMonths));

    if (event.summary === "nothing due") {
      expect(summary).toEqual({ evaluated: 0, released: 0, held: 0, stale: 0 });
    } else if (event.summary) {
      expect(summary).toEqual(event.summary[journeyId]);
    }

    const lines = accruedMonths.map((index) => lineOf(index));
    expect(
      lines.map((line) => ({
        state: line.state,
        amountPence: line.amountPence,
        holdReasons: line.holdReasons,
        reversalReason: line.reversalReason,
      })),
    ).toEqual(expectedLines.map((line) => ({ reversalReason: undefined, ...line })));
  });
});

describe("commission journeys: further rules", () => {
  test.each(Object.entries(JOURNEYS))("%s accrues a held line with no hold reasons", async (_id, journey) => {
    journey.arrange();
    expect(await accrueMonth(0)).toEqual({ status: "recorded" });
    expect(lineOf(0)).toMatchObject({ state: "held", holdReasons: [], amountPence: journey.amountPence, tier: journey.tier });
  });

  test("a line is not released before its hold ends", async () => {
    JOURNEYS.J1.arrange();
    await accrueMonth(0);
    const justBefore = new Date(new Date(lineOf(0).releaseAt).getTime() - 1);
    expect(await releaseCommissions(justBefore)).toEqual({ evaluated: 0, released: 0, held: 0, stale: 0 });
    expect(lineOf(0).state).toBe("held");
  });

  test("an approved family referrer's line is payable and counts in the tax-year total only", async () => {
    JOURNEYS.J2.arrange();
    db.affiliates.set(REFERRER, { state: "approved", tier: "casual" });
    await accrueMonth(0);
    const summary = await releaseCommissions(holdEnd([0]));
    expect(summary).toEqual({ evaluated: 1, released: 1, held: 0, stale: 0 });
    expect(lineOf(0)).toMatchObject({ state: "payable", amountPence: 1000, tier: "family", payableTaxYear: "2025-26" });
    expect(read(`commission#${REFERRER}`, "totals#taxyear#2025-26")).toMatchObject({ cashPence: 1000 });
    expect(read(`commission#${REFERRER}`, "totals#month#2026-03")).toBeNull();
  });

  test("approval after the first invoice leaves the tier at customer", async () => {
    JOURNEYS.J3.arrange();
    await accrueMonth(0);
    db.affiliates.set(REFERRER, { state: "approved", tier: "casual" });
    await accrueMonth(1);
    expect(lineOf(0).tier).toBe("customer");
    expect(lineOf(1).tier).toBe("customer");
  });

  test("a refund after release reverses the payable line", async () => {
    JOURNEYS.J1.arrange();
    await accrueMonth(0);
    await releaseCommissions(holdEnd([0]));
    expect(lineOf(0).state).toBe("payable");
    expect(await reverseCommissionForCharge("ch_1", "refund", { nowIso: "2026-02-02T00:00:00.000Z" })).toEqual({ status: "reversed" });
    expect(lineOf(0)).toMatchObject({ state: "reversed", reversalReason: "refund", amountPence: 330 });
  });
});
