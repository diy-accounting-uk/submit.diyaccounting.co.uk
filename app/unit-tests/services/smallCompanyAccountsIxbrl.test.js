// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/smallCompanyAccountsIxbrl.test.js

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import {
  buildSmallCompanyAccounts,
  withBalanceSheetTotals,
  profitAndLossProblems,
  format2ProfitAndLossProblems,
  SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LINES,
  FORMAT_2_PROFIT_AND_LOSS_CONCEPT_KEY,
  fixedAssetClosingFigures,
  fixedAssetNoteNetBookValue,
  SMALL_COMPANY_MANDATORY_CONCEPT_KEYS,
  SMALL_COMPANY_STATEMENT_KEYS,
} from "@app/services/smallCompanyAccountsIxbrl.js";
import { CONCEPTS, loadFrcTaxonomyConcepts } from "@app/services/accountsIxbrlCommon.js";
import { parseXmlDocument } from "@app/lib/xmlDom.js";
import { ixbrlStructureProblems } from "@app/lib/ixbrlStructure.js";
import {
  SMALL_COMPANY_FORMAT_2_CASE_INPUT,
  SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LABELS,
} from "@app/test-helpers/accountsDocumentCases.js";

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
  registeredOffice: { addressLine1: "1 Test Street", cityOrTown: "London", postalCode: "EC1A 1AA" },
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

// The countries module is outside the business, core and direp lists in the checked-in concept file.
function inFrcBusinessOrCoreTaxonomy({ dimension, member }) {
  return !dimension.startsWith("countries:") && !member.startsWith("countries:");
}

function qnameOf({ prefix, name }) {
  return `${prefix}:${name}`;
}

function nonFractionValue(xhtml, name, contextRef) {
  const pattern = new RegExp(`<ix:nonFraction name="${name}" contextRef="${contextRef}"[^>]*>([0-9,]+)</ix:nonFraction>`);
  const match = pattern.exec(xhtml);
  return match ? Number(match[1].replaceAll(",", "")) : undefined;
}

const PACKAGE_VERSION = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;

function hiddenText(xhtml, name) {
  const hidden = parseXmlDocument(xhtml).getElementsByTagName("ix:hidden")[0];
  return Array.from(hidden.getElementsByTagName("ix:nonNumeric")).find((fact) => fact.getAttribute("name") === name)?.textContent;
}

