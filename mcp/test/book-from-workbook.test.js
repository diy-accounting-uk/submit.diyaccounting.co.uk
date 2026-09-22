// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// book-from-workbook.test.js -- bookFromWorkbookSet over the public "Precision
// Code Ltd" Company example the spreadsheets repository ships (invented data,
// no copy held in this repository): the workbooks are copied into a scratch
// directory per test and removed afterwards, the same way book-tools.test.js
// reaches its own example books.

import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";

import { applyCellWrites } from "@diy-accounting-uk/diya-gl/dist/app/lib/spreadsheet-runner.js";

import { bookFromWorkbookSet, toToml } from "../lib/finance/book-from-workbook.js";

// This workspace's sibling checkout of the spreadsheets repository; never
// copied into this repository. Currentaccount.xlsx carries no line data
// this module reads -- it is here only so the package sniffs as "ltd"
// rather than "se", the same hub-plus-Currentaccount.xlsx check the
// published engine itself runs.
// The spreadsheets repository's public Ltd example set (examples/ltd-latest, an invented
// company), copied here so the test runs in a clean checkout.
const EXAMPLE_DIR = new URL("./fixtures/finance/ltd-example/", import.meta.url).pathname;
const EXAMPLE_FILES = [
  "Financialaccounts.xlsx",
  "Sales.xlsx",
  "Purchases.xlsx",
  "Fixedassets.xlsx",
  "Companysecretary.xlsx",
  "Currentaccount.xlsx",
];

let scratch;
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "diya-book-from-workbook-"));
  for (const name of EXAMPLE_FILES) copyFileSync(join(EXAMPLE_DIR, name), join(scratch, name));
});
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("bookFromWorkbookSet", () => {
  it("seeds a v2 book from the public Company example package", async () => {
    const book = await bookFromWorkbookSet({ dir: scratch });

    expect(book.entityInformation["diya-gl:product"]).toBe("Company");
    expect(book.entityInformation.organizationIdentifier).toBe("Precision Code Ltd");
    expect(book.entityInformation["diya-gl:companyNumber"]).toBe("12345678");

    expect(book.openingBalances.tradeCreditors).toBeGreaterThan(0);
    expect(book.creditors.length).toBeGreaterThan(0);
    expect(book.debtors.length).toBeGreaterThan(0);
    expect(book.fixedAssets.length).toBeGreaterThan(0);
    expect(book.members.length).toBeGreaterThan(0);
    expect(book.dividends.length).toBeGreaterThan(0);

    for (const code of Object.keys(book.accounts.sales)) expect(code).toMatch(/^\d{4}$/);
    for (const code of Object.keys(book.accounts.purchases)) expect(code).toMatch(/^\d{4}$/);
  });

  it("restores the leading zero the OpenAccounts company-number cell drops", async () => {
    // The example's own company number is already eight digits, so this
    // proves the fix by writing a seven-digit one over it with the
    // package's own cell writer, not by relying on a real workbook's quirk.
    const path = join(scratch, "Financialaccounts.xlsx");
    const patched = await applyCellWrites(readFileSync(path), { OpenAccounts: { E3: 1234567 } });
    writeFileSync(path, patched);

    const book = await bookFromWorkbookSet({ dir: scratch });
    expect(book.entityInformation["diya-gl:companyNumber"]).toBe("01234567");
  });

  it("requires a dir", async () => {
    await expect(bookFromWorkbookSet({})).rejects.toThrow(/requires a dir/);
  });

  it("throws when the directory carries no Company workbook set", async () => {
    const empty = mkdtempSync(join(tmpdir(), "diya-book-from-workbook-empty-"));
    try {
      await expect(bookFromWorkbookSet({ dir: empty })).rejects.toThrow();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("toToml", () => {
  it("round-trips the seeded book through smol-toml", async () => {
    const book = await bookFromWorkbookSet({ dir: scratch });
    const toml = toToml(book);
    expect(toml).toContain("Precision Code Ltd");
    const parsed = parseToml(toml);
    expect(parsed.entityInformation.organizationIdentifier).toBe("Precision Code Ltd");
    expect(parsed.openingBalances.tradeCreditors).toBe(book.openingBalances.tradeCreditors);
  });
});
