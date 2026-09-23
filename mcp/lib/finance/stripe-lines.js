// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// stripe-lines.js -- staged Stripe balance transactions and payouts turned
// into validated diya-gl lines. A charge's gross amount and its Stripe fee
// are never netted: the gross posts to sales, the fee posts to purchases,
// so the P&L carries income and cost separately rather than the net that
// actually reaches the bank. A refund or a dispute reverses the sales side
// as a credit note. A payout posts to bank, dated to when it lands
// (arrival_date), for the caller to match against the NatWest statement's
// own BAC line for that date -- the same account bankLinesFromCsv books to.

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

function isoDateFromUnixSeconds(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function toPounds(minorUnits) {
  return Math.round(minorUnits) / 100;
}

function compact(line) {
  return Object.fromEntries(Object.entries(line).filter(([, value]) => value !== undefined));
}

function chargeGrossLine(txn, { salesAccountMainID, taxCode }) {
  const source = txn.source || {};
  return compact({
    entryNumber: `STRIPE-${txn.id}`,
    sourceJournalID: "sales",
    postingDate: isoDateFromUnixSeconds(txn.created),
    accountMainID: salesAccountMainID,
    amount: toPounds(txn.amount),
    amountCurrency: txn.currency.toUpperCase(),
    documentType: "receipt",
    documentReference: source.id,
    detailComment: source.billing_details?.name || "Stripe charge",
    paymentMethod: "online-payment",
    taxCode: taxCode,
  });
}

function chargeFeeLine(txn, { feeAccountMainID, taxCode }) {
  return compact({
    entryNumber: `STRIPE-${txn.id}-FEE`,
    sourceJournalID: "purchases",
    postingDate: isoDateFromUnixSeconds(txn.created),
    accountMainID: feeAccountMainID,
    amount: toPounds(txn.fee),
    amountCurrency: txn.currency.toUpperCase(),
    documentType: "receipt",
    documentReference: txn.id,
    detailComment: "Stripe processing fee",
    paymentMethod: "online-payment",
    taxCode: taxCode,
  });
}

// Stripe's own subscription/usage fees (e.g. Billing) arrive as their own
// balance transaction, with no charge behind them to attach a fee to.
function standaloneFeeLine(txn, { feeAccountMainID, taxCode }) {
  return compact({
    entryNumber: `STRIPE-${txn.id}`,
    sourceJournalID: "purchases",
    postingDate: isoDateFromUnixSeconds(txn.created),
    accountMainID: feeAccountMainID,
    amount: toPounds(Math.abs(txn.amount)),
    amountCurrency: txn.currency.toUpperCase(),
    documentType: "receipt",
    documentReference: txn.id,
    detailComment: txn.description || "Stripe fee",
    paymentMethod: "online-payment",
    taxCode: taxCode,
  });
}

function reversalLine(txn, { salesAccountMainID, taxCode }) {
  const source = txn.source || {};
  return compact({
    entryNumber: `STRIPE-${txn.id}`,
    sourceJournalID: "sales",
    postingDate: isoDateFromUnixSeconds(txn.created),
    accountMainID: salesAccountMainID,
    amount: toPounds(Math.abs(txn.amount)),
    amountCurrency: txn.currency.toUpperCase(),
    documentType: "credit-note",
    documentReference: source.charge || source.id,
    detailComment: txn.reporting_category === "dispute" ? "Stripe dispute" : "Stripe refund",
    paymentMethod: "online-payment",
    taxCode: taxCode,
  });
}

/**
 * Parses staged Stripe balance transactions into validated diya-gl lines: a
 * charge becomes a sales receipt for its gross amount plus a purchases
 * receipt for its fee, a refund or dispute becomes a sales credit note, and
 * a standalone fee (no charge behind it, e.g. a Billing usage fee) becomes
 * a purchases receipt on its own. A payout's own balance transaction is
 * skipped here -- it is staged separately and turned into a bank line by
 * stripePayoutLines -- so posting it here as well would double it.
 * @param {Array<Object>} transactions - raw Stripe balance_transaction objects
 * @param {{salesAccountMainID: string, feeAccountMainID: string, taxCode?: string}} options
 * @returns {Array<Object>} validated diya-gl lines
 */
export function stripeLinesFromTransactions(transactions, { salesAccountMainID, feeAccountMainID, taxCode } = {}) {
  if (!salesAccountMainID) {
    throw new Error("salesAccountMainID is required");
  }
  if (!feeAccountMainID) {
    throw new Error("feeAccountMainID is required");
  }

  const lines = [];
  for (const txn of transactions) {
    switch (txn.reporting_category) {
      case "charge":
        lines.push(chargeGrossLine(txn, { salesAccountMainID, taxCode }));
        if (txn.fee > 0) {
          lines.push(chargeFeeLine(txn, { feeAccountMainID, taxCode }));
        }
        break;
      case "fee":
        lines.push(standaloneFeeLine(txn, { feeAccountMainID, taxCode }));
        break;
      case "refund":
      case "dispute":
        lines.push(reversalLine(txn, { salesAccountMainID, taxCode }));
        break;
      case "payout":
        break;
      default:
        throw new Error(`Unrecognised Stripe balance transaction reporting_category "${txn.reporting_category}"`);
    }
  }

  const book = { accounts: { sales: { [salesAccountMainID]: {} }, purchases: { [feeAccountMainID]: {} } } };
  const { valid, errors } = validateLines(lines, book);
  if (!valid) {
    throw new Error(`Stripe transaction lines failed validation:\n${errors.join("\n")}`);
  }
  return lines;
}

/**
 * Parses staged Stripe payouts into validated diya-gl bank lines, one per
 * payout, dated to arrival_date -- the day the money lands in the bank
 * account, the same day the NatWest statement carries its BAC credit line
 * for the same amount.
 * @param {Array<Object>} payouts - raw Stripe payout objects
 * @param {{accountMainID: string}} options - the book.toml bank account the payout lands in
 * @returns {Array<Object>} validated diya-gl lines
 */
export function stripePayoutLines(payouts, { accountMainID } = {}) {
  if (!accountMainID) {
    throw new Error("accountMainID is required");
  }

  const lines = payouts.map((payout) => ({
    "entryNumber": `STRIPE-PAYOUT-${payout.id}`,
    "sourceJournalID": "bank",
    "postingDate": isoDateFromUnixSeconds(payout.arrival_date),
    accountMainID,
    "amount": toPounds(payout.amount),
    "amountCurrency": payout.currency.toUpperCase(),
    "documentType": "bank-statement",
    "documentReference": payout.id,
    "detailComment": payout.description || "Stripe payout",
    "paymentMethod": "bank-transfer",
    "diya-gl:bankCode": "DR",
    "diya-gl:bankAccountID": accountMainID,
  }));

  const book = { accounts: { bank: { [accountMainID]: {} } } };
  const { valid, errors } = validateLines(lines, book);
  if (!valid) {
    throw new Error(`Stripe payout lines failed validation:\n${errors.join("\n")}`);
  }
  return lines;
}

/**
 * Reconciles a staged month's Stripe activity: gross charges minus fees
 * (a charge's own processing fee plus every standalone fee) minus refunds
 * and disputes must equal that month's payouts plus the balance change --
 * the sum of every transaction's own net movement, which Stripe computes
 * independently of how this module buckets transactions into charges, fees
 * and refunds. The two sides matching to the penny confirms the bucketing
 * above covers every reporting_category the staged file actually carries;
 * an unrecognised one throws before either side is computed.
 * @param {{transactions: Array<Object>, payouts: Array<Object>}} month
 * @returns {{charges: number, fees: number, refunds: number, payouts: number, balanceChange: number, reconciled: boolean}}
 */
export function reconcileStripeMonth({ transactions, payouts }) {
  let chargesMinor = 0;
  let feesMinor = 0;
  let refundsMinor = 0;
  let netMinor = 0;

  for (const txn of transactions) {
    netMinor += txn.net;
    switch (txn.reporting_category) {
      case "charge":
        chargesMinor += txn.amount;
        feesMinor += txn.fee;
        break;
      case "fee":
        feesMinor += Math.abs(txn.amount);
        break;
      case "refund":
      case "dispute":
        refundsMinor += Math.abs(txn.amount);
        break;
      case "payout":
        break;
      default:
        throw new Error(`Unrecognised Stripe balance transaction reporting_category "${txn.reporting_category}"`);
    }
  }

  const payoutsMinor = payouts.reduce((sum, payout) => sum + payout.amount, 0);
  const reconciled = chargesMinor - feesMinor - refundsMinor === payoutsMinor + netMinor;

  return {
    charges: toPounds(chargesMinor),
    fees: toPounds(feesMinor),
    refunds: toPounds(refundsMinor),
    payouts: toPounds(payoutsMinor),
    balanceChange: toPounds(netMinor),
    reconciled,
  };
}
