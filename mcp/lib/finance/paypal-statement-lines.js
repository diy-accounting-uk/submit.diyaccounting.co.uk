// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// paypal-statement-lines.js -- PayPal's monthly "Transaction History" PDF
// (poppler's pdftotext -layout text) turned into validated diya-gl lines.
// This is the statement route: it reads what PayPal already sent, rather
// than calling the Transaction Search API (that route is staged separately
// and stays separate -- this module does not replace it).
//
// A settled receipt posts gross to sales and its fee, if any, to purchases,
// never netted, the same split stripe-lines.js uses for a Stripe charge. A
// settled bill or card payment posts its full gross to purchases. An
// optional label map (see labels.js) can redirect a record's gross line to a
// different account, on the strength of its own description, in place of
// that default; the fee line is never redirected, since it is PayPal's own
// charge, not the payee's. Every other row on a PayPal statement is
// scaffolding around those two events, not a transaction of its own, and is
// left unposted:
//   - a currency conversion -- moves money between the wallet's own
//     currency pots, no sale or purchase behind it
//   - a transfer to or from the linked bank account ("Bank deposit to
//     PayPal account", "General Withdrawal") -- the bank statement already
//     carries this as its own BAC/D-D line; posting it here too would
//     double it
//   - anything not marked "Completed" -- a hold, an authorisation or a
//     transfer still in flight, never a real movement yet
//   - a hold or an authorisation -- it reserves balance without moving it,
//     never a sale or purchase of its own
//   - the row that releases a hold ("Reversal of ...", "Void of ...", or
//     the unhelpful "Other: ..."), but only when the same statement's
//     statement.PDF says so
//
// Why the statement.PDF is the authority on releases: a transaction's own
// free-text description cannot say, on its own, whether a given "Other: X"
// row freed a hold or was a genuinely separate movement that happens to
// land on the same amount as a hold placed the same day -- both look
// identical in the transactions.PDF. statement.PDF's own Activity Summary
// carries a Releases figure per currency, computed by PayPal from its own
// internal hold/release linkage rather than from a description string; see
// chooseReleaseRows.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

import { matchLabel } from "./labels.js";

const execFileAsync = promisify(execFile);

/**
 * Render a PDF's text with poppler's pdftotext, preserving the statement's
 * column layout so a transaction's fields stay on recognisable lines. The
 * one seam tests replace: every other function in this module takes the
 * rendered text as a parameter instead of calling this directly, so a test
 * runs on a recorded fixture without poppler installed.
 * @param {string} pdfPath - path to the PayPal "Transaction History" PDF
 * @returns {Promise<string>} the PDF's text, laid out as poppler renders it
 */
export async function runPdftotext(pdfPath) {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`pdftotext was not found on PATH -- install poppler to read "${pdfPath}"`);
    }
    throw error;
  }
}

function compact(line) {
  return Object.fromEntries(Object.entries(line).filter(([, value]) => value !== undefined));
}

function isoDateFromUkDate(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) throw new Error(`Unrecognised PayPal statement date "${text}"`);
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseAmount(text) {
  return Number(text.replace(/,/g, ""));
}

// A transaction's Date/Status/Currency/Gross/Fee/Net row. pdftotext -layout
// keeps every column at its position on the page, so the gap between
// columns stretches or shrinks with the text either side of it rather than
// holding a fixed width; two or more spaces is what separates one column
// from the next throughout the statement. Split on that gap and validate
// each of the trailing five tokens on its own, rather than one regex
// spanning the row, so nothing here can backtrack.
const LEADING_DATE = /^\s*(\d{2}\/\d{2}\/\d{4})\s*/;
const STATUS_TOKEN = /^[A-Za-z]+$/;
const CURRENCY_TOKEN = /^[A-Z]{3}$/;
const AMOUNT_TOKEN = /^-?[\d,]+\.\d\d$/;
const ID_LINE = /^\s*ID:\s*(\S+)/;
// Lines that never belong to a description: the page header repeated on
// every page, the running column header, and the period banner that closes
// each page.
const NOISE_LINE = /^(Date\s+Description|Transaction History|Page \d|DIY Accounting|antony@|[A-Za-z]+ \d{1,2},? \d{4}\s+through)/;

