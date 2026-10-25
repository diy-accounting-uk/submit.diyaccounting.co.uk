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
  NUMBER_FORMAT,
  qname,
  buildContexts,
  formatMonetary,
  displayDate,
  previousDay,
  periodEndedPhrase,
  renderStatement,
  renderFixedFact,
  renderTextFact,
  renderMonetaryFact,
  renderDateFact,
  dimensionMemberXml,
  buildDimensionedContext,
  balanceSheetFacts,
  balanceSheetRows,
  pageHeading,
  coverPage,
  approvalHtml,
  renderAccountsDocument,
  renderProductionSoftwareFacts,
  buildOfficerContext,
  renderSigningDirectorFact,
  renderCompanyDescriptionFacts,
} from "./accountsIxbrlCommon.js";
import { recordFigure, recordTable } from "../lib/submissionRecord.js";

const SMALL_COMPANY_FRAMEWORK_COMPLIANCE =
  "These financial statements have been prepared in accordance with Section 1A Small Entities of FRS 102 The Financial Reporting Standard applicable to the UK and Republic of Ireland.";

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

const PROFIT_AND_LOSS_ROW = {
  turnover: {},
  costOfSales: { deduction: true },
  grossProfit: { style: "subtotal" },
  administrativeExpenses: { deduction: true },
  operatingProfit: { style: "subtotal" },
  interestReceivable: {},
  profitBeforeTax: { style: "subtotal" },
  tax: { deduction: true },
  profit: { style: "total" },
};

function profitAndLossPage({ heading, refs, current, prior, columns }) {
  const rows = SMALL_COMPANY_PROFIT_AND_LOSS_LINES.map((line) => {
    const { deduction, style } = PROFIT_AND_LOSS_ROW[line];
    const conceptKey = PROFIT_AND_LOSS_CONCEPT_KEY[line];
    const cells = [recordFigure(money(conceptKey, refs.current, current[line]), current[line], { deduction })];
    if (prior) cells.push(recordFigure(money(conceptKey, refs.prior, prior[line]), prior[line], { deduction }));
    return { label: PROFIT_AND_LOSS_LABEL[line], style, cells };
  });
  return `<div class="page">
${heading}${recordTable({ columns: prior ? columns : columns.slice(0, 1), rows })}
</div>`;
}

const CURRENT_ASSET_SUB_LINES = [
  ["Stocks", "totalInventories", "stocks"],
  ["Debtors", "debtors", "debtors"],
  ["Cash at bank and in hand", "cashBankOnHand", "cashAtBank"],
];

const CREDITOR_SUB_LINES = [
  ["Trade creditors", "tradeCreditors", "tradeCreditors"],
  ["Corporation tax", "corporationTaxPayable", "corporationTax"],
  ["Other creditors", "otherCreditors", "otherCreditors"],
];

function subLineRows(lines, yearFigures, contextRefs, contextSuffix) {
  return lines.map(([label, conceptKey, field]) => ({
    label,
    cells: yearFigures.map((figures, index) =>
      recordFigure(money(conceptKey, `${contextRefs[index]}${contextSuffix}`, figures[field]), figures[field]),
    ),
  }));
}

/**
 * The fixed asset note as printed: one column per asset class and a total column, with the cost
 * and depreciation movements and the net book values at both balance sheet dates. Each class's
 * figures are tagged against its PropertyPlantEquipmentClassesDimension member and the totals
 * against the undimensioned contexts.
 */
