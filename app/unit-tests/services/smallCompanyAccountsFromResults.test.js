// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/smallCompanyAccountsFromResults.test.js

import { describe, test, expect } from "vitest";
import {
  smallCompanyFormat2ProfitAndLossFromResults,
  smallCompanyLinesFromOpeningBalance,
  smallCompanyLinesFromPublishedBalanceSheet,
  roundSmallCompanyBalanceSheet,
} from "@app/services/smallCompanyAccountsFromResults.js";
import { smallCompanyProfitAndLossFromPublishedAccount } from "@app/services/ct600Figures.js";
import { format2ProfitAndLossProblems, profitAndLossProblems } from "@app/services/smallCompanyAccountsIxbrl.js";

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
