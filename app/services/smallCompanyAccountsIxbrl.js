// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/smallCompanyAccountsIxbrl.js
// Builds a small company's FRS 102 section 1A annual accounts as one iXBRL document: the full
// profit and loss account, the Format 1 balance sheet with its sub-lines, the directors' report,
// the fixed asset note and the small-companies-regime statements. With `filleted` the document is
// the Companies House copy under section 444: it carries the section 444(5A) statement and omits
// the profit and loss account and the directors' report. Prior-year comparatives render when
// supplied and are omitted when not.

import { escapeXmlText } from "../lib/xmlDom.js";
import {
  CONCEPTS,
  DIMENSIONS,
  MEMBERS,
  qname,
  buildContexts,
  formatMonetary,
  renderStatement,
  renderFixedFact,
  renderTextFact,
  renderMonetaryFact,
  dimensionMemberXml,
  buildDimensionedContext,
  assembleBalanceSheetFacts,
  renderAccountsDocument,
} from "./accountsIxbrlCommon.js";

export const SMALL_COMPANY_BALANCE_SHEET_LINES = [
  "fixedAssets",
  "stocks",
  "debtors",
  "cashAtBank",
  "tradeCreditors",
  "corporationTax",
  "otherCreditors",
  "creditorsAfterOneYear",
  "calledUpShareCapital",
  "profitAndLossAccount",
  "capitalAndReserves",
];

export const SMALL_COMPANY_PROFIT_AND_LOSS_LINES = [
  "turnover",
  "costOfSales",
  "grossProfit",
  "administrativeExpenses",
  "operatingProfit",
  "interestReceivable",
  "profitBeforeTax",
  "tax",
  "profit",
];

export const FIXED_ASSET_CLASSES = ["landBuildings", "plantMachinery", "furnitureFittings", "computerEquipment", "motorVehicles"];

export const FIXED_ASSET_CLASS_LABEL = {
  landBuildings: "Land and buildings",
  plantMachinery: "Plant and machinery",
  furnitureFittings: "Fixtures and fittings",
  computerEquipment: "Computer equipment",
  motorVehicles: "Motor vehicles",
};

export const FIXED_ASSET_CLASS_FIELDS = [
  "costAtStart",
  "additions",
  "disposals",
  "depreciationAtStart",
  "depreciationCharge",
  "depreciationOnDisposals",
];

export const SMALL_COMPANY_STATEMENT_KEYS = [
  "statementAuditExemptionSection477",
  "statementMembersNotRequiredAudit",
  "statementDirectorsResponsibilities",
  "statementSmallCompaniesRegimeAccounts",
];

export const SMALL_COMPANY_MANDATORY_CONCEPT_KEYS = [
  "companiesHouseRegisteredNumber",
  "entityCurrentLegalOrRegisteredName",
  "balanceSheetDate",
  "dateAuthorisationFinancialStatementsForIssue",
  "directorSigningFinancialStatements",
  "entityDormantTruefalse",
  "startDateForPeriodCoveredByReport",
  "endDateForPeriodCoveredByReport",
  "entityTradingStatus",
  "accountsStatusAuditedOrUnaudited",
  "accountsType",
  "accountingStandardsApplied",
  "applicableLegislation",
];

export const PROFIT_AND_LOSS_CONCEPT_KEY = {
  turnover: "turnoverRevenue",
  costOfSales: "costSales",
  grossProfit: "grossProfitLoss",
  administrativeExpenses: "administrativeExpenses",
  operatingProfit: "operatingProfitLoss",
  interestReceivable: "otherInterestReceivable",
  profitBeforeTax: "profitLossBeforeTax",
  tax: "taxOnProfitLoss",
  profit: "profitLoss",
};

const PROFIT_AND_LOSS_LABEL = {
  turnover: "Turnover",
  costOfSales: "Cost of sales",
  grossProfit: "Gross profit",
  administrativeExpenses: "Administrative expenses",
  operatingProfit: "Operating profit",
  interestReceivable: "Interest receivable and similar income",
  profitBeforeTax: "Profit on ordinary activities before taxation",
  tax: "Tax on profit on ordinary activities",
  profit: "Profit for the financial year",
};

