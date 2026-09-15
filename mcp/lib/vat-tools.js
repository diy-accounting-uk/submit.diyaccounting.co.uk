// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// vat-tools.js -- derive_vat_return: the nine VAT boxes for one obligation
// period, read from the Ltd engine's own Vatreturns.xlsx!Vatinterface
// results, with the HMRC field names, HMRC's rounding, and the journal
// lines that fed each box. The mapping is written out in
// PLAN_SUBMISSION_MCP.md ("From a book to the nine VAT boxes"); nothing here
// computes VAT that the engine has not already computed.

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { isStraddlingLine, LTD_PURCHASE_CODE_MAP, LTD_SALES_CODE_MAP } from "@diy-accounting-uk/diya-gl/dist/app/lib/scenario-extractor.js";

// The Ltd engine's one VAT rate (calculators/ltd.js VAT_RATE), applied to
// every sales and purchases journal line whatever its own taxCode says.
const ENGINE_VAT_RATE = 0.2;

const INTERFACE_SHEET = "Vatreturns.xlsx!Vatinterface";
const INTERFACE_FIRST_ROW = 4;
const INTERFACE_LAST_ROW = 20;
const INTERFACE_FIRST_QUARTER_ROW = 6;
const MONTHS_IN_QUARTER = 3;

// Excel's day serials count from 1899-12-30; the engine stores every
// interface date that way.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export function isoFromSerial(serial) {
  return new Date(EXCEL_EPOCH_MS + Math.round(serial) * DAY_MS).toISOString().slice(0, 10);
}

function isoDate(value) {
  if (value === undefined || value === null) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function firstOfMonthsBefore(isoMonthEnd, monthsBefore) {
  const [year, month] = isoMonthEnd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 - monthsBefore, 1)).toISOString().slice(0, 10);
}

function monthKey(isoDay) {
  return isoDay.slice(0, 7);
}

function pence(value) {
  return Math.round(value * 100) / 100;
}

function pounds(value) {
  return Math.round(value);
}

// The engine's own split: VAT is gross × percent ÷ (100 + percent), net is
// the rest (calculators/ltd.js sheetVat / sheetNet).
function splitGross(gross) {
  const percent = ENGINE_VAT_RATE * 100;
  const vat = (gross * percent) / (100 + percent);
  return { vat, net: gross - vat };
}

function requireLoaded(session) {
  if (!session.book || !session.lines) {
    throw new Error("No book is loaded. Call open_book first.");
  }
}

/**
 * The interface rows the engine built for this book: one per period end,
 * with the quarter sums the return boxes read.
 * @param {Object} results - calculatedResultsFor() output
 * @returns {Array<{row: number, periodEnd: string, dueDate: string, quarter: Object|null, flatRate: number}>}
 */
export function interfaceRows(results) {
  const sheet = results[INTERFACE_SHEET];
  if (!sheet) throw new Error("The book's product carries no VAT interface; only a Company (ltd) book answers a VAT return");
  const rows = [];
  for (let row = INTERFACE_FIRST_ROW; row <= INTERFACE_LAST_ROW; row++) {
    const hasQuarter = row >= INTERFACE_FIRST_QUARTER_ROW;
    rows.push({
      row,
      periodEnd: isoFromSerial(sheet[`B${row}`]),
      dueDate: isoFromSerial(sheet[`C${row}`]),
      month: {
        salesNet: sheet[`D${row}`] || 0,
        salesVat: sheet[`F${row}`] || 0,
        purchasesNet: sheet[`H${row}`] || 0,
        purchasesVat: sheet[`J${row}`] || 0,
      },
      quarter: hasQuarter
        ? {
            salesNet: sheet[`E${row}`] || 0,
            salesVat: sheet[`G${row}`] || 0,
            purchasesNet: sheet[`I${row}`] || 0,
            purchasesVat: sheet[`K${row}`] || 0,
          }
        : null,
      flatRate: sheet[`M${row}`] || 0,
    });
  }
  return rows;
}

function lineContribution(line, box) {
  const { vat, net } = splitGross(line.amount);
  return {
    entryNumber: line.entryNumber,
    lineNumber: line.lineNumber ?? null,
    date: line.postingDate,
    account: line.accountMainID,
    reference: line.documentReference ?? null,
    counterparty: line.detailComment ?? null,
    gross: pence(line.amount),
    contributes: pence(box === "vat" ? vat : net),
  };
}

// The journal lines behind one quarter, bucketed the way the engine's month
// tabs and straddling sheets take them: a line without diya-gl:vatPeriodEnd
// lands on the month its postingDate names; a line with it lands on the
// interface row carrying that period end.
function linesForQuarter(lines, quarterRows) {
  const monthEnds = new Set(quarterRows.map((r) => r.periodEnd));
  const months = new Set(quarterRows.map((r) => monthKey(r.periodEnd)));
  const inQuarter = (line) => {
    if (isStraddlingLine(line)) return monthEnds.has(isoDate(line["diya-gl:vatPeriodEnd"]));
    return months.has(monthKey(line.postingDate));
  };
  const sales = lines.filter((l) => l.sourceJournalID === "sales" && LTD_SALES_CODE_MAP[l.accountMainID] && inQuarter(l));
  const purchases = lines.filter((l) => l.sourceJournalID === "purchases" && LTD_PURCHASE_CODE_MAP[l.accountMainID] && inQuarter(l));
  return { sales, purchases };
}