// A data row carries its date at the start of the line and its five other
// fields -- Status, Currency, Gross, Fee, Net -- as the last five
// two-or-more-space-separated columns; whatever sits between the two is the
// tail of the description that shares this line with the date. Returns null
// for a line that is not a data row at all.
function matchDataRow(rawLine) {
  const dateMatch = LEADING_DATE.exec(rawLine);
  if (!dateMatch) return null;
  const rest = rawLine.slice(dateMatch[0].length);
  const columns = rest
    .split(/\s{2,}/)
    .map((column) => column.trim())
    .filter((column) => column !== "");
  if (columns.length < 5) return null;

  const [status, currency, gross, fee, net] = columns.slice(-5);
  if (!STATUS_TOKEN.test(status) || !CURRENCY_TOKEN.test(currency)) return null;
  if (!AMOUNT_TOKEN.test(gross) || !AMOUNT_TOKEN.test(fee) || !AMOUNT_TOKEN.test(net)) return null;

  return { date: dateMatch[1], descriptionTail: columns.slice(0, -5).join(" "), status, currency, gross, fee, net };
}

/**
 * Parse a PayPal "Transaction History" PDF's rendered text into raw
 * records, one per transaction: its description reassembled from whatever
 * lines wrapped around the date/amount row, its id, and its own posting
 * date, status, currency and Gross/Fee/Net figures.
 * @param {string} text - pdftotext -layout output for one statement PDF
 * @returns {Array<{date: string, description: string, status: string, currency: string, gross: number, fee: number, net: number, id: string|undefined}>}
 */
export function parsePaypalStatementRecords(text) {
  const records = [];
  let descriptionParts = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const dataRow = matchDataRow(rawLine);
    if (dataRow) {
      const description = [...descriptionParts, dataRow.descriptionTail]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
      records.push({
        date: isoDateFromUkDate(dataRow.date),
        description,
        status: dataRow.status,
        currency: dataRow.currency,
        gross: parseAmount(dataRow.gross),
        fee: parseAmount(dataRow.fee),
        net: parseAmount(dataRow.net),
        id: undefined,
      });
      descriptionParts = [];
      continue;
    }

    const idMatch = ID_LINE.exec(rawLine);
    if (idMatch) {
      if (records.length > 0) records[records.length - 1].id = idMatch[1];
      descriptionParts = [];
      continue;
    }

    const trimmed = rawLine.trim();
    if (trimmed === "" || NOISE_LINE.test(trimmed)) {
      descriptionParts = [];
      continue;
    }
    descriptionParts.push(trimmed);
  }

  return records;
}

// statement.PDF's "Activity Summary" table, one row per label, one column
// per currency the account has ever carried a balance in (GBP, EUR, USD in
// whatever combination the statement's own header line lists).
const ACTIVITY_SUMMARY_ROW_KEYS = new Map([
  ["Start Available Balance", "startAvailableBalance"],
  ["Payments received", "paymentsReceived"],
  ["Payments sent", "paymentsSent"],
  ["Withdrawals and Debits", "withdrawalsAndDebits"],
  ["Deposits and Credits", "depositsAndCredits"],
  ["Fees", "fees"],
  ["Other", "other"],
  ["Releases", "releases"],
  ["Transfers", "transfers"],
  ["Withheld", "withheld"],
  ["End Available Balance", "endAvailableBalance"],
]);
// A line naming nothing but currency codes: the Activity Summary's header,
// in whatever combination of GBP/EUR/USD the account has carried a balance
// in. Checked token by token, rather than with one regex spanning the
// line, so nothing here can backtrack.
function currencyHeaderTokens(rawLine) {
  const trimmed = rawLine.trim();
  if (trimmed === "") return null;
  const tokens = trimmed.split(/\s{2,}/);
  return tokens.every((token) => CURRENCY_TOKEN.test(token)) ? tokens : null;
}

/**
 * Parse one statement.PDF's "Activity Summary" table: the same
 * Available-balance movement a month's transactions.PDF rows should sum
 * to, already broken into the categories PayPal computed it from --
 * Payments received/sent, Withdrawals and Debits, Deposits and Credits,
 * Fees, Other, Releases, Transfers, Withheld. See the module comment for
 * why this, not the transaction rows' own free text, decides which
 * "Other: ..." rows are hold releases.
 * @param {string} text - pdftotext -layout output for one statement.PDF
 * @returns {Object<string, Object<string, number>>} row key (see
 *   ACTIVITY_SUMMARY_ROW_KEYS) -> currency code -> amount
 */
