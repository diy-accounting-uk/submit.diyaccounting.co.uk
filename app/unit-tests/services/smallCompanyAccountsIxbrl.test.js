// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/smallCompanyAccountsIxbrl.test.js

import { describe, test, expect } from "vitest";
import {
  buildSmallCompanyAccounts,
  withBalanceSheetTotals,
  profitAndLossProblems,
  fixedAssetClosingFigures,
  fixedAssetNoteNetBookValue,
  SMALL_COMPANY_MANDATORY_CONCEPT_KEYS,
  SMALL_COMPANY_STATEMENT_KEYS,
} from "@app/services/smallCompanyAccountsIxbrl.js";
import { CONCEPTS, loadFrcTaxonomyConcepts } from "@app/services/accountsIxbrlCommon.js";
import { parseXmlDocument } from "@app/lib/xmlDom.js";

const CURRENT_BALANCE_SHEET = {
  fixedAssets: 10000,
  stocks: 500,
  debtors: 2500,
  cashAtBank: 2000,
  tradeCreditors: 1000,
  corporationTax: 1500,
  otherCreditors: 500,
  creditorsAfterOneYear: 2000,
  calledUpShareCapital: 100,
  profitAndLossAccount: 9900,
  capitalAndReserves: 10000,
};

const PRIOR_BALANCE_SHEET = {
  fixedAssets: 8000,
  stocks: 400,
  debtors: 2000,
  cashAtBank: 1600,
  tradeCreditors: 900,
  corporationTax: 1000,
  otherCreditors: 600,
  creditorsAfterOneYear: 1500,
  calledUpShareCapital: 100,
  profitAndLossAccount: 7900,
  capitalAndReserves: 8000,
};

const CURRENT_PROFIT_AND_LOSS = {
  turnover: 50000,
  costOfSales: 20000,
  grossProfit: 30000,
  administrativeExpenses: 25000,
  operatingProfit: 5000,
  interestReceivable: 100,
  profitBeforeTax: 5100,
  tax: 1000,
  profit: 4100,
};

const PRIOR_PROFIT_AND_LOSS = {
  turnover: 40000,
  costOfSales: 16000,
  grossProfit: 24000,
  administrativeExpenses: 21000,
  operatingProfit: 3000,
  interestReceivable: 0,
  profitBeforeTax: 3000,
  tax: 600,
  profit: 2400,
};

const FIXED_ASSET_NOTE = {
  landBuildings: {
    costAtStart: 6000,
    additions: 0,
    disposals: 0,
    depreciationAtStart: 0,
    depreciationCharge: 0,
    depreciationOnDisposals: 0,
  },
  computerEquipment: {
    costAtStart: 5000,
    additions: 1000,
    disposals: 0,
    depreciationAtStart: 1500,
    depreciationCharge: 500,
    depreciationOnDisposals: 0,
  },
};

const SAMPLE_INPUT = {
  companyNumber: "02706061",
  companyName: "TEST SMALL LIMITED",
  periodStart: "2025-07-01",
  periodEnd: "2026-06-30",
  averageNumberOfEmployees: 4,
  principalActivity: "Software consultancy",
  accountingPolicies: "The accounts are prepared under the historical cost convention. Depreciation is 25% a year on computer equipment.",
  directors: ["Jo Smith", "Alex Jones"],
  directorName: "Jo Smith",
  dateOfApproval: "2026-09-01",
  balanceSheet: { current: CURRENT_BALANCE_SHEET },
  profitAndLoss: { current: CURRENT_PROFIT_AND_LOSS },
  fixedAssetNote: FIXED_ASSET_NOTE,
};

const WITH_COMPARATIVES = {
  ...SAMPLE_INPUT,
  balanceSheet: { current: CURRENT_BALANCE_SHEET, prior: PRIOR_BALANCE_SHEET },
  profitAndLoss: { current: CURRENT_PROFIT_AND_LOSS, prior: PRIOR_PROFIT_AND_LOSS },
};

function factNames(xhtml) {
  return Array.from(xhtml.matchAll(/name="([a-z]+:[A-Za-z0-9-]+)"/g), (match) => match[1]);
}

function dimensionNames(xhtml) {
  return Array.from(xhtml.matchAll(/<xbrldi:explicitMember dimension="([a-z]+:[A-Za-z0-9-]+)">([a-z]+:[A-Za-z0-9-]+)</g), (match) => ({
    dimension: match[1],
    member: match[2],
  }));
}

function nonFractionValue(xhtml, name, contextRef) {
  const pattern = new RegExp(`<ix:nonFraction name="${name}" contextRef="${contextRef}"[^>]*>([0-9]+)</ix:nonFraction>`);
  const match = pattern.exec(xhtml);
  return match ? Number(match[1]) : undefined;
}

