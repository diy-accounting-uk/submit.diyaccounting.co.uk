// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// package-writer.test.js -- writeFinancePackage over the "BrickWork Pro Ltd"
// example book this repository already ships for book-tools.test.js: a
// small, synthetic Company book (171 lines). The workbook templates are read
// from the sibling spreadsheets repository's own app/ directory rather than
// fetched over the network, the same sibling-workspace assumption
// mail-invoices.js's findWorkspaceRoot already makes. The written package is
// read back with bookFromWorkbookSet, so the figures asserted are read from
// the workbook cells the package writer wrote, not recomputed from the book.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { findWorkspaceRoot } from "../lib/finance/mail-invoices.js";
import { bookFromWorkbookSet } from "../lib/finance/book-from-workbook.js";
import { writeFinancePackage } from "../lib/finance/package-writer.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const BOOK_PATH = resolve(MODULE_DIR, "fixtures", "brickwork-pro-ltd-vat");

let templatePackagePath;
beforeAll(() => {
  const workspaceRoot = findWorkspaceRoot(MODULE_DIR, "diy-accounting-limited", existsSync);
  templatePackagePath = resolve(workspaceRoot, "spreadsheets.diyaccounting.co.uk", "app");
});

let scratch;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe("writeFinancePackage", { timeout: 60000 }, () => {
  it("writes the Company package's workbooks under a dirName the package's own naming produces", async () => {
    scratch = mkdtempSync(join(tmpdir(), "diya-package-writer-"));

    const result = await writeFinancePackage({ bookPath: BOOK_PATH, templatePackagePath, outputDir: scratch });

    expect(result.product).toBe("ltd");
    expect(result.dirName).toMatch(/^GB Accounts Company 2026-03-31/);
    expect(result.outputDir).toBe(join(scratch, result.dirName));
    expect(result.files).toEqual(
      expect.arrayContaining(["Financialaccounts.xlsx", "Sales.xlsx", "Purchases.xlsx", "Fixedassets.xlsx", "Companysecretary.xlsx"]),
    );
    for (const file of result.files) {
      expect(existsSync(join(result.outputDir, file))).toBe(true);
    }
  });

  it("writes figures a completed package's own workbooks read back correctly", async () => {
    scratch = mkdtempSync(join(tmpdir(), "diya-package-writer-"));

    const result = await writeFinancePackage({ bookPath: BOOK_PATH, templatePackagePath, outputDir: scratch });
    const book = await bookFromWorkbookSet({ dir: result.outputDir });

    expect(book.entityInformation.organizationIdentifier).toBe("BrickWork Pro Ltd");
    expect(book.entityInformation["diya-gl:companyNumber"]).toBe("87654321");
    expect(book.openingBalances.tradeCreditors).toBe(2718);
    expect(book.openingBalances.tradeDebtors).toBe(11880);
    expect(book.openingBalances.stock).toBe(3000);
    expect(book.debtors.length).toBeGreaterThan(0);
  });

  it("accepts an already-loaded book and lines instead of bookPath", async () => {
    scratch = mkdtempSync(join(tmpdir(), "diya-package-writer-"));
    const { loadDiyaGlData } = await import("@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js");
    const { book, lines } = loadDiyaGlData(BOOK_PATH);

    const result = await writeFinancePackage({ book, lines, templatePackagePath, outputDir: scratch });

    expect(result.product).toBe("ltd");
    expect(existsSync(join(result.outputDir, "Financialaccounts.xlsx"))).toBe(true);
  });

  it("requires outputDir", async () => {
    await expect(writeFinancePackage({ bookPath: BOOK_PATH, templatePackagePath })).rejects.toThrow(/requires outputDir/);
  });

  it("requires bookPath, or book and lines", async () => {
    scratch = mkdtempSync(join(tmpdir(), "diya-package-writer-"));
    await expect(writeFinancePackage({ templatePackagePath, outputDir: scratch })).rejects.toThrow(/requires bookPath, or book and lines/);
  });

  it("refuses a bookPath that does not exist", async () => {
    scratch = mkdtempSync(join(tmpdir(), "diya-package-writer-"));
    await expect(
      writeFinancePackage({ bookPath: join(MODULE_DIR, "fixtures", "no-such-book"), templatePackagePath, outputDir: scratch }),
    ).rejects.toThrow(/No such file or directory/);
  });
});