export function parsePaypalActivitySummary(text) {
  const summary = {};
  let currencies = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const headerTokens = currencyHeaderTokens(rawLine);
    if (headerTokens) {
      currencies = headerTokens;
      continue;
    }
    if (!currencies) continue;

    const trimmed = rawLine.trim();
    const label = [...ACTIVITY_SUMMARY_ROW_KEYS.keys()].find((candidate) => trimmed.startsWith(candidate));
    if (!label) continue;

    const amounts = trimmed
      .slice(label.length)
      .split(/\s{2,}/)
      .map((column) => column.trim())
      .filter(Boolean);
    // The same short words ("Other", "Releases", "Withheld") also head an
    // itemised breakdown further down the statement, as a bare section
    // title with no amount on its own line -- not a second Activity
    // Summary row, so it must not overwrite the one already read.
    if (amounts.length === 0) continue;

    const byCurrency = {};
    currencies.forEach((currency, index) => {
      if (amounts[index] !== undefined) byCurrency[currency] = parseAmount(amounts[index]);
    });
    summary[ACTIVITY_SUMMARY_ROW_KEYS.get(label)] = byCurrency;
  }

  return summary;
}

// A hold or an authorisation: a negative row that reserves balance without
// a sale or purchase behind it. Excludes the row that releases one again --
// "Reversal of ...", "Void of ..." and "Other: ..." are read as release
// labels by the checks below, never as a hold placement's own label.
const HOLD_OR_AUTHORISATION = /\b(hold|authorisation|authorization)\b/i;
const RELEASE_LABEL = /^(reversal of|void of|other:)/i;
// "Reversal of ..." and "Void of ..." are PayPal's own unambiguous release
// labels; chooseReleaseRows always counts these. "Other: ..." is the
// ambiguous one -- see the module comment.
const UNAMBIGUOUS_RELEASE_LABEL = /^(reversal of|void of)/i;
// Moves the wallet's own balance between its currency pots; no sale or
// purchase behind it.
const CURRENCY_CONVERSION = /currency conversion/i;
// A transfer to or from the linked bank account. The bank statement already
// carries this as its own BAC (deposit) or D/D (withdrawal) line.
const BANK_DEPOSIT_TO_PAYPAL = /^bank deposit to paypal account/i;
const WITHDRAWAL = /\bwithdrawal\b/i;

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

/**
 * True when a still-open row (typically a "Bank deposit to PayPal account"
 * top-up, still "Pending" in this statement) shows up "Completed" under the
 * same transaction id somewhere else -- usually a later month's own
 * statement, since PayPal sometimes settles a transfer a few days after
 * this statement's cut-off. This never changes what posts (a transfer is
 * excluded from posting whether or not it has settled); it tells a
 * reconciliation whether the statement's own Available-balance movement
 * already counts the row, so the row belongs in the reconciliation's
 * transfers total rather than being reported as an unexplained gap.
 * @param {{id: string|undefined, status: string}} record
 * @param {Array<{id: string|undefined, status: string}>} otherRecords
 * @returns {boolean}
 */
export function settlesElsewhere(record, otherRecords) {
  return record.id !== undefined && otherRecords.some((other) => other.id === record.id && other.status === "Completed");
}

// A handful of "Other: ..." release candidates at most sit in any one
// month, so every subset is cheap to check; the smallest one that sums to
// the target wins, so a single matching row is preferred over two that
// happen to add up the same way.
function smallestSubsetSummingToCents(records, targetCents) {
  const centsOf = (record) => Math.round(record.gross * 100);
  let best = null;
  for (let mask = 1; mask < 1 << records.length; mask++) {
    let sum = 0;
    const chosen = [];
    for (let i = 0; i < records.length; i++) {
      if (!(mask & (1 << i))) continue;
      sum += centsOf(records[i]);
      chosen.push(records[i]);
    }
    if (sum === targetCents && (!best || chosen.length < best.length)) best = chosen;
  }
  return best;
}

