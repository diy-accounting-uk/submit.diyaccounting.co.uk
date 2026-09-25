// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// accounts-tools.test.js -- derive_micro_entity_accounts over the two
// example company books: the current-year lines equal the engine's
// published balance sheet, the prior-year lines equal its opening balance
// sheet, the filing's identity holds after rounding, BrickWork Pro's lines
// render through buildMicroEntityAccounts, and an unbalanced sheet is
// refused.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { diyaGlToScenario } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { loadTaxDataForBook, productOf } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";

import { buildMicroEntityAccounts } from "../../app/services/microEntityAccountsIxbrl.js";
import {
  BALANCE_SHEET_LINES,
  deriveMicroEntityAccounts,
  linesFromOpeningBalance,
  linesFromPublishedBalanceSheet,
  profitAndLossFromPublishedAccount,
  roundForFiling,
} from "../lib/accounts-tools.js";
import { createSession, openBook } from "../lib/book-tools.js";
import { TOOLS } from "../lib/server.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

const EXAMPLES = [
  { name: "BrickWork Pro Ltd", dir: "brickwork-pro-ltd-vat", companyNumber: "87654321", director: "Mike Brown", employees: 2 },
  { name: "Precision Code Ltd", dir: "precision-code-ltd-full", companyNumber: "12345678", director: "Carol Smith", employees: 3 },
];

const netAssetsOf = (year) => year.fixedAssets + year.currentAssets - year.creditorsWithinOneYear - year.creditorsAfterOneYear;

