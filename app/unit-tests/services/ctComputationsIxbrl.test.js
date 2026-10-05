// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/ctComputationsIxbrl.test.js

import { describe, test, expect, beforeAll } from "vitest";
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
  profitLossPerAccounts: 171888,
  nonTradingLoanRelationshipCredits: 340,
  depreciation: 13740,
  amortisation: 2500,
  entertaining: 292,
  totalCapitalAllowances: 64000,
  adjustedProfitBeforeCapitalAllowances: 188080,
  adjustedProfit: 124080,
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

  test("tags the mandatory items on the company context and the lines on the UK trade context", () => {
    const xml = buildCtComputations(INPUT);
    const byName = facts(parseXmlDocument(xml));
    expect(byName["ct-comp:CompanyName"]).toMatchObject({ value: "Precision Code Ltd", contextRef: "companyInstant" });
    expect(byName["ct-comp:TaxReference"]).toMatchObject({ value: "8596148860", contextRef: "companyInstant" });
    expect(byName["ct-comp:StartOfPeriodCoveredByReturn"].value).toBe("2025-04-01");
    expect(byName["ct-comp:EndOfPeriodCoveredByReturn"].value).toBe("2026-03-31");
    expect(byName["ct-comp:PeriodOfAccountStartDate"].value).toBe("2025-04-01");
    expect(byName["ct-comp:PeriodOfAccountEndDate"].value).toBe("2026-03-31");
    expect(byName["ct-comp:CompanyIsAPartnerInAFirm"]).toMatchObject({ value: "false", contextRef: "companyPeriod" });
    expect(byName["ct-comp:ProfitLossPerAccounts"]).toMatchObject({ value: "171888", contextRef: "tradePeriod" });
    expect(byName["ct-comp:AdjustmentsNon-tradingLoanRelationshipCreditsPerAccounts"].value).toBe("340");
    expect(byName["ct-comp:TotalCapitalAllowances"].value).toBe("64000");
    expect(byName["ct-comp:AdjustedProfitForThePeriod"]).toMatchObject({ value: "124080", contextRef: "tradePeriod" });

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
      adjustedProfitBeforeCapitalAllowances: 15400,
      adjustedProfit: -48600,
    };
    const byName = facts(parseXmlDocument(buildCtComputations({ ...INPUT, lines })));
    expect(byName["ct-comp:AdjustmentsEntertaining"]).toBeUndefined();
    expect(byName["ct-comp:ProfitLossPerAccounts"]).toMatchObject({ value: "500", sign: "-" });
  });

  test("refuses a computation that does not add up, and missing identifiers", () => {
    expect(() => buildCtComputations({ ...INPUT, lines: { ...LINES, adjustedProfit: 1 } })).toThrow(/does not add up/);
    expect(() => buildCtComputations({ ...INPUT, utr: "12345" })).toThrow(/UTR/);
    expect(() => buildCtComputations({ ...INPUT, companyNumber: "" })).toThrow(/registration number/);
    expect(() => buildCtComputations({ ...INPUT, tradeName: " " })).toThrow(/trade name/);
  });
});
