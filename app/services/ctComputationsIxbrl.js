// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/ctComputationsIxbrl.js
// The Corporation Tax computations a small trading company attaches to its CT600, as one iXBRL
// document tagged with HMRC's CT computational 2025 taxonomy. The lines are HMRC's computations
// format v1.1 section 1 (accounts adjustments) and section 2 (the capital allowances total) that
// diya-gl's Company book reads: profit per accounts, the bank interest moved out of trading, the
// depreciation, amortisation and entertaining added back, and the capital allowances.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { escapeXmlText } from "../lib/xmlDom.js";

// eslint-disable-next-line sonarjs/no-clear-text-protocols -- the entry point HMRC accepts is this http URI, resolved from the taxonomy package
export const CT_COMP_ENTRY_POINT = "http://www.hmrc.gov.uk/schemas/ct/comp/2025-01-01/ct-comp-2025.xsd";
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- taxonomy namespace, compared byte for byte, not fetched
export const CT_COMP_NAMESPACE = "http://www.hmrc.gov.uk/schemas/ct/comp/2025-01-01";

// The computations context entity identifier for a company incorporated under the Companies Act
// 2006 is its registration number on the Companies House scheme, the same as its accounts use.
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- identifier scheme URI, compared byte for byte, not fetched
const COMPANIES_HOUSE_SCHEME = "http://www.companieshouse.gov.uk/";

// Each trading line, in the order the computation shows it, with its ct-comp concept and whether
// it adds to or takes from the profit per accounts.
export const TRADING_LINES = [
  {
    key: "nonTradingLoanRelationshipCredits",
    concept: "AdjustmentsNon-tradingLoanRelationshipCreditsPerAccounts",
    effect: -1,
    label: "Less: bank interest (non-trading loan relationship credits)",
  },
  { key: "depreciation", concept: "AdjustmentsDepreciation", effect: 1, label: "Add: depreciation" },
  { key: "amortisation", concept: "AdjustmentsAmortisation", effect: 1, label: "Add: goodwill amortisation" },
  { key: "entertaining", concept: "AdjustmentsEntertaining", effect: 1, label: "Add: entertaining" },
];

export const COMPUTATIONS_CONCEPTS = [
  "CompanyName",
  "TaxReference",
  "StartOfPeriodCoveredByReturn",
  "EndOfPeriodCoveredByReturn",
  "PeriodOfAccountStartDate",
  "PeriodOfAccountEndDate",
  "CompanyIsAPartnerInAFirm",
  "ProfitLossPerAccounts",
  ...TRADING_LINES.map((line) => line.concept),
  "AdjustedProfitOrLossBeforeAccountingPeriodAdjustments",
  "TotalCapitalAllowances",
  "AdjustedProfitForThePeriod",
];

function wholePounds(value) {
  return Math.round(value || 0);
}

function positiveWholePounds(value) {
  return value > 0 ? Math.round(value) : 0;
}

/**
 * The computation lines in whole pounds, from a Company book's calculated results. Each line is
 * rounded on its own and the totals are summed from the rounded lines, so the computation adds up
 * exactly; the adjusted profit is what CT600 box 155 carries.
 * @param {object} results - diya-gl calculatedResultsFor output
 * @returns {{profitLossPerAccounts: number, nonTradingLoanRelationshipCredits: number, depreciation: number, amortisation: number, entertaining: number, adjustedProfitBeforeCapitalAllowances: number, totalCapitalAllowances: number, adjustedProfit: number}}
 */
export function computationLinesFromResults(results) {
  const workingSheet = results.CorporationTax;
  const profitAndLoss = results["PubP&L"];
  if (!workingSheet || !profitAndLoss) {
    throw new Error(
      "The book carries no CorporationTax working sheet or published profit and loss account; only a Company (ltd) book has a tax computation",
    );
  }
  const lines = {
    profitLossPerAccounts: wholePounds(profitAndLoss.F49),
    nonTradingLoanRelationshipCredits: positiveWholePounds(workingSheet.K24),
    depreciation: positiveWholePounds(workingSheet.I8),
    amortisation: positiveWholePounds(workingSheet.I7),
    entertaining: positiveWholePounds(workingSheet.I9),
    totalCapitalAllowances: wholePounds(workingSheet.K20),
  };
  lines.adjustedProfitBeforeCapitalAllowances =
    lines.profitLossPerAccounts + TRADING_LINES.reduce((total, line) => total + line.effect * lines[line.key], 0);
  lines.adjustedProfit = lines.adjustedProfitBeforeCapitalAllowances - lines.totalCapitalAllowances;
  return lines;
}

function monetaryFact(concept, contextRef, value) {
  const sign = value < 0 ? ' sign="-"' : "";
  return `<ix:nonFraction name="ct-comp:${concept}" contextRef="${contextRef}" unitRef="GBP" decimals="0"${sign}>${Math.abs(value)}</ix:nonFraction>`;
}

function textFact(concept, contextRef, text) {
  return `<ix:nonNumeric name="ct-comp:${concept}" contextRef="${contextRef}">${escapeXmlText(text)}</ix:nonNumeric>`;
}

function dateFact(concept, contextRef, isoDate) {
  return `<ix:nonNumeric name="ct-comp:${concept}" contextRef="${contextRef}">${isoDate}</ix:nonNumeric>`;
}

/**
 * Build the computations iXBRL document.
 *
 * @param {object} input
 * @param {string} input.companyName
 * @param {string} input.companyNumber - the Companies House registration number, the context entity identifier
 * @param {string} input.utr - the 10-digit UTR; equals the CT600's Reference (validation 1607)
 * @param {string} input.periodStart - ISO date, the return period start
 * @param {string} input.periodEnd - ISO date, equals the CT600's PeriodCovered/To (validation 1607)
 * @param {string} input.tradeName - names the trade in the BusinessNameDimension
 * @param {object} input.lines - computationLinesFromResults output
 * @returns {string} the XHTML document
 */
