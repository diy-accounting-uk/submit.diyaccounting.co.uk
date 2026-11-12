// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/ct600LongPeriod.test.js

import { describe, test, expect } from "vitest";
import { Ct600RefusedError, deriveCt600FromFigures } from "@app/services/ct600Figures.js";
import {
  ACCOUNTING_PERIOD_FIELDS,
  accountingPeriodsOf,
  deriveLongPeriodReturns,
  splitLongPeriodFigures,
} from "@app/services/ct600LongPeriod.js";
import { ltdTaxDataForPeriodEnd } from "@app/services/ct600Xml.js";

const TODAY = "2026-11-11";

// A 15-month period of account, 1 January 2025 to 31 March 2026 (455 days), of a company with no
// associated companies.
function longFigures(overrides = {}) {
  return {
    companyName: "Long Period Example Ltd",
    companyNumber: "09999993",
    utr: "8596148860",
    companyType: 0,
    declarantName: "Alex Example",
    declarantStatus: "Director",
    periodStart: "2025-01-01",
    periodEnd: "2026-03-31",
    profitAndLoss: {
      current: {
        turnover: 250000,
        costOfSales: 50000,
        grossProfit: 200000,
        administrativeExpenses: 81000,
        operatingProfit: 119000,
        interestReceivable: 1000,
        profitBeforeTax: 120000,
        tax: 24962,
        profit: 95038,
      },
    },
    nonTradingLoanRelationshipCredits: 1000,
    depreciation: 6000,
    donations: 2000,
    accountingPeriods: [
      { associatedCompanies: 0, annualInvestmentAllowance: 12000, mainPoolAllowances: 1800, donationsPaid: 2000 },
      {
        associatedCompanies: 0,
        mainPoolAllowances: 363,
        donationsPaid: 0,
        loansToParticipators: { releasedBeforeEnd: false, repayments: [], loans: [{ name: "Alex Example", amount: 15000 }] },
      },
    ],
    ...overrides,
  };
}

function taxData(figures) {
  return {
    ...ltdTaxDataForPeriodEnd(figures.periodStart),
    ...ltdTaxDataForPeriodEnd(accountingPeriodsOf(figures.periodStart, figures.periodEnd)[0].periodEnd),
    ...ltdTaxDataForPeriodEnd(figures.periodEnd),
  };
}

function deriveBoth(figures) {
  return deriveLongPeriodReturns(figures, taxData(figures), { today: TODAY });
}

function refusal(action) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(Ct600RefusedError);
    return error;
  }
  throw new Error("The call did not refuse");
}

describe("accountingPeriodsOf", () => {
  test("gives one accounting period for 12 months or less", () => {
    expect(accountingPeriodsOf("2025-04-01", "2026-03-31")).toEqual([{ periodStart: "2025-04-01", periodEnd: "2026-03-31" }]);
    expect(accountingPeriodsOf("2026-01-01", "2026-03-31")).toEqual([{ periodStart: "2026-01-01", periodEnd: "2026-03-31" }]);
  });

  test("gives the first 12 months and the rest for a longer period", () => {
    expect(accountingPeriodsOf("2025-01-01", "2026-03-31")).toEqual([
      { periodStart: "2025-01-01", periodEnd: "2025-12-31" },
      { periodStart: "2026-01-01", periodEnd: "2026-03-31" },
    ]);
  });

  test("a period of 12 months and a day has a second accounting period of one day", () => {
    expect(accountingPeriodsOf("2025-01-01", "2026-01-01")[1]).toEqual({ periodStart: "2026-01-01", periodEnd: "2026-01-01" });
  });

  test("accepts 18 months and refuses 18 months and a day", () => {
    expect(accountingPeriodsOf("2025-01-01", "2026-06-30")).toHaveLength(2);
    const error = refusal(() => accountingPeriodsOf("2025-01-01", "2026-07-01"));
    expect(error.message).toBe("A period of account can be 18 months at most (Companies Act 2006 s392).");
    expect(error.field).toBe("period");
  });

  test("refuses a period that is not dates in order", () => {
    expect(refusal(() => accountingPeriodsOf("2025-01-01", "2025-13-31")).message).toMatch(/must be dates/);
    expect(refusal(() => accountingPeriodsOf("2025-06-01", "2025-05-31")).message).toMatch(/cannot end before it starts/);
  });
});

