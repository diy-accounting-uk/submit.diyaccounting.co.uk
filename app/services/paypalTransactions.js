// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/paypalTransactions.js
//
// Classifies PayPal Transaction Search API records: which are real money movements and which
// are scaffolding around them (pending or denied rows, currency conversions, bank transfers,
// holds and their releases). Shared by the nightly PayPal donations pull, which runs in a Lambda
// image that copies app/ only, and by mcp/lib/finance/paypal-lines.js and
// mcp/lib/finance/paypal-statement-lines.js, which turn the same records into book lines.

// A hold or an authorisation: a negative row that reserves balance without
// a sale or purchase behind it. Excludes the row that releases one again --
// "Reversal of ...", "Void of ..." and "Other: ..." are read as release
// labels by the checks below, never as a hold placement's own label.
const HOLD_OR_AUTHORISATION = /\b(hold|authorisation|authorization)\b/i;
const RELEASE_LABEL = /^(reversal of|void of|other:)/i;
// "Reversal of ..." and "Void of ..." are PayPal's own unambiguous release
// labels; chooseReleaseRows always counts these. "Other: ..." is the
// ambiguous one -- see the module comment.
export const UNAMBIGUOUS_RELEASE_LABEL = /^(reversal of|void of)/i;
// Moves the wallet's own balance between its currency pots; no sale or
// purchase behind it.
const CURRENCY_CONVERSION = /currency conversion/i;
// A transfer to or from the linked bank account. The bank statement already
// carries this as its own BAC (deposit) or D/D (withdrawal) line.
export const BANK_DEPOSIT_TO_PAYPAL = /^bank deposit to paypal account/i;
const WITHDRAWAL = /\bwithdrawal\b/i;

/**
 * True for a currency conversion row.
 * @param {string} description
 * @returns {boolean}
 */
export function isCurrencyConversion(description) {
  return CURRENCY_CONVERSION.test(description);
}

/**
 * True for a currency conversion or a transfer to/from the linked bank
 * account -- balance mechanics with no sale or purchase behind them,
 * excluded from posting. Exported so a reconciliation report can categorise
 * a row exactly as paypalLinesFromStatementText does, rather than a second,
 * driftable copy of the same regexes.
 * @param {string} description
 * @returns {boolean}
 */
export function isCurrencyConversionOrTransfer(description) {
  return CURRENCY_CONVERSION.test(description) || BANK_DEPOSIT_TO_PAYPAL.test(description) || WITHDRAWAL.test(description);
}

/**
 * True for a hold/authorisation candidate: negative, and not itself labelled
 * as a release (an authorisation's own void is still "Authorisation" in
 * PayPal's label, so the release check runs first). A hold never posts,
 * whatever its own status -- PayPal marks the placement of a hold "Pending"
 * far more often than "Completed", so this carries no status test of its
 * own.
 * @param {{gross: number, description: string}} record
 * @returns {boolean}
 */
export function isHoldCandidate(record) {
  return record.gross < 0 && !RELEASE_LABEL.test(record.description) && HOLD_OR_AUTHORISATION.test(record.description);
}

/**
 * True for a release candidate: positive, labelled as undoing something,
 * whatever that label is, and "Completed" -- only a release that has
 * actually happened frees real balance. A negative "Other: ..." (a genuine,
 * differently-labelled cost) is never a release candidate regardless of
 * status.
 * @param {{status: string, gross: number, description: string}} record
 * @returns {boolean}
 */
export function isReleaseCandidate(record) {
  return record.status === "Completed" && record.gross > 0 && RELEASE_LABEL.test(record.description);
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
// drive isCurrencyConversionOrTransfer,
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
// A payment refund (T1107) and a payment reversal (T1106) hand money back against an earlier
// receipt, named by the refund's own paypal_reference_id.
export const REFUND_EVENT_CODES = new Set(["T1106", "T1107"]);

const CURRENCY_CONVERSION_EVENT_CODE = "T0200";
const HOME_CURRENCY = "GBP";

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
export const CREDIT_NOTE_EVENT_CODES = new Set(["T0801", "T9900"]);
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

// The free-text description the classifiers above
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
// the classifiers above read: {id, status, gross,
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

/**
 * Adapts every record on a page and resolves each ambiguous "Other" against the page, so a
 * reference resolves regardless of array order.
 *
 * @param {Array<Object>} transactions - raw transaction_details objects
 * @returns {{adaptedRecords: Array<Object>, byId: Map<string, Object>}}
 */
export function adaptTransactions(transactions) {
  const adaptedRecords = transactions.map(adapt);
  const byId = new Map(adaptedRecords.map((adapted) => [adapted.id, adapted]));
  nameAmbiguousReleases(adaptedRecords, byId);
  return { adaptedRecords, byId };
}

/**
 * True for an adapted record that is scaffolding, never a sale, purchase or donation of its
 * own: not settled, a currency conversion or bank transfer, a hold placement, or the release of
 * a hold on the same page.
 *
 * @param {Object} adapted - a record from adaptTransactions
 * @param {Map<string, Object>} byId - the page's adapted records by transaction id
 * @returns {boolean}
 */
export function isScaffolding(adapted, byId) {
  if (adapted.status !== "Completed") return true;
  if (isCurrencyConversionOrTransfer(adapted.description)) return true;
  if (isHoldCandidate(adapted)) return true;
  return isReleaseCandidate(adapted) && resolvesToAHold(adapted, byId);
}

/**
 * The pound amount of a settled record. A pound record is its own gross. A record in another
 * currency is converted by a T0200 pair whose pound leg names the record in its
 * paypal_reference_id; that leg's amount (positive when money came in, negative when it went
 * out) is the pound figure PayPal actually credited or debited.
 *
 * @param {Object} adapted - a record from adaptTransactions
 * @param {Array<Object>} adaptedRecords - the page's adapted records, conversion legs included
 * @returns {number|undefined} undefined when no completed pound leg names the record
 */
export function gbpAmountOf(adapted, adaptedRecords) {
  if (adapted.currency === HOME_CURRENCY) return adapted.gross;
  const poundLeg = adaptedRecords.find(
    (candidate) =>
      candidate.code === CURRENCY_CONVERSION_EVENT_CODE &&
      candidate.status === "Completed" &&
      candidate.currency === HOME_CURRENCY &&
      candidate.referenceId === adapted.id &&
      Math.sign(candidate.gross) === Math.sign(adapted.gross),
  );
  return poundLeg?.gross;
}
