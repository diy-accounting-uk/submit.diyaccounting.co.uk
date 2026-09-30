// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// paypal-lines.js -- staged PayPal Transaction Search API records (see
// scripts/finance/paypal-stage.js) turned into validated diya-gl lines. This
// is the API route: it reads scripts/finance/paypal-stage.js's own staged
// JSON rather than pdftotext-ing the monthly "Transaction History" PDF (that
// route is paypal-statement-lines.js and stays separate -- this module does
// not replace it). Where the API record shape carries the same fact the
// statement text carries, this module reuses paypal-statement-lines.js's own
// exported classifiers (isCurrencyConversionOrTransfer, isHoldCandidate,
// isReleaseCandidate) against an adapted record, rather than a second,
// driftable copy of the same rule.
//
// A settled receipt posts gross to sales and its fee, if any, to purchases,
// never netted -- the same split stripe-lines.js and paypal-statement-lines.js
// use. A settled bill or card payment posts its full gross to purchases.
// Everything else on a Transaction Search page is scaffolding around those
// two events, not a transaction of its own, and is left unposted:
//   - anything not marked "S" (Successful/Settled) -- a pending hold,
//     authorisation or transfer still in flight, never a real movement yet
//   - a currency conversion (T0200) or a transfer to/from the linked bank
//     account (T0300 bank deposit, T0400/T0403 withdrawal) -- the bank
//     statement already carries this as its own BAC/D-D line; posting it
//     here too would double it
//   - a hold placement (T1501, T2101 in this account's own usage -- see
//     below) -- it reserves balance without moving it, never a sale or
//     purchase of its own
//   - the settled row that releases one again (T1105), matched to its own
//     hold placement via paypal_reference_id -- the Transaction Search API
//     carries this link directly, so this route does not need
//     paypal-statement-lines.js's chooseReleaseRows (built for the
//     statement PDF's free text, which carries no such id)
//
// T2101/T9900: this account's own usage debits a hold-sized amount under
// T2101 against the same day's T0300 bank-deposit top-up, and later credits
// the same amount back under T9900 -- referencing, via paypal_reference_id,
// not the T2101 row but that month's own debit-card purchase (T0500). Traced
// against five real months (April-August 2026), a T9900 row's reference
// never resolves to a hold placement, so it is never that hold's own
// release -- the exact ambiguity paypal-statement-lines.js's own module
// comment documents for the statement PDF's "Other: ..." rows. This module
// resolves it the API route's own way: a release candidate posts only when
// its own paypal_reference_id resolves, within the same page, to a record
// this module itself classifies as a hold -- otherwise it is a genuine,
// separate movement and posts as a purchases credit note (see
// CREDIT_NOTE_EVENT_CODES below), never guessed at as this route's own
// scaffolding.
//
// T0801 (a PayPal debit card's own cashback bonus) and T9900 always reduce
// purchases, never sales -- see CREDIT_NOTE_EVENT_CODES.
//
// Every other settled event code -- T0003 (a pre-approved billing
// agreement's own payment), T0500 (a PayPal debit card purchase), T0013 (an
// ordinary receipt), and whichever other T00xx code PayPal's own Transaction
// Search API reports for a plain payment -- posts by its own gross's sign:
// positive is a sales receipt, negative is a purchases invoice. This default
// covers a payment type this module does not itself name, the same way
// paypal-statement-lines.js's isPostable defaults to posting anything not
// itself flagged as scaffolding.

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

import { CREDIT_NOTE_EVENT_CODES, adaptTransactions, isScaffolding } from "../../../app/services/paypalTransactions.js";

import { matchLabel } from "./labels.js";

function compact(line) {
  return Object.fromEntries(Object.entries(line).filter(([, value]) => value !== undefined));
}

function receiptGrossLine(adapted, { sourceJournalID, accountMainID, taxCode }) {
  return compact({
    entryNumber: `PAYPAL-${adapted.id}`,
    sourceJournalID,
    postingDate: adapted.date,
    accountMainID,
    amount: Math.abs(adapted.gross),
    amountCurrency: adapted.currency,
    documentType: "receipt",
    documentReference: adapted.id,
    detailComment: adapted.description,
    paymentMethod: "online-payment",
    taxCode,
  });
}

function billGrossLine(adapted, { sourceJournalID, accountMainID, taxCode }) {
  return compact({
    entryNumber: `PAYPAL-${adapted.id}`,
    sourceJournalID,
    postingDate: adapted.date,
    accountMainID,
    amount: Math.abs(adapted.gross),
    amountCurrency: adapted.currency,
    documentType: "invoice",
    documentReference: adapted.id,
    detailComment: adapted.description,
    paymentMethod: "online-payment",
    taxCode,
  });
}