function fixedAssetNoteTable({ refs, fixedAssetNote, entityIdentifierXml, periodXml, additionalContexts }) {
  const classNames = FIXED_ASSET_CLASSES.filter((className) => fixedAssetNote[className]);
  const columns = [];
  for (const className of classNames) {
    const classFigures = fixedAssetNote[className];
    const dimensionXml = dimensionMemberXml(DIMENSIONS.propertyPlantEquipmentClasses, MEMBERS[className]);
    const context = (periodKey, suffix) =>
      buildDimensionedContext({
        additionalContexts,
        entityIdentifierXml,
        periodXml: periodXml[periodKey],
        dimensionXml,
        id: `${periodKey}-ppe-${className}${suffix}`,
      });
    columns.push({
      heading: FIXED_ASSET_CLASS_LABEL[className],
      figures: { ...classFigures, ...fixedAssetClosingFigures(classFigures) },
      refs: { opening: context(refs.priorInstant, ""), duration: context(refs.current, ""), closing: context(refs.currentInstant, "") },
    });
  }
  const totals = {};
  for (const field of [...FIXED_ASSET_CLASS_FIELDS, "costAtEnd", "depreciationAtEnd", "netBookValue"]) {
    totals[field] = columns.reduce((total, column) => total + column.figures[field], 0);
  }
  columns.push({
    heading: "Total",
    figures: totals,
    refs: { opening: refs.priorInstant, duration: refs.current, closing: refs.currentInstant },
  });

  const row = (label, conceptKey, refKey, valueOf, options = {}) => ({
    label,
    indent: options.indent,
    style: options.style,
    cells: columns.map((column) => {
      const value = valueOf(column.figures);
      return recordFigure(money(conceptKey, column.refs[refKey], value), value, { deduction: options.deduction });
    }),
  });
  const openingNetBookValue = (figures) => figures.costAtStart - figures.depreciationAtStart;
  const startLabel = `At ${displayDate(refs.periodStartDate)}`;
  const endLabel = `At ${displayDate(refs.periodEndDate)}`;
  const priorEndLabel = `At ${displayDate(previousDay(refs.periodStartDate))}`;

  return recordTable({
    columns: columns.map((column) => column.heading),
    rows: [
      { label: "Cost", style: "heading" },
      row(startLabel, "propertyPlantEquipmentGrossCost", "opening", (f) => f.costAtStart, { indent: true }),
      row("Additions", "additionsPropertyPlantEquipment", "duration", (f) => f.additions, { indent: true }),
      row("Disposals", "disposalsPropertyPlantEquipment", "duration", (f) => f.disposals, { indent: true, deduction: true }),
      row(endLabel, "propertyPlantEquipmentGrossCost", "closing", (f) => f.costAtEnd, { indent: true, style: "subtotal" }),
      { label: "Depreciation", style: "heading" },
      row(startLabel, "accumulatedDepreciationPropertyPlantEquipment", "opening", (f) => f.depreciationAtStart, { indent: true }),
      row("Charge for the year", "depreciationChargePropertyPlantEquipment", "duration", (f) => f.depreciationCharge, { indent: true }),
      row("On disposals", "depreciationDisposalsPropertyPlantEquipment", "duration", (f) => f.depreciationOnDisposals, {
        indent: true,
        deduction: true,
      }),
      row(endLabel, "accumulatedDepreciationPropertyPlantEquipment", "closing", (f) => f.depreciationAtEnd, {
        indent: true,
        style: "subtotal",
      }),
      { label: "Net book value", style: "heading" },
      row(endLabel, "propertyPlantEquipment", "closing", (f) => f.netBookValue, { indent: true, style: "total" }),
      row(priorEndLabel, "propertyPlantEquipment", "opening", openingNetBookValue, { indent: true }),
    ],
  });
}