function sumContributions(lines, part) {
  return lines.reduce((total, line) => total + splitGross(line.amount)[part], 0);
}

function reconcile(label, attributed, engine) {
  if (Math.abs(attributed - engine) > 0.005) {
    throw new Error(
      `The lines attributed to ${label} sum to ${pence(attributed)} but the book's VAT interface carries ${pence(engine)}; ` +
        "a line is dated outside the accounting year or posts to a month the interface does not carry, so this return cannot be derived",
    );
  }
}

/**
 * derive_vat_return: the nine boxes for the quarter ending on periodEnd,
 * from the session's loaded book.
 * @param {Object} session
 * @param {{periodEnd: string, periodStart?: string, periodKey?: string}} params
 */
export async function deriveVatReturn(session, { periodEnd, periodStart, periodKey } = {}) {
  requireLoaded(session);
  if (!periodEnd) throw new Error("derive_vat_return requires periodEnd (the obligation's period end, YYYY-MM-DD)");
  const { book, lines } = session;
  const entity = book.entityInformation ?? {};
  if (entity["diya-gl:vatRegistered"] !== true) {
    throw new Error(
      "The book does not declare the company VAT registered (entityInformation diya-gl:vatRegistered), so it carries no VAT return",
    );
  }

  const taxData = await loadTaxDataForBook(book);
  const results = calculatedResultsFor(book, lines, taxData);
  const rows = interfaceRows(results);
  const wantedEnd = isoDate(periodEnd);
  const index = rows.findIndex((r) => r.periodEnd === wantedEnd);
  if (index < 0) {
    throw new Error(
      `The book carries no VAT period ending ${wantedEnd}; it answers periods ending ${rows.map((r) => r.periodEnd).join(", ")}`,
    );
  }
  const row = rows[index];
  if (!row.quarter) {
    throw new Error(
      `The period ending ${wantedEnd} is before the book's accounting year; the earliest quarter this book answers ends ${rows[INTERFACE_FIRST_QUARTER_ROW - INTERFACE_FIRST_ROW].periodEnd}`,
    );
  }
  const expectedStart = firstOfMonthsBefore(wantedEnd, MONTHS_IN_QUARTER - 1);
  if (periodStart && isoDate(periodStart) !== expectedStart) {
    throw new Error(
      `The book answers three-month periods ending on a month end; ${isoDate(periodStart)} to ${wantedEnd} is not one, the quarter ending ${wantedEnd} starts ${expectedStart}`,
    );
  }

  const quarterRows = rows.slice(index - (MONTHS_IN_QUARTER - 1), index + 1);
  const { sales, purchases } = linesForQuarter(lines, quarterRows);
  reconcile("box 1", sumContributions(sales, "vat"), row.quarter.salesVat);
  reconcile("box 4", sumContributions(purchases, "vat"), row.quarter.purchasesVat);
  reconcile("box 6", sumContributions(sales, "net"), row.quarter.salesNet);
  reconcile("box 7", sumContributions(purchases, "net"), row.quarter.purchasesNet);

  const flatRate = row.flatRate > 0;
  const box1 = pence(row.quarter.salesVat);
  const box2 = 0;
  const box3 = pence(box1 + box2);
  const box4 = pence(row.quarter.purchasesVat);
  const box5 = pence(box3 - box4);
  const box6 = pounds(row.quarter.salesNet + (flatRate ? row.quarter.salesVat : 0));
  const box7 = pounds(row.quarter.purchasesNet);
  const box8 = 0;
  const box9 = 0;

  return {
    vatRegistrationNumber: entity["diya-gl:vatNumber"] ?? null,
    periodKey: periodKey ?? null,
    periodStart: expectedStart,
    periodEnd: wantedEnd,
    dueDate: row.dueDate,
    scheme: flatRate ? "flat-rate" : "standard",
    months: quarterRows.map((r) => ({
      periodEnd: r.periodEnd,
      salesNet: pence(r.month.salesNet),
      salesVat: pence(r.month.salesVat),
      purchasesNet: pence(r.month.purchasesNet),
      purchasesVat: pence(r.month.purchasesVat),
    })),
    boxes: { box1, box2, box3, box4, box5, box6, box7, box8, box9 },
    hmrc: {
      vatDueSales: box1,
      vatDueAcquisitions: box2,
      totalVatDue: box3,
      vatReclaimedCurrPeriod: box4,
      netVatDue: box5,
      totalValueSalesExVAT: box6,
      totalValuePurchasesExVAT: box7,
      totalValueGoodsSuppliedExVAT: box8,
      totalAcquisitionsExVAT: box9,
    },
    lines: {
      box1: sales.map((l) => lineContribution(l, "vat")),
      box4: purchases.map((l) => lineContribution(l, "vat")),
      box6: sales.map((l) => lineContribution(l, "net")),
      box7: purchases.map((l) => lineContribution(l, "net")),
    },
    notes: [
      `The engine applies ${ENGINE_VAT_RATE * 100}% to every sales and purchases journal line; the lines' own taxCode and taxRate are not read.`,
      "Boxes 2, 8 and 9 are nil: the book carries no EU acquisitions or supplies.",
      "Boxes 1 to 5 are to the penny and boxes 6 to 9 whole pounds; box 5 is the rounded box 3 less the rounded box 4.",
    ],
  };
}