describe("services/smallCompanyAccountsIxbrl", () => {
  describe("buildSmallCompanyAccounts, full accounts", () => {
    const xhtml = buildSmallCompanyAccounts(SAMPLE_INPUT);

    test("parses as well-formed XML after a bare XML declaration", () => {
      expect(xhtml.split("\n")[0]).toBe('<?xml version="1.0"?>');
      expect(() => parseXmlDocument(xhtml)).not.toThrow();
    });

    test("names the production software and its package version in the hidden section", () => {
      expect(hiddenText(xhtml, "bus:NameProductionSoftware")).toBe("DIY Accounting Submit");
      expect(hiddenText(xhtml, "bus:VersionProductionSoftware")).toBe(PACKAGE_VERSION);
    });

    test("tags the report title, the authorising body, the report signing date and the basis of measurement", () => {
      expect(xhtml).toMatch(/name="bus:ReportTitle" contextRef="y2026">Unaudited financial statements</);
      expect(xhtml).toMatch(/name="core:DescriptionBodyAuthorisingFinancialStatements" contextRef="y2026">the board of directors</);
      expect(xhtml).toMatch(/name="direp:DateSigningDirectorsReport" contextRef="e2026"[^>]*>1 September 2026</);
      expect(xhtml).toMatch(/name="core:GeneralDescriptionBasisMeasurementUsedInPreparingFinancialStatements" contextRef="y2026">/);
      expect(hiddenText(xhtml, "bus:ReportIncludesDetailedProfitLossStatementTruefalse")).toBe("true");
    });

    test("names each director once as an officer, and the signing line is plain text", () => {
      expect(xhtml.match(/name="bus:NameEntityOfficer"/g)).toHaveLength(SAMPLE_INPUT.directors.length);
    });

    test("every mandatory concept is present", () => {
      const names = factNames(xhtml);
      for (const key of SMALL_COMPANY_MANDATORY_CONCEPT_KEYS) {
        expect(names, key).toContain(`${CONCEPTS[key].prefix}:${CONCEPTS[key].name}`);
      }
    });

    test("every concept, dimension and member it uses is in the FRS 102 taxonomy", () => {
      const known = new Set(loadFrcTaxonomyConcepts());
      for (const name of [
        ...factNames(xhtml),
        ...dimensionNames(xhtml)
          .filter(inFrcBusinessOrCoreTaxonomy)
          .flatMap((d) => [d.dimension, d.member]),
      ]) {
        expect(known.has(name), `${name} is in the taxonomy`).toBe(true);
      }
    });

    test("reports Section 1A Small Entities as the accounting standard, the small companies regime as the legislation and full accounts", () => {
      const dimensions = dimensionNames(xhtml);
      expect(dimensions).toContainEqual({ dimension: "bus:AccountingStandardsDimension", member: "bus:SmallEntities" });
      expect(dimensions).toContainEqual({ dimension: "bus:ApplicableLegislationDimension", member: "bus:SmallCompaniesRegimeForAccounts" });
      expect(dimensions).toContainEqual({ dimension: "bus:AccountsTypeDimension", member: "bus:FullAccounts" });
    });

    test("describes the company and puts the signing director's fact on that director's officer context", () => {
      const dimensions = dimensionNames(xhtml);
      expect(dimensions).toContainEqual({ dimension: "bus:LegalFormEntityDimension", member: "bus:PrivateLimitedCompanyLtd" });
      expect(dimensions).toContainEqual({ dimension: "countries:CountriesRegionsDimension", member: "countries:EnglandWales" });
      for (const name of ["bus:LegalFormEntity", "bus:CountryFormationOrIncorporation", "bus:ScopeAccounts"]) {
        expect(factNames(xhtml), name).toContain(name);
      }
      expect(hiddenText(xhtml, "bus:ReportAnAmendedRevisedVersionPreviouslyFiledReportTruefalse")).toBe("false");
      expect(hiddenText(xhtml, "bus:AccountingStandardsAppliedMatchesTaxonomyEntry-pointTruefalse")).toBe("true");
      const signing = new RegExp(`name="core:DirectorSigningFinancialStatements" contextRef="([^"]+)"`).exec(xhtml)[1];
      expect(signing).toBe("y2026-director-1");
      expect(xhtml).toContain(`name="bus:NameEntityOfficer" contextRef="${signing}">Jo Smith<`);
      expect(xhtml.match(/<xbrli:context id="y2026-director-1"/g)).toHaveLength(1);
    });

    test("states that the accounts were prepared and delivered under the small companies regime, and the framework compliance", () => {
      expect(xhtml).toContain(
        "These accounts have been prepared and delivered in accordance with the provisions applicable to companies subject to the small companies regime.",
      );
      expect(xhtml).toContain("prepared in accordance with Section 1A Small Entities of FRS 102");
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

    test("carries no section 444 statement and no prior-year balance sheet or profit and loss facts", () => {
      expect(factNames(xhtml)).not.toContain(`direp:${CONCEPTS.statementProfitAndLossNotDelivered.name}`);
      expect(nonFractionValue(xhtml, "core:NetAssetsLiabilities", "e2025")).toBeUndefined();
      expect(xhtml).not.toContain("y2025");
    });

    test("tags the fixed asset note's opening balances at the prior balance sheet date", () => {
      expect(nonFractionValue(xhtml, "core:PropertyPlantEquipmentGrossCost", "e2025-ppe-computerEquipment")).toBe(5000);
      expect(nonFractionValue(xhtml, "core:AccumulatedDepreciationImpairmentPropertyPlantEquipment", "e2025-ppe-computerEquipment")).toBe(
        1500,
      );
      expect(nonFractionValue(xhtml, "core:PropertyPlantEquipment", "e2025")).toBe(9500);
      expect(nonFractionValue(xhtml, "core:PropertyPlantEquipment", "e2026")).toBe(10000);
      expect(xhtml).toContain("<xbrli:instant>2025-06-30</xbrli:instant>");
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
      expect(nonFractionValue(xhtml, "core:NetAssetsLiabilities", "e2025")).toBeUndefined();
    });
  });

  describe("layout", () => {
    const document = parseXmlDocument(buildSmallCompanyAccounts(WITH_COMPARATIVES));
    const rows = Array.from(document.getElementsByTagName("tr")).map((row) =>
      Array.from(row.getElementsByTagName("td")).map((cell) => cell.textContent.trim()),
    );

    test("the profit and loss account shows both years, deductions in brackets", () => {
      expect(rows).toContainEqual(["Turnover", "50,000", "40,000"]);
      expect(rows).toContainEqual(["Cost of sales", "(20,000)", "(16,000)"]);
      expect(rows).toContainEqual(["Profit for the financial year", "4,100", "2,400"]);
    });

    test("the balance sheet shows the sub-lines under their heading and the subtotal below them", () => {
      const labels = rows.map((row) => row[0]);
      const stocks = labels.indexOf("Stocks");
      expect(labels[stocks - 1]).toBe("Current assets");
      expect(rows[stocks + 3]).toEqual(["", "", "5,000", "4,000"]);
      expect(rows).toContainEqual(["Fixed assets", "4", "10,000", "8,000"]);
    });

    test("the fixed asset note has a column per class and a total", () => {
      const headings = Array.from(document.getElementsByTagName("th")).map((cell) => cell.textContent);
      expect(headings).toEqual(expect.arrayContaining(["Land and buildings", "Computer equipment", "Total"]));
      expect(rows).toContainEqual(["At 30 June 2026", "6,000", "4,000", "10,000"]);
    });

    test("the pages run directors' report, profit and loss account, balance sheet, notes", () => {
      const titles = Array.from(document.getElementsByTagName("h2")).map((heading) => heading.textContent);
      expect(titles).toEqual(["Directors' report", "Profit and loss account", "Balance sheet", "Notes to the financial statements"]);
    });
  });

  describe("company information", () => {
    const xhtml = buildSmallCompanyAccounts(WITH_COMPARATIVES);

    test("states the legal form, country, number and registered office in the notes", () => {
      expect(xhtml).toContain("is a private company limited by shares, registered in England and Wales, registered number");
      expect(xhtml).toContain(
        'Its registered office is <ix:nonNumeric name="bus:AddressLine1" contextRef="y2026-registered-office">1 Test Street</ix:nonNumeric>, <ix:nonNumeric name="bus:PrincipalLocation-CityOrTown" contextRef="y2026-registered-office">London</ix:nonNumeric>, <ix:nonNumeric name="bus:PostalCodeZip" contextRef="y2026-registered-office">EC1A 1AA</ix:nonNumeric>.',
      );
    });

    test("refuses an input without a registered office", () => {
      expect(() => buildSmallCompanyAccounts({ ...WITH_COMPARATIVES, registeredOffice: {} })).toThrow(/registeredOffice/);
    });

    test("states the report period, language and sterling currency", () => {
      const xhtml = buildSmallCompanyAccounts(WITH_COMPARATIVES);
      expect(xhtml).toContain('<ix:nonNumeric name="bus:ReportPeriod" contextRef="y2026"></ix:nonNumeric>');
      expect(xhtml).toContain('<ix:nonNumeric name="bus:ReportPrincipalLanguage" contextRef="y2026"></ix:nonNumeric>');
      expect(xhtml).toContain(
        '<ix:nonNumeric name="bus:PrincipalCurrencyUsedInBusinessReport" contextRef="y2026-currency"></ix:nonNumeric>',
      );
      expect(xhtml).toMatch(/<xbrli:context id="y2026-currency">.*curr:CurrenciesDimension">curr:PoundSterling</);
    });
  });

  describe("buildSmallCompanyAccounts, filleted", () => {
    const xhtml = buildSmallCompanyAccounts({ ...WITH_COMPARATIVES, filleted: true });

    test("carries the section 444(5A) statement", () => {
      expect(factNames(xhtml)).toContain(`direp:${CONCEPTS.statementProfitAndLossNotDelivered.name}`);
      expect(xhtml).toContain("section 444(5A) of the Companies Act 2006");
    });

    test("reports filleted accounts with the signing director named and the principal activity shown in the notes", () => {
      expect(dimensionNames(xhtml)).toContainEqual({ dimension: "bus:AccountsTypeDimension", member: "bus:FilletedAccounts" });
      expect(hiddenText(xhtml, "bus:DescriptionPrincipalActivities")).toBeUndefined();
      expect(parseXmlDocument(xhtml).getElementsByTagName("body")[0].textContent).toContain(
        `The company's principal activity is ${SAMPLE_INPUT.principalActivity}.`,
      );
      expect(xhtml).toMatch(/name="bus:NameEntityOfficer" contextRef="y2026-director-1">Jo Smith</);
    });

    test("puts the signing director's fact on that director's officer context", () => {
      expect(xhtml).toMatch(/name="core:DirectorSigningFinancialStatements" contextRef="y2026-director-1"/);
    });

    test("says in the hidden section that no profit and loss account is delivered", () => {
      expect(hiddenText(xhtml, "bus:ReportIncludesDetailedProfitLossStatementTruefalse")).toBe("false");
      expect(hiddenText(xhtml, "direp:EntityHasTakenExemptionUnderCompaniesActInNotPublishingItsOwnProfitLossAccountTruefalse")).toBe(
        "true",
      );
    });

    test("omits the profit and loss account and the directors' report", () => {
      const names = factNames(xhtml);
      for (const name of [
        "core:TurnoverRevenue",
        "core:GrossProfitLoss",
        "core:OperatingProfitLoss",
        "core:ProfitLossOnOrdinaryActivitiesBeforeTax",
        "core:ProfitLoss",
        "direp:DirectorSigningDirectorsReport",
        `direp:${CONCEPTS.statementSmallCompaniesRegimeDirectorsReport.name}`,
      ]) {
        expect(names, name).not.toContain(name);
      }
      const priorPeriodFacts = [...xhtml.matchAll(/<ix:non\w+ name="([^"]+)" contextRef="y2025[^"]*"/g)].map((match) => match[1]);
      expect(priorPeriodFacts).toEqual(["core:CurrentTaxForPeriod"]);
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
      for (const name of [
        ...factNames(xhtml),
        ...dimensionNames(xhtml)
          .filter(inFrcBusinessOrCoreTaxonomy)
          .flatMap((d) => [d.dimension, d.member]),
      ]) {
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
    expect(xhtml).toMatch(
      /name="core:ProfitLoss" contextRef="y2026" unitRef="GBP" decimals="0" format="ixt2:numdotdecimal" sign="-">4,900</,
    );
    expect(xhtml).toContain('(<ix:nonFraction name="core:ProfitLoss" contextRef="y2026"');
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

  describe("Format 2 profit and loss account", () => {
    const format2 = SMALL_COMPANY_FORMAT_2_CASE_INPUT;
    const xhtml = buildSmallCompanyAccounts(format2);
    const currentContext = `y${format2.periodEnd.slice(0, 4)}`;
    const priorContext = `y${Number(format2.periodEnd.slice(0, 4)) - 1}`;

    test("carries each line's concept on the current and the prior context", () => {
      for (const line of SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LINES) {
        const name = qnameOf(CONCEPTS[FORMAT_2_PROFIT_AND_LOSS_CONCEPT_KEY[line]]);
        expect(nonFractionValue(xhtml, name, currentContext), `${line} current`).toBe(Math.abs(format2.profitAndLoss.current[line]));
        expect(nonFractionValue(xhtml, name, priorContext), `${line} prior`).toBe(Math.abs(format2.profitAndLoss.prior[line]));
      }
    });

    test("tags a decrease in stocks with a sign attribute", () => {
      expect(xhtml).toMatch(
        new RegExp(
          `name="core:IncreaseDecreaseInStocksInventoriesFinishedGoodsWorkInProgress" contextRef="${priorContext}"[^>]*sign="-">50<`,
        ),
      );
    });

    test("prints the Schedule 1 labels in order", () => {
      let from = xhtml.indexOf("Profit and loss account");
      for (const label of SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LABELS) {
        const at = xhtml.indexOf(label, from);
        expect(at, label).toBeGreaterThan(from);
        from = at;
      }
    });

    test("carries no Format 1 line", () => {
      for (const name of ["core:CostSales", "core:GrossProfitLoss", "core:AdministrativeExpenses"]) {
        expect(xhtml).not.toContain(`name="${name}"`);
      }
    });

    test("uses only concepts in the FRC taxonomy", () => {
      const known = new Set(loadFrcTaxonomyConcepts());
      const unknown = factNames(xhtml).filter((name) => !known.has(name));
      expect(unknown).toEqual([]);
    });

    test("refuses an operating profit that is not the lines above it", () => {
      const bad = { ...format2, profitAndLoss: { current: { ...format2.profitAndLoss.current, operatingProfit: 5501 } } };
      expect(() => buildSmallCompanyAccounts(bad)).toThrow(/profitAndLoss.current: operatingProfit must equal turnover plus/);
    });

    test("refuses a profit before tax that ignores the interest payable", () => {
      const bad = { ...format2, profitAndLoss: { current: { ...format2.profitAndLoss.current, profitBeforeTax: 5600, profit: 4600 } } };
      expect(() => buildSmallCompanyAccounts(bad)).toThrow(
        /profitBeforeTax must equal operatingProfit plus interestReceivable less interestPayable/,
      );
    });

    test("refuses a prior-year profit that is not profit before tax less tax", () => {
      const bad = {
        ...format2,
        profitAndLoss: { current: format2.profitAndLoss.current, prior: { ...format2.profitAndLoss.prior, profit: 1 } },
      };
      expect(() => buildSmallCompanyAccounts(bad)).toThrow(/profitAndLoss.prior: profit must equal profitBeforeTax less tax/);
    });

    test("holds no problem for the case figures", () => {
      expect(format2ProfitAndLossProblems(format2.profitAndLoss.current)).toEqual([]);
      expect(format2ProfitAndLossProblems(format2.profitAndLoss.prior)).toEqual([]);
    });

    test("refuses a format that is neither 1 nor 2", () => {
      expect(() => buildSmallCompanyAccounts({ ...format2, profitAndLossFormat: 3 })).toThrow(/profitAndLossFormat must be 1 or 2/);
    });

    test("Format 1 output is unchanged when the format is named", () => {
      expect(buildSmallCompanyAccounts({ ...SAMPLE_INPUT, profitAndLossFormat: 1 })).toBe(buildSmallCompanyAccounts(SAMPLE_INPUT));
    });
  });
});

describe("the principal activity sentence", () => {
  const activity = "the retail of accounting software";
  const full = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, principalActivity: activity });
  const filleted = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, principalActivity: activity, filleted: true });
  const bodyText = (xhtml) => parseXmlDocument(xhtml).getElementsByTagName("body")[0].textContent;

  test("reads as one sentence in the directors' report of a full set", () => {
    expect(bodyText(full)).toContain("The company's principal activity is the retail of accounting software.");
  });

  test("reads as one sentence in the general information note of a filleted set", () => {
    expect(bodyText(filleted)).toContain("The company's principal activity is the retail of accounting software.");
  });

  test("tags the activity text alone", () => {
    expect(full).toMatch(/name="bus:DescriptionPrincipalActivities"[^>]*>the retail of accounting software</);
  });
});

describe("the share capital note and the tax policy of a small company", () => {
  const input = {
    ...WITH_COMPARATIVES,
    taxPolicy: "The tax expense for the year comprises current tax, recognised in profit or loss.",
    shareCapital: { shareClass: "ordinaryShares", nominalValue: 1 },
  };
  const xhtml = buildSmallCompanyAccounts(input);

  test("tags the share type, the shares issued and the par value against the share class", () => {
    expect(xhtml).toMatch(/name="bus:DescriptionShareType" contextRef="y\d{4}-share-class">ordinary</);
    expect(xhtml).toMatch(/name="core:NumberSharesIssuedFullyPaid"[^>]*contextRef="e\d{4}-share-class"[^>]*unitRef="shares"[^>]*>100</);
    expect(xhtml).toMatch(/name="core:ParValueShare"[^>]*contextRef="y\d{4}-share-class"[^>]*unitRef="pure"[^>]*>1</);
    expect(dimensionNames(xhtml)).toContainEqual({ dimension: "bus:EntityShareClassesDimension", member: "bus:OrdinaryShareClass1" });
  });

  test("states the shares in the plural for a count above one and the singular for one", () => {
    expect(xhtml).toMatch(/>100<\/ix:nonFraction> <ix:nonNumeric[^>]*>ordinary<\/ix:nonNumeric> shares of £/);
    const single = buildSmallCompanyAccounts({
      ...input,
      balanceSheet: {
        current: { ...CURRENT_BALANCE_SHEET, calledUpShareCapital: 1, profitAndLossAccount: 9999, capitalAndReserves: 10000 },
      },
    });
    expect(single).toMatch(/>1<\/ix:nonFraction> <ix:nonNumeric[^>]*>ordinary<\/ix:nonNumeric> share of £/);
  });

  test("tags the tax policy in the accounting policies note", () => {
    expect(xhtml).toMatch(/name="core:TaxPolicy" contextRef="y\d{4}">The tax expense for the year comprises current tax/);
  });

  test("leaves both out when the input carries neither", () => {
    const plain = buildSmallCompanyAccounts(WITH_COMPARATIVES);
    expect(factNames(plain)).not.toContain("core:TaxPolicy");
    expect(factNames(plain)).not.toContain("core:ParValueShare");
  });

  test("every concept it adds is in the FRS 102 taxonomy", () => {
    const known = new Set(loadFrcTaxonomyConcepts());
    for (const name of [
      "bus:DescriptionShareType",
      "core:ParValueShare",
      "core:TaxPolicy",
      "core:DepreciationExpensePropertyPlantEquipment",
    ]) {
      expect(known.has(name)).toBe(true);
      expect(factNames(xhtml)).toContain(name);
    }
  });

  test("tags the year's depreciation charge as an expense in the notes", () => {
    expect(xhtml).toMatch(/name="core:DepreciationExpensePropertyPlantEquipment"[^>]*unitRef="GBP"[^>]*>500</);
  });

  test("tags the detailed profit and loss flag true on a full set and false on a filleted one", () => {
    expect(hiddenText(xhtml, "bus:ReportIncludesDetailedProfitLossStatementTruefalse")).toBe("true");
    expect(
      hiddenText(buildSmallCompanyAccounts({ ...input, filleted: true }), "bus:ReportIncludesDetailedProfitLossStatementTruefalse"),
    ).toBe("false");
  });
});

describe("the creditor lines, policies, accountants' report and controlling party of a small company", () => {
  const BANK_YEAR = {
    ...CURRENT_BALANCE_SHEET,
    bankLoansOverdrafts: 300,
    taxationSocialSecurity: 200,
    bankLoansAfterOneYear: 1200,
    tradeCreditors: 1200,
    otherCreditors: 300,
    corporationTax: 1000,
  };
  const withBank = {
    ...SAMPLE_INPUT,
    balanceSheet: { current: BANK_YEAR },
  };

  test("a request without the optional values builds the same creditor and policy markup as before", () => {
    const xhtml = buildSmallCompanyAccounts(SAMPLE_INPUT);
    expect(xhtml).not.toContain("BankBorrowingsOverdrafts");
    expect(xhtml).not.toContain("TaxationSocialSecurityPayable");
    expect(xhtml).not.toContain("<h4>");
    expect(xhtml).not.toContain("accrep:");
    expect(xhtml).not.toContain("ControllingParty");
    expect(xhtml).toContain("AuditExempt-NoAccountantsReport");
  });

  test("totals the creditors within one year with accruals", () => {
    expect(withBalanceSheetTotals({ ...BANK_YEAR, accruals: 400 }).creditorsWithinOneYear).toBe(3400);
  });

  test("tags accruals on a current financial instrument within one year context and recomputes the creditors", () => {
    const year = { ...CURRENT_BALANCE_SHEET, otherCreditors: CURRENT_BALANCE_SHEET.otherCreditors - 400, accruals: 400 };
    const xhtml = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, balanceSheet: { current: year } });
    expect(nonFractionValue(xhtml, "core:AccruedLiabilities", "e2026-accruals")).toBe(400);
    expect(xhtml).toMatch(
      /<xbrli:context id="e2026-accruals">.*FinancialInstrumentCurrentNon-currentDimension">core:CurrentFinancialInstruments<.*MaturitiesOrExpirationPeriodsDimension">core:WithinOneYear</,
    );
    expect(nonFractionValue(xhtml, "core:Creditors", "e2026-within-one-year")).toBe(
      withBalanceSheetTotals(CURRENT_BALANCE_SHEET).creditorsWithinOneYear,
    );
    expect(xhtml).toContain("Accruals");
    expect(loadFrcTaxonomyConcepts()).toContain("core:AccruedLiabilities");
    const plain = buildSmallCompanyAccounts(SAMPLE_INPUT);
    expect(plain).not.toContain("AccruedLiabilities");
  });

  test("defines the context of every fact when accruals are non-zero in the current year and 0 in the prior year", () => {
    const current = { ...CURRENT_BALANCE_SHEET, otherCreditors: CURRENT_BALANCE_SHEET.otherCreditors - 400, accruals: 400 };
    const xhtml = buildSmallCompanyAccounts({
      ...WITH_COMPARATIVES,
      balanceSheet: { current, prior: { ...PRIOR_BALANCE_SHEET, accruals: 0 } },
    });

    expect(() => parseXmlDocument(xhtml)).not.toThrow();
    const defined = new Set(Array.from(xhtml.matchAll(/<xbrli:context id="([^"]+)"/g), (match) => match[1]));
    const referred = new Set(Array.from(xhtml.matchAll(/<ix:non(?:Fraction|Numeric)\b[^>]* contextRef="([^"]+)"/g), (match) => match[1]));
    expect([...referred].filter((contextRef) => !defined.has(contextRef))).toEqual([]);
    expect(nonFractionValue(xhtml, "core:AccruedLiabilities", "e2025-accruals")).toBe(0);
  });

  test("tags the tax charge of both years as current tax in a numbered note, on a full and a filleted set", () => {
    const tax = { current: SAMPLE_INPUT.profitAndLoss.current.tax, prior: WITH_COMPARATIVES.profitAndLoss.prior.tax };
    for (const filleted of [false, true]) {
      const xhtml = buildSmallCompanyAccounts({ ...WITH_COMPARATIVES, filleted });
      expect(nonFractionValue(xhtml, "core:CurrentTaxForPeriod", "y2026-uk-tax")).toBe(tax.current);
      expect(nonFractionValue(xhtml, "core:CurrentTaxForPeriod", "y2025-uk-tax")).toBe(tax.prior);
      expect(xhtml).toMatch(/xbrldi:explicitMember dimension="core:TaxJurisdictionDimension">core:UKTax</);
      expect(xhtml).toMatch(/<h3>\d+\. Tax on profit<\/h3>/);
    }
  });

  test("prints the tax note charge without brackets, and a tax credit with them and sign minus", () => {
    const noteOf = (xhtml) => xhtml.slice(xhtml.search(/<h3>\d+\. Tax on profit<\/h3>/));
    for (const filleted of [false, true]) {
      const note = noteOf(buildSmallCompanyAccounts({ ...WITH_COMPARATIVES, filleted }));
      const start = note.indexOf("current tax on profit for the year");
      const row = note.slice(start, note.indexOf("</tr>", start));
      const [current, prior] = [WITH_COMPARATIVES.profitAndLoss.current.tax, WITH_COMPARATIVES.profitAndLoss.prior.tax].map((v) =>
        v.toLocaleString("en-GB"),
      );
      expect(row).toContain(`>${current}</ix:nonFraction>`);
      expect(row).toContain(`>${prior}</ix:nonFraction>`);
      expect(row).not.toMatch(/[()]/);
    }
    const credit = (figures) => ({ ...figures, tax: -300, profit: figures.profitBeforeTax + 300 });
    const creditNote = noteOf(
      buildSmallCompanyAccounts({
        ...WITH_COMPARATIVES,
        profitAndLoss: { current: credit(WITH_COMPARATIVES.profitAndLoss.current), prior: credit(WITH_COMPARATIVES.profitAndLoss.prior) },
      }),
    );
    expect(creditNote).toContain("(");
    expect(creditNote).toContain('sign="-"');
  });

  test("leaves the tax note out when no year has a tax charge", () => {
    const zero = (figures) => ({ ...figures, tax: 0, profit: figures.profitBeforeTax });
    const xhtml = buildSmallCompanyAccounts({
      ...WITH_COMPARATIVES,
      profitAndLoss: { current: zero(WITH_COMPARATIVES.profitAndLoss.current), prior: zero(WITH_COMPARATIVES.profitAndLoss.prior) },
    });
    expect(xhtml).not.toContain("CurrentTaxForPeriod");
  });

  test("totals the creditors within one year with the two new lines", () => {
    expect(withBalanceSheetTotals(BANK_YEAR).creditorsWithinOneYear).toBe(3000);
  });

  test("tags the bank and taxation lines on the within-one-year context and the bank loans on the after-one-year context", () => {
    const xhtml = buildSmallCompanyAccounts(withBank);
    expect(nonFractionValue(xhtml, "core:BankBorrowingsOverdrafts", "e2026-within-one-year")).toBe(300);
    expect(nonFractionValue(xhtml, "core:TaxationSocialSecurityPayable", "e2026-within-one-year")).toBe(200);
    expect(nonFractionValue(xhtml, "core:BankBorrowingsOverdrafts", "e2026-after-one-year")).toBe(1200);
    expect(nonFractionValue(xhtml, "core:OtherCreditors", "e2026-after-one-year")).toBe(800);
    expect(nonFractionValue(xhtml, "core:Creditors", "e2026-after-one-year")).toBe(2000);
    expect(xhtml).toContain("Bank loans and overdrafts");
    expect(xhtml).toContain("Taxation and social security");
  });

  test("refuses bank loans after one year above the creditors after one year", () => {
    expect(() =>
      buildSmallCompanyAccounts({ ...withBank, balanceSheet: { current: { ...BANK_YEAR, bankLoansAfterOneYear: 2500 } } }),
    ).toThrow(/bankLoansAfterOneYear/);
  });

  test("tags each policy under its subheading in the order of the note, and the going concern basis true", () => {
    const xhtml = buildSmallCompanyAccounts({
      ...SAMPLE_INPUT,
      goingConcernStatement: "Going on.",
      revenueRecognitionPolicy: "Turnover policy.",
      tangibleFixedAssetsPolicy: "Fixed asset policy.",
      impairmentPolicy: "Impairment policy.",
      financialInstrumentsPolicy: "Instruments policy.",
      taxPolicy: "Tax policy.",
      currentIncomeTaxPolicy: "Current tax policy.",
      dividendPolicy: "Dividend policy.",
    });
    const order = [
      "Basis of preparation",
      "Going concern",
      "Turnover",
      "Tangible fixed assets",
      "Impairment",
      "Financial instruments",
      "Taxation",
      "Dividends",
    ].map((heading) => xhtml.indexOf(`<h4>${heading}</h4>`));
    expect(order.every((position, index) => position > 0 && (index === 0 || position > order[index - 1]))).toBe(true);
    expect(xhtml.split("<h4>Taxation</h4>")).toHaveLength(2);
    expect(hiddenText(xhtml, "core:FinancialStatementsArePreparedOnGoing-concernBasisTruefalse")).toBe("true");
    for (const name of [
      "core:DescriptionGoing-concernStatus",
      "core:RevenueRecognitionPolicy",
      "core:DescriptionMeasurementBasisForPropertyPlantEquipment",
      "core:ImpairmentNon-financialAssetsPolicy",
      "core:FinancialInstrumentsRecognitionMeasurementPolicy",
      "core:TaxPolicy",
      "core:CurrentIncomeTaxPolicy",
      "core:DividendPolicy",
    ]) {
      expect(factNames(xhtml)).toContain(name);
      expect(loadFrcTaxonomyConcepts()).toContain(name);
    }
  });

  test("an accountants' report adds its page, tags the firm and the statement and changes the accounts status member", () => {
    const accountantsReport = { accountantsName: "Test Firm LLP", statement: "We compiled these accounts." };
    for (const filleted of [false, true]) {
      const xhtml = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, filleted, accountantsReport });
      expect(xhtml).toMatch(/name="bus:NameEntityAccountants" contextRef="y2026">Test Firm LLP</);
      expect(xhtml).toMatch(/name="accrep:StatementOnScopeAccountantsReport" contextRef="y2026">We compiled these accounts\.</);
      expect(xhtml).toContain("Accountants' report");
      expect(xhtml).toContain("bus:AuditExemptWithAccountantsReport");
      expect(xhtml).not.toContain("bus:AuditExempt-NoAccountantsReport");
      expect(loadFrcTaxonomyConcepts()).toContain("accrep:StatementOnScopeAccountantsReport");
    }
  });

  test("states that the company has no ultimate controlling party, with the fact false on the typed member context", () => {
    const xhtml = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, controllingParty: { ultimate: false } });
    expect(xhtml).toContain("The company has no ultimate controlling party.");
    expect(xhtml).toContain(
      '<xbrldi:typedMember dimension="core:X-ParentEntityOrControllingPartyUltimateControllingPartyGroupingDimension"><core:ParentEntityOrControllingPartyAndUltimateControllingPartyGroupingDimension.domain>1</core:ParentEntityOrControllingPartyAndUltimateControllingPartyGroupingDimension.domain></xbrldi:typedMember>',
    );
    expect(hiddenText(xhtml, "core:ControllingPartyUltimateControllingPartyTruefalse")).toBe("false");
    expect(factNames(xhtml)).not.toContain("core:NameControllingParty");
  });

  test("names the controlling party in the note both ways", () => {
    const ultimate = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, controllingParty: { ultimate: true, name: "Pat Lee" } });
    expect(ultimate).toMatch(
      /The company's ultimate controlling party is <ix:nonNumeric name="core:NameControllingParty" contextRef="y2026-controlling-party-1">Pat Lee</,
    );
    expect(hiddenText(ultimate, "core:ControllingPartyUltimateControllingPartyTruefalse")).toBe("true");
    const notUltimate = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, controllingParty: { ultimate: false, name: "Pat Lee" } });
    expect(notUltimate).toContain("The company's controlling party is ");
    expect(() => buildSmallCompanyAccounts({ ...SAMPLE_INPUT, controllingParty: { ultimate: true } })).toThrow(/controllingParty.name/);
  });
});