describe("splitLongPeriodFigures", () => {
  test("gives each return its accounting period, its own figures and its share of the period of account", () => {
    const [first, second] = splitLongPeriodFigures(longFigures());
    expect([first.periodStart, first.periodEnd]).toEqual(["2025-01-01", "2025-12-31"]);
    expect([second.periodStart, second.periodEnd]).toEqual(["2026-01-01", "2026-03-31"]);
    expect(first.annualInvestmentAllowance).toBe(12000);
    expect(second.annualInvestmentAllowance).toBeUndefined();
    expect(second.mainPoolAllowances).toBe(363);
    expect(first.accountingPeriods).toBeUndefined();
    expect(first.periodOfAccount).toEqual({
      periodStart: "2025-01-01",
      periodEnd: "2026-03-31",
      days: 455,
      apportioned: { turnover: 200549, nonTradingLoanRelationshipCredits: 802, adjustedProfitBeforeCapitalAllowances: 101879 },
    });
    expect(second.periodOfAccount.apportioned).toEqual({
      turnover: 49451,
      nonTradingLoanRelationshipCredits: 198,
      adjustedProfitBeforeCapitalAllowances: 25121,
    });
  });

  test("gives the losses brought forward and the previous period's profits to the first return only", () => {
    const [first, second] = splitLongPeriodFigures(longFigures({ lossesBroughtForward: 700, priorPeriodChargeableProfits: 3000 }));
    expect(first).toMatchObject({ lossesBroughtForward: 700, priorPeriodChargeableProfits: 3000 });
    expect(second.lossesBroughtForward).toBeUndefined();
    expect(second.priorPeriodChargeableProfits).toBeUndefined();
  });

  test("a period over 12 months with no accountingPeriods is refused", () => {
    const { accountingPeriods, ...withoutPeriods } = longFigures();
    expect(accountingPeriods).toHaveLength(2);
    const error = refusal(() => splitLongPeriodFigures(withoutPeriods));
    expect(error.message).toMatch(/longer than 12 months/);
    expect(error.field).toBe("accountingPeriods");
    expect(() => deriveBoth(withoutPeriods)).toThrow(/longer than 12 months/);
  });

  test("accountingPeriods on a period of 12 months or less is refused", () => {
    const error = refusal(() => splitLongPeriodFigures(longFigures({ periodEnd: "2025-12-31" })));
    expect(error.message).toBe("accountingPeriods are for a period of account longer than 12 months");
    expect(
      refusal(() => splitLongPeriodFigures({ ...longFigures({ periodEnd: "2025-12-31" }), accountingPeriods: undefined })).message,
    ).toBe("A period of account of 12 months or less files as one return");
  });

  test("a period of 18 months and a day is refused", () => {
    expect(refusal(() => deriveBoth(longFigures({ periodEnd: "2026-07-01" }))).message).toMatch(/18 months at most/);
  });

  test("refuses anything but two accounting periods of known per-period figures", () => {
    expect(refusal(() => splitLongPeriodFigures(longFigures({ accountingPeriods: [{}] }))).message).toMatch(/two accounting periods/);
    expect(refusal(() => splitLongPeriodFigures(longFigures({ accountingPeriods: [{}, "x"] }))).message).toMatch(/must be an object/);
    const wholePeriodField = refusal(() => splitLongPeriodFigures(longFigures({ accountingPeriods: [{ depreciation: 5 }, {}] })));
    expect(wholePeriodField.field).toBe("depreciation");
    expect(wholePeriodField.message).toMatch(/whole period of account/);
  });

  test("refuses a per-period figure typed for the whole period, and a working sheet", () => {
    for (const field of ACCOUNTING_PERIOD_FIELDS) {
      expect(refusal(() => splitLongPeriodFigures(longFigures({ [field]: 1 }))).field).toBe(field);
    }
    expect(refusal(() => splitLongPeriodFigures(longFigures({ workingSheet: { tradingProfit: 1, corporationTax: 1 } }))).field).toBe(
      "workingSheet",
    );
  });

  test("takes no donations paid in an accounting period that gives none", () => {
    const figures = longFigures();
    delete figures.accountingPeriods[0].donationsPaid;
    const [first] = deriveBoth(figures);
    expect(first.boxes[305]).toBeUndefined();
    expect(first.boxes[315]).toBe(88881);
  });
});

