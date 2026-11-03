// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/smallCompanyAccountsFromResults.test.js

import { describe, test, expect } from "vitest";
import { loadDiyaGlData, diyaGlToScenario } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { deriveSmallCompanyAccounts } from "@app/services/smallCompanyAccounts.js";
import { deriveMicroEntityAccounts, deriveCompanyBookFigures } from "@app/services/microEntityAccounts.js";
import { microEntityAccountsFromResults } from "@app/services/microEntityAccountsFromResults.js";
import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook, productOf } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import {
  smallCompanyAccountsFromResults,
  smallCompanyFormat2ProfitAndLossFromResults,
  smallCompanyLinesFromOpeningBalance,
  smallCompanyLinesFromPublishedBalanceSheet,
  roundSmallCompanyBalanceSheet,
} from "@app/services/smallCompanyAccountsFromResults.js";
import { smallCompanyProfitAndLossFromPublishedAccount } from "@app/services/ct600Figures.js";
import { buildSmallCompanyAccounts, format2ProfitAndLossProblems, profitAndLossProblems } from "@app/services/smallCompanyAccountsIxbrl.js";

// Purchases, sub-contractors, wages, directors' pay, employer's National Insurance, depreciation and
// goodwill amortisation, with amounts that do not round evenly.
function resultsWithCosts() {
  const monthly = {
    B11: 9000.4,
    B12: 1200.3,
    B13: 800.4,
    B18: 12000.2,
    B19: 6000.3,
    B20: 2100.4,
    B38: 100.4,
    B40: 400.3,
  };
  const costOfSales = monthly.B11 + monthly.B12 + monthly.B13;
  const expenses = monthly.B18 + monthly.B19 + monthly.B20 + monthly.B38 + monthly.B40 + 3000.7;
  monthly.B41 = expenses;
  const turnover = 50000.6;
  const operatingProfit = turnover - costOfSales - expenses;
  const published = { F9: turnover, F16: costOfSales, F44: expenses, F46: operatingProfit, F49: operatingProfit + 50.2, F50: 1500.3 };
  return { "MnthP&L": monthly, "PubP&L": published };
}

describe("services/smallCompanyAccountsFromResults Format 2", () => {
  const results = resultsWithCosts();
  const format2 = smallCompanyFormat2ProfitAndLossFromResults(results);

  test("takes each cost line from the book's lines by nature", () => {
    expect(format2).toMatchObject({
      turnover: 50001,
      changeInStocks: 0,
      ownWorkCapitalised: 0,
      otherOperatingIncome: 0,
      rawMaterialsConsumables: 9000,
      otherExternalCharges: 2001,
      staffCosts: 20101,
      depreciation: 501,
      interestPayable: 0,
    });
  });

  test("holds every Format 2 identity to the pound", () => {
    expect(format2ProfitAndLossProblems(format2)).toEqual([]);
  });

  test("gives the same profit before tax, tax and profit as Format 1", () => {
    const format1 = smallCompanyProfitAndLossFromPublishedAccount(results["PubP&L"]);
    expect(profitAndLossProblems(format1)).toEqual([]);
    expect(format2.profitBeforeTax).toBe(format1.profitBeforeTax);
    expect(format2.tax).toBe(format1.tax);
    expect(format2.profit).toBe(format1.profit);
  });

  test("refuses a product with no monthly profit and loss account", () => {
    expect(() => smallCompanyFormat2ProfitAndLossFromResults({ "PubP&L": results["PubP&L"] })).toThrow(/only a Company \(ltd\) book/);
  });
});

