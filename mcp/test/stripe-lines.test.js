// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// stripe-lines.test.js -- stripeLinesFromTransactions, stripePayoutLines and
// reconcileStripeMonth over a small hand-written sample shaped like one
// staged Stripe month: a charge with a processing fee, a refund against an
// earlier charge, and the payout that swept both. Amounts are rounded and
// every id is invented; no name or email is recorded.

import { describe, expect, it } from "vitest";

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

import { reconcileStripeMonth, stripeLinesFromTransactions, stripePayoutLines } from "../lib/finance/stripe-lines.js";

const CHARGE = {
  id: "txn_test_charge_1",
  reporting_category: "charge",
  amount: 2000,
  fee: 50,
  net: 1950,
  currency: "gbp",
  created: 1773100800, // 2026-03-10
  source: { id: "ch_test_1", object: "charge" },
};

const REFUND = {
  id: "txn_test_refund_1",
  reporting_category: "refund",
  amount: -500,
  fee: 0,
  net: -500,
  currency: "gbp",
  created: 1773273600, // 2026-03-12
  source: { id: "re_test_1", object: "refund", charge: "ch_test_0" },
};

const PAYOUT_TRANSACTION = {
  id: "txn_test_payout_1",
  reporting_category: "payout",
  amount: -1450,
  fee: 0,
  net: -1450,
  currency: "gbp",
  created: 1773532800, // 2026-03-15
  source: { id: "po_test_1", object: "payout" },
};

const PAYOUT = {
  id: "po_test_1",
  amount: 1450,
  currency: "gbp",
  arrival_date: 1773532800, // 2026-03-15
  description: "STRIPE PAYOUT",
};

const MONTH_TRANSACTIONS = [CHARGE, REFUND, PAYOUT_TRANSACTION];
const MONTH_PAYOUTS = [PAYOUT];

const SALES_ACCOUNT = "4000";
const FEE_ACCOUNT = "7901";
const BANK_ACCOUNT = "1200";