function creditNoteLine(adapted, { purchasesAccountMainID, taxCode }) {
  return compact({
    entryNumber: `PAYPAL-${adapted.id}`,
    sourceJournalID: "purchases",
    postingDate: adapted.date,
    accountMainID: purchasesAccountMainID,
    amount: Math.abs(adapted.gross),
    amountCurrency: adapted.currency,
    documentType: "credit-note",
    documentReference: adapted.id,
    detailComment: adapted.description,
    paymentMethod: "online-payment",
    taxCode,
  });
}

function feeLine(adapted, { feeAccountMainID, taxCode }) {
  return compact({
    entryNumber: `PAYPAL-${adapted.id}-FEE`,
    sourceJournalID: "purchases",
    postingDate: adapted.date,
    accountMainID: feeAccountMainID,
    amount: Math.abs(adapted.fee),
    amountCurrency: adapted.currency,
    documentType: "receipt",
    documentReference: adapted.id,
    detailComment: "PayPal transaction fee",
    paymentMethod: "online-payment",
    taxCode,
  });
}

/**
 * Parses staged PayPal Transaction Search API records (see
 * scripts/finance/paypal-stage.js) into validated diya-gl lines. See the
 * module comment for the full rule set: settled only; a currency conversion
 * or a bank transfer unposted; a hold and its release unposted; a cashback
 * bonus or a settled "Other" that is not, in fact, a hold's release posts as
 * a purchases credit note; every other settled record posts by its own
 * gross's sign, receipt (sales) or bill (purchases), with its own fee, if
 * any, posted to purchases and never netted into the gross. A label rule
 * (see labels.js) matching a receipt's or bill's own description sets its
 * gross line's sourceJournalID, accountMainID and taxCode in place of that
 * default; a receipt or bill no rule matches keeps the default and is also
 * listed in unlabelled. The fee line is never redirected.
 * @param {Array<Object>} transactions - raw transaction_details objects, one
 *   staged month's page (or every page concatenated)
 * @param {{salesAccountMainID: string, purchasesAccountMainID: string, feeAccountMainID: string, taxCode?: string, labels?: Object}} options
 * @returns {{lines: Array<Object>, unlabelled: Array<Object>}} validated
 *   diya-gl lines, and the receipts and bills no label rule matched
 */
export function paypalLinesFromTransactions(
  transactions,
  { salesAccountMainID, purchasesAccountMainID, feeAccountMainID, taxCode, labels } = {},
) {
  if (!salesAccountMainID) throw new Error("salesAccountMainID is required");
  if (!purchasesAccountMainID) throw new Error("purchasesAccountMainID is required");
  if (!feeAccountMainID) throw new Error("feeAccountMainID is required");

  const { adaptedRecords, byId } = adaptTransactions(transactions);

  const unlabelled = [];
  const lines = [];
  for (const adapted of adaptedRecords) {
    if (isScaffolding(adapted, byId)) continue;

    if (CREDIT_NOTE_EVENT_CODES.has(adapted.code)) {
      lines.push(creditNoteLine(adapted, { purchasesAccountMainID, taxCode }));
    } else {
      const rule = matchLabel(adapted.description, labels);
      if (labels && !rule) {
        unlabelled.push(adapted);
      }
      const isReceipt = adapted.gross >= 0;
      const coding = {
        sourceJournalID: rule?.sourceJournalID ?? (isReceipt ? "sales" : "purchases"),
        accountMainID: rule?.accountMainID ?? (isReceipt ? salesAccountMainID : purchasesAccountMainID),
        taxCode: rule?.taxCode ?? taxCode,
      };
      lines.push(isReceipt ? receiptGrossLine(adapted, coding) : billGrossLine(adapted, coding));
    }
    if (adapted.fee !== 0) {
      lines.push(feeLine(adapted, { feeAccountMainID, taxCode }));
    }
  }

  const book = {
    accounts: {
      sales: { [salesAccountMainID]: {} },
      purchases: { [purchasesAccountMainID]: {}, [feeAccountMainID]: {} },
    },
  };
  for (const line of lines) {
    if (!book.accounts[line.sourceJournalID]) {
      book.accounts[line.sourceJournalID] = {};
    }
    book.accounts[line.sourceJournalID][line.accountMainID] = {};
  }
  const { valid, errors } = validateLines(lines, book);
  if (!valid) {
    throw new Error(`PayPal transaction lines failed validation:\n${errors.join("\n")}`);
  }
  return { lines, unlabelled };
}
