// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/ct600Figures.test.js

import { describe, test, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import {
  computationLinesFromFigures,
  ct600FiguresFromResults,
  smallCompanyProfitAndLossFromPublishedAccount,
  deriveCt600FromFigures,
  validateCt600Figures,
  Ct600RefusedError,
} from "@app/services/ct600Figures.js";
import { ltdTaxDataForPeriodEnd, deriveCompanyTaxReturn } from "@app/services/ct600Xml.js";
import { deriveSmallCompanyAccounts } from "@app/services/smallCompanyAccounts.js";

const BOOK_DIRECTORY = join(process.cwd(), "fixtures", "diya-gl", "precision-code-ltd");

const COMPANY = {
  companyName: "Precision Code Ltd",
  companyNumber: "12345678",
  utr: "8596148860",
  companyType: 0,
  declarantName: "Carol Smith",
  declarantStatus: "Director",
};

const PROFIT_AND_LOSS = {
  turnover: 341283,
  costOfSales: 18787,
  grossProfit: 322496,
  administrativeExpenses: 151548,
  operatingProfit: 170948,
  interestReceivable: 340,
  profitBeforeTax: 171288,
  tax: 29062,
  profit: 142226,
};

// A typed return with no book: one 12-month period in the marginal relief band.
const TYPED = {
  ...COMPANY,
  periodStart: "2025-04-01",
  periodEnd: "2026-03-31",
  associatedCompanies: 0,
  profitAndLoss: { current: PROFIT_AND_LOSS },
  nonTradingLoanRelationshipCredits: 340,
  depreciation: 13740,
  amortisation: 2500,
  entertaining: 292,
  annualInvestmentAllowance: 52500,
  mainPoolAllowances: 11500,
};

let results;
let figuresFromBook;

function derive(figures) {
  return deriveCt600FromFigures(figures, ltdTaxDataForPeriodEnd(figures.periodEnd));
}

beforeAll(async () => {
  const { book, lines } = loadDiyaGlData(BOOK_DIRECTORY);
  results = calculatedResultsFor(book, lines, await loadTaxDataForBook(book));
  const accounts = await deriveSmallCompanyAccounts({ book, lines });
  figuresFromBook = { ...ct600FiguresFromResults(results, accounts), ...COMPANY };
});

describe("deriveCt600FromFigures worked from the precision-code-ltd book", () => {
  test("gives every box of the book's return, with box 705 holding the annual investment allowance", () => {
    const { boxes, computationLines } = derive(figuresFromBook);
    expect(boxes).toMatchObject({
      4: 0,
      145: 341283,
      155: 123480,
      165: 123480,
      170: 340,
      235: 123820,
      300: 123820,
      315: 123820,
      326: 0,
      329: "yes",
      330: 2025,
      335: 123820,
      340: 25,
      345: 30955,
      430: 30955,
      435: 1892.7,
      440: 29062.3,
      475: 29062.3,
      510: 29062.3,
      515: 64.51,
      525: 28997.79,
      528: 28997.79,
      600: 28997.79,
      690: 52500,
      705: 64000,
    });
    expect(computationLines).toEqual({
      profitLossPerAccounts: 171288,
      nonTradingLoanRelationshipCredits: 340,
      depreciation: 13740,
      amortisation: 2500,
      entertaining: 292,
      adjustedProfitBeforeCapitalAllowances: 187480,
      totalCapitalAllowances: 64000,
      adjustedProfit: 123480,
    });
  });

  test("names the sources and the rule of each worked box", () => {
    const { worked } = derive(figuresFromBook);
    expect(worked[155].rule).toBe("Box 155 equals the computation's adjusted profit");
    expect(worked[335].rule).toMatch(/^9198/);
    expect(worked[345].rule).toMatch(/^9204 and 9213/);
    expect(worked[440].sources).toEqual(["430", "435"]);
    expect(worked[705].sources).toEqual(["annualInvestmentAllowance", "mainPoolAllowances"]);
  });

  test("agrees with the working sheet to within five pounds", () => {
    const { boxes } = derive(figuresFromBook);
    expect(Math.abs(boxes[155] - figuresFromBook.workingSheet.tradingProfit)).toBeLessThan(5);
    expect(Math.abs(boxes[440] - figuresFromBook.workingSheet.corporationTax)).toBeLessThan(5);
  });

  test("the book and the model through the MCP derivation give the same boxes", async () => {
    const { boxes } = await deriveCompanyTaxReturn(loadDiyaGlData(BOOK_DIRECTORY), COMPANY);
    expect(boxes).toEqual(derive(figuresFromBook).boxes);
  });
});

describe("deriveCt600FromFigures worked from typed figures", () => {
  test("charges the tax from the typed figures with no book and no working sheet", () => {
    const { boxes } = derive(TYPED);
    expect(boxes[155]).toBe(123480);
    expect(boxes[315]).toBe(123820);
    expect(boxes[345]).toBe((123820 * 25) / 100);
    expect(boxes[345]).toBe(30955);
    expect(boxes[440]).toBe(boxes[430] - boxes[435]);
  });

  test("box 4 is the typed company type", () => {
    expect(derive(TYPED).boxes[4]).toBe(0);
    expect(derive({ ...TYPED, companyType: undefined }).boxes[4]).toBe(0);
  });

  test("works the allowances: 705 less 710 is the computation's total", () => {
    const figures = { ...TYPED, annualInvestmentAllowance: 1000, mainPoolAllowances: 500, mainPoolBalancingCharges: 200 };
    const { boxes, computationLines } = derive(figures);
    expect(boxes[690]).toBe(1000);
    expect(boxes[705]).toBe(1500);
    expect(boxes[710]).toBe(200);
    expect(computationLines.totalCapitalAllowances).toBe(1300);
  });

  test("takes losses brought forward off the trading profit", () => {
    const { boxes } = derive({ ...TYPED, lossesBroughtForward: 3480 });
    expect(boxes[160]).toBe(3480);
    expect(boxes[165]).toBe(120000);
    expect(boxes[235]).toBe(120340);
  });

  test("takes tax already paid and Income Tax deducted off the amount outstanding", () => {
    const { boxes } = derive({ ...TYPED, incomeTaxDeducted: 100, taxAlreadyPaid: 10000 });
    expect(boxes[515]).toBe(100);
    expect(boxes[525]).toBeCloseTo(boxes[510] - 100, 2);
    expect(boxes[595]).toBe(10000);
    expect(boxes[600]).toBeCloseTo(boxes[525] - 10000, 2);
  });

  test("charges the main rate and gives no marginal relief above the upper limit", () => {
    const { boxes } = derive({ ...TYPED, profitAndLoss: { current: { ...PROFIT_AND_LOSS, profitBeforeTax: 400000 } } });
    expect(boxes[340]).toBe(25);
    expect(boxes[435]).toBeUndefined();
    expect(boxes[329]).toBeUndefined();
  });

  test("charges the small profits rate and claims it in box 329 below the lower limit", () => {
    const figures = {
      ...TYPED,
      profitAndLoss: { current: { ...PROFIT_AND_LOSS, profitBeforeTax: 30000 } },
      nonTradingLoanRelationshipCredits: 0,
      depreciation: 0,
      amortisation: 0,
      entertaining: 0,
      annualInvestmentAllowance: 0,
      mainPoolAllowances: 0,
    };
    const { boxes } = derive(figures);
    expect(boxes[315]).toBe(30000);
    expect(boxes[340]).toBe(19);
    expect(boxes[345]).toBe(5700);
    expect(boxes[329]).toBe("yes");
    expect(boxes[435]).toBeUndefined();
  });

  test("reduces both limits by the associated companies", () => {
    const { boxes } = derive({ ...TYPED, associatedCompanies: 1 });
    expect(boxes[326]).toBe(1);
    expect(boxes[435]).toBe(17.7);
    expect(boxes[340]).toBe(25);
  });

  test("files a nil return with the mandatory boxes at zero when there is no profit", () => {
    const nil = {
      ...TYPED,
      profitAndLoss: { current: { ...PROFIT_AND_LOSS, profitBeforeTax: 0 } },
      nonTradingLoanRelationshipCredits: 0,
      depreciation: 0,
      amortisation: 0,
      entertaining: 0,
      annualInvestmentAllowance: 0,
      mainPoolAllowances: 0,
    };
    const { boxes } = derive(nil);
    expect(boxes[315]).toBe(0);
    expect(boxes[155]).toBeUndefined();
    expect(boxes[330]).toBeUndefined();
    expect(boxes[440]).toBe(0);
    expect(boxes[525]).toBe(0);
  });
});

describe("deriveCt600FromFigures on a period that straddles 1 April", () => {
  const straddling = { ...TYPED, periodStart: "2025-01-01", periodEnd: "2025-12-31" };

  test("splits the profit between the financial years by days, rounding half up (rule 9198)", () => {
    const { boxes } = derive(straddling);
    const firstShare = Math.round((123820 * 90) / 365);
    expect(boxes[330]).toBe(2024);
    expect(boxes[335]).toBe(firstShare);
    expect(boxes[380]).toBe(2025);
    expect(boxes[385]).toBe(123820 - firstShare);
    expect(boxes[335] + boxes[385]).toBe(boxes[315]);
    expect(boxes[326]).toBeUndefined();
    expect(boxes[327]).toBe(0);
    expect(boxes[328]).toBe(0);
  });

  test("charges each share at its year's rate to the penny (rules 9204 and 9213)", () => {
    const { boxes } = derive(straddling);
    expect(boxes[345]).toBe((boxes[335] * boxes[340]) / 100);
    expect(boxes[395]).toBe((boxes[385] * boxes[390]) / 100);
    expect(boxes[430]).toBe((boxes[335] * boxes[340] + boxes[385] * boxes[390]) / 100);
    expect(Number.isInteger(Math.round(boxes[430] * 100))).toBe(true);
  });
});

describe("the marginal relief band", () => {
  test("gives box 435 as (upper limit - profit) x 3/200 on a profit between the limits", () => {
    const { boxes } = derive(TYPED);
    expect(boxes[435]).toBe(Math.round((250000 - boxes[315]) * 0.015 * 100) / 100);
  });
});

describe("the figures refusals", () => {
  test.each([
    ["a company type other than 0", { companyType: 6 }, /Company type 6/, "companyType"],
    ["a period over 12 months", { periodEnd: "2026-04-30" }, /longer than 12 months/, "period"],
    ["a period starting before 1 April 2015", { periodStart: "2015-01-01", periodEnd: "2015-12-31" }, /on or after 2015-04-01/, "period"],
    [
      "a trading loss",
      {
        profitAndLoss: { current: { ...PROFIT_AND_LOSS, profitBeforeTax: -100 } },
        depreciation: 0,
        amortisation: 0,
        entertaining: 0,
        nonTradingLoanRelationshipCredits: 0,
        annualInvestmentAllowance: 0,
        mainPoolAllowances: 0,
      },
      /trading loss/,
      "profitAndLoss",
    ],
    ["a negative turnover", { profitAndLoss: { current: { ...PROFIT_AND_LOSS, turnover: -1 } } }, /turnover is negative/, "profitAndLoss"],
    [
      "Income Tax deducted beyond the Corporation Tax charged (box 515 over 440)",
      { incomeTaxDeducted: 29063 },
      /Income Tax deducted 29063.00 is more than the Corporation Tax charged 29062.30; the repayment boxes/,
      "incomeTaxDeducted",
    ],
    ["tax paid beyond the amount payable (box 595 over 525)", { taxAlreadyPaid: 50000 }, /repayment boxes/, "taxAlreadyPaid"],
    [
      "losses brought forward beyond the trading profit",
      { lossesBroughtForward: 200000 },
      /losses brought forward/,
      "lossesBroughtForward",
    ],
  ])("%s", (_label, changes, message, field) => {
    expect(() => derive({ ...TYPED, ...changes })).toThrow(message);
    const refusal = validateCt600Figures({ ...TYPED, ...changes }, { taxDataByYear: ltdTaxDataForPeriodEnd(TYPED.periodEnd) }).find(
      (entry) => entry.refusal,
    );
    expect(refusal?.field).toBe(field);
    expect(() => derive({ ...TYPED, ...changes })).toThrow(Ct600RefusedError);
  });

  test("accepts Income Tax deducted equal to the Corporation Tax charged", () => {
    const { boxes } = derive({ ...TYPED, incomeTaxDeducted: 29062.3 });
    expect(boxes[515]).toBe(29062.3);
    expect(boxes[525]).toBe(0);
  });

  test("a book with no CT600 sheet", () => {
    expect(() => ct600FiguresFromResults({ ...results, CT600: undefined }, { profitAndLoss: { currentYear: PROFIT_AND_LOSS } })).toThrow(
      /only a Company \(ltd\) book/,
    );
  });
});

describe("the £5 check", () => {
  test("stops a working sheet whose trading profit disagrees", () => {
    expect(() => derive({ ...figuresFromBook, workingSheet: { ...figuresFromBook.workingSheet, tradingProfit: 200000 } })).toThrow(
      /disagrees with the working sheet/,
    );
  });

  test("stops a working sheet whose tax disagrees", () => {
    expect(() => derive({ ...figuresFromBook, workingSheet: { ...figuresFromBook.workingSheet, corporationTax: 1000 } })).toThrow(
      /Corporation Tax .* disagrees with the working sheet/,
    );
  });

  test("compares box 440 with the customer's own working on the typed path", () => {
    expect(derive({ ...TYPED, ownCorporationTax: 29065 }).boxes[440]).toBe(29062.3);
    expect(() => derive({ ...TYPED, ownCorporationTax: 29100 })).toThrow(/disagrees with your own working's 29100.00/);
  });
});

describe("validateCt600Figures", () => {
  test("gives no entries for figures that stand", () => {
    expect(validateCt600Figures(TYPED, { today: "2026-10-24", taxDataByYear: ltdTaxDataForPeriodEnd(TYPED.periodEnd) })).toEqual([]);
  });

  test("names the field of each problem", () => {
    const problems = validateCt600Figures({
      ...TYPED,
      utr: "12",
      depreciation: 1.5,
      entertaining: 999999,
      declarantName: "",
      associatedCompanies: -1,
    });
    expect(problems.map((entry) => entry.field).sort()).toEqual([
      "associatedCompanies",
      "declarantName",
      "depreciation",
      "entertaining",
      "utr",
    ]);
    expect(problems.every((entry) => entry.refusal === false)).toBe(true);
  });

  test("asks for a period that ended before today", () => {
    expect(validateCt600Figures(TYPED, { today: "2026-03-31" }).map((entry) => entry.message)).toContain(
      "The period must end before today",
    );
  });
});

describe("the prior year's profit and loss", () => {
  const accounts = (priorYear) => ({ profitAndLoss: { currentYear: PROFIT_AND_LOSS, ...(priorYear ? { priorYear } : {}) } });

  test("is in the figures when the accounts carry a prior year", () => {
    const figures = ct600FiguresFromResults(results, accounts({ ...PROFIT_AND_LOSS, turnover: 300000 }));
    expect(figures.profitAndLoss.prior.turnover).toBe(300000);
    expect(figures.profitAndLoss.current).toEqual(PROFIT_AND_LOSS);
  });

  test("is absent when the accounts carry none", () => {
    expect(ct600FiguresFromResults(results, accounts()).profitAndLoss).not.toHaveProperty("prior");
  });

  test("the book's own profit and loss gives the current year only", () => {
    expect(smallCompanyProfitAndLossFromPublishedAccount(results["PubP&L"]).profitBeforeTax).toBe(171288);
  });

  test("a prior year without turnover and profit before tax is a problem", () => {
    const problems = validateCt600Figures({ ...TYPED, profitAndLoss: { current: PROFIT_AND_LOSS, prior: { turnover: 1 } } });
    expect(problems.map((entry) => entry.message)).toContain(
      "The prior year's profit and loss account needs turnover and profit before tax",
    );
  });
});

describe("computationLinesFromFigures", () => {
  test("adds up from the lines", () => {
    const lines = computationLinesFromFigures(TYPED);
    expect(lines.adjustedProfitBeforeCapitalAllowances).toBe(171288 - 340 + 13740 + 2500 + 292);
    expect(lines.adjustedProfit).toBe(lines.adjustedProfitBeforeCapitalAllowances - lines.totalCapitalAllowances);
  });
});