/**
 * Chooses which release-labelled rows a currency's Activity Summary
 * Releases figure actually counts as hold releases, out of every row
 * isReleaseCandidate accepts for that currency. Every "Reversal of ..." and
 * "Void of ..." row always counts -- PayPal's own unambiguous release
 * label. An "Other: ..." row counts only when the unambiguous rows alone
 * fall short of the Releases figure, and then only the smallest set of
 * "Other: ..." rows that closes the gap exactly; an "Other: ..." row not
 * needed for that is a real, separate movement that happens to land on a
 * hold's amount, not a release of it (the case that surfaced this: a May
 * 2026 "General Hold" of £15.66 and an "Other: AWS EMEA" of £15.66 the same
 * day, which the statement's own Releases figure showed was not that
 * hold's release).
 * @param {Array<Object>} releaseCandidates - records for which isReleaseCandidate
 *   is true, one currency
 * @param {number} releasesTotal - that currency's Activity Summary Releases figure
 * @returns {{releaseIds: Set<string>, matched: boolean}} matched is false when no
 *   combination of "Other: ..." rows closes the gap to releasesTotal exactly --
 *   the statement and the transaction rows disagree, a residual to report,
 *   not to guess past
 */
export function chooseReleaseRows(releaseCandidates, releasesTotal) {
  const unambiguous = releaseCandidates.filter((record) => UNAMBIGUOUS_RELEASE_LABEL.test(record.description));
  const ambiguous = releaseCandidates.filter((record) => !UNAMBIGUOUS_RELEASE_LABEL.test(record.description));

  const targetCents = Math.round(releasesTotal * 100);
  const baseCents = unambiguous.reduce((sum, record) => sum + Math.round(record.gross * 100), 0);
  if (baseCents === targetCents) {
    return { releaseIds: new Set(unambiguous.map((record) => record.id)), matched: true };
  }

  const subset = smallestSubsetSummingToCents(ambiguous, targetCents - baseCents);
  if (!subset) {
    return { releaseIds: new Set(unambiguous.map((record) => record.id)), matched: false };
  }
  return { releaseIds: new Set([...unambiguous, ...subset].map((record) => record.id)), matched: true };
}

function isPostable(record, chosenReleaseIds) {
  if (record.status !== "Completed") return false;
  if (isCurrencyConversionOrTransfer(record.description)) return false;
  if (isHoldCandidate(record)) return false; // never posts
  if (isReleaseCandidate(record) && chosenReleaseIds.has(record.id)) return false; // this month's Releases figure already counts it
  return true;
}

function receiptGrossLine(record, { sourceJournalID, accountMainID, taxCode }) {
  return compact({
    entryNumber: `PAYPAL-${record.id}`,
    sourceJournalID,
    postingDate: record.date,
    accountMainID,
    amount: Math.abs(record.gross),
    amountCurrency: record.currency,
    documentType: "receipt",
    documentReference: record.id,
    detailComment: record.description,
    paymentMethod: "online-payment",
    taxCode,
  });
}

function billGrossLine(record, { sourceJournalID, accountMainID, taxCode }) {
  return compact({
    entryNumber: `PAYPAL-${record.id}`,
    sourceJournalID,
    postingDate: record.date,
    accountMainID,
    amount: Math.abs(record.gross),
    amountCurrency: record.currency,
    documentType: "invoice",
    documentReference: record.id,
    detailComment: record.description,
    paymentMethod: "online-payment",
    taxCode,
  });
}

function feeLine(record, { feeAccountMainID, taxCode }) {
  return compact({
    entryNumber: `PAYPAL-${record.id}-FEE`,
    sourceJournalID: "purchases",
    postingDate: record.date,
    accountMainID: feeAccountMainID,
    amount: Math.abs(record.fee),
    amountCurrency: record.currency,
    documentType: "receipt",
    documentReference: record.id,
    detailComment: "PayPal transaction fee",
    paymentMethod: "online-payment",
    taxCode,
  });
}

/**
 * Parses a PayPal "Transaction History" PDF's rendered text into validated
 * diya-gl lines: a settled receipt (positive gross) becomes a sales receipt
 * for the gross amount plus a purchases receipt for its fee, and a settled
 * bill or card payment (negative gross) becomes a purchases invoice for the
 * gross amount plus a purchases receipt for its fee -- gross and fee are
 * never netted. A currency conversion, a transfer to or from the bank, and
 * anything not marked "Completed" are excluded. A hold or authorisation
 * never posts. A release ("Reversal of ...", "Void of ...", "Other: ...")
 * posts only when statementText is not given, or does not cover its currency
 * -- with statementText, chooseReleaseRows decides per currency, against that
 * currency's own Releases figure, and without it every "Reversal of ..." /
 * "Void of ..." row still excludes (PayPal's own unambiguous label) but
 * every "Other: ..." row posts, since nothing here can then tell a real
 * movement from a release that merely shares its amount. A label rule
 * matching a postable record's own description sets its sourceJournalID,
 * accountMainID and taxCode in place of the default sales/purchases account
 * above; a record no rule matches keeps that default and is also listed in
 * unlabelled. The fee line always posts to feeAccountMainID, whatever the
 * gross line's own rule -- the fee is PayPal's own charge, not the payee's.
 * @param {string} text - pdftotext -layout output for the statement PDF being posted
 * @param {{salesAccountMainID: string, purchasesAccountMainID: string, feeAccountMainID: string, taxCode?: string, statementText?: string, labels?: Object}} options
 *   statementText - this same month's statement.PDF text, read for its
 *   Activity Summary's Releases figure; see chooseReleaseRows; labels - a
 *   parsed label map (see labels.js)
 * @returns {{lines: Array<Object>, unlabelled: Array<Object>}} validated
 *   diya-gl lines, and the postable records no label rule matched
 */
