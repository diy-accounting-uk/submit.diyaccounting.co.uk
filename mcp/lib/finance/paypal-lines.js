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

import { isCurrencyConversionOrTransfer, isHoldCandidate, isReleaseCandidate } from "./paypal-statement-lines.js";

import { matchLabel } from "./labels.js";

function compact(line) {
  return Object.fromEntries(Object.entries(line).filter(([, value]) => value !== undefined));
}

function isoDateFromApiDateTime(text) {
  return text.slice(0, 10);
}

// PayPal's own settled/successful status code on a Transaction Search page.
// Every other status ("P" pending, "D" denied, "V" reversed, ...) is a
// movement still in flight or one that never happened, never posted.
const SETTLED_STATUS = "S";

// A currency conversion moves the wallet's own balance between its currency
// pots; a bank deposit or a withdrawal is a transfer to/from the linked bank
// account, already carried by the bank statement's own BAC/D-D line. Neither
// is a sale or purchase of its own. Descriptions synthesised here only to
// drive paypal-statement-lines.js's own isCurrencyConversionOrTransfer,
// which matches on free text rather than an event code.
const TRANSFER_DESCRIPTION_BY_EVENT_CODE = new Map([
  ["T0200", "General currency conversion"],
  ["T0300", "Bank deposit to PayPal account"],
  ["T0400", "General withdrawal"],
  ["T0403", "General withdrawal"],
]);

// A hold placement reserves balance without moving it. This account's own
// usage carries two event codes for one: T1501 (pending when placed) and
// T2101 (already settled when placed, against a bank-deposit top-up -- see
// the module comment). Both synthesise a description isHoldCandidate reads
// as a hold; neither is ever a sale or purchase of its own.
const HOLD_EVENT_CODES = new Set(["T1501", "T2101"]);

// T1105 releases a T1501/T2101 hold, matched via paypal_reference_id rather
// than a free-text label -- see resolvesToAHold below. Synthesised as an
// unambiguous "Reversal of ..." release label so isReleaseCandidate accepts
// it the same way it accepts the statement PDF's own unambiguous rows.
const RELEASE_EVENT_CODES = new Set(["T1105"]);

// "Other" (T9900): ambiguous by its own free-text label -- see the module
// comment on why this route resolves it via paypal_reference_id rather than
// paypal-statement-lines.js's chooseReleaseRows.
const AMBIGUOUS_RELEASE_EVENT_CODES = new Set(["T9900"]);

// A PayPal debit card's own cashback bonus (T0801) and a settled T9900 that
// is not, in fact, a hold's release both reduce purchases -- neither is
// income, and neither is a bill of its own.
const CREDIT_NOTE_EVENT_CODES = new Set(["T0801", "T9900"]);
const CASHBACK_DESCRIPTION = "Debit Card Cashback Bonus";

function payerName(record) {
  const payer = record.payer_info || {};
  const name = payer.payer_name || {};
  if (name.alternate_full_name) return name.alternate_full_name;
  const fullName = [name.given_name, name.surname].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  return payer.email_address;
}

function describeRecord(ti, record) {
  const subject = ti.transaction_subject && ti.transaction_subject.trim();
  return subject || payerName(record) || ti.transaction_event_code;
}

// The free-text description paypal-statement-lines.js's own classifiers
// read for this record -- synthesised from its event code for the codes
// this module itself treats as scaffolding (transfer, hold, release), or
// the record's own subject/payer name otherwise. An ambiguous "Other"
// (T9900) is named after what it actually references, resolved once every
// record on the page has been adapted -- see the second pass below.
function descriptionFor(ti, record, code) {
  if (TRANSFER_DESCRIPTION_BY_EVENT_CODE.has(code)) return TRANSFER_DESCRIPTION_BY_EVENT_CODE.get(code);
  if (HOLD_EVENT_CODES.has(code)) return "General hold";
  if (RELEASE_EVENT_CODES.has(code)) return "Reversal of General Hold";
  if (AMBIGUOUS_RELEASE_EVENT_CODES.has(code)) return "Other";
  if (code === "T0801") return CASHBACK_DESCRIPTION;
  return describeRecord(ti, record);
}

// Adapts one raw transaction_details object into the shape
// paypal-statement-lines.js's own classifiers read: {id, status, gross,
// description}. gross carries the API's own signed amount, already in major
// units (unlike Stripe's minor-unit balance transactions).
function adapt(record) {
  const ti = record.transaction_info;
  const code = ti.transaction_event_code;
  return {
    id: ti.transaction_id,
    referenceId: ti.paypal_reference_id,
    code,
    status: ti.transaction_status === SETTLED_STATUS ? "Completed" : ti.transaction_status,
    gross: Number(ti.transaction_amount.value),
    fee: ti.fee_amount ? Number(ti.fee_amount.value) : 0,
    currency: ti.transaction_amount.currency_code,
    date: isoDateFromApiDateTime(ti.transaction_initiation_date),
    description: descriptionFor(ti, record, code),
  };
}

// An ambiguous "Other" (T9900) names itself after whatever it references --
// this account's own usage always references that month's own debit-card
// purchase (T0500), never the hold it happens to share an amount with (see
// the module comment). Run once every record on the page has been adapted,
// so the reference can resolve regardless of array order.
function nameAmbiguousReleases(adaptedRecords, byId) {
  for (const adapted of adaptedRecords) {
    if (!AMBIGUOUS_RELEASE_EVENT_CODES.has(adapted.code)) continue;
    const referenced = adapted.referenceId ? byId.get(adapted.referenceId) : undefined;
    adapted.description = `Other: ${referenced ? referenced.description : adapted.code}`;
  }
}

// True when a release candidate's own paypal_reference_id resolves, within
// this page, to a record this module classifies as a hold -- the API's own
// linkage in place of paypal-statement-lines.js's Activity Summary Releases
// figure. A release candidate whose reference does not resolve to a hold is
// a genuine, separate movement (see the module comment on T9900), not this
// route's scaffolding to unpost.
function resolvesToAHold(adapted, byId) {
  const referenced = adapted.referenceId ? byId.get(adapted.referenceId) : undefined;
  return referenced !== undefined && HOLD_EVENT_CODES.has(referenced.code);
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

  const adaptedRecords = transactions.map(adapt);
  const byId = new Map(adaptedRecords.map((adapted) => [adapted.id, adapted]));
  nameAmbiguousReleases(adaptedRecords, byId);

  const unlabelled = [];
  const lines = [];
  for (const adapted of adaptedRecords) {
    if (adapted.status !== "Completed") continue;
    if (isCurrencyConversionOrTransfer(adapted.description)) continue;
    if (isHoldCandidate(adapted)) continue;
    if (isReleaseCandidate(adapted) && resolvesToAHold(adapted, byId)) continue;

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