let scratch;
beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "diya-submit-accounts-"));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("derive_micro_entity_accounts", () => {
  for (const example of EXAMPLES) {
    describe(example.name, () => {
      let session;
      let results;
      let opening;
      let answer;
      beforeAll(async () => {
        session = createSession();
        await openBook(session, { path: join(FIXTURES, example.dir) });
        results = calculatedResultsFor(session.book, session.lines, await loadTaxDataForBook(session.book));
        opening = diyaGlToScenario(session.book, session.lines, productOf(session.book)).opening_balance;
        answer = await deriveMicroEntityAccounts(session);
      });

      it("takes the company, the period, the director and the employee count from the book", () => {
        expect(answer.companyNumber).toBe(example.companyNumber);
        expect(answer.companyName).toBe(example.name);
        expect(answer.periodStart).toBe("2025-04-01");
        expect(answer.periodEnd).toBe("2026-03-31");
        expect(answer.priorBalanceSheetDate).toBe("2025-03-31");
        expect(answer.directorName).toBe(example.director);
        expect(answer.averageNumberOfEmployees).toBe(example.employees);
        expect(answer.dormant).toBe(false);
      });

      it("answers the current year from the published balance sheet, in whole pounds", () => {
        const sheet = results.PubBalSht;
        const year = answer.balanceSheet.currentYear;
        expect(Object.keys(year).sort()).toEqual([...BALANCE_SHEET_LINES].sort());
        expect(year.fixedAssets).toBe(Math.round(sheet.F6));
        expect(year.currentAssets).toBe(Math.round(sheet.E13));
        expect(year.creditorsWithinOneYear).toBe(Math.round(sheet.E20));
        expect(year.creditorsAfterOneYear).toBe(Math.round(sheet.F31));
        expect(year.calledUpShareCapital).toBe(Math.round(sheet.F36));
        expect(Math.abs(year.capitalAndReserves - sheet.F39)).toBeLessThan(2.5);
        expect(Math.abs(year.profitAndLossAccount - (sheet.F39 - sheet.F36))).toBeLessThan(2.5);
        expect(netAssetsOf(year)).toBe(year.capitalAndReserves);
        expect(year.capitalAndReserves - year.calledUpShareCapital).toBe(year.profitAndLossAccount);
        for (const value of Object.values(year)) expect(Number.isInteger(value)).toBe(true);
      });

      it("answers the prior year from the opening balance sheet the engine shows", () => {
        // The OpenAccounts sheet displays the common rows; the opening
        // balances it does not display (long-term debtors and creditors,
        // wages and dividends due, a capital reserve) still count in its own
        // accuracy check, so they count here too.
        const open = results.OpenAccounts;
        const at = (key) => opening[key] || 0;
        const year = answer.balanceSheet.priorYear;
        expect(year.fixedAssets).toBe(Math.round(open.E13));
        expect(year.currentAssets).toBe(Math.round(open.E15 + open.E16 + open.E18 + at("long_term_debtors")));
        expect(year.creditorsWithinOneYear).toBe(
          Math.round(open.E20 + open.E24 + open.E26 + at("net_wages_due") + at("wage_deductions_due") + at("dividends_due")),
        );
        expect(year.creditorsAfterOneYear).toBe(Math.round(open.E30 + at("long_term_creditors")));
        expect(year.calledUpShareCapital).toBe(Math.round(open.E33));
        expect(year.profitAndLossAccount).toBe(Math.round(open.E34 + at("capital_reserves")));
        expect(year.capitalAndReserves).toBe(Math.round(open.E33 + open.E34 + at("capital_reserves")));
        expect(open.E37).toBe(0);
        expect(netAssetsOf(year)).toBe(year.capitalAndReserves);
        if (example.dir === "precision-code-ltd-full") expect(at("long_term_creditors")).toBe(25000);
      });

      it("keeps the unrounded derivation beside the filing figures", () => {
        expect(answer.derivation.currentYear.sheet).toBe("PubBalSht");
        expect(answer.derivation.priorYear.sheet).toBe("OpenAccounts");
        expect(Math.abs(answer.derivation.currentYear.lines.capitalAndReserves - results.PubBalSht.F39)).toBeLessThan(0.01);
        expect(answer.derivation.priorYear.lines.calledUpShareCapital).toBe(results.OpenAccounts.E33);
      });

      it("answers turnover, costs and profit from the published profit and loss account, in whole pounds", () => {
        const pl = results["PubP&L"];
        expect(answer.profitAndLoss.turnover).toBe(Math.round(pl.F9));
        expect(answer.profitAndLoss.profit).toBe(Math.round(pl.F51));
        expect(answer.profitAndLoss.turnover - answer.profitAndLoss.costs).toBe(answer.profitAndLoss.profit);
        for (const value of Object.values(answer.profitAndLoss)) expect(Number.isInteger(value)).toBe(true);
      });
    });
  }

  it("renders BrickWork Pro's derived lines through buildMicroEntityAccounts", async () => {
    const session = createSession();
    await openBook(session, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
    const answer = await deriveMicroEntityAccounts(session);
    const xhtml = buildMicroEntityAccounts({
      companyNumber: answer.companyNumber,
      companyName: answer.companyName,
      periodStart: answer.periodStart,
      periodEnd: answer.periodEnd,
      priorBalanceSheetDate: answer.priorBalanceSheetDate,
      dormant: answer.dormant,
      averageNumberOfEmployees: answer.averageNumberOfEmployees,
      directorName: answer.directorName,
      dateOfApproval: "2026-06-30",
      balanceSheet: { current: answer.balanceSheet.currentYear, prior: answer.balanceSheet.priorYear },
    });
    expect(xhtml).toContain(answer.companyNumber);
    expect(xhtml).toContain("BrickWork Pro Ltd");
    expect(xhtml).toContain(String(answer.balanceSheet.currentYear.fixedAssets));
    const path = join(scratch, "brickwork-pro-accounts.html");
    writeFileSync(path, xhtml);
    expect(xhtml.length).toBeGreaterThan(1000);
  });

  it("refuses a published balance sheet whose net assets do not equal shareholders' funds", () => {
    expect(() => linesFromPublishedBalanceSheet({ F6: 100, E13: 50, E20: 10, F31: 0, F33: 140, F36: 1, F39: 120 })).toThrow(
      /does not balance: net assets 140 against shareholders' funds 120/,
    );
    expect(() => linesFromPublishedBalanceSheet(undefined)).toThrow(/no published balance sheet/);
  });

  it("derives turnover, costs and profit from a published profit and loss account", () => {
    expect(profitAndLossFromPublishedAccount({ F9: 10000.4, F51: 2000.6 })).toEqual({
      turnover: 10000,
      costs: 7999,
      profit: 2001,
    });
    expect(() => profitAndLossFromPublishedAccount(undefined)).toThrow(/no published profit and loss account/);
  });

  it("refuses an opening balance whose assets do not equal its liabilities and equity", () => {
    expect(() => linesFromOpeningBalance({ stock: 100, share_capital: 1, retained_earnings: 50 })).toThrow(
      /opening balance sheet does not balance/,
    );
    const lines = linesFromOpeningBalance({
      fixed_asset_cost: { plant_machinery: 1000 },
      fixed_asset_depreciation: { plant_machinery: 250 },
      stock: 100,
      trade_debtors: 200,
      current_account: 300,
      trade_creditors: 150,
      vat_due: 50,
      directors_loan: 400,
      share_capital: 1,
      retained_earnings: 749,
    });
    expect(lines).toEqual({
      fixedAssets: 750,
      currentAssets: 600,
      creditorsWithinOneYear: 200,
      creditorsAfterOneYear: 400,
      calledUpShareCapital: 1,
      profitAndLossAccount: 749,
      capitalAndReserves: 750,
    });
  });

  it("rounds to whole pounds without breaking the filing's identity", () => {
    const rounded = roundForFiling({
      fixedAssets: 10.4,
      currentAssets: 20.6,
      creditorsWithinOneYear: 5.5,
      creditorsAfterOneYear: 0.4,
      calledUpShareCapital: 1,
      profitAndLossAccount: 24.1,
      capitalAndReserves: 25.1,
    });
    expect(rounded).toEqual({
      fixedAssets: 10,
      currentAssets: 21,
      creditorsWithinOneYear: 6,
      creditorsAfterOneYear: 0,
      calledUpShareCapital: 1,
      profitAndLossAccount: 24,
      capitalAndReserves: 25,
    });
  });

  it("refuses before a book is open, and is registered on the server with no inputs", async () => {
    await expect(deriveMicroEntityAccounts(createSession())).rejects.toThrow(/Call open_book first/);
    expect(TOOLS.derive_micro_entity_accounts.handler).toBe(deriveMicroEntityAccounts);
    expect(TOOLS.derive_micro_entity_accounts.inputSchema).toEqual({});
  });
});