function directorsReportPage({ heading, input, refs, additionalContexts, entityIdentifierXml, periodXml }) {
  const directorFacts = input.directors.map((name, index) => {
    const contextRef = buildOfficerContext({ additionalContexts, entityIdentifierXml, periodXml, refs, position: index + 1 });
    return renderTextFact("nameEntityOfficer", contextRef, name);
  });
  return `<div class="page">
${heading}<p>The directors present their report and the financial statements for the ${escapeXmlText(periodEndedPhrase(input.periodStart, input.periodEnd))}.</p>
<h3>Principal activity</h3>
<p>${renderTextFact("descriptionPrincipalActivities", refs.current, input.principalActivity)}</p>
<h3>Directors</h3>
<p>The directors who held office during the ${escapeXmlText(periodEndedPhrase(input.periodStart, input.periodEnd).split(" ")[0])} were:</p>
<p>${directorFacts.join("<br/>")}</p>
<p>${renderStatement("statementSmallCompaniesRegimeDirectorsReport", refs.current)}</p>
<p class="approval">This report was approved by the board of directors on ${renderDateFact("dateSigningDirectorsReport", refs.currentInstant, input.dateOfApproval)} and signed on its behalf by:</p>
<p class="signature">${escapeXmlText(input.directorName)}<br/>Director</p>
</div>`;
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
  const hasFixedAssetNote = Boolean(input.fixedAssetNote) && Object.keys(input.fixedAssetNote).length > 0;
  const {
    xml: contextsXml,
    refs,
    entityIdentifierXml,
    periodXml,
  } = buildContexts(input, {
    // The fixed asset note's opening balances sit at the prior balance sheet date.
    includePriorInstant: Boolean(priorBalanceSheet) || hasFixedAssetNote,
    includePriorPeriod: Boolean(priorProfitAndLoss) && !input.filleted,
  });
  const additionalContexts = [];
  const hiddenFacts = [];

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

  // The signing director's position among the directors; a filleted set has no directors' report, so
  // the approval line names the signing director as an officer.
  const signingDirectorPosition = Math.max(1, input.directors.indexOf(input.directorName) + 1);
  const { fact: signingDirectorFact, officerContextRef } = renderSigningDirectorFact({
    additionalContexts,
    entityIdentifierXml,
    periodXml,
    refs,
    position: signingDirectorPosition,
  });
  hiddenFacts.push(
    ...renderProductionSoftwareFacts(refs.current),
    ...renderCompanyDescriptionFacts({ companyNumber: input.companyNumber, refs, entityIdentifierXml, periodXml, additionalContexts }),
    signingDirectorFact,
    `<ix:nonNumeric name="${qname(CONCEPTS.entityDormantTruefalse)}" contextRef="${refs.current}">false</ix:nonNumeric>`,
    renderFixedFact("entityTradingStatus", refs.current),
  );
  if (input.filleted) {
    hiddenFacts.push(
      `<ix:nonNumeric name="${qname(CONCEPTS.reportIncludesDetailedProfitLossStatement)}" contextRef="${refs.current}">false</ix:nonNumeric>`,
      `<ix:nonNumeric name="${qname(CONCEPTS.exemptionNotPublishingOwnProfitLossAccount)}" contextRef="${refs.current}">true</ix:nonNumeric>`,
      renderTextFact("descriptionPrincipalActivities", refs.current, input.principalActivity),
    );
  } else {
    hiddenFacts.push(renderFixedFact("directorSigningDirectorsReport", refs.current));
  }

  for (const [conceptKey, dimension, member, id] of [
    ["accountsStatusAuditedOrUnaudited", DIMENSIONS.accountsStatus, MEMBERS.auditExemptNoAccountantsReport, "accounts-status"],
    ["accountsType", DIMENSIONS.accountsType, input.filleted ? MEMBERS.filletedAccounts : MEMBERS.fullAccounts, "accounts-type"],
    ["accountingStandardsApplied", DIMENSIONS.accountingStandards, MEMBERS.smallEntities, "accounting-standards"],
    ["applicableLegislation", DIMENSIONS.applicableLegislation, MEMBERS.smallCompaniesRegimeForAccounts, "applicable-legislation"],
  ]) {
    const contextRef = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.current],
      dimensionXml: dimensionMemberXml(dimension, member),
      id: `${refs.current}-${id}`,
    });
    hiddenFacts.push(renderFixedFact(conceptKey, contextRef));
  }

  const balanceSheetYears = [withBalanceSheetTotals(input.balanceSheet.current)];
  const balanceSheetRefs = [refs.currentInstant];
  if (priorBalanceSheet) {
    balanceSheetYears.push(withBalanceSheetTotals(priorBalanceSheet));
    balanceSheetRefs.push(refs.priorInstant);
  }
  const years = balanceSheetYears.map((figures, index) =>
    balanceSheetFacts({
      contextRef: balanceSheetRefs[index],
      entityIdentifierXml,
      periodXml: periodXml[balanceSheetRefs[index]],
      additionalContexts,
      unitRef: "GBP",
      figures,
    }),
  );
  const columns = [input.periodEnd.slice(0, 4), (input.priorBalanceSheetDate || previousDay(input.periodStart)).slice(0, 4)];

  const statementKeys = input.filleted
    ? [...SMALL_COMPANY_STATEMENT_KEYS, "statementProfitAndLossNotDelivered"]
    : SMALL_COMPANY_STATEMENT_KEYS;

  const notes = [
    {
      title: "Accounting policies",
      html: `<p>${renderTextFact("statementComplianceWithReportingFramework", refs.current, SMALL_COMPANY_FRAMEWORK_COMPLIANCE)}</p>
<p>${renderTextFact("generalDescriptionBasisMeasurement", refs.current, input.accountingPolicies)}</p>`,
    },
    {
      title: "Employees",
      html: `<p>The average number of employees during the ${escapeXmlText(periodEndedPhrase(input.periodStart, input.periodEnd).split(" ")[0])} was <ix:nonFraction name="${qname(CONCEPTS.averageNumberEmployeesDuringPeriod)}" contextRef="${refs.current}" unitRef="pure" decimals="0" format="${NUMBER_FORMAT}">${formatMonetary(input.averageNumberOfEmployees)}</ix:nonFraction>.</p>`,
    },
  ];
  let fixedAssetNoteNumber;
  if (hasFixedAssetNote) {
    notes.push({
      title: "Tangible fixed assets",
      html: fixedAssetNoteTable({
        refs: { ...refs, periodStartDate: input.periodStart, periodEndDate: input.periodEnd },
        fixedAssetNote: input.fixedAssetNote,
        entityIdentifierXml,
        periodXml,
        additionalContexts,
      }),
    });
    fixedAssetNoteNumber = notes.length;
  }

  const period = escapeXmlText(periodEndedPhrase(input.periodStart, input.periodEnd));
  const heading = (title, subtitleHtml) =>
    pageHeading({ companyName: input.companyName, companyNumber: input.companyNumber, title, subtitleHtml });

  const pages = [
    coverPage({
      refs,
      companyName: input.companyName,
      companyNumber: input.companyNumber,
      title: "Unaudited financial statements",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
  ];
  if (!input.filleted) {
    pages.push(
      directorsReportPage({
        heading: heading("Directors' report", `for the ${period}`),
        input,
        refs,
        additionalContexts,
        entityIdentifierXml,
        periodXml,
      }),
      profitAndLossPage({
        heading: heading("Profit and loss account", `for the ${period}`),
        refs,
        current: input.profitAndLoss.current,
        prior: priorProfitAndLoss,
        columns,
      }),
    );
  }
  pages.push(`<div class="page">
${heading("Balance sheet", `as at ${renderDateFact("balanceSheetDate", refs.currentInstant, input.periodEnd)}`)}${recordTable({
    columns: columns.slice(0, years.length),
    notes: Boolean(fixedAssetNoteNumber),
    rows: balanceSheetRows({
      years,
      currentAssetLines: subLineRows(CURRENT_ASSET_SUB_LINES, balanceSheetYears, balanceSheetRefs, ""),
      creditorLines: subLineRows(CREDITOR_SUB_LINES, balanceSheetYears, balanceSheetRefs, "-within-one-year"),
      notes: { fixedAssets: fixedAssetNoteNumber },
    }),
  })}
${statementKeys.map((key) => `<p>${renderStatement(key, refs.current)}</p>`).join("\n")}
${approvalHtml({
  refs,
  dateOfApproval: input.dateOfApproval,
  directorName: input.directorName,
  // The directors' report of a full set tags the directors' names, so only a filleted set tags the name here.
  officerContextRef: input.filleted ? officerContextRef : undefined,
})}
</div>`);
  pages.push(`<div class="page">
${heading("Notes to the financial statements", `for the ${period}`)}${notes
    .map((note, index) => `<h3>${index + 1}. ${escapeXmlText(note.title)}</h3>\n${note.html}`)
    .join("\n")}
</div>`);

  return renderAccountsDocument({
    title: `${input.companyName} - Accounts`,
    contextsXml: `${contextsXml}${additionalContexts.join("")}`,
    hiddenFactsXml: hiddenFacts.join("\n"),
    bodyHtml: pages.join("\n"),
  });
}