describe("deriveLongPeriodReturns, the 15-month period of account", () => {
  const [first, second] = deriveBoth(longFigures());

  test("return 1: the first 12 months, box by box", () => {
    expect(first.boxes).toEqual({
      "1": "Long Period Example Ltd",
      "2": "09999993",
      "3": "8596148860",
      "4": 0,
      "30": "2025-01-01",
      "35": "2025-12-31",
      "50": "yes",
      "85A": "yes",
      "145": 200549,
      "155": 88079,
      "165": 88079,
      "170": 802,
      "235": 88881,
      "300": 88881,
      "305": 2000,
      "315": 86881,
      "327": 0,
      "328": 0,
      "329": "yes",
      "330": 2024,
      "335": 21423,
      "340": 25,
      "345": 5355.75,
      "380": 2025,
      "385": 65458,
      "390": 25,
      "395": 16364.5,
      "430": 21720.25,
      "435": 2446.79,
      "440": 19273.46,
      "475": 19273.46,
      "510": 19273.46,
      "525": 19273.46,
      "528": 19273.46,
      "600": 19273.46,
      "690": 12000,
      "705": 13800,
      "975": "Alex Example",
      "985": "Director",
    });
    expect(first.ct600a).toBeUndefined();
  });

  test("return 2: the last 90 days, box by box, with the loan's section 455 tax", () => {
    expect(second.boxes).toEqual({
      "1": "Long Period Example Ltd",
      "2": "09999993",
      "3": "8596148860",
      "4": 0,
      "30": "2026-01-01",
      "35": "2026-03-31",
      "50": "yes",
      "85A": "yes",
      "95": "yes",
      "145": 49451,
      "155": 24758,
      "165": 24758,
      "170": 198,
      "235": 24956,
      "300": 24956,
      "315": 24956,
      "326": 0,
      "329": "yes",
      "330": 2025,
      "335": 24956,
      "340": 25,
      "345": 6239,
      "430": 6239,
      "435": 550.32,
      "440": 5688.68,
      "475": 5688.68,
      "480": 5062.5,
      "510": 10751.18,
      "525": 10751.18,
      "528": 10751.18,
      "600": 10751.18,
      "705": 363,
      "975": "Alex Example",
      "985": "Director",
    });
    expect(second.ct600a.taxChargeable).toBe(5062.5);
  });

  test("the computation lines run from the period of account to each accounting period", () => {
    expect(first.computationLines).toMatchObject({
      profitLossPerAccounts: 120000,
      nonTradingLoanRelationshipCredits: 1000,
      depreciation: 6000,
      donations: 2000,
      adjustedProfitBeforeAccountingPeriodAdjustments: 127000,
      timeApportionment: -25121,
      adjustedProfitBeforeCapitalAllowances: 101879,
      totalCapitalAllowances: 13800,
      adjustedProfit: 88079,
    });
    expect(second.computationLines).toMatchObject({
      adjustedProfitBeforeAccountingPeriodAdjustments: 127000,
      timeApportionment: -101879,
      adjustedProfitBeforeCapitalAllowances: 25121,
      totalCapitalAllowances: 363,
      adjustedProfit: 24758,
    });
  });

  test("each return names the period of account and its own period", () => {
    expect(first.periodOfAccount).toEqual({ periodStart: "2025-01-01", periodEnd: "2026-03-31", days: 455 });
    expect(second.periodOfAccount).toEqual(first.periodOfAccount);
    expect([first.periodStart, first.periodEnd, second.periodStart, second.periodEnd]).toEqual([
      "2025-01-01",
      "2025-12-31",
      "2026-01-01",
      "2026-03-31",
    ]);
  });

  test("the two returns' turnover, bank interest and profit add back to the period of account", () => {
    expect(first.boxes[145] + second.boxes[145]).toBe(250000);
    expect(first.boxes[170] + second.boxes[170]).toBe(1000);
    expect(
      first.computationLines.adjustedProfitBeforeCapitalAllowances + second.computationLines.adjustedProfitBeforeCapitalAllowances,
    ).toBe(127000);
  });

  test("the annual investment allowance of the 90-day return is limited to its days", () => {
    const figures = longFigures();
    figures.accountingPeriods[1].annualInvestmentAllowance = 246576;
    const error = refusal(() => deriveBoth(figures));
    expect(error.message).toBe("The annual investment allowance of a 90-day period can be 246,575 at most.");
    figures.accountingPeriods[1].annualInvestmentAllowance = 246575;
    expect(deriveBoth(figures)[1].boxes[690]).toBe(246575);
  });

  test("a return of 12 months or less is not changed by the long period code", () => {
    const { accountingPeriods, ...rest } = longFigures({ periodEnd: "2025-12-31" });
    expect(accountingPeriods).toHaveLength(2);
    const figures = { ...rest, ...accountingPeriods[0] };
    const { boxes } = deriveCt600FromFigures(figures, taxData(figures), { today: TODAY });
    expect(boxes[50]).toBeUndefined();
    expect(boxes["85A"]).toBeUndefined();
    expect(boxes[145]).toBe(250000);
  });
});

