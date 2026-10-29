// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/ctComputationsIxbrl.test.js

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import {
  computationLinesFromResults,
  buildCtComputations,
  loadCtCompTaxonomyConcepts,
  COMPUTATIONS_CONCEPTS,
  CT_COMP_ENTRY_POINT,
  CT_COMP_NAMESPACE,
} from "@app/services/ctComputationsIxbrl.js";
import { parseXmlDocument } from "@app/lib/xmlDom.js";

const BOOK_DIRECTORY = join(process.cwd(), "fixtures", "diya-gl", "precision-code-ltd");

const LINES = {
  profitLossPerAccounts: 171288,
  nonTradingLoanRelationshipCredits: 340,
  depreciation: 13740,
  amortisation: 2500,
  entertaining: 292,
  donations: 417,
  totalCapitalAllowances: 64000,
  adjustedProfitBeforeCapitalAllowances: 187897,
  adjustedProfit: 123897,
};

const INPUT = {
  companyName: "Precision Code Ltd",
  companyNumber: "12345678",
  utr: "8596148860",
  periodStart: "2025-04-01",
  periodEnd: "2026-03-31",
  tradeName: "IT consultancy",
  lines: LINES,
};

function facts(document) {
  const byName = {};
  for (const fact of [...document.getElementsByTagName("ix:nonFraction"), ...document.getElementsByTagName("ix:nonNumeric")]) {
    byName[fact.getAttribute("name")] = {
      value: fact.textContent,
      contextRef: fact.getAttribute("contextRef"),
      sign: fact.getAttribute("sign"),
      format: fact.getAttribute("format"),
    };
  }
  return byName;
}

function contextXml(xml, id) {
  return xml.match(new RegExp(`<xbrli:context id="${id}">.*?</xbrli:context>`))[0];
}

describe("computationLinesFromResults", () => {
  let results;
  beforeAll(async () => {
    const { book, lines } = loadDiyaGlData(BOOK_DIRECTORY);
    results = calculatedResultsFor(book, lines, await loadTaxDataForBook(book));
  });

  test("reads the computation lines from a Company book, in whole pounds that add up", () => {
    expect(computationLinesFromResults(results)).toEqual(LINES);
  });

  test("refuses results with no tax working sheet", () => {
    expect(() => computationLinesFromResults({ "PubP&L": {} })).toThrow(/only a Company \(ltd\) book/);
  });
});

