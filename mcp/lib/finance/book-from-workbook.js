// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// book-from-workbook.js -- seeds a diya-gl book.toml (entity information,
// chart of accounts, opening balances, debtors, creditors, fixed assets,
// dividends and members) from a complete Company package's workbook set:
// the files a finished trading year leaves in the Drive mirror's
// finance/<year-end> accounts/ folder. Every figure and every register
// comes from the package's own workbooks, read through the published
// @diy-accounting-uk/diya-gl engine's own multi-file extractors; nothing
// here parses a spreadsheet cell of its own.

import { workbookSetFromDirectory } from "@diy-accounting-uk/diya-gl/dist/app/lib/workbook-set.js";
import { sniffProduct } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { extractBook, extractLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/xlsx-exporter.js";
import { validateBook, validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";
import { stampBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/provenance.js";
import { productModule } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";
import { stringify } from "smol-toml";

// The OpenAccounts sheet carries the Companies House number in a cell
// Excel stores as a plain number, so a number starting "0" (06846849) reads
// back seven digits, not eight. The schema's eight-digit pattern is the
// real requirement; the fix is to restore the digit the cell's own General
// number format dropped, not to relax the pattern.
function restoreLeadingZero(book) {
  const raw = book.entityInformation?.["diya-gl:companyNumber"];
  if (typeof raw === "string" && /^\d{1,7}$/.test(raw)) {
    book.entityInformation["diya-gl:companyNumber"] = raw.padStart(8, "0");
  }
}

/**
 * Seed a book.toml from a Company package's workbook set: the entity
 * information, chart of accounts, opening balances, debtors, creditors,
 * fixed asset register, dividends and register of members the year's own
 * workbooks carry (Financialaccounts.xlsx, Fixedassets.xlsx,
 * Companysecretary.xlsx, alongside the Sales, Purchases and bank workbooks
 * the chart of accounts and the opening balance sheet are read against),
 * stamped and validated against the published v2 book schema.
 *
 * @param {{dir: string}} params - the directory holding the package's
 *   workbooks, read as loose files rather than a zipped package
 * @returns {Promise<Object>} the validated, stamped book
 */
export async function bookFromWorkbookSet({ dir } = {}) {
  if (!dir) throw new Error("bookFromWorkbookSet requires a dir");

  const set = await workbookSetFromDirectory(dir);
  const product = await sniffProduct(set, dir);
  if (product !== "ltd") {
    throw new Error(`${dir} sniffs as a "${product}" package, not a Company ("ltd") package`);
  }

  const lines = await extractLines(set, product);
  const book = await extractBook(set, product, lines, productModule(product).CELL_MAP);
  restoreLeadingZero(book);
  const stamped = stampBook(book);

  const result = validateBook(stamped);
  if (!result.valid) {
    throw new Error(`${dir} does not extract to a book that conforms to the published v2 book schema: ${result.errors.join("; ")}`);
  }

  return stamped;
}

/**
 * The book as TOML text, in the shape book.toml is written.
 * @param {Object} book
 * @returns {string}
 */
export function toToml(book) {
  return stringify(book);
}

// A Ltd book's opening balance sheet is read only from an opening journal
// (sourceJournalID "journal", documentReference starting "OB-"; see
// isOpeningBalanceLine and buildOpeningBalance,
// ../spreadsheets.diyaccounting.co.uk/app/lib/scenario-extractor.js lines
// 237 and 252) -- never from book.toml's own [openingBalances] table, which
// the loader reads for the "bst" product alone. This mirrors the engine's
// own OA_JOURNAL_MAP (app/lib/xlsx-exporter.js line 1097), which extracts
// the same journal from a completed package's OpenAccounts sheet: same
// account codes, same natural side, same "Opening balances" comment.
//
// Keyed by the v2 book field name toV2OpeningBalances() writes
// (scenario-extractor.js line 284) so a book.toml built from either that
// function or a hand-maintained [openingBalances] table carries lines this
// map can find every account for.
const OPENING_JOURNAL_ACCOUNTS = {
  stock: { accountMainID: "1100", section: "assets", normalSide: "D", comment: "Opening stock" },
  tradeDebtors: { accountMainID: "1300", section: "assets", normalSide: "D", comment: "Trade debtors" },
  longTermDebtors: { accountMainID: "1400", section: "assets", normalSide: "D", comment: "Long term debtors" },
  tradeCreditors: { accountMainID: "2100", section: "liabilities", normalSide: "C", comment: "Trade creditors" },
  netWagesDue: { accountMainID: "2150", section: "liabilities", normalSide: "C", comment: "Net wages due" },
  wageDeductionsDue: { accountMainID: "2160", section: "liabilities", normalSide: "C", comment: "Wage deductions due" },
  vatDue: { accountMainID: "2200", section: "liabilities", normalSide: "C", comment: "VAT liability" },
  corporationTaxDue: { accountMainID: "2300", section: "liabilities", normalSide: "C", comment: "Corporation Tax liability" },
  payeDue: { accountMainID: "2400", section: "liabilities", normalSide: "C", comment: "PAYE due" },
  cisDue: { accountMainID: "2410", section: "liabilities", normalSide: "C", comment: "CIS due" },
  directorsLoan: { accountMainID: "2500", section: "liabilities", normalSide: "C", comment: "Directors loan" },
  longTermCreditors: { accountMainID: "2600", section: "liabilities", normalSide: "C", comment: "Long term creditors" },
  shareCapital: { accountMainID: "3000", section: "capital", normalSide: "C", comment: "Share capital" },
  retainedEarnings: { accountMainID: "3100", section: "capital", normalSide: "C", comment: "Retained earnings" },
  dividendsDue: { accountMainID: "3200", section: "capital", normalSide: "C", comment: "Dividends due" },
  capitalReserves: { accountMainID: "3300", section: "capital", normalSide: "C", comment: "Capital reserves" },
};

const OPENING_JOURNAL_BANK_ACCOUNTS = {
  1200: "Current account opening balance",
  1210: "Savings account opening balance",
  1220: "Cash account opening balance",
  1230: "Credit card account opening balance",
};

const OPENING_BALANCE_DOCUMENT_PREFIX = "OB-";

function toIsoDateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function flipSide(side) {
  return side === "D" ? "C" : "D";
}

// Adds a chart-of-accounts entry for an opening balance account book.toml
// does not already declare, the way a real package's own extractBook run
// would (a directors' loan account exists in book.accounts.liabilities as
// soon as a workbook set's OpenAccounts sheet carries a non-zero balance
// for it). The account code and section come from OPENING_JOURNAL_ACCOUNTS
// / OPENING_JOURNAL_BANK_ACCOUNTS above, never invented here.
function withDeclaredAccount(accounts, section, code, description) {
  const declared = accounts[section] || {};
  if (declared[code]) return accounts;
  const withDescription =
    section === "bank" ? { accountMainDescription: description, accountType: "bank" } : { accountMainDescription: description };
  return { ...accounts, [section]: { ...declared, [code]: withDescription } };
}

/**
 * Builds the opening journal a Ltd book's balance sheet is read from, out
 * of book.openingBalances (the scalars and the bankAccounts table), and
 * declares any account referenced there that book.accounts does not
 * already carry.
 * @param {Object} book - a book with documentInfo.periodCoveredStart and openingBalances
 * @returns {{book: Object, lines: Array<Object>}} the book with any missing
 *   accounts declared, and the validated opening journal lines
 */
export function openingJournalLines(book) {
  const periodStart = toIsoDateString(book?.documentInfo?.periodCoveredStart);
  if (!periodStart) {
    throw new Error("openingJournalLines requires book.documentInfo.periodCoveredStart");
  }
  const openingBalances = book.openingBalances || {};

  const entries = [];
  for (const [key, value] of Object.entries(openingBalances)) {
    if (key === "bankAccounts" || key === "fixedAssetCost" || key === "fixedAssetDepreciation") continue;
    const account = OPENING_JOURNAL_ACCOUNTS[key];
    if (!account) {
      throw new Error(`book.openingBalances.${key} has no opening journal account mapping in OPENING_JOURNAL_ACCOUNTS`);
    }
    entries.push({ ...account, value });
  }
  for (const [code, value] of Object.entries(openingBalances.bankAccounts || {})) {
    const comment = OPENING_JOURNAL_BANK_ACCOUNTS[code];
    if (!comment) {
      throw new Error(`book.openingBalances.bankAccounts.${code} has no opening journal account mapping in OPENING_JOURNAL_BANK_ACCOUNTS`);
    }
    entries.push({ accountMainID: code, section: "bank", normalSide: "D", comment, value });
  }

  let accounts = book.accounts || {};
  for (const entry of entries) accounts = withDeclaredAccount(accounts, entry.section, entry.accountMainID, entry.comment);
  const updatedBook = { ...book, accounts };

  const lines = entries.map((entry) => ({
    entryNumber: `${OPENING_BALANCE_DOCUMENT_PREFIX}${entry.accountMainID}`,
    sourceJournalID: "journal",
    postingDate: periodStart,
    accountMainID: entry.accountMainID,
    amount: Math.abs(entry.value),
    documentType: "journal",
    documentReference: `${OPENING_BALANCE_DOCUMENT_PREFIX}001`,
    detailComment: "Opening balances",
    lineItemComment: entry.comment,
    taxCode: "OS",
    taxRate: 0,
    debitCreditCode: entry.value >= 0 ? entry.normalSide : flipSide(entry.normalSide),
  }));

  const { valid, errors } = validateLines(lines, updatedBook);
  if (!valid) {
    throw new Error(`Opening journal lines failed validation:\n${errors.join("\n")}`);
  }
  return { book: updatedBook, lines };
}