describe("stripeLinesFromTransactions", () => {
  it("emits a sales receipt for the gross amount and a purchases receipt for the fee, from one charge", () => {
    const { lines } = stripeLinesFromTransactions([CHARGE], { salesAccountMainID: SALES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      sourceJournalID: "sales",
      documentType: "receipt",
      postingDate: "2026-03-10",
      accountMainID: SALES_ACCOUNT,
      amount: 20,
      amountCurrency: "GBP",
      documentReference: "ch_test_1",
    });
    expect(lines[1]).toMatchObject({
      sourceJournalID: "purchases",
      documentType: "receipt",
      postingDate: "2026-03-10",
      accountMainID: FEE_ACCOUNT,
      amount: 0.5,
      documentReference: "txn_test_charge_1",
      detailComment: "Stripe processing fee",
    });
  });

  it("emits a sales credit note for a refund", () => {
    const { lines } = stripeLinesFromTransactions([REFUND], { salesAccountMainID: SALES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      sourceJournalID: "sales",
      documentType: "credit-note",
      postingDate: "2026-03-12",
      accountMainID: SALES_ACCOUNT,
      amount: 5,
      documentReference: "ch_test_0",
      detailComment: "Stripe refund",
    });
  });

  it("skips a payout's own balance transaction, leaving it to stripePayoutLines", () => {
    const { lines } = stripeLinesFromTransactions(MONTH_TRANSACTIONS, { salesAccountMainID: SALES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT });

    expect(lines).toHaveLength(3);
    expect(lines.some((line) => line.documentReference === "po_test_1")).toBe(false);
  });

  it("requires salesAccountMainID", () => {
    expect(() => stripeLinesFromTransactions([CHARGE], { feeAccountMainID: FEE_ACCOUNT })).toThrow(/salesAccountMainID is required/);
  });

  it("requires feeAccountMainID", () => {
    expect(() => stripeLinesFromTransactions([CHARGE], { salesAccountMainID: SALES_ACCOUNT })).toThrow(/feeAccountMainID is required/);
  });

  it("rejects a reporting_category it does not recognise", () => {
    const unrecognised = { ...CHARGE, reporting_category: "adjustment" };
    expect(() => stripeLinesFromTransactions([unrecognised], { salesAccountMainID: SALES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT })).toThrow(
      /Unrecognised Stripe balance transaction reporting_category "adjustment"/,
    );
  });

  it("emits lines that validate against the diya-gl lines schema", () => {
    const { lines } = stripeLinesFromTransactions(MONTH_TRANSACTIONS, { salesAccountMainID: SALES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT });
    const book = { accounts: { sales: { [SALES_ACCOUNT]: {} }, purchases: { [FEE_ACCOUNT]: {} } } };
    const result = validateLines(lines, book);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("stripeLinesFromTransactions with labels", () => {
  const LABELS = {
    rule: [{ pattern: "Widget Donations", sourceJournalID: "sales", accountMainID: "4002", taxCode: "OS" }],
  };

  it("sets a matched charge's account, sourceJournalID and taxCode from the rule, in place of salesAccountMainID", () => {
    const charge = {
      ...CHARGE,
      id: "txn_lbl_1",
      source: { id: "ch_lbl_1", object: "charge", billing_details: { name: "Widget Donations Ltd" } },
    };

    const { lines } = stripeLinesFromTransactions([charge], {
      salesAccountMainID: SALES_ACCOUNT,
      feeAccountMainID: FEE_ACCOUNT,
      labels: LABELS,
    });

    const gross = lines.find((line) => line.documentReference === "ch_lbl_1");
    expect(gross).toMatchObject({ sourceJournalID: "sales", accountMainID: "4002", taxCode: "OS" });
  });

  it("never redirects the fee line, whatever the charge's own rule", () => {
    const charge = {
      ...CHARGE,
      id: "txn_lbl_2",
      source: { id: "ch_lbl_2", object: "charge", billing_details: { name: "Widget Donations Ltd" } },
    };

    const { lines } = stripeLinesFromTransactions([charge], {
      salesAccountMainID: SALES_ACCOUNT,
      feeAccountMainID: FEE_ACCOUNT,
      labels: LABELS,
    });

    const fee = lines.find((line) => line.entryNumber === "STRIPE-txn_lbl_2-FEE");
    expect(fee).toMatchObject({ sourceJournalID: "purchases", accountMainID: FEE_ACCOUNT });
  });

  it("leaves an unmatched charge posting to the default sales account, and lists it in unlabelled", () => {
    const charge = { ...CHARGE, id: "txn_lbl_3", source: { id: "ch_lbl_3", object: "charge", billing_details: { name: "A N Other" } } };

    const { lines, unlabelled } = stripeLinesFromTransactions([charge], {
      salesAccountMainID: SALES_ACCOUNT,
      feeAccountMainID: FEE_ACCOUNT,
      labels: LABELS,
    });

    const gross = lines.find((line) => line.documentReference === "ch_lbl_3");
    expect(gross).toMatchObject({ sourceJournalID: "sales", accountMainID: SALES_ACCOUNT });
    expect(unlabelled).toHaveLength(1);
    expect(unlabelled[0].id).toBe("txn_lbl_3");
  });

  it("behaves exactly as today when no labels are given", () => {
    const { lines, unlabelled } = stripeLinesFromTransactions([CHARGE], {
      salesAccountMainID: SALES_ACCOUNT,
      feeAccountMainID: FEE_ACCOUNT,
    });

    const gross = lines.find((line) => line.documentReference === "ch_test_1");
    expect(gross).toMatchObject({ sourceJournalID: "sales", accountMainID: SALES_ACCOUNT });
    expect(gross.taxCode).toBeUndefined();
    expect(unlabelled).toEqual([]);
  });
});

describe("stripePayoutLines", () => {
  it("emits one bank line per payout, dated to arrival_date", () => {
    const lines = stripePayoutLines(MONTH_PAYOUTS, { accountMainID: BANK_ACCOUNT });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      "sourceJournalID": "bank",
      "documentType": "bank-statement",
      "postingDate": "2026-03-15",
      "accountMainID": BANK_ACCOUNT,
      "amount": 14.5,
      "amountCurrency": "GBP",
      "documentReference": "po_test_1",
      "diya-gl:bankCode": "DR",
      "diya-gl:bankAccountID": BANK_ACCOUNT,
    });
  });

  it("requires accountMainID", () => {
    expect(() => stripePayoutLines(MONTH_PAYOUTS, {})).toThrow(/accountMainID is required/);
  });

  it("emits lines that validate against the diya-gl lines schema", () => {
    const lines = stripePayoutLines(MONTH_PAYOUTS, { accountMainID: BANK_ACCOUNT });
    const book = { accounts: { bank: { [BANK_ACCOUNT]: {} } } };
    const result = validateLines(lines, book);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("reconcileStripeMonth", () => {
  it("reconciles a month's charge, fee, refund and payout to the penny", () => {
    const result = reconcileStripeMonth({ transactions: MONTH_TRANSACTIONS, payouts: MONTH_PAYOUTS });

    expect(result).toEqual({
      charges: 20,
      fees: 0.5,
      refunds: 5,
      payouts: 14.5,
      balanceChange: 0,
      reconciled: true,
    });
  });

  it("stops reconciling once a payout is left out", () => {
    const result = reconcileStripeMonth({ transactions: MONTH_TRANSACTIONS, payouts: [] });
    expect(result.reconciled).toBe(false);
  });

  it("rejects a reporting_category it does not recognise", () => {
    const unrecognised = { ...CHARGE, reporting_category: "adjustment" };
    expect(() => reconcileStripeMonth({ transactions: [unrecognised], payouts: [] })).toThrow(
      /Unrecognised Stripe balance transaction reporting_category "adjustment"/,
    );
  });
});
