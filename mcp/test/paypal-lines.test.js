// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// paypal-lines.test.js -- paypalLinesFromTransactions over a small
// hand-written page shaped like one staged PayPal Transaction Search API
// response (scripts/finance/paypal-stage.js): a donation receipt with its
// fee, a pre-approved billing agreement's own payment, a currency
// conversion, a bank deposit and a withdrawal, a hold and its release, a
// debit card cashback bonus, and the T2101/T9900 pair this account's own
// usage carries -- a hold-sized debit that is never released, credited back
// under an ambiguous "Other" that turns out to reference an ordinary
// purchase rather than that hold. Amounts are rounded and every id, name
// and merchant is invented.

import { describe, expect, it } from "vitest";

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

import { paypalLinesFromTransactions } from "../lib/finance/paypal-lines.js";

function record(overrides) {
  return {
    transaction_info: {
      transaction_id: "TXN-DEFAULT",
      transaction_event_code: "T0013",
      transaction_initiation_date: "2026-06-10T09:00:00Z",
      transaction_amount: { currency_code: "GBP", value: "10.00" },
      transaction_status: "S",
      ...overrides,
    },
  };
}

const DONATION = record({
  transaction_id: "TXN-DONATION-1",
  transaction_event_code: "T0013",
  transaction_amount: { currency_code: "GBP", value: "10.61" },
  fee_amount: { currency_code: "GBP", value: "-0.61" },
});
DONATION.payer_info = { payer_name: { alternate_full_name: "Test Donor" } };

const BILL_PAYMENT = record({
  transaction_id: "TXN-BILL-1",
  transaction_event_code: "T0003",
  transaction_initiation_date: "2026-06-01T08:00:00Z",
  transaction_amount: { currency_code: "GBP", value: "-25.00" },
});
BILL_PAYMENT.payer_info = { payer_name: { alternate_full_name: "Test Cloud Vendor" } };

const CURRENCY_CONVERSION = record({
  transaction_id: "TXN-CONV-1",
  transaction_event_code: "T0200",
  transaction_amount: { currency_code: "GBP", value: "-5.00" },
});

const BANK_DEPOSIT = record({
  transaction_id: "TXN-DEPOSIT-1",
  transaction_event_code: "T0300",
  transaction_amount: { currency_code: "GBP", value: "100.00" },
});

const WITHDRAWAL = record({
  transaction_id: "TXN-WITHDRAWAL-1",
  transaction_event_code: "T0400",
  transaction_amount: { currency_code: "GBP", value: "-50.00" },
});

const HOLD = record({
  transaction_id: "TXN-HOLD-1",
  transaction_event_code: "T1501",
  transaction_status: "P",
  transaction_amount: { currency_code: "GBP", value: "-30.00" },
});

const HOLD_RELEASE = record({
  transaction_id: "TXN-RELEASE-1",
  transaction_event_code: "T1105",
  paypal_reference_id: "TXN-HOLD-1",
  transaction_amount: { currency_code: "GBP", value: "30.00" },
});

const CASHBACK = record({
  transaction_id: "TXN-CASHBACK-1",
  transaction_event_code: "T0801",
  transaction_amount: { currency_code: "GBP", value: "0.42" },
});

// T2101/T9900: a hold-sized debit this account's own usage never releases
// (excluded as a hold, like TXN-HOLD-1 above), credited back later under an
// ambiguous "Other" that references an ordinary purchase rather than the
// hold -- see paypal-lines.js's own module comment.
const HOLD_LIKE_DEBIT = record({
  transaction_id: "TXN-HOLDLIKE-1",
  transaction_event_code: "T2101",
  transaction_amount: { currency_code: "GBP", value: "-12.34" },
});

const ORDINARY_PURCHASE = record({
  transaction_id: "TXN-PURCHASE-1",
  transaction_event_code: "T0500",
  transaction_amount: { currency_code: "GBP", value: "-88.00" },
  transaction_subject: "Test Supplies Co",
});

