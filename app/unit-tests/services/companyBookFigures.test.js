// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companyBookFigures.test.js

import { describe, test, expect } from "vitest";
import { join } from "node:path";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { deriveCompanyBookFigures } from "@app/services/microEntityAccounts.js";
import { cashAtBankFromResults } from "@app/services/microEntityAccountsFromResults.js";

const BOOK_DIRECTORY = join(process.cwd(), "fixtures", "diya-gl", "precision-code-ltd");

describe("cashAtBankFromResults", () => {
  test("adds the closing trial balance cells of accounts 1200, 1210, 1220 and 1230 to the penny", () => {
    const results = { TrialBalance: { EJ22: 1000.1, EJ23: 500.2, EJ24: -50.05, EJ25: 10 } };
    expect(cashAtBankFromResults(results)).toBe(1460.25);
  });

  test("reads a missing cell as zero", () => {
    expect(cashAtBankFromResults({ TrialBalance: { EJ22: 12.5 } })).toBe(12.5);
  });

  test("refuses results with no trial balance", () => {
    expect(() => cashAtBankFromResults({})).toThrow(/trial balance/);
  });
});

describe("deriveCompanyBookFigures", () => {
  test("gives the cash across the bank accounts of the precision-code-ltd book beside its accounts", async () => {
    const { book, lines } = loadDiyaGlData(BOOK_DIRECTORY);
    const { accounts, cashAtBank } = await deriveCompanyBookFigures({ book, lines });
    expect(cashAtBank).toBe(192995.43);
    expect(accounts.balanceSheet.currentYear).toBeDefined();
  });

  test("refuses a session with no book", async () => {
    await expect(deriveCompanyBookFigures({})).rejects.toThrow(/No book is loaded/);
  });
});