export function buildCtComputations({ companyName, companyNumber, utr, periodStart, periodEnd, tradeName, lines }) {
  if (!/^\d{10}$/.test(utr)) throw new Error("The UTR must be 10 digits");
  if (!companyNumber) throw new Error("The company registration number is required for the context entity identifier");
  if (!tradeName || !tradeName.trim()) throw new Error("The trade name is required for the computation's trade context");
  const expectedAdjusted =
    lines.profitLossPerAccounts +
    TRADING_LINES.reduce((total, line) => total + line.effect * lines[line.key], 0) -
    lines.totalCapitalAllowances;
  if (expectedAdjusted !== lines.adjustedProfit) {
    throw new Error(
      `The computation does not add up: the lines give ${expectedAdjusted}, the adjusted profit says ${lines.adjustedProfit}`,
    );
  }

  const identifier = `<xbrli:identifier scheme="${COMPANIES_HOUSE_SCHEME}">${escapeXmlText(companyNumber)}</xbrli:identifier>`;
  const company = `<xbrldi:explicitMember dimension="ct-comp:BusinessTypeDimension">ct-comp:Company</xbrldi:explicitMember>`;
  const trade = `<xbrldi:typedMember dimension="ct-comp:BusinessNameDimension"><ct-comp:BusinessNameDomain>${escapeXmlText(tradeName)}</ct-comp:BusinessNameDomain></xbrldi:typedMember><xbrldi:explicitMember dimension="ct-comp:BusinessTypeDimension">ct-comp:Trade</xbrldi:explicitMember><xbrldi:explicitMember dimension="ct-comp:TerritoryDimension">ct-comp:UK</xbrldi:explicitMember>`;
  const duration = `<xbrli:period><xbrli:startDate>${periodStart}</xbrli:startDate><xbrli:endDate>${periodEnd}</xbrli:endDate></xbrli:period>`;
  const instant = `<xbrli:period><xbrli:instant>${periodEnd}</xbrli:instant></xbrli:period>`;
  const context = (id, segment, period) =>
    `<xbrli:context id="${id}"><xbrli:entity>${identifier}<xbrli:segment>${segment}</xbrli:segment></xbrli:entity>${period}</xbrli:context>`;
  const contextsXml = [
    context("companyInstant", company, instant),
    context("companyPeriod", company, duration),
    context("tradePeriod", trade, duration),
  ].join("\n");

  const tradeRows = TRADING_LINES.filter((line) => lines[line.key] !== 0)
    .map((line) => `<tr><td>${escapeXmlText(line.label)}</td><td>${monetaryFact(line.concept, "tradePeriod", lines[line.key])}</td></tr>`)
    .join("\n");

  const bodyHtml = `<h1>${textFact("CompanyName", "companyInstant", companyName)}</h1>
<p>Corporation Tax computation. Unique Taxpayer Reference ${textFact("TaxReference", "companyInstant", utr)}.</p>
<p>Return period ${dateFact("StartOfPeriodCoveredByReturn", "companyInstant", periodStart)} to ${dateFact("EndOfPeriodCoveredByReturn", "companyInstant", periodEnd)}.
Period of account ${dateFact("PeriodOfAccountStartDate", "companyInstant", periodStart)} to ${dateFact("PeriodOfAccountEndDate", "companyInstant", periodEnd)}.</p>
<p>The company is a partner in a firm: <ix:nonNumeric name="ct-comp:CompanyIsAPartnerInAFirm" contextRef="companyPeriod">false</ix:nonNumeric></p>
<h2>Trading profits: ${escapeXmlText(tradeName)}</h2>
<table>
<tr><td>Profit before tax per accounts</td><td>${monetaryFact("ProfitLossPerAccounts", "tradePeriod", lines.profitLossPerAccounts)}</td></tr>
${tradeRows}
<tr><td>Adjusted profit before capital allowances</td><td>${monetaryFact("AdjustedProfitOrLossBeforeAccountingPeriodAdjustments", "tradePeriod", lines.adjustedProfitBeforeCapitalAllowances)}</td></tr>
<tr><td>Less: capital allowances</td><td>${monetaryFact("TotalCapitalAllowances", "tradePeriod", lines.totalCapitalAllowances)}</td></tr>
<tr><td>Adjusted trading profit</td><td>${monetaryFact("AdjustedProfitForThePeriod", "tradePeriod", lines.adjustedProfit)}</td></tr>
</table>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:ct-comp="${CT_COMP_NAMESPACE}">
<head><title>${escapeXmlText(companyName)} - Corporation Tax computation</title></head>
<body>
<div style="display:none">
<ix:header>
<ix:references><link:schemaRef xlink:type="simple" xlink:href="${CT_COMP_ENTRY_POINT}"/></ix:references>
<ix:resources>
${contextsXml}
<xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
</ix:resources>
</ix:header>
</div>
${bodyHtml}
</body>
</html>
`;
}

let cachedConcepts;

/**
 * The concept names the CT computational 2025 taxonomy declares, from the checked-in fixture.
 * @returns {string[]}
 */
export function loadCtCompTaxonomyConcepts() {
  if (!cachedConcepts) {
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "hmrc-ct-comp", "ct-comp-2025-concepts.json");
    cachedConcepts = JSON.parse(readFileSync(fixturePath, "utf8")).concepts;
  }
  return cachedConcepts;
}