describe("buildCtComputations", () => {
  test("references the CT computational 2025 entry point", () => {
    const xml = buildCtComputations(INPUT);
    expect(xml).toContain(`<link:schemaRef xlink:type="simple" xlink:href="${CT_COMP_ENTRY_POINT}"/>`);
    expect(xml).toContain(`xmlns:ct-comp="${CT_COMP_NAMESPACE}"`);
  });

  test("uses only concepts the taxonomy declares", () => {
    const declared = new Set(loadCtCompTaxonomyConcepts());
    for (const concept of COMPUTATIONS_CONCEPTS) expect(declared.has(`ct-comp:${concept}`), concept).toBe(true);
    const xml = buildCtComputations(INPUT);
    for (const name of xml.match(/name="ct-comp:[^"]+"/g)) expect(declared.has(name.slice(6, -1)), name).toBe(true);
  });

  test("names the production software and its package version on the instant context", () => {
    const byName = facts(parseXmlDocument(buildCtComputations(INPUT)));
    const version = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;
    expect(byName["ct-comp:NameOfProductionSoftware"]).toMatchObject({ value: "DIY Accounting Submit", contextRef: "companyInstant" });
    expect(byName["ct-comp:VersionOfProductionSoftware"]).toMatchObject({ value: version, contextRef: "companyInstant" });
  });

  test("tags the mandatory items on the company context and the lines on the UK trade context", () => {
    const xml = buildCtComputations(INPUT);
    const byName = facts(parseXmlDocument(xml));
    expect(byName["ct-comp:CompanyName"]).toMatchObject({ value: "Precision Code Ltd", contextRef: "companyInstant" });
    expect(byName["ct-comp:TaxReference"]).toMatchObject({ value: "8596148860", contextRef: "companyInstant" });
    expect(byName["ct-comp:StartOfPeriodCoveredByReturn"]).toMatchObject({ value: "1 April 2025", format: "ixt2:datedaymonthyearen" });
    expect(byName["ct-comp:EndOfPeriodCoveredByReturn"].value).toBe("31 March 2026");
    expect(byName["ct-comp:PeriodOfAccountStartDate"].value).toBe("1 April 2025");
    expect(byName["ct-comp:PeriodOfAccountEndDate"].value).toBe("31 March 2026");
    expect(byName["ct-comp:CompanyIsAPartnerInAFirm"]).toMatchObject({ value: "false", contextRef: "companyPeriod" });
    expect(byName["ct-comp:ProfitLossPerAccounts"]).toMatchObject({
      value: "171,288",
      contextRef: "tradePeriod",
      format: "ixt2:numdotdecimal",
    });
    expect(byName["ct-comp:AdjustmentsNon-tradingLoanRelationshipCreditsPerAccounts"].value).toBe("340");
    expect(byName["ct-comp:TotalCapitalAllowances"].value).toBe("64,000");
    expect(byName["ct-comp:AdjustedProfitForThePeriod"]).toMatchObject({ value: "123,897", contextRef: "tradePeriod" });

    const company = contextXml(xml, "companyInstant");
    expect(company).toContain('<xbrli:identifier scheme="http://www.companieshouse.gov.uk/">12345678</xbrli:identifier>');
    expect(company).toContain('<xbrldi:explicitMember dimension="ct-comp:BusinessTypeDimension">ct-comp:Company</xbrldi:explicitMember>');
    expect(company).toContain("<xbrli:instant>2026-03-31</xbrli:instant>");
    const trade = contextXml(xml, "tradePeriod");
    expect(trade).toContain("<ct-comp:BusinessNameDomain>IT consultancy</ct-comp:BusinessNameDomain>");
    expect(trade).toContain('<xbrldi:explicitMember dimension="ct-comp:BusinessTypeDimension">ct-comp:Trade</xbrldi:explicitMember>');
    expect(trade).toContain('<xbrldi:explicitMember dimension="ct-comp:TerritoryDimension">ct-comp:UK</xbrldi:explicitMember>');
  });

  test("leaves out a zero adjustment line and signs a loss per accounts", () => {
    const lines = {
      ...LINES,
      entertaining: 0,
      profitLossPerAccounts: -500,
      adjustedProfitBeforeCapitalAllowances: 15817,
      adjustedProfit: -48183,
    };
    const byName = facts(parseXmlDocument(buildCtComputations({ ...INPUT, lines })));
    expect(byName["ct-comp:AdjustmentsEntertaining"]).toBeUndefined();
    expect(byName["ct-comp:ProfitLossPerAccounts"]).toMatchObject({ value: "500", sign: "-" });
  });

  test("tags a loss as the adjusted loss of the period, in place of the adjusted profit", () => {
    const lines = {
      ...LINES,
      adjustedProfitBeforeCapitalAllowances: 15817,
      adjustedProfit: -48183,
      entertaining: 0,
      profitLossPerAccounts: -500,
    };
    const byName = facts(parseXmlDocument(buildCtComputations({ ...INPUT, lines })));
    expect(byName["ct-comp:AdjustedLossOfPeriod"]).toMatchObject({ value: "48,183", contextRef: "tradePeriod" });
    expect(byName["ct-comp:AdjustedProfitForThePeriod"]).toBeUndefined();
  });

  test("shows the analysis of losses and the carry-back claim, and tags an overseas trade on the overseas territory", () => {
    const losses = {
      arising: 48183,
      usedAgainstTotalProfits: 300,
      carriedBack: 10000,
      carriedForwardFromPeriod: 37883,
      broughtForward: 2000,
      broughtForwardUsedAgainstTrading: 0,
      broughtForwardAgainstTotalProfits: 0,
      broughtForwardCarriedForward: 2000,
      totalCarriedForward: 39883,
    };
    const carryBack = { amount: 10000, priorPeriodStart: "2024-04-01", priorPeriodEnd: "2025-03-31", taxRepayable: 2500 };
    const lines = {
      ...LINES,
      adjustedProfitBeforeCapitalAllowances: 15817,
      adjustedProfit: -48183,
      entertaining: 0,
      profitLossPerAccounts: -500,
    };
    const xml = buildCtComputations({ ...INPUT, lines, losses, carryBack, tradeOutsideUk: true });
    expect(xml).toContain("Trading loss of the period carried forward");
    expect(xml).toContain("39,883");
    expect(xml).toContain("Corporation Tax repayable 2,500.00");
    expect(contextXml(xml, "tradePeriod")).toContain('dimension="ct-comp:TerritoryDimension">ct-comp:Overseas<');
    expect(parseXmlDocument(xml)).toBeTruthy();
  });

  test("tags the capital allowance classes on the trade context and leaves out the classes at zero", () => {
    const lines = {
      ...LINES,
      fullExpensingAllowances: 20000,
      fullExpensingBalancingCharges: 500,
      specialRateAllowances: 0,
      specialRatePoolAllowances: 800,
      totalCapitalAllowances: 64000 + 20000 - 500 + 800,
      adjustedProfit: 123897 - 20300,
    };
    const xml = buildCtComputations({ ...INPUT, lines });
    const byName = facts(parseXmlDocument(xml));
    expect(byName["ct-comp:MainPoolTotalFullExpensingAllowance"]).toMatchObject({ value: "20,000", contextRef: "tradePeriod" });
    expect(byName["ct-comp:MainPoolBalancingChargesInRespectOfFullExpensing"]).toMatchObject({ value: "500", contextRef: "tradePeriod" });
    expect(byName["ct-comp:SpecialRatePoolTotalAllowances"]).toMatchObject({ value: "800", contextRef: "tradePeriod" });
    expect(byName["ct-comp:SpecialRatePoolTotalSRAllowance"]).toBeUndefined();
    expect(xml).toContain("Capital allowances by class");
    expect(buildCtComputations(INPUT)).not.toContain("Capital allowances by class");
  });

  test("refuses a computation that does not add up, and missing identifiers", () => {
    expect(() => buildCtComputations({ ...INPUT, lines: { ...LINES, adjustedProfit: 1 } })).toThrow(/does not add up/);
    expect(() => buildCtComputations({ ...INPUT, utr: "12345" })).toThrow(/UTR/);
    expect(() => buildCtComputations({ ...INPUT, companyNumber: "" })).toThrow(/registration number/);
    expect(() => buildCtComputations({ ...INPUT, tradeName: " " })).toThrow(/trade name/);
  });
});
