// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// bank-lines.js -- parses a NatWest current account CSV export
// (Date,Type,Description,Value,Balance,Account Name,Account Number) into
// validated diya-gl bank lines, one per statement transaction. Every
// transaction the statement carries becomes a line: no holds to filter,
// no fee to split out, no netting. The amount is always positive per the
// diya-gl-lines-v2 schema; direction lives in two fields, both required by
// the engine's book-ltd-bank-line-has-side check
// (../spreadsheets.diyaccounting.co.uk/app/lib/book-checks/ltd.js line 141):
// diya-gl:bankCode, the analysis column a bank workbook totals the line
// into (DR/CR/B/...), and debitCreditCode ("D"/"C"), the side the check
// itself reads. A line with a bankCode but no debitCreditCode reaches
// neither block of its month tab and drops out of the trial balance.

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

import { matchLabel } from "./labels.js";

const HEADER_PREFIX = "Date,Type,Description,Value,Balance";

const MONTHS = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseStatementDate(text) {
  const match = /^(\d{2}) (\w{3}) (\d{4})$/.exec(text.trim());
  if (!match) {
    throw new Error(`Unrecognised statement date "${text}"`);
  }
  const [, day, monthName, year] = match;
  const month = MONTHS[monthName];
  if (!month) {
    throw new Error(`Unrecognised statement month "${monthName}"`);
  }
  return `${year}-${month}-${day}`;
}

function parseRows(text) {
  const rawLines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (rawLines.length === 0 || !rawLines[0].startsWith(HEADER_PREFIX)) {
    throw new Error('Not a NatWest bank statement CSV: expected the header "Date,Type,Description,Value,Balance,..."');
  }
  return rawLines.slice(1).map((line, index) => {
    const [date, type, description, value, balance] = parseCsvLine(line);
    const parsedValue = Number(value);
    const parsedBalance = Number(balance);
    if (!Number.isFinite(parsedValue) || !Number.isFinite(parsedBalance)) {
      throw new Error(`Row ${index + 1}: Value "${value}" or Balance "${balance}" is not a number`);
    }
    return {
      date: parseStatementDate(date),
      type: type.trim(),
      description: description.trim(),
      value: parsedValue,
      balance: parsedBalance,
    };
  });
}

// The fallback used when no label rule matches a line's description. The
// statement's own Type column does not say which direction the money moved;
// a bank charge is always a payment, but BAC, DPC, D/D and POS all occur on
// both sides of the account across a year. The sign of Value is what the
// bank workbook's own receipt/payment columns key off, so it decides the
// diya-gl:bankCode here too: a generic debtor receipt for money in, a
// generic creditor payment for money out. INT is the savings account's
// interest, money in.
function bankCodeFor(type, value) {
  if (type === "CHG") {
    return "B";
  }
  if (type === "BAC" || type === "DPC" || type === "D/D" || type === "POS" || type === "INT") {
    return value >= 0 ? "DR" : "CR";
  }
  throw new Error(`Unrecognised statement type "${type}"`);
}

// The side book-ltd-bank-line-has-side reads: "D" for money in to the bank
// account, "C" for money out, decided by the same sign of Value that
// bankCodeFor keys off (a bank charge's Value is always negative).
function debitCreditCodeFor(value) {
  return value >= 0 ? "D" : "C";
}

/**
 * Parses a NatWest current account CSV export into validated diya-gl bank
 * lines, one per statement transaction. A label rule matching a line's own
 * description sets its diya-gl:bankCode and taxCode; a line no rule matches
 * keeps bankCodeFor's coding and is also listed in unlabelled.
 * @param {string} text - the raw CSV file content
 * @param {{accountMainID: string, labels?: Object}} options - accountMainID is
 *   the book.toml bank account this statement books to; labels is a parsed
 *   label map (see labels.js)
 * @returns {{lines: Array<Object>, unlabelled: Array<Object>}} validated
 *   diya-gl lines, and the statement rows no label rule matched
 */
export function bankLinesFromCsv(text, { accountMainID, labels } = {}) {
  if (!accountMainID) {
    throw new Error("accountMainID is required");
  }
  const rows = parseRows(text);
  const unlabelled = [];
  const lines = rows.map((row, index) => {
    const rule = matchLabel(row.description, labels);
    if (labels && !rule) {
      unlabelled.push(row);
    }
    const line = {
      "entryNumber": `BANK-${row.date}-${index + 1}`,
      "sourceJournalID": "bank",
      "postingDate": row.date,
      accountMainID,
      "amount": Math.abs(row.value),
      "documentType": "bank-statement",
      "detailComment": row.description,
      "diya-gl:bankCode": rule?.["diya-gl:bankCode"] ?? bankCodeFor(row.type, row.value),
      "diya-gl:bankAccountID": accountMainID,
      "debitCreditCode": debitCreditCodeFor(row.value),
    };
    if (rule?.taxCode !== undefined) {
      line.taxCode = rule.taxCode;
    }
    return line;
  });

  const book = { accounts: { bank: { [accountMainID]: {} } } };
  const { valid, errors } = validateLines(lines, book);
  if (!valid) {
    throw new Error(`Bank statement lines failed validation:\n${errors.join("\n")}`);
  }
  return { lines, unlabelled };
}

/**
 * The statement's closing balance: the Balance field carried by the most
 * recent transaction in the file, whatever order the rows are in.
 * @param {string} text - the raw CSV file content
 * @returns {number} the closing balance
 */
export function closingBalance(text) {
  const rows = parseRows(text);
  if (rows.length === 0) {
    throw new Error("Bank statement has no transaction rows");
  }
  let latest = rows[0];
  for (const row of rows) {
    if (row.date > latest.date) {
      latest = row;
    }
  }
  return latest.balance;
}
