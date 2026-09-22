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
import { validateBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";
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
