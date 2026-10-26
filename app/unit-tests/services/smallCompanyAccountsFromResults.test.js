// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/smallCompanyAccountsFromResults.test.js

import { describe, test, expect } from "vitest";
import { smallCompanyFormat2ProfitAndLossFromResults } from "@app/services/smallCompanyAccountsFromResults.js";
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