describe("the debtors, directors' loan, group and provisions lines of a small company", () => {
  const ZERO_LINES = {
    tradeDebtors: 0,
    otherDebtors: 0,
    prepayments: 0,
    provisionsForLiabilities: 0,
    amountsOwedToDirectors: 0,
    amountsOwedToGroupUndertakings: 0,
  };
  const withYears = (current, prior) => ({ ...WITH_COMPARATIVES, balanceSheet: { current, prior } });
  const split = { ...CURRENT_BALANCE_SHEET, tradeDebtors: 1800, otherDebtors: 400, prepayments: 300 };

  test("absent and zero optional lines build the same document byte for byte", () => {
    for (const input of [SAMPLE_INPUT, WITH_COMPARATIVES, { ...WITH_COMPARATIVES, filleted: true }]) {
      const withZeros = {
        ...input,
        balanceSheet: Object.fromEntries(
          Object.entries(input.balanceSheet).map(([year, figures]) => [year, { ...figures, ...ZERO_LINES }]),
        ),
      };
      expect(buildSmallCompanyAccounts(withZeros)).toBe(buildSmallCompanyAccounts(input));
    }
    const xhtml = buildSmallCompanyAccounts(WITH_COMPARATIVES);
    for (const name of ["TradeDebtors", "OtherDebtors", "PrepaymentsAccruedIncome", "ProvisionsForLiabilities", "AmountsOwedTo"]) {
      expect(xhtml).not.toContain(name);
    }
  });

  test("tags the debtors split in a debtors note beside the debtors total and shows its note number", () => {
    const xhtml = buildSmallCompanyAccounts(SAMPLE_INPUT_WITH_SPLIT());
    expect(nonFractionValue(xhtml, "core:TradeDebtorsTradeReceivables", "e2026")).toBe(1800);
    expect(nonFractionValue(xhtml, "core:OtherDebtors", "e2026")).toBe(400);
    expect(nonFractionValue(xhtml, "core:PrepaymentsAccruedIncome", "e2026")).toBe(300);
    expect(nonFractionValue(xhtml, "core:Debtors", "e2026")).toBe(2500);
    expect(xhtml).toMatch(/<h3>\d+\. Debtors<\/h3>/);
    expect(xhtml).toContain("Total debtors");
    const concepts = loadFrcTaxonomyConcepts();
    for (const name of ["TradeDebtorsTradeReceivables", "OtherDebtors", "PrepaymentsAccruedIncome"]) {
      expect(concepts).toContain(`core:${name}`);
    }
    expect(ixbrlStructureProblems(xhtml)).toEqual([]);
  });

  test("shows only the debtors lines a year carries", () => {
    const xhtml = buildSmallCompanyAccounts({
      ...SAMPLE_INPUT,
      balanceSheet: { current: { ...CURRENT_BALANCE_SHEET, tradeDebtors: 2500 } },
    });
    expect(nonFractionValue(xhtml, "core:TradeDebtorsTradeReceivables", "e2026")).toBe(2500);
    expect(xhtml).not.toContain("core:OtherDebtors");
    expect(xhtml).not.toContain("core:PrepaymentsAccruedIncome");
  });

  test("refuses a debtors split that does not add up to the debtors", () => {
    expect(() =>
      buildSmallCompanyAccounts({ ...SAMPLE_INPUT, balanceSheet: { current: { ...CURRENT_BALANCE_SHEET, tradeDebtors: 1000 } } }),
    ).toThrow(/must add up to debtors/);
  });

  test("splits the creditors after one year into directors, group and the rest", () => {
    const current = { ...CURRENT_BALANCE_SHEET, amountsOwedToDirectors: 1200, amountsOwedToGroupUndertakings: 300 };
    const xhtml = buildSmallCompanyAccounts({ ...SAMPLE_INPUT, balanceSheet: { current } });
    expect(nonFractionValue(xhtml, "core:AmountsOwedToDirectors", "e2026-after-one-year")).toBe(1200);
    expect(nonFractionValue(xhtml, "core:AmountsOwedToGroupUndertakings", "e2026-after-one-year")).toBe(300);
    expect(nonFractionValue(xhtml, "core:OtherCreditors", "e2026-after-one-year")).toBe(500);
    expect(nonFractionValue(xhtml, "core:Creditors", "e2026-after-one-year")).toBe(2000);
    expect(xhtml).toContain("Amounts owed to directors");
    expect(ixbrlStructureProblems(xhtml)).toEqual([]);
  });

  test("refuses after one year splits above the creditors after one year", () => {
    const current = { ...CURRENT_BALANCE_SHEET, bankLoansAfterOneYear: 1500, amountsOwedToDirectors: 600 };
    expect(() => buildSmallCompanyAccounts({ ...SAMPLE_INPUT, balanceSheet: { current } })).toThrow(
      /must not be more than creditorsAfterOneYear/,
    );
  });

  test("takes provisions off the net assets in both years and tags them on the instant context", () => {
    const current = { ...CURRENT_BALANCE_SHEET, provisionsForLiabilities: 300, profitAndLossAccount: 9600, capitalAndReserves: 9700 };
    const xhtml = buildSmallCompanyAccounts(withYears(current, PRIOR_BALANCE_SHEET));
    expect(nonFractionValue(xhtml, "core:ProvisionsForLiabilitiesBalanceSheetSubtotal", "e2026")).toBe(300);
    expect(nonFractionValue(xhtml, "core:ProvisionsForLiabilitiesBalanceSheetSubtotal", "e2025")).toBe(0);
    expect(nonFractionValue(xhtml, "core:NetAssetsLiabilities", "e2026")).toBe(9700);
    expect(xhtml).toContain("Provisions for liabilities");
    expect(loadFrcTaxonomyConcepts()).toContain("core:ProvisionsForLiabilitiesBalanceSheetSubtotal");
    expect(ixbrlStructureProblems(xhtml)).toEqual([]);
  });

  test("refuses provisions that leave capital and reserves unequal to the net assets", () => {
    const current = { ...CURRENT_BALANCE_SHEET, provisionsForLiabilities: 300 };
    expect(() => buildSmallCompanyAccounts({ ...SAMPLE_INPUT, balanceSheet: { current } })).toThrow(/Capital and reserves/);
  });

  function SAMPLE_INPUT_WITH_SPLIT() {
    return withYears(split, { ...PRIOR_BALANCE_SHEET, tradeDebtors: 2000 });
  }
});