export function paypalLinesFromStatementText(
  text,
  { salesAccountMainID, purchasesAccountMainID, feeAccountMainID, taxCode, statementText, labels } = {},
) {
  if (!salesAccountMainID) throw new Error("salesAccountMainID is required");
  if (!purchasesAccountMainID) throw new Error("purchasesAccountMainID is required");
  if (!feeAccountMainID) throw new Error("feeAccountMainID is required");

  const records = parsePaypalStatementRecords(text);
  const activitySummary = statementText ? parsePaypalActivitySummary(statementText) : {};

  const chosenReleaseIds = new Set();
  for (const currency of new Set(records.map((record) => record.currency))) {
    const releaseCandidates = records.filter((record) => record.currency === currency && isReleaseCandidate(record));
    if (releaseCandidates.length === 0) continue;

    const releasesTotal = activitySummary.releases?.[currency];
    if (releasesTotal === undefined) {
      for (const record of releaseCandidates) {
        if (UNAMBIGUOUS_RELEASE_LABEL.test(record.description)) chosenReleaseIds.add(record.id);
      }
      continue;
    }
    const { releaseIds } = chooseReleaseRows(releaseCandidates, releasesTotal);
    for (const id of releaseIds) chosenReleaseIds.add(id);
  }

  const unlabelled = [];
  const lines = [];
  for (const record of records) {
    if (!isPostable(record, chosenReleaseIds)) continue;

    const rule = matchLabel(record.description, labels);
    if (labels && !rule) {
      unlabelled.push(record);
    }

    if (record.gross >= 0) {
      lines.push(
        receiptGrossLine(record, {
          sourceJournalID: rule?.sourceJournalID ?? "sales",
          accountMainID: rule?.accountMainID ?? salesAccountMainID,
          taxCode: rule?.taxCode ?? taxCode,
        }),
      );
    } else {
      lines.push(
        billGrossLine(record, {
          sourceJournalID: rule?.sourceJournalID ?? "purchases",
          accountMainID: rule?.accountMainID ?? purchasesAccountMainID,
          taxCode: rule?.taxCode ?? taxCode,
        }),
      );
    }
    if (record.fee !== 0) {
      lines.push(feeLine(record, { feeAccountMainID, taxCode }));
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
    throw new Error(`PayPal statement lines failed validation:\n${errors.join("\n")}`);
  }
  return { lines, unlabelled };
}

/**
 * Reads a PayPal "Transaction History" PDF, and optionally its own
 * statement.PDF, with pdftotext, and turns the transactions PDF into
 * validated diya-gl lines. The PDF reads and the parsing are separate
 * functions so the parsing itself, paypalLinesFromStatementText, runs in
 * tests on recorded text fixtures without poppler installed.
 * @param {string} pdfPath - path to the PayPal "Transaction History" PDF
 * @param {{salesAccountMainID: string, purchasesAccountMainID: string, feeAccountMainID: string, taxCode?: string, statementPdfPath?: string, labels?: Object}} options
 *   statementPdfPath - path to this same month's statement.PDF; see
 *   paypalLinesFromStatementText's statementText; labels - a parsed label
 *   map (see labels.js), passed through to paypalLinesFromStatementText
 * @param {{runPdftotext?: (pdfPath: string) => Promise<string>}} [deps]
 * @returns {Promise<{lines: Array<Object>, unlabelled: Array<Object>}>} validated
 *   diya-gl lines, and the postable records no label rule matched
 */
export async function paypalLinesFromStatementPdf(
  pdfPath,
  { statementPdfPath, ...options } = {},
  { runPdftotext: runPdftotextFn = runPdftotext } = {},
) {
  const text = await runPdftotextFn(pdfPath);
  const statementText = statementPdfPath !== undefined ? await runPdftotextFn(statementPdfPath) : undefined;
  return paypalLinesFromStatementText(text, { ...options, statementText });
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Reconciles one month's PayPal statement: posted lines (real receipts and
 * purchases, plus any release candidate chooseReleaseRows does not pick)
 * plus transfers (Completed currency conversions and bank transfers, plus
 * a still-Pending "Bank deposit to PayPal account" -- see below) plus that
 * month's own Releases and Withheld figures, read straight from
 * statementText rather than re-derived from transaction rows, should sum
 * to the same statement's Available-balance movement (End minus Start).
 *
 * A still-Pending "Bank deposit to PayPal account" counts in its own
 * month's transfers, not a later one. Traced against five real months
 * (April-August 2026), the deposit each carries never shows "Completed"
 * under its own transaction id anywhere else checked -- the export's
 * status field for that row simply never updates -- yet each month's
 * residual, computed without counting it, matched that same month's own
 * Pending deposit exactly. PayPal's own Available balance credits a bank
 * deposit the moment it is placed; only the transaction-level status
 * lags, sometimes for good. settlesElsewhere, given previousMonthText/
 * nextMonthText, checks for the rarer case where it does catch up and
 * reports that as pendingTransfersConfirmed -- it never changes what
 * counts, since a Pending deposit is counted either way.
 * @param {{transactionsText: string, statementText: string, previousMonthText?: string, nextMonthText?: string}} params
 *   transactionsText - pdftotext -layout output for the month's own
 *   transactions.PDF; statementText - pdftotext -layout output for the same
 *   month's statement.PDF; previousMonthText/nextMonthText - a neighbouring
 *   month's transactions.PDF text, read only for settlesElsewhere -- never
 *   posted from
 * @returns {{posted: number, transfers: number, releases: number, withheld: number, total: number, statementMovement: number, residual: number, reconciled: boolean, pendingTransfersConfirmed: boolean}}
 */
export function reconcilePaypalMonth({ transactionsText, statementText, previousMonthText, nextMonthText }) {
  if (!transactionsText) throw new Error("transactionsText is required");
  if (!statementText) throw new Error("statementText is required");

  const activitySummary = parsePaypalActivitySummary(statementText);
  const startBalance = activitySummary.startAvailableBalance?.GBP;
  const endBalance = activitySummary.endAvailableBalance?.GBP;
  if (startBalance === undefined || endBalance === undefined) {
    throw new Error("statementText carries no GBP Available balance to reconcile against");
  }
  const releasesTotal = activitySummary.releases?.GBP ?? 0;
  const withheldTotal = activitySummary.withheld?.GBP ?? 0;
  const statementMovement = round2(endBalance - startBalance);

  const records = parsePaypalStatementRecords(transactionsText).filter((record) => record.currency === "GBP");
  const releaseCandidates = records.filter(isReleaseCandidate);
  const { releaseIds } = chooseReleaseRows(releaseCandidates, releasesTotal);

  const neighbourRecords = [previousMonthText, nextMonthText]
    .filter((text) => text !== undefined)
    .flatMap((text) => parsePaypalStatementRecords(text));

  let posted = 0;
  let transfers = 0;
  let pendingTransfersConfirmed = true;
  for (const record of records) {
    if (isHoldCandidate(record)) continue; // never posts; this month's own Withheld figure already covers it
    if (isCurrencyConversionOrTransfer(record.description)) {
      if (record.status === "Completed") {
        transfers += record.net;
      } else if (BANK_DEPOSIT_TO_PAYPAL.test(record.description)) {
        transfers += record.net; // see the function comment above
        if (!settlesElsewhere(record, neighbourRecords)) pendingTransfersConfirmed = false;
      }
      continue;
    }
    if (record.status !== "Completed") continue;
    if (isReleaseCandidate(record) && releaseIds.has(record.id)) continue;
    posted += record.net;
  }

  const total = round2(posted + transfers + releasesTotal + withheldTotal);
  const residual = round2(total - statementMovement);

  return {
    posted: round2(posted),
    transfers: round2(transfers),
    releases: round2(releasesTotal),
    withheld: round2(withheldTotal),
    total,
    statementMovement,
    residual,
    reconciled: residual === 0,
    pendingTransfersConfirmed,
  };
}
