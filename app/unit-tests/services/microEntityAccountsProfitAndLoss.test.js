// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/microEntityAccountsProfitAndLoss.test.js

import { describe, test, expect } from "vitest";
import {
  buildMicroEntityAccounts,
  microProfitAndLossProblems,
  MICRO_PROFIT_AND_LOSS_LINES,
} from "@app/services/microEntityAccountsIxbrl.js";
import { loadFrcTaxonomyConcepts } from "@app/services/accountsIxbrlCommon.js";

const CURRENT = {
  turnover: 50000,
  otherIncome: 500,
  rawMaterials: 10000,
  staffCosts: 12000,
  depreciation: 1000,
  otherCharges: 8000,
  profitBeforeTax: 19500,
  tax: 3500,
  profit: 16000,
};
const PRIOR = { ...CURRENT, turnover: 40000, profitBeforeTax: 9500, tax: 1500, profit: 8000 };

const INPUT = {
  companyNumber: "02706061",
  companyName: "TEST MICRO LIMITED",
  periodStart: "2025-07-01",
  periodEnd: "2026-06-30",
  averageNumberOfEmployees: 2,
  directorName: "Jo Smith",
  dateOfApproval: "2026-09-01",
  balanceSheet: {
    current: {
      fixedAssets: 10000,
      currentAssets: 5000,
      creditorsWithinOneYear: 3000,
      creditorsAfterOneYear: 2000,
      calledUpShareCapital: 100,
      profitAndLossAccount: 9900,
      capitalAndReserves: 10000,
    },
  },
};

function factNames(xhtml) {
  return [...xhtml.matchAll(/name="([a-z]+:[A-Za-z0-9-]+)"/g)].map((match) => match[1]);
}

describe("buildMicroEntityAccounts with a profit and loss account", () => {
  test("tags every line of the FRS 105 profit and loss account with a concept from the FRC taxonomy", () => {
    const xhtml = buildMicroEntityAccounts({ ...INPUT, profitAndLoss: { current: CURRENT } });
    const names = factNames(xhtml);
    for (const name of [
      "core:TurnoverRevenue",
      "core:OtherOperatingIncomeFormat2",
      "core:RawMaterialsConsumablesUsed",
      "core:StaffCostsEmployeeBenefitsExpense",
      "core:DepreciationAmortisationImpairmentExpense",
      "core:OtherOperatingExpensesFormat2",
      "core:ProfitLossOnOrdinaryActivitiesBeforeTax",
      "core:TaxTaxCreditOnProfitOrLossOnOrdinaryActivities",
      "core:ProfitLoss",
    ]) {
      expect(names).toContain(name);
    }
    const concepts = loadFrcTaxonomyConcepts();
    for (const name of names) expect(concepts, `expected ${name} in the concept list`).toContain(name);
  });

  test("is the full copy: the profit and loss statement is included and no section 444 exemption is claimed", () => {
    const xhtml = buildMicroEntityAccounts({ ...INPUT, profitAndLoss: { current: CURRENT } });
    expect(xhtml).toMatch(/ReportIncludesDetailedProfitLossStatementTruefalse"[^>]*>true</);
    expect(xhtml).not.toContain("EntityHasTakenExemptionUnderCompaniesActInNotPublishingItsOwnProfitLossAccountTruefalse");
    expect(xhtml).toContain("bus:FullAccounts");
    expect(xhtml).not.toContain("bus:FilletedAccounts");
    expect(xhtml).toContain("bus:Micro-entities");
  });

  test("shows the comparative year when the request carries one", () => {
    const xhtml = buildMicroEntityAccounts({ ...INPUT, profitAndLoss: { current: CURRENT, prior: PRIOR } });
    expect(xhtml).toContain('id="y2025"');
    expect(xhtml.match(/name="core:TurnoverRevenue"/g)).toHaveLength(2);
  });

  test("keeps the Companies House copy as it was when no profit and loss account is supplied", () => {
    const xhtml = buildMicroEntityAccounts(INPUT);
    expect(factNames(xhtml)).not.toContain("core:TurnoverRevenue");
    expect(xhtml).toContain("bus:FilletedAccounts");
    expect(xhtml).toMatch(/ReportIncludesDetailedProfitLossStatementTruefalse"[^>]*>false</);
  });

  test("refuses a profit and loss account whose lines do not add up", () => {
    expect(() => buildMicroEntityAccounts({ ...INPUT, profitAndLoss: { current: { ...CURRENT, profit: 1 } } })).toThrow(
      /profitAndLoss.current: profit must equal/,
    );
    expect(microProfitAndLossProblems(CURRENT)).toEqual([]);
    expect(microProfitAndLossProblems({ ...CURRENT, profitBeforeTax: 1 })).toHaveLength(2);
  });

  test("names the lines the request reads", () => {
    expect(MICRO_PROFIT_AND_LOSS_LINES).toContain("rawMaterials");
  });
});