/**
 * The current assets and creditors totals a balance sheet carries, derived from its sub-lines.
 * @param {object} figures - the sub-lines of SMALL_COMPANY_BALANCE_SHEET_LINES
 * @returns {object} the figures plus currentAssets and creditorsWithinOneYear
 */
export function withBalanceSheetTotals(figures) {
  return {
    ...figures,
    currentAssets: figures.stocks + figures.debtors + figures.cashAtBank,
    creditorsWithinOneYear: figures.tradeCreditors + figures.corporationTax + figures.otherCreditors,
  };
}

/**
 * The profit and loss identities a set of figures must hold, as messages; empty when they hold.
 * @param {object} figures - the lines of SMALL_COMPANY_PROFIT_AND_LOSS_LINES
 * @returns {string[]}
 */
export function profitAndLossProblems(figures) {
  const problems = [];
  if (figures.grossProfit !== figures.turnover - figures.costOfSales) problems.push("grossProfit must equal turnover less costOfSales");
  if (figures.operatingProfit !== figures.grossProfit - figures.administrativeExpenses)
    problems.push("operatingProfit must equal grossProfit less administrativeExpenses");
  if (figures.profitBeforeTax !== figures.operatingProfit + figures.interestReceivable)
    problems.push("profitBeforeTax must equal operatingProfit plus interestReceivable");
  if (figures.profit !== figures.profitBeforeTax - figures.tax) problems.push("profit must equal profitBeforeTax less tax");
  return problems;
}

/**
 * The fixed asset note's closing figures for each class, derived from its movements.
 * @param {object} classFigures - the FIXED_ASSET_CLASS_FIELDS of one class
 * @returns {{costAtEnd: number, depreciationAtEnd: number, netBookValue: number}}
 */
export function fixedAssetClosingFigures(classFigures) {
  const costAtEnd = classFigures.costAtStart + classFigures.additions - classFigures.disposals;
  const depreciationAtEnd = classFigures.depreciationAtStart + classFigures.depreciationCharge - classFigures.depreciationOnDisposals;
  return { costAtEnd, depreciationAtEnd, netBookValue: costAtEnd - depreciationAtEnd };
}

/**
 * The total net book value of a fixed asset note, and whether it matches the balance sheet's fixed assets.
 * @param {Record<string, object>} fixedAssetNote - class name to FIXED_ASSET_CLASS_FIELDS
 * @returns {number}
 */
export function fixedAssetNoteNetBookValue(fixedAssetNote) {
  return Object.values(fixedAssetNote).reduce((total, classFigures) => total + fixedAssetClosingFigures(classFigures).netBookValue, 0);
}

function money(conceptKey, contextRef, value) {
  return renderMonetaryFact(conceptKey, contextRef, "GBP", value);
}

function row(label, currentXml, priorXml) {
  return `<tr><td>${escapeXmlText(label)}</td><td>${currentXml}</td><td>${priorXml ?? ""}</td></tr>`;
}

function table(headingText, hasPrior, rows) {
  return `<h2>${escapeXmlText(headingText)}</h2>
<table><thead><tr><th></th><th>Current year</th>${hasPrior ? "<th>Prior year</th>" : "<th></th>"}</tr></thead><tbody>
${rows.join("\n")}
</tbody></table>`;
}

function profitAndLossHtml({ refs, current, prior }) {
  const rows = SMALL_COMPANY_PROFIT_AND_LOSS_LINES.map((line) =>
    row(
      PROFIT_AND_LOSS_LABEL[line],
      money(PROFIT_AND_LOSS_CONCEPT_KEY[line], refs.current, current[line]),
      prior ? money(PROFIT_AND_LOSS_CONCEPT_KEY[line], refs.prior, prior[line]) : undefined,
    ),
  );
  return table("Profit and loss account", Boolean(prior), rows);
}