describe("services/smallCompanyAccountsFromResults balance sheet lines", () => {
  const sheet = { F6: 1000, E10: 0, E11: 2000, E12: 500, E16: 400, E17: 300, E18: 250, E19: 600, F31: 0, F36: 100, F33: 1950, F39: 1950 };

  test("the published sheet's E19 is the bank overdraft and E18 is taxation and social security", () => {
    const lines = smallCompanyLinesFromPublishedBalanceSheet(sheet);
    expect(lines).toMatchObject({ bankLoansOverdrafts: 600, taxationSocialSecurity: 250, otherCreditors: 0 });
  });

  test("the rounded published lines still balance with the overdraft and the tax line", () => {
    const lines = roundSmallCompanyBalanceSheet(smallCompanyLinesFromPublishedBalanceSheet(sheet));
    const netAssets =
      lines.fixedAssets +
      lines.debtors +
      lines.cashAtBank -
      lines.bankLoansOverdrafts -
      lines.tradeCreditors -
      lines.corporationTax -
      lines.taxationSocialSecurity -
      lines.otherCreditors;
    expect(netAssets).toBe(lines.capitalAndReserves);
    expect(lines.profitAndLossAccount).toBe(lines.capitalAndReserves - lines.calledUpShareCapital);
  });

  test("the published sheet's E11 is the trade debtors and E29 is the directors' loan within the creditors after one year", () => {
    const withLoan = { ...sheet, E29: 1200.4, F31: 1500.2, F33: 450, F39: 450 };
    const lines = smallCompanyLinesFromPublishedBalanceSheet(withLoan);
    expect(lines).toMatchObject({ debtors: 2000, tradeDebtors: 2000, otherDebtors: 0, amountsOwedToDirectors: 1200.4 });
    const rounded = roundSmallCompanyBalanceSheet(lines);
    expect(rounded).toMatchObject({
      debtors: 2000,
      tradeDebtors: 2000,
      otherDebtors: 0,
      amountsOwedToDirectors: 1200,
      creditorsAfterOneYear: 1500,
    });
  });

  test("an opening balance splits the debtors and takes the directors' loan from its own line", () => {
    const lines = smallCompanyLinesFromOpeningBalance({
      trade_debtors: 700,
      long_term_debtors: 300,
      directors_loan: 400,
      long_term_creditors: 100,
      share_capital: 500,
    });
    expect(lines).toMatchObject({
      debtors: 1000,
      tradeDebtors: 700,
      otherDebtors: 300,
      amountsOwedToDirectors: 400,
      creditorsAfterOneYear: 500,
    });
    expect(roundSmallCompanyBalanceSheet(lines)).toMatchObject({ tradeDebtors: 700, otherDebtors: 300, amountsOwedToDirectors: 400 });
  });

  test("an overdrawn directors' loan account (E29 below 0) is a debtor and leaves the creditors", () => {
    const overdrawn = { ...sheet, E29: -1200.4, F31: -1200.4, F33: 1950, F39: 1950 };
    const lines = smallCompanyLinesFromPublishedBalanceSheet(overdrawn);
    expect(lines).toMatchObject({
      debtors: 3200.4,
      tradeDebtors: 2000,
      amountsOwedByDirectors: 1200.4,
      amountsOwedToDirectors: 0,
      creditorsAfterOneYear: 0,
    });
    const rounded = roundSmallCompanyBalanceSheet(lines);
    expect(rounded).toMatchObject({
      debtors: 3200,
      tradeDebtors: 2000,
      otherDebtors: 0,
      amountsOwedByDirectors: 1200,
      creditorsAfterOneYear: 0,
    });
    expect(rounded.tradeDebtors + rounded.otherDebtors + rounded.amountsOwedByDirectors).toBe(rounded.debtors);
  });

  test("an opening balance with the directors' loan negative is a debtor and carries no creditor", () => {
    const lines = smallCompanyLinesFromOpeningBalance({
      trade_debtors: 700,
      directors_loan: -300,
      long_term_creditors: 100,
      share_capital: 900,
    });
    expect(lines).toMatchObject({
      debtors: 1000,
      tradeDebtors: 700,
      amountsOwedByDirectors: 300,
      amountsOwedToDirectors: 0,
      creditorsAfterOneYear: 100,
    });
  });

  test("an opening balance with the three statement accounts overdrawn together gives an overdraft and no cash at bank", () => {
    const lines = smallCompanyLinesFromOpeningBalance({
      current_account: -800,
      savings_account: 300,
      credit_card: -200,
      cash: 50,
      fixed_asset_cost: { computers: 1000 },
      paye_due: 100,
      vat_due: 40,
      cis_due: 10,
      net_wages_due: 20,
      share_capital: 100,
      retained_earnings: 80,
    });
    expect(lines).toMatchObject({ bankLoansOverdrafts: 700, cashAtBank: 50, taxationSocialSecurity: 150, otherCreditors: 20 });
  });

  test("an opening balance with the three statement accounts in credit together gives cash at bank and no overdraft", () => {
    const lines = smallCompanyLinesFromOpeningBalance({
      current_account: -100,
      savings_account: 500,
      credit_card: -50,
      cash: 10,
      share_capital: 360,
    });
    expect(lines).toMatchObject({ bankLoansOverdrafts: 0, cashAtBank: 360 });
  });
});