describe("services/smallCompanyAccountsIxbrl", () => {
  describe("buildSmallCompanyAccounts, full accounts", () => {
    const xhtml = buildSmallCompanyAccounts(SAMPLE_INPUT);

    test("parses as well-formed XML after a bare XML declaration", () => {
      expect(xhtml.split("\n")[0]).toBe('<?xml version="1.0"?>');
      expect(() => parseXmlDocument(xhtml)).not.toThrow();
    });

    test("every mandatory concept is present", () => {
      const names = factNames(xhtml);
      for (const key of SMALL_COMPANY_MANDATORY_CONCEPT_KEYS) {
        expect(names, key).toContain(`${CONCEPTS[key].prefix}:${CONCEPTS[key].name}`);
      }
    });

    test("every concept, dimension and member it uses is in the FRS 102 taxonomy", () => {
      const known = new Set(loadFrcTaxonomyConcepts());
      for (const name of [...factNames(xhtml), ...dimensionNames(xhtml).flatMap((d) => [d.dimension, d.member])]) {
        expect(known.has(name), `${name} is in the taxonomy`).toBe(true);
      }
    });

    test("reports FRS 102 as the accounting standard, the small companies regime as the legislation and full accounts", () => {
      const dimensions = dimensionNames(xhtml);
      expect(dimensions).toContainEqual({ dimension: "bus:AccountingStandardsDimension", member: "bus:FRS102" });
      expect(dimensions).toContainEqual({ dimension: "bus:ApplicableLegislationDimension", member: "bus:SmallCompaniesRegimeForAccounts" });
      expect(dimensions).toContainEqual({ dimension: "bus:AccountsTypeDimension", member: "bus:FullAccounts" });
    });

    test("carries the audit exemption, members, responsibilities and small companies regime statements", () => {
      const names = factNames(xhtml);
      for (const key of SMALL_COMPANY_STATEMENT_KEYS) {
        expect(names).toContain(`${CONCEPTS[key].prefix}:${CONCEPTS[key].name}`);
      }
      expect(xhtml).toContain("section 477 of the Companies Act 2006 relating to small companies");
      expect(xhtml).toContain("subject to the small companies regime");
      expect(xhtml).not.toContain("micro-entities regime");
    });

    test("writes every profit and loss line against the current period", () => {
      expect(nonFractionValue(xhtml, "core:TurnoverRevenue", "y2026")).toBe(50000);
      expect(nonFractionValue(xhtml, "core:CostSales", "y2026")).toBe(20000);
      expect(nonFractionValue(xhtml, "core:GrossProfitLoss", "y2026")).toBe(30000);
      expect(nonFractionValue(xhtml, "core:AdministrativeExpenses", "y2026")).toBe(25000);
      expect(nonFractionValue(xhtml, "core:OperatingProfitLoss", "y2026")).toBe(5000);
      expect(nonFractionValue(xhtml, "core:ProfitLossOnOrdinaryActivitiesBeforeTax", "y2026")).toBe(5100);
      expect(nonFractionValue(xhtml, "core:TaxTaxCreditOnProfitOrLossOnOrdinaryActivities", "y2026")).toBe(1000);
      expect(nonFractionValue(xhtml, "core:ProfitLoss", "y2026")).toBe(4100);
    });

    test("derives current assets and creditors from the sub-lines and writes the sub-lines", () => {
      expect(nonFractionValue(xhtml, "core:CurrentAssets", "e2026")).toBe(5000);
      expect(nonFractionValue(xhtml, "core:TotalInventories", "e2026")).toBe(500);
      expect(nonFractionValue(xhtml, "core:Debtors", "e2026")).toBe(2500);
      expect(nonFractionValue(xhtml, "core:CashBankOnHand", "e2026")).toBe(2000);
      expect(nonFractionValue(xhtml, "core:Creditors", "e2026-within-one-year")).toBe(3000);
      expect(nonFractionValue(xhtml, "core:TradeCreditorsTradePayables", "e2026-within-one-year")).toBe(1000);
      expect(nonFractionValue(xhtml, "core:CorporationTaxPayable", "e2026-within-one-year")).toBe(1500);
      expect(nonFractionValue(xhtml, "core:OtherCreditors", "e2026-within-one-year")).toBe(500);
      expect(nonFractionValue(xhtml, "core:NetAssetsLiabilities", "e2026")).toBe(10000);
    });

    test("writes the fixed asset note by class with closing cost, depreciation and net book value", () => {
      expect(nonFractionValue(xhtml, "core:PropertyPlantEquipmentGrossCost", "e2026-ppe-computerEquipment")).toBe(6000);
      expect(nonFractionValue(xhtml, "core:AccumulatedDepreciationImpairmentPropertyPlantEquipment", "e2026-ppe-computerEquipment")).toBe(
        2000,
      );
      expect(nonFractionValue(xhtml, "core:PropertyPlantEquipment", "e2026-ppe-computerEquipment")).toBe(4000);
      expect(nonFractionValue(xhtml, "core:PropertyPlantEquipment", "e2026-ppe-landBuildings")).toBe(6000);
      expect(
        nonFractionValue(xhtml, "core:IncreaseFromDepreciationChargeForYearPropertyPlantEquipment", "y2026-ppe-computerEquipment"),
      ).toBe(500);
      expect(dimensionNames(xhtml)).toContainEqual({
        dimension: "core:PropertyPlantEquipmentClassesDimension",
        member: "core:ComputerEquipment",
      });
    });

    test("the directors' report names the principal activity, each director and the signing", () => {
      expect(xhtml).toMatch(/name="bus:DescriptionPrincipalActivities"[^>]*>Software consultancy</);
      expect(xhtml).toMatch(/name="bus:NameEntityOfficer" contextRef="y2026-director-1">Jo Smith</);
      expect(xhtml).toMatch(/name="bus:NameEntityOfficer" contextRef="y2026-director-2">Alex Jones</);
      expect(dimensionNames(xhtml)).toContainEqual({ dimension: "bus:EntityOfficersDimension", member: "bus:Director2" });
      expect(factNames(xhtml)).toContain("direp:DirectorSigningDirectorsReport");
      expect(xhtml).toContain("entitled to the small companies regime");
    });

    test("carries no section 444 statement and no prior-year facts", () => {
      expect(factNames(xhtml)).not.toContain(`direp:${CONCEPTS.statementProfitAndLossNotDelivered.name}`);
      expect(xhtml).not.toContain("e2025");
      expect(xhtml).not.toContain("y2025");
    });
  });

  describe("comparatives", () => {
    test("render in a prior-year column against prior-year contexts when supplied", () => {
      const xhtml = buildSmallCompanyAccounts(WITH_COMPARATIVES);
      expect(() => parseXmlDocument(xhtml)).not.toThrow();
      expect(nonFractionValue(xhtml, "core:TurnoverRevenue", "y2025")).toBe(40000);
      expect(nonFractionValue(xhtml, "core:ProfitLoss", "y2025")).toBe(2400);
      expect(nonFractionValue(xhtml, "core:CurrentAssets", "e2025")).toBe(4000);
      expect(nonFractionValue(xhtml, "core:TradeCreditorsTradePayables", "e2025-within-one-year")).toBe(900);
      expect(xhtml).toContain("<xbrli:startDate>2024-07-01</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate>");
    });

    test("an explicit prior period start overrides the default", () => {
      const xhtml = buildSmallCompanyAccounts({ ...WITH_COMPARATIVES, priorPeriodStart: "2024-10-01" });
      expect(xhtml).toContain("<xbrli:startDate>2024-10-01</xbrli:startDate>");
    });

    test("balance sheet comparatives alone leave the profit and loss without a prior column", () => {
      const xhtml = buildSmallCompanyAccounts({
        ...SAMPLE_INPUT,
        balanceSheet: { current: CURRENT_BALANCE_SHEET, prior: PRIOR_BALANCE_SHEET },
      });
      expect(nonFractionValue(xhtml, "core:CurrentAssets", "e2025")).toBe(4000);
      expect(xhtml).not.toContain("y2025");
    });

    test("profit and loss comparatives alone leave the balance sheet without a prior column", () => {
      const xhtml = buildSmallCompanyAccounts({
        ...SAMPLE_INPUT,
        profitAndLoss: { current: CURRENT_PROFIT_AND_LOSS, prior: PRIOR_PROFIT_AND_LOSS },
      });
      expect(nonFractionValue(xhtml, "core:TurnoverRevenue", "y2025")).toBe(40000);
      expect(xhtml).not.toContain("e2025");
    });
  });

  describe("buildSmallCompanyAccounts, filleted", () => {
    const xhtml = buildSmallCompanyAccounts({ ...WITH_COMPARATIVES, filleted: true });

    test("carries the section 444(5A) statement", () => {
      expect(factNames(xhtml)).toContain(`direp:${CONCEPTS.statementProfitAndLossNotDelivered.name}`);
      expect(xhtml).toContain("section 444(5A) of the Companies Act 2006");
    });

    test("omits the profit and loss account and the directors' report", () => {
      const names = factNames(xhtml);
      for (const name of [
        "core:TurnoverRevenue",
        "core:GrossProfitLoss",
        "core:OperatingProfitLoss",
        "core:ProfitLossOnOrdinaryActivitiesBeforeTax",
        "core:ProfitLoss",
        "bus:DescriptionPrincipalActivities",
        "bus:NameEntityOfficer",
        "direp:DirectorSigningDirectorsReport",
        `direp:${CONCEPTS.statementSmallCompaniesRegimeDirectorsReport.name}`,
      ]) {
        expect(names, name).not.toContain(name);
      }
      expect(xhtml).not.toContain("y2025");
    });

    test("keeps the balance sheet, notes and statements", () => {
      expect(nonFractionValue(xhtml, "core:NetAssetsLiabilities", "e2026")).toBe(10000);
      expect(nonFractionValue(xhtml, "core:NetAssetsLiabilities", "e2025")).toBe(8000);
      expect(factNames(xhtml)).toContain("core:PropertyPlantEquipment");
      for (const key of SMALL_COMPANY_STATEMENT_KEYS) {
        expect(factNames(xhtml)).toContain(`${CONCEPTS[key].prefix}:${CONCEPTS[key].name}`);
      }
    });

    test("is well-formed and every concept it uses is in the taxonomy", () => {
      expect(() => parseXmlDocument(xhtml)).not.toThrow();
      const known = new Set(loadFrcTaxonomyConcepts());
      for (const name of [...factNames(xhtml), ...dimensionNames(xhtml).flatMap((d) => [d.dimension, d.member])]) {
        expect(known.has(name), `${name} is in the taxonomy`).toBe(true);
      }
    });
  });

  describe("refuses figures that do not hold together", () => {
    test("capital and reserves that differ from net assets", () => {
      const badInput = { ...SAMPLE_INPUT, balanceSheet: { current: { ...CURRENT_BALANCE_SHEET, capitalAndReserves: 999 } } };
      expect(() => buildSmallCompanyAccounts(badInput)).toThrow(/does not equal net assets/);
    });

    test("a profit and loss account whose gross profit is not turnover less cost of sales", () => {
      const badInput = { ...SAMPLE_INPUT, profitAndLoss: { current: { ...CURRENT_PROFIT_AND_LOSS, grossProfit: 29999 } } };
      expect(() => buildSmallCompanyAccounts(badInput)).toThrow(/profitAndLoss.current: grossProfit must equal turnover less costOfSales/);
    });

    test("a prior-year profit and loss account that does not add up", () => {
      const badInput = {
        ...WITH_COMPARATIVES,
        profitAndLoss: { current: CURRENT_PROFIT_AND_LOSS, prior: { ...PRIOR_PROFIT_AND_LOSS, profit: 1 } },
      };
      expect(() => buildSmallCompanyAccounts(badInput)).toThrow(/profitAndLoss.prior: profit must equal profitBeforeTax less tax/);
    });

    test("a fixed asset note whose net book value differs from fixed assets", () => {
      const badInput = { ...SAMPLE_INPUT, fixedAssetNote: { landBuildings: FIXED_ASSET_NOTE.landBuildings } };
      expect(() => buildSmallCompanyAccounts(badInput)).toThrow(/net book value \(6000\) does not equal fixed assets \(10000\)/);
    });
  });

  test("a loss reports its figure with a sign attribute", () => {
    const loss = {
      ...CURRENT_PROFIT_AND_LOSS,
      administrativeExpenses: 35000,
      operatingProfit: -5000,
      profitBeforeTax: -4900,
      tax: 0,
      profit: -4900,
    };
    const xhtml = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, profitAndLoss: { current: loss } });
    expect(xhtml).toMatch(/name="core:ProfitLoss" contextRef="y2026" unitRef="GBP" decimals="0" sign="-">4900</);
  });

  describe("helpers", () => {
    test("withBalanceSheetTotals adds current assets and creditors within one year", () => {
      const totals = withBalanceSheetTotals(CURRENT_BALANCE_SHEET);
      expect(totals.currentAssets).toBe(5000);
      expect(totals.creditorsWithinOneYear).toBe(3000);
    });

    test("profitAndLossProblems is empty for consistent figures", () => {
      expect(profitAndLossProblems(CURRENT_PROFIT_AND_LOSS)).toEqual([]);
    });

    test("fixedAssetClosingFigures rolls the movements forward", () => {
      expect(fixedAssetClosingFigures(FIXED_ASSET_NOTE.computerEquipment)).toEqual({
        costAtEnd: 6000,
        depreciationAtEnd: 2000,
        netBookValue: 4000,
      });
      expect(fixedAssetNoteNetBookValue(FIXED_ASSET_NOTE)).toBe(10000);
    });
  });
});
