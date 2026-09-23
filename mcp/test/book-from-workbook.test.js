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

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

import { bookFromWorkbookSet, openingBankBalanceLines, openingJournalLines, toToml } from "../lib/finance/book-from-workbook.js";

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

// The opening balances DIY Accounting Limited's own 1 April 2026 balance
// sheet carries, taken from the 2025-2026 accounts' closing control
// (drive/DIY Accounting Limited/finance/2025-2026 accounts/Financialaccounts.xlsx,
// OpenAccounts sheet, closing column). directorsLoan is negative: the
// director owed the company money at that date, the opposite of the
// account's normal credit side.
const DIYA_OPENING_BOOK = {
  documentInfo: { periodCoveredStart: "2026-04-01" },
  accounts: {
    bank: {
      1200: { accountMainDescription: "Current account", accountType: "bank" },
      1210: { accountMainDescription: "Savings account", accountType: "bank" },
      1220: { accountMainDescription: "Cash account", accountType: "bank" },
      1230: { accountMainDescription: "Credit card account", accountType: "bank" },
    },
    capital: {
      3000: { accountMainDescription: "Share capital" },
      3100: { accountMainDescription: "Retained earnings" },
      3200: { accountMainDescription: "Dividends due" },
    },
    liabilities: {
      2300: { accountMainDescription: "Corporation Tax liability" },
    },
  },
  openingBalances: {
    corporationTaxDue: 717.06,
    dividendsDue: 660.0,
    directorsLoan: -443.29,
    shareCapital: 100.0,
    retainedEarnings: 58.5,
    bankAccounts: { 1200: 903.18, 1210: 246.82, 1220: 94.27, 1230: 136.47 },
  },
};

describe("openingJournalLines", () => {
  it("emits one journal line per opening balance, on its account's normal side", () => {
    const { lines } = openingJournalLines(DIYA_OPENING_BOOK);

    expect(lines).toHaveLength(9);
    for (const line of lines) {
      expect(line.sourceJournalID).toBe("journal");
      expect(line.postingDate).toBe("2026-04-01");
      expect(line.documentReference).toMatch(/^OB-/);
    }

    const bank1200 = lines.find((line) => line.accountMainID === "1200");
    expect(bank1200).toMatchObject({ amount: 903.18, debitCreditCode: "D" });

    const corporationTax = lines.find((line) => line.accountMainID === "2300");
    expect(corporationTax).toMatchObject({ amount: 717.06, debitCreditCode: "C" });
  });

  it("flips a balance sitting on the opposite of its account's normal side", () => {
    const { lines } = openingJournalLines(DIYA_OPENING_BOOK);
    const directorsLoan = lines.find((line) => line.accountMainID === "2500");
    // directorsLoan is normally a credit (2500 is a liability); a negative
    // figure means the director owed the company, so this balance sits on
    // the debit side instead.
    expect(directorsLoan).toMatchObject({ amount: 443.29, debitCreditCode: "D" });
  });

  it("declares an account book.toml does not already carry, from the fixed account map", () => {
    expect(DIYA_OPENING_BOOK.accounts.liabilities["2500"]).toBeUndefined();
    const { book } = openingJournalLines(DIYA_OPENING_BOOK);
    expect(book.accounts.liabilities["2500"]).toMatchObject({ accountMainDescription: "Directors loan" });
    // The input book is not mutated.
    expect(DIYA_OPENING_BOOK.accounts.liabilities["2500"]).toBeUndefined();
  });

  it("emits lines that validate against the diya-gl lines schema and the declared book", () => {
    const { book, lines } = openingJournalLines(DIYA_OPENING_BOOK);
    const result = validateLines(lines, book);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("requires documentInfo.periodCoveredStart", () => {
    expect(() => openingJournalLines({ openingBalances: {} })).toThrow(/periodCoveredStart/);
  });

  it("rejects an opening balance account it has no mapping for", () => {
    const withUnknown = { ...DIYA_OPENING_BOOK, openingBalances: { ...DIYA_OPENING_BOOK.openingBalances, unknownAccount: 1 } };
    expect(() => openingJournalLines(withUnknown)).toThrow(/unknownAccount.*no opening journal account mapping/);
  });
});

describe("openingBankBalanceLines", () => {
  it("emits one BC-coded bank line per opening bank balance, dated the period's first day", () => {
    const lines = openingBankBalanceLines(DIYA_OPENING_BOOK);

    expect(lines).toHaveLength(4);
    const current = lines.find((line) => line.accountMainID === "1200");
    expect(current).toMatchObject({ sourceJournalID: "bank", postingDate: "2026-04-01", amount: 903.18 });
  });

  it("codes every line D, since every DIYA bank balance is money the account holds", () => {
    const lines = openingBankBalanceLines(DIYA_OPENING_BOOK);
    for (const line of lines) {
      expect(line["diya-gl:bankCode"]).toBe("BC");
      expect(line.debitCreditCode).toBe("D");
      expect(line["diya-gl:bankAccountID"]).toBe(line.accountMainID);
    }
  });

  it("carries each account's opening figure from book.openingBalances.bankAccounts", () => {
    const lines = openingBankBalanceLines(DIYA_OPENING_BOOK);
    const byAccount = Object.fromEntries(lines.map((line) => [line.accountMainID, line.amount]));
    expect(byAccount).toEqual({ 1200: 903.18, 1210: 246.82, 1220: 94.27, 1230: 136.47 });
  });

  it("emits lines that validate against the diya-gl lines schema", () => {
    const lines = openingBankBalanceLines(DIYA_OPENING_BOOK);
    const result = validateLines(lines, DIYA_OPENING_BOOK);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("requires documentInfo.periodCoveredStart", () => {
    expect(() => openingBankBalanceLines({ openingBalances: { bankAccounts: { 1200: 1 } } })).toThrow(/periodCoveredStart/);
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