describe("an overdrawn directors' loan account in a Company book", () => {
  const session = () => {
    const { book, lines } = loadDiyaGlData("fixtures/diya-gl/precision-code-ltd-loan");
    return { book, lines };
  };

  test("the small company accounts show the loan as a debtor and carry the section 413 note rows", async () => {
    const accounts = await deriveSmallCompanyAccounts(session());
    expect(accounts.balanceSheet.currentYear).toMatchObject({
      debtors: 19180,
      tradeDebtors: 7180,
      amountsOwedByDirectors: 12000,
      amountsOwedToDirectors: 0,
      creditorsAfterOneYear: 45000,
    });
    expect(accounts.balanceSheet.priorYear).toMatchObject({ amountsOwedByDirectors: 0, amountsOwedToDirectors: 20000 });
    expect(accounts.directorsAdvances).toEqual([
      { name: "Carol Smith", balanceAtStart: 0, advanced: 12000, repaid: 0, balanceAtEnd: 12000 },
    ]);
  });

  test("the derived figures build a balanced document once the terms are stated", async () => {
    const accounts = await deriveSmallCompanyAccounts(session());
    const xhtml = buildSmallCompanyAccounts({
      companyNumber: accounts.companyNumber,
      companyName: accounts.companyName,
      registeredOffice: { addressLine1: "1 Test Street", cityOrTown: "London", postalCode: "EC1A 1AA" },
      periodStart: accounts.periodStart,
      periodEnd: accounts.periodEnd,
      averageNumberOfEmployees: accounts.averageNumberOfEmployees,
      principalActivity: "Software",
      accountingPolicies: "Prepared under FRS 102 section 1A.",
      directors: accounts.directors,
      directorName: accounts.directorName,
      dateOfApproval: "2026-09-01",
      balanceSheet: { current: accounts.balanceSheet.currentYear, prior: accounts.balanceSheet.priorYear },
      profitAndLoss: { current: accounts.profitAndLoss.currentYear },
      fixedAssetNote: accounts.fixedAssetNote,
      directorsAdvances: accounts.directorsAdvances.map((advance) => ({ ...advance, terms: "Interest free" })),
    });
    expect(xhtml).toContain("Amounts owed by directors");
    expect(xhtml).toContain("Advances and credits to directors");
  });

  test("the micro-entity accounts count the loan in current assets and leave it out of the creditors", async () => {
    const accounts = await deriveMicroEntityAccounts(session());
    expect(accounts.balanceSheet.currentYear.creditorsAfterOneYear).toBe(45000);
    expect(accounts.directorsAdvances).toEqual([
      { name: "Carol Smith", balanceAtStart: 0, advanced: 12000, repaid: 0, balanceAtEnd: 12000 },
    ]);
    const { currentYear } = accounts.balanceSheet;
    expect(
      currentYear.fixedAssets + currentYear.currentAssets - currentYear.creditorsWithinOneYear - currentYear.creditorsAfterOneYear,
    ).toBe(currentYear.capitalAndReserves);
  });

  describe("with no director named in the book", () => {
    const sessionWithoutDirector = () => {
      const { book, lines } = session();
      return { book: { ...book, directors: [] }, lines };
    };

    test("a filing path refuses to build the small company accounts", async () => {
      await expect(deriveSmallCompanyAccounts(sessionWithoutDirector())).rejects.toThrow(/names no director/);
    });

    test("a filing path refuses to build the micro-entity accounts", async () => {
      await expect(deriveMicroEntityAccounts(sessionWithoutDirector())).rejects.toThrow(/names no director/);
    });

    test("the company book figures come without the note and with the overdrawn loan as a debtor", async () => {
      const { accounts } = await deriveCompanyBookFigures(sessionWithoutDirector(), { requireDirectorsNote: false });
      expect(accounts.directorsAdvances).toBeUndefined();
      expect(accounts.directorName).toBeNull();
      expect(accounts.balanceSheet.currentYear.creditorsAfterOneYear).toBe(45000);
    });

    test("the books bundle fill derives small company and micro-entity figures without the note", async () => {
      const { book, lines } = sessionWithoutDirector();
      const results = calculatedResultsFor(book, lines, await loadTaxDataForBook(book));
      const scenario = diyaGlToScenario(book, lines, productOf(book));
      const options = { requireDirectorsNote: false };
      expect(smallCompanyAccountsFromResults(book, results, scenario, options).directorsAdvances).toBeUndefined();
      expect(microEntityAccountsFromResults(book, results, scenario, options).directorsAdvances).toBeUndefined();
      expect(() => smallCompanyAccountsFromResults(book, results, scenario)).toThrow(/names no director/);
      expect(() => microEntityAccountsFromResults(book, results, scenario)).toThrow(/names no director/);
    });
  });
});