function balanceSheetHtml({ refs, current, prior, additionalContexts, entityIdentifierXml, periodXml }) {
  const currentWithTotals = withBalanceSheetTotals(current);
  const priorWithTotals = prior ? withBalanceSheetTotals(prior) : undefined;

  const mainFacts = [
    assembleBalanceSheetFacts({
      contextRef: refs.currentInstant,
      entityIdentifierXml,
      periodXml: periodXml[refs.currentInstant],
      additionalContexts,
      unitRef: "GBP",
      figures: currentWithTotals,
    }),
  ];
  if (priorWithTotals) {
    mainFacts.push(
      assembleBalanceSheetFacts({
        contextRef: refs.priorInstant,
        entityIdentifierXml,
        periodXml: periodXml[refs.priorInstant],
        additionalContexts,
        unitRef: "GBP",
        figures: priorWithTotals,
      }),
    );
  }

  const lines = [
    ["Stocks", "totalInventories", "stocks", ""],
    ["Debtors", "debtors", "debtors", ""],
    ["Cash at bank and in hand", "cashBankOnHand", "cashAtBank", ""],
    ["Trade creditors", "tradeCreditors", "tradeCreditors", "-within-one-year"],
    ["Corporation tax", "corporationTaxPayable", "corporationTax", "-within-one-year"],
    ["Other creditors", "otherCreditors", "otherCreditors", "-within-one-year"],
  ];
  const rows = lines.map(([label, conceptKey, field, contextSuffix]) =>
    row(
      label,
      money(conceptKey, `${refs.currentInstant}${contextSuffix}`, current[field]),
      priorWithTotals ? money(conceptKey, `${refs.priorInstant}${contextSuffix}`, prior[field]) : undefined,
    ),
  );
  return { html: table("Balance sheet", Boolean(priorWithTotals), rows), mainFacts: mainFacts.join("") };
}

function fixedAssetNoteFacts({ refs, fixedAssetNote, entityIdentifierXml, periodXml, additionalContexts }) {
  const facts = [];
  const htmlRows = [];
  for (const className of FIXED_ASSET_CLASSES) {
    const classFigures = fixedAssetNote[className];
    if (!classFigures) continue;
    const member = MEMBERS[className];
    const dimensionXml = dimensionMemberXml(DIMENSIONS.propertyPlantEquipmentClasses, member);
    const instantRef = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.currentInstant],
      dimensionXml,
      id: `${refs.currentInstant}-ppe-${className}`,
    });
    const durationRef = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.current],
      dimensionXml,
      id: `${refs.current}-ppe-${className}`,
    });
    const closing = fixedAssetClosingFigures(classFigures);
    facts.push(
      money("propertyPlantEquipmentGrossCost", instantRef, closing.costAtEnd),
      money("additionsPropertyPlantEquipment", durationRef, classFigures.additions),
      money("disposalsPropertyPlantEquipment", durationRef, classFigures.disposals),
      money("accumulatedDepreciationPropertyPlantEquipment", instantRef, closing.depreciationAtEnd),
      money("depreciationChargePropertyPlantEquipment", durationRef, classFigures.depreciationCharge),
      money("depreciationDisposalsPropertyPlantEquipment", durationRef, classFigures.depreciationOnDisposals),
      money("propertyPlantEquipment", instantRef, closing.netBookValue),
    );
    htmlRows.push(
      `<tr><td>${FIXED_ASSET_CLASS_LABEL[className]}</td><td>${money("propertyPlantEquipmentGrossCost", instantRef, closing.costAtEnd)}</td><td>${money("accumulatedDepreciationPropertyPlantEquipment", instantRef, closing.depreciationAtEnd)}</td><td>${money("propertyPlantEquipment", instantRef, closing.netBookValue)}</td></tr>`,
    );
  }
  return { facts, htmlRows };
}

function directorsReportHtml({ input, refs, additionalContexts, entityIdentifierXml, periodXml }) {
  const directorFacts = input.directors.map((name, index) => {
    const contextRef = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.current],
      dimensionXml: dimensionMemberXml(DIMENSIONS.entityOfficers, { prefix: "bus", name: `Director${index + 1}` }),
      id: `${refs.current}-director-${index + 1}`,
    });
    return `<li>${renderTextFact("nameEntityOfficer", contextRef, name)}</li>`;
  });
  return `<h2>Directors' report</h2>
<p>Principal activity: ${renderTextFact("descriptionPrincipalActivities", refs.current, input.principalActivity)}</p>
<p>Directors who held office during the period:</p>
<ul>${directorFacts.join("")}</ul>
<p>${renderStatement("statementSmallCompaniesRegimeDirectorsReport", refs.current)}</p>
<p>Approved by the board on ${input.dateOfApproval} and signed on its behalf by ${escapeXmlText(input.directorName)}${renderFixedFact("directorSigningDirectorsReport", refs.current)}</p>`;
}

