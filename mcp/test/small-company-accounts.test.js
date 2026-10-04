// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// small-company-accounts.test.js -- derive_small_company_accounts over the two example company
// books: the profit and loss and balance sheet sub-lines equal the engine's published statements
// in whole pounds, every identity the filing checks holds, the fixed asset note balances to the
// balance sheet, and the derived figures render through buildSmallCompanyAccounts.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";

import {
  buildSmallCompanyAccounts,
  profitAndLossProblems,
  fixedAssetNoteNetBookValue,
} from "../../app/services/smallCompanyAccountsIxbrl.js";
import { parseXmlDocument } from "../../app/lib/xmlDom.js";
import { deriveSmallCompanyAccounts } from "../lib/accounts-tools.js";
import { createSession, openBook } from "../lib/book-tools.js";
import { TOOLS } from "../lib/server.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

const EXAMPLES = [
  { name: "BrickWork Pro Ltd", dir: "brickwork-pro-ltd-vat", director: "Mike Brown" },
  { name: "Precision Code Ltd", dir: "precision-code-ltd-full", director: "Carol Smith" },
];

describe("derive_small_company_accounts", () => {
  for (const example of EXAMPLES) {
    describe(example.name, () => {
      let session;
      let results;
      let answer;
      beforeAll(async () => {
        session = createSession();
        await openBook(session, { path: join(FIXTURES, example.dir) });
        results = calculatedResultsFor(session.book, session.lines, await loadTaxDataForBook(session.book));
        answer = await deriveSmallCompanyAccounts(session);
      });

      it("takes the company, the period and the directors from the book", () => {
        expect(answer.companyName).toBe(example.name);
        expect(answer.periodStart).toBe("2025-04-01");
        expect(answer.periodEnd).toBe("2026-03-31");
        expect(answer.directorName).toBe(example.director);
        expect(answer.directors).toContain(example.director);
      });

      it("answers every profit and loss line from the published account, in whole pounds with every subtotal holding", () => {
        const pl = answer.profitAndLoss.currentYear;
        const sheet = results["PubP&L"];
        expect(pl.turnover).toBe(Math.round(sheet.F9));
        expect(pl.costOfSales).toBe(Math.round(sheet.F16));
        expect(pl.administrativeExpenses).toBe(Math.round(sheet.F44));
        expect(pl.profitBeforeTax).toBe(Math.round(sheet.F49));
        expect(pl.tax).toBe(Math.round(sheet.F50));
        expect(profitAndLossProblems(pl)).toEqual([]);
        for (const value of Object.values(pl)) expect(Number.isInteger(value)).toBe(true);
      });

      it("answers the balance sheet sub-lines from the published balance sheet and the identities hold", () => {
        const year = answer.balanceSheet.currentYear;
        const sheet = results.PubBalSht;
        expect(year.fixedAssets).toBe(Math.round(sheet.F6));
        expect(year.stocks).toBe(Math.round(sheet.E10));
        expect(year.debtors).toBe(Math.round(sheet.E11));
        expect(year.cashAtBank).toBe(Math.round(sheet.E12));
        expect(year.tradeCreditors).toBe(Math.round(sheet.E16));
        expect(year.corporationTax).toBe(Math.round(sheet.E17));
        expect(year.otherCreditors).toBe(Math.round(sheet.E18));
        expect(year.creditorsAfterOneYear).toBe(Math.round(sheet.F31));
        expect(year.calledUpShareCapital).toBe(Math.round(sheet.F36));
        const netAssets =
          year.fixedAssets +
          year.stocks +
          year.debtors +
          year.cashAtBank -
          year.tradeCreditors -
          year.corporationTax -
          year.otherCreditors -
          year.creditorsAfterOneYear;
        expect(netAssets).toBe(year.capitalAndReserves);
        expect(year.calledUpShareCapital + year.profitAndLossAccount).toBe(year.capitalAndReserves);
      });

      it("derives a prior-year balance sheet that balances and no prior-year profit and loss account", () => {
        const year = answer.balanceSheet.priorYear;
        const netAssets =
          year.fixedAssets +
          year.stocks +
          year.debtors +
          year.cashAtBank -
          year.tradeCreditors -
          year.corporationTax -
          year.otherCreditors -
          year.creditorsAfterOneYear;
        expect(netAssets).toBe(year.capitalAndReserves);
        expect(answer.profitAndLoss.priorYear).toBeUndefined();
      });

      it("renders through buildSmallCompanyAccounts once the typed fields are added", () => {
        const fixedAssetNote = Object.keys(answer.fixedAssetNote).length > 0 ? answer.fixedAssetNote : undefined;
        if (fixedAssetNote) {
          expect(Math.abs(fixedAssetNoteNetBookValue(fixedAssetNote) - answer.balanceSheet.currentYear.fixedAssets)).toBeLessThan(5);
        }
        const xhtml = buildSmallCompanyAccounts({
          companyNumber: "12345678",
          companyName: answer.companyName,
          periodStart: answer.periodStart,
          periodEnd: answer.periodEnd,
          priorBalanceSheetDate: answer.priorBalanceSheetDate,
          averageNumberOfEmployees: answer.averageNumberOfEmployees,
          principalActivity: "Trading",
          accountingPolicies: "Historical cost convention.",
          directors: answer.directors,
          directorName: answer.directorName,
          dateOfApproval: "2026-06-30",
          balanceSheet: { current: answer.balanceSheet.currentYear, prior: answer.balanceSheet.priorYear },
          profitAndLoss: { current: answer.profitAndLoss.currentYear },
        });
        expect(() => parseXmlDocument(xhtml)).not.toThrow();
        expect(xhtml).toContain('name="core:TurnoverRevenue"');
      });
    });
  }

  it("refuses before a book is open, and is registered on the server with no inputs", async () => {
    await expect(deriveSmallCompanyAccounts(createSession())).rejects.toThrow(/Call open_book first/);
    expect(TOOLS.derive_small_company_accounts.handler).toBe(deriveSmallCompanyAccounts);
    expect(TOOLS.derive_small_company_accounts.inputSchema).toEqual({});
  });
});