describe("deriveLongPeriodReturns, losses between the two returns", () => {
  // Return 2 claims 40,000 of allowances against a 25,121 profit: a trading loss of 14,879.
  function lossInSecondReturn(carriedBack, allowance = 40000) {
    const figures = longFigures();
    figures.accountingPeriods[1] = { associatedCompanies: 0, annualInvestmentAllowance: allowance, lossCarriedBack: carriedBack };
    return figures;
  }

  test("a return 2 loss carried back sets boxes 275 and 280 in return 1", () => {
    const [first, second] = deriveBoth(lossInSecondReturn(10000));
    expect(first.boxes).toMatchObject({
      "275": 10000,
      "280": "yes",
      "295": 10000,
      "300": 78881,
      "305": 2000,
      "315": 76881,
      "50": "yes",
      "85A": "yes",
    });
    expect(second.boxes[780]).toBe(14879);
    expect(second.boxes[315]).toBe(198);
    expect(second.carryBack).toMatchObject({
      amount: 10000,
      priorPeriodStart: "2025-01-01",
      priorPeriodEnd: "2025-12-31",
      boxes: { 275: 10000, 280: "yes" },
    });
  });

  test("the repayment is the difference in return 1's Corporation Tax", () => {
    const [first, second] = deriveBoth(lossInSecondReturn(10000));
    const [withoutClaim] = deriveBoth(longFigures());
    expect(first.boxes[440]).toBe(16623.46);
    expect(withoutClaim.boxes[440] - first.boxes[440]).toBeCloseTo(2650, 2);
    expect(second.carryBack.taxRepayable).toBe(2650);
  });

  test("the loss left after the carry-back is carried forward", () => {
    const [, second] = deriveBoth(lossInSecondReturn(10000));
    expect(second.losses).toMatchObject({ arising: 14879, carriedBack: 10000, carriedForwardFromPeriod: 4879, totalCarriedForward: 4879 });
  });

  test("return 1's loss carried forward is return 2's loss brought forward", () => {
    const figures = longFigures();
    figures.accountingPeriods[0] = { associatedCompanies: 0, annualInvestmentAllowance: 150000 };
    const [first, second] = deriveBoth(figures);
    expect(first.losses.totalCarriedForward).toBe(48121);
    expect(first.boxes[780]).toBe(48121);
    expect(second.losses.broughtForward).toBe(48121);
    expect(second.boxes[160]).toBe(24758);
    expect(second.losses.totalCarriedForward).toBe(23363);
  });

  test("a loss carried back is refused when it is more than return 1's chargeable profits", () => {
    const error = refusal(() => deriveBoth(lossInSecondReturn(86882, 150000)));
    expect(error.message).toBe("The loss carried back 86882 is more than the previous period's chargeable profits 86881");
  });

  test("a loss carried back is refused when it is more than the loss left after claims in the period", () => {
    const error = refusal(() => deriveBoth(lossInSecondReturn(14880)));
    expect(error.field).toBe("lossCarriedBack");
  });
});