/**
 * Build a small company's FRS 102 section 1A annual accounts as one iXBRL document.
 *
 * @param {object} input
 * @param {string} input.companyNumber
 * @param {string} input.companyName
 * @param {string} input.periodStart - ISO date
 * @param {string} input.periodEnd - ISO date
 * @param {string} [input.priorBalanceSheetDate] - ISO date; defaults to the day before periodStart
 * @param {string} [input.priorPeriodStart] - ISO date; defaults to a year before periodStart
 * @param {boolean} [input.filleted] - the Companies House copy: section 444(5A) statement, no profit and loss account, no directors' report
 * @param {number} input.averageNumberOfEmployees
 * @param {string} input.principalActivity
 * @param {string} input.accountingPolicies - plain text for the accounting policies note
 * @param {string[]} input.directors - the names of the directors who held office
 * @param {string} input.directorName - the director who signs
 * @param {string} input.dateOfApproval - ISO date
 * @param {{current: object, prior?: object}} input.balanceSheet - SMALL_COMPANY_BALANCE_SHEET_LINES
 * @param {{current: object, prior?: object}} input.profitAndLoss - SMALL_COMPANY_PROFIT_AND_LOSS_LINES
 * @param {Record<string, object>} [input.fixedAssetNote] - FIXED_ASSET_CLASSES to FIXED_ASSET_CLASS_FIELDS
 * @returns {string} the XHTML document
 */
