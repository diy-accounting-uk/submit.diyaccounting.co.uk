// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/vatReturnCsv.js

/**
 * Parser for the CSV VAT return contract (_developers/CSV_VAT_RETURN_CONTRACT.md).
 * Turns one CSV file into an array of nine-box return objects in the shape
 * app/lib/vatReturnTypes.js already builds for HMRC submission: the same
 * field names, plus vrn, periodStart and periodEnd, minus periodKey (the
 * caller looks that up from periodStart/periodEnd via
 * app/lib/obligationFormatter.js findObligationByDateRange, the same way the
 * HTML form does).
 *
 * Every rejection throws VatReturnCsvError with a `reason` naming which rule
 * failed, so a caller (or a test) can assert on the reason rather than the
 * message text.
 */

import { isValidVrn, isValidIsoDate } from "./hmrcValidation.js";

export const CSV_COLUMNS = [
  "vrn",
  "periodStart",
  "periodEnd",
  "vatDueSales",
  "vatDueAcquisitions",
  "totalVatDue",
  "vatReclaimedCurrPeriod",
  "netVatDue",
  "totalValueSalesExVAT",
  "totalValuePurchasesExVAT",
  "totalValueGoodsSuppliedExVAT",
  "totalAcquisitionsExVAT",
  "finalised",
];

const MONETARY_COLUMNS = ["vatDueSales", "vatDueAcquisitions", "totalVatDue", "vatReclaimedCurrPeriod", "netVatDue"];
const WHOLE_POUND_COLUMNS = ["totalValueSalesExVAT", "totalValuePurchasesExVAT", "totalValueGoodsSuppliedExVAT", "totalAcquisitionsExVAT"];

export class VatReturnCsvError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "VatReturnCsvError";
    this.reason = reason;
  }
}

function reject(reason, message) {
  throw new VatReturnCsvError(reason, message);
}

// Strips a leading UTF-8 byte-order mark, which spreadsheet exports commonly
// add and which would otherwise land inside the first header name.
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Splits CSV text into rows of fields. Supports RFC 4180 double-quoted
// fields (embedded commas, embedded newlines, "" as an escaped quote) since
// a spreadsheet exporter may quote fields defensively even though none of
// this contract's columns need it. Accepts LF or CRLF line endings.
function splitCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) reject("UNTERMINATED_QUOTE", "CSV has an unterminated quoted field");
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

function parseHeader(headerRow) {
  const seen = new Set();
  for (const name of headerRow) {
    if (seen.has(name)) reject("DUPLICATE_COLUMN", `Duplicate column "${name}" in header row`);
    seen.add(name);
  }
  for (const required of CSV_COLUMNS) {
    if (!seen.has(required)) reject("MISSING_COLUMN", `Missing required column "${required}"`);
  }
  for (const name of headerRow) {
    if (!CSV_COLUMNS.includes(name)) reject("UNKNOWN_COLUMN", `Unknown column "${name}"`);
  }
  return headerRow;
}

// Exactly two decimal places, allowing an optional leading minus sign. No
// thousands separators, no currency symbols. HMRC expects boxes 1-5 to the
// nearest penny; the contract requires the CSV to already carry that
// precision rather than have the reader round it.
function parseMonetary(raw, column, rowNumber) {
  if (!/^-?\d+\.\d{2}$/.test(raw)) {
    reject("INVALID_MONETARY_AMOUNT", `Row ${rowNumber}: "${column}" must have exactly 2 decimal places, got "${raw}"`);
  }
  return Number(raw);
}

// A whole number of pounds, no decimal point. HMRC expects boxes 6-9 as
// whole pounds; the contract requires the CSV to already be rounded rather
// than have the reader round it.
function parseWholePounds(raw, column, rowNumber) {
  if (!/^-?\d+$/.test(raw)) {
    reject("INVALID_WHOLE_AMOUNT", `Row ${rowNumber}: "${column}" must be a whole number of pounds, got "${raw}"`);
  }
  return Number(raw);
}

function parseIsoDate(raw, column, rowNumber) {
  if (!isValidIsoDate(raw)) {
    reject("INVALID_DATE_FORMAT", `Row ${rowNumber}: "${column}" must be an ISO date (YYYY-MM-DD), got "${raw}"`);
  }
  return raw;
}