const AMBIGUOUS_OTHER = record({
  transaction_id: "TXN-OTHER-1",
  transaction_event_code: "T9900",
  paypal_reference_id: "TXN-PURCHASE-1",
  transaction_amount: { currency_code: "GBP", value: "12.34" },
});

const PENDING = record({
  transaction_id: "TXN-PENDING-1",
  transaction_event_code: "T0013",
  transaction_status: "P",
  transaction_amount: { currency_code: "GBP", value: "15.00" },
});

const ALL_RECORDS = [
  DONATION,
  BILL_PAYMENT,
  CURRENCY_CONVERSION,
  BANK_DEPOSIT,
  WITHDRAWAL,
  HOLD,
  HOLD_RELEASE,
  CASHBACK,
  HOLD_LIKE_DEBIT,
  ORDINARY_PURCHASE,
  AMBIGUOUS_OTHER,
  PENDING,
];

const SALES_ACCOUNT = "4000";
const PURCHASES_ACCOUNT = "5301";
const FEE_ACCOUNT = "7901";
const OPTIONS = { salesAccountMainID: SALES_ACCOUNT, purchasesAccountMainID: PURCHASES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT };

describe("paypalLinesFromTransactions", () => {
  it("emits a sales receipt for the gross amount and a purchases receipt for the fee, from a settled receipt", () => {
    const { lines } = paypalLinesFromTransactions([DONATION], OPTIONS);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      entryNumber: "PAYPAL-TXN-DONATION-1",
      sourceJournalID: "sales",
      documentType: "receipt",
      postingDate: "2026-06-10",
      accountMainID: SALES_ACCOUNT,
      amount: 10.61,
      amountCurrency: "GBP",
      documentReference: "TXN-DONATION-1",
      detailComment: "Test Donor",
    });
    expect(lines[1]).toMatchObject({
      entryNumber: "PAYPAL-TXN-DONATION-1-FEE",
      sourceJournalID: "purchases",
      documentType: "receipt",
      accountMainID: FEE_ACCOUNT,
      amount: 0.61,
      detailComment: "PayPal transaction fee",
    });
  });

  it("emits a purchases invoice for a settled bill payment's negative gross", () => {
    const { lines } = paypalLinesFromTransactions([BILL_PAYMENT], OPTIONS);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      sourceJournalID: "purchases",
      documentType: "invoice",
      postingDate: "2026-06-01",
      accountMainID: PURCHASES_ACCOUNT,
      amount: 25,
      documentReference: "TXN-BILL-1",
      detailComment: "Test Cloud Vendor",
    });
  });

  it("excludes a currency conversion", () => {
    expect(paypalLinesFromTransactions([CURRENCY_CONVERSION], OPTIONS).lines).toEqual([]);
  });

  it("excludes a bank deposit to the PayPal account", () => {
    expect(paypalLinesFromTransactions([BANK_DEPOSIT], OPTIONS).lines).toEqual([]);
  });

  it("excludes a withdrawal to the linked bank account", () => {
    expect(paypalLinesFromTransactions([WITHDRAWAL], OPTIONS).lines).toEqual([]);
  });

  it("excludes a hold placement and its own settled release", () => {
    expect(paypalLinesFromTransactions([HOLD, HOLD_RELEASE], OPTIONS).lines).toEqual([]);
  });

  it("excludes a still-pending record", () => {
    expect(paypalLinesFromTransactions([PENDING], OPTIONS).lines).toEqual([]);
  });

  it("posts a debit card cashback bonus as a purchases credit note", () => {
    const { lines } = paypalLinesFromTransactions([CASHBACK], OPTIONS);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      sourceJournalID: "purchases",
      documentType: "credit-note",
      accountMainID: PURCHASES_ACCOUNT,
      amount: 0.42,
      detailComment: "Debit Card Cashback Bonus",
    });
  });

  it("excludes a hold-sized debit and posts its later 'Other' credit as a purchases credit note when the 'Other' references an ordinary purchase, not that debit", () => {
    const { lines } = paypalLinesFromTransactions([HOLD_LIKE_DEBIT, ORDINARY_PURCHASE, AMBIGUOUS_OTHER], OPTIONS);

    expect(lines.some((line) => line.documentReference === "TXN-HOLDLIKE-1")).toBe(false);
    const purchaseLine = lines.find((line) => line.documentReference === "TXN-PURCHASE-1");
    expect(purchaseLine).toMatchObject({ sourceJournalID: "purchases", documentType: "invoice", amount: 88 });
    const otherLine = lines.find((line) => line.documentReference === "TXN-OTHER-1");
    expect(otherLine).toMatchObject({
      sourceJournalID: "purchases",
      documentType: "credit-note",
      amount: 12.34,
      detailComment: "Other: Test Supplies Co",
    });
  });

  it("requires salesAccountMainID", () => {
    expect(() =>
      paypalLinesFromTransactions([DONATION], { purchasesAccountMainID: PURCHASES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT }),
    ).toThrow(/salesAccountMainID is required/);
  });

  it("requires purchasesAccountMainID", () => {
    expect(() => paypalLinesFromTransactions([DONATION], { salesAccountMainID: SALES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT })).toThrow(
      /purchasesAccountMainID is required/,
    );
  });

  it("requires feeAccountMainID", () => {
    expect(() =>
      paypalLinesFromTransactions([DONATION], { salesAccountMainID: SALES_ACCOUNT, purchasesAccountMainID: PURCHASES_ACCOUNT }),
    ).toThrow(/feeAccountMainID is required/);
  });

  it("emits lines that validate against the diya-gl lines schema", () => {
    const { lines } = paypalLinesFromTransactions(ALL_RECORDS, OPTIONS);
    const book = {
      accounts: {
        sales: { [SALES_ACCOUNT]: {} },
        purchases: { [PURCHASES_ACCOUNT]: {}, [FEE_ACCOUNT]: {} },
      },
    };
    const result = validateLines(lines, book);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("paypalLinesFromTransactions with labels", () => {
  const LABELS = {
    rule: [
      { pattern: "Test Donor", sourceJournalID: "sales", accountMainID: "4002", taxCode: "OS" },
      { pattern: "Test Cloud Vendor", sourceJournalID: "purchases", accountMainID: "5302" },
    ],
  };

  it("sets a matched receipt's gross line account, sourceJournalID and taxCode from the rule, and leaves its fee line alone", () => {
    const { lines, unlabelled } = paypalLinesFromTransactions([DONATION], { ...OPTIONS, labels: LABELS });

    expect(lines[0]).toMatchObject({ sourceJournalID: "sales", accountMainID: "4002", taxCode: "OS" });
    expect(lines[1]).toMatchObject({ sourceJournalID: "purchases", accountMainID: FEE_ACCOUNT });
    expect(unlabelled).toEqual([]);
  });

  it("sets a matched bill's gross line account from the rule", () => {
    const { lines } = paypalLinesFromTransactions([BILL_PAYMENT], { ...OPTIONS, labels: LABELS });

    expect(lines[0]).toMatchObject({ sourceJournalID: "purchases", accountMainID: "5302" });
  });

  it("leaves an unmatched receipt on the default sales account and lists it in unlabelled", () => {
    const { lines, unlabelled } = paypalLinesFromTransactions([DONATION], {
      ...OPTIONS,
      labels: { rule: [{ pattern: "Nobody Here", sourceJournalID: "sales", accountMainID: "4002" }] },
    });

    expect(lines[0]).toMatchObject({ sourceJournalID: "sales", accountMainID: SALES_ACCOUNT });
    expect(unlabelled.map((adapted) => adapted.id)).toEqual(["TXN-DONATION-1"]);
  });

  it("returns an empty unlabelled list when no labels are given", () => {
    const { unlabelled } = paypalLinesFromTransactions(ALL_RECORDS, OPTIONS);

    expect(unlabelled).toEqual([]);
  });
});