export function buildSmallCompanyAccounts(input) {
  const priorBalanceSheet = input.balanceSheet.prior;
  const priorProfitAndLoss = input.profitAndLoss.prior;
  const {
    xml: contextsXml,
    refs,
    entityIdentifierXml,
    periodXml,
  } = buildContexts(input, {
    includePriorInstant: Boolean(priorBalanceSheet),
    includePriorPeriod: Boolean(priorProfitAndLoss) && !input.filleted,
  });
  const additionalContexts = [];
  const unrenderedFacts = [];

  const problems = [
    ...profitAndLossProblems(input.profitAndLoss.current).map((message) => `profitAndLoss.current: ${message}`),
    ...(priorProfitAndLoss ? profitAndLossProblems(priorProfitAndLoss).map((message) => `profitAndLoss.prior: ${message}`) : []),
  ];
  if (problems.length > 0) throw new Error(problems.join("; "));
  if (input.fixedAssetNote && fixedAssetNoteNetBookValue(input.fixedAssetNote) !== input.balanceSheet.current.fixedAssets) {
    throw new Error(
      `The fixed asset note's net book value (${fixedAssetNoteNetBookValue(input.fixedAssetNote)}) does not equal fixed assets (${input.balanceSheet.current.fixedAssets})`,
    );
  }

  unrenderedFacts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.companiesHouseRegisteredNumber)}" contextRef="${refs.current}">${escapeXmlText(input.companyNumber)}</ix:nonNumeric>`,
    `<ix:nonNumeric name="${qname(CONCEPTS.entityCurrentLegalOrRegisteredName)}" contextRef="${refs.current}">${escapeXmlText(input.companyName)}</ix:nonNumeric>`,
    `<ix:nonNumeric name="${qname(CONCEPTS.balanceSheetDate)}" contextRef="${refs.currentInstant}">${input.periodEnd}</ix:nonNumeric>`,
    `<ix:nonNumeric name="${qname(CONCEPTS.dateAuthorisationFinancialStatementsForIssue)}" contextRef="${refs.currentInstant}">${input.dateOfApproval}</ix:nonNumeric>`,
    renderFixedFact("directorSigningFinancialStatements", refs.current),
    `<ix:nonNumeric name="${qname(CONCEPTS.entityDormantTruefalse)}" contextRef="${refs.current}">false</ix:nonNumeric>`,
    `<ix:nonNumeric name="${qname(CONCEPTS.startDateForPeriodCoveredByReport)}" contextRef="${refs.periodStartInstant}">${input.periodStart}</ix:nonNumeric>`,
    `<ix:nonNumeric name="${qname(CONCEPTS.endDateForPeriodCoveredByReport)}" contextRef="${refs.currentInstant}">${input.periodEnd}</ix:nonNumeric>`,
    renderFixedFact("entityTradingStatus", refs.current),
  );

  for (const [conceptKey, dimension, member, id] of [
    ["accountsStatusAuditedOrUnaudited", DIMENSIONS.accountsStatus, MEMBERS.auditExemptNoAccountantsReport, "accounts-status"],
    ["accountsType", DIMENSIONS.accountsType, MEMBERS.fullAccounts, "accounts-type"],
    ["accountingStandardsApplied", DIMENSIONS.accountingStandards, MEMBERS.frs102, "accounting-standards"],
    ["applicableLegislation", DIMENSIONS.applicableLegislation, MEMBERS.smallEntities, "applicable-legislation"],
  ]) {
    const contextRef = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.current],
      dimensionXml: dimensionMemberXml(dimension, member),
      id: `${refs.current}-${id}`,
    });
    unrenderedFacts.push(renderFixedFact(conceptKey, contextRef));
  }

  const statementKeys = input.filleted
    ? [...SMALL_COMPANY_STATEMENT_KEYS, "statementProfitAndLossNotDelivered"]
    : SMALL_COMPANY_STATEMENT_KEYS;
  const statementsHtml = statementKeys.map((key) => `<p>${renderStatement(key, refs.current)}</p>`).join("\n");

  const employeesFact = `<ix:nonFraction name="${qname(CONCEPTS.averageNumberEmployeesDuringPeriod)}" contextRef="${refs.current}" unitRef="pure" decimals="0">${formatMonetary(input.averageNumberOfEmployees)}</ix:nonFraction>`;

  const balanceSheet = balanceSheetHtml({
    refs,
    current: input.balanceSheet.current,
    prior: priorBalanceSheet,
    additionalContexts,
    entityIdentifierXml,
    periodXml,
  });

  const sections = [];
  if (!input.filleted) {
    sections.push(profitAndLossHtml({ refs, current: input.profitAndLoss.current, prior: priorProfitAndLoss }));
  }
  sections.push(balanceSheet.html, `<div>${balanceSheet.mainFacts}</div>`);

  sections.push(`<h2>Statements</h2>\n${statementsHtml}`);
  sections.push(`<h2>Notes to the accounts</h2>
<h3>Accounting policies</h3>
<p>${escapeXmlText(input.accountingPolicies)}</p>
<h3>Employees</h3>
<p>The average number of employees during the period was ${employeesFact}</p>`);

  if (input.fixedAssetNote) {
    const note = fixedAssetNoteFacts({ refs, fixedAssetNote: input.fixedAssetNote, entityIdentifierXml, periodXml, additionalContexts });
    sections.push(`<h3>Tangible fixed assets</h3>
<table><thead><tr><th></th><th>Cost</th><th>Depreciation</th><th>Net book value</th></tr></thead><tbody>
${note.htmlRows.join("\n")}
</tbody></table>
<div>${note.facts.join("")}</div>`);
  }

  if (!input.filleted) {
    sections.push(directorsReportHtml({ input, refs, additionalContexts, entityIdentifierXml, periodXml }));
  }

  const bodyHtml = `<h1>${escapeXmlText(input.companyName)}</h1>
<p>Company number ${escapeXmlText(input.companyNumber)}</p>
<p>Annual accounts for the period from ${input.periodStart} to ${input.periodEnd}</p>
<p>Approved on behalf of the board on ${input.dateOfApproval} by ${escapeXmlText(input.directorName)}</p>
<div>${unrenderedFacts.join("\n")}</div>
${sections.join("\n")}`;

  return renderAccountsDocument({ companyName: input.companyName, contextsXml: `${contextsXml}${additionalContexts.join("")}`, bodyHtml });
}