function closeEnough(a, b) {
  return Math.abs(a - b) < 0.005;
}

function parseRow(fields, header, rowNumber) {
  if (fields.length !== header.length) {
    reject("COLUMN_COUNT_MISMATCH", `Row ${rowNumber}: expected ${header.length} columns, got ${fields.length}`);
  }
  const byName = {};
  header.forEach((name, index) => {
    byName[name] = fields[index];
  });

  if (!isValidVrn(byName.vrn)) {
    reject("INVALID_VRN", `Row ${rowNumber}: "vrn" must be exactly 9 digits, got "${byName.vrn}"`);
  }

  const periodStart = parseIsoDate(byName.periodStart, "periodStart", rowNumber);
  const periodEnd = parseIsoDate(byName.periodEnd, "periodEnd", rowNumber);
  if (new Date(periodEnd) < new Date(periodStart)) {
    reject("PERIOD_END_BEFORE_START", `Row ${rowNumber}: "periodEnd" (${periodEnd}) is before "periodStart" (${periodStart})`);
  }

  const monetary = {};
  for (const column of MONETARY_COLUMNS) {
    monetary[column] = parseMonetary(byName[column], column, rowNumber);
  }

  const wholePounds = {};
  for (const column of WHOLE_POUND_COLUMNS) {
    wholePounds[column] = parseWholePounds(byName[column], column, rowNumber);
  }

  if (monetary.netVatDue < 0) {
    reject("NEGATIVE_NET_VAT_DUE", `Row ${rowNumber}: "netVatDue" (Box 5) cannot be negative`);
  }

  const expectedTotalVatDue = monetary.vatDueSales + monetary.vatDueAcquisitions;
  if (!closeEnough(monetary.totalVatDue, expectedTotalVatDue)) {
    reject(
      "BOX_ARITHMETIC_BOX3",
      `Row ${rowNumber}: "totalVatDue" (Box 3, ${monetary.totalVatDue}) must equal vatDueSales + vatDueAcquisitions (${expectedTotalVatDue})`,
    );
  }

  const expectedNetVatDue = Math.abs(monetary.totalVatDue - monetary.vatReclaimedCurrPeriod);
  if (!closeEnough(monetary.netVatDue, expectedNetVatDue)) {
    reject(
      "BOX_ARITHMETIC_BOX5",
      `Row ${rowNumber}: "netVatDue" (Box 5, ${monetary.netVatDue}) must equal |totalVatDue - vatReclaimedCurrPeriod| (${expectedNetVatDue})`,
    );
  }

  if (byName.finalised !== "true") {
    reject("NOT_FINALISED", `Row ${rowNumber}: "finalised" must be "true" (HMRC only accepts a finalised declaration), got "${byName.finalised}"`);
  }

  return {
    vrn: byName.vrn,
    periodStart,
    periodEnd,
    vatDueSales: monetary.vatDueSales,
    vatDueAcquisitions: monetary.vatDueAcquisitions,
    totalVatDue: monetary.totalVatDue,
    vatReclaimedCurrPeriod: monetary.vatReclaimedCurrPeriod,
    netVatDue: monetary.netVatDue,
    totalValueSalesExVAT: wholePounds.totalValueSalesExVAT,
    totalValuePurchasesExVAT: wholePounds.totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT: wholePounds.totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT: wholePounds.totalAcquisitionsExVAT,
    finalised: true,
  };
}

/**
 * Parses a CSV VAT return file into an array of nine-box return objects.
 * @param {string} csvText - The raw CSV file content.
 * @returns {Array<Object>} One entry per data row, in file order.
 * @throws {VatReturnCsvError} On any column, format or arithmetic violation.
 */
export function parseVatReturnCsv(csvText) {
  if (typeof csvText !== "string" || csvText.trim().length === 0) {
    reject("EMPTY_FILE", "CSV file is empty");
  }

  const rows = splitCsvRows(stripBom(csvText)).filter((row) => !(row.length === 1 && row[0] === ""));
  if (rows.length === 0) {
    reject("EMPTY_FILE", "CSV file is empty");
  }

  const header = parseHeader(rows[0]);
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    reject("NO_DATA_ROWS", "CSV file has a header row but no return rows");
  }

  return dataRows.map((fields, index) => parseRow(fields, header, index + 2));
}
