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
  formatNominalValue,
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
  renderReportHeaderFacts,
  buildOfficerContext,
  accountsStatusMember,
  accountantsReportPage,
  renderControllingPartyFacts,
  controllingPartyNote,
  renderSigningDirectorFact,
  renderCompanyDescriptionFacts,
  revisionPage,
  companyInformationNote,
  principalActivitySentence,
  shareNoun,
} from "./accountsIxbrlCommon.js";
import { recordAmount, recordFigure, recordTable } from "../lib/submissionRecord.js";
import { SHARE_CLASS_LABEL, sharesIssuedFor } from "./microEntityAccountsIxbrl.js";

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

// Lines a balance sheet may leave out; an absent line is 0.
export const SMALL_COMPANY_OPTIONAL_BALANCE_SHEET_LINES = [
  "bankLoansOverdrafts",
  "taxationSocialSecurity",
  "accruals",
  "bankLoansAfterOneYear",
  "tradeDebtors",
  "otherDebtors",
  "prepayments",
  "provisionsForLiabilities",
  "amountsOwedToDirectors",
  "amountsOwedToGroupUndertakings",
];

// A year that shows any of these splits `debtors`: the three lines then add up to it.
export const SMALL_COMPANY_DEBTORS_SPLIT_LINES = ["tradeDebtors", "otherDebtors", "prepayments"];

// The lines that split `creditorsAfterOneYear`; the rest of the total is other creditors.
export const SMALL_COMPANY_AFTER_ONE_YEAR_SPLIT_LINES = [
  "bankLoansAfterOneYear",
  "amountsOwedToDirectors",
  "amountsOwedToGroupUndertakings",
];

/**
 * The balance sheet breakdown rules a year's figures must hold, as messages; empty when they hold.
 * An absent optional line is 0, so a year without these lines has no problem.
 * @param {object} figures - the lines of SMALL_COMPANY_BALANCE_SHEET_LINES and the optional lines
 * @returns {string[]}
 */
export function balanceSheetBreakdownProblems(figures) {
  const problems = [];
  const sum = (lines) => lines.reduce((total, line) => total + (figures[line] ?? 0), 0);
  const debtorsSplit = sum(SMALL_COMPANY_DEBTORS_SPLIT_LINES);
  if (debtorsSplit !== 0 && debtorsSplit !== figures.debtors) {
    problems.push(`tradeDebtors, otherDebtors and prepayments (${debtorsSplit}) must add up to debtors (${figures.debtors})`);
  }
  const afterOneYearSplit = sum(SMALL_COMPANY_AFTER_ONE_YEAR_SPLIT_LINES);
  if ((figures.bankLoansAfterOneYear ?? 0) <= figures.creditorsAfterOneYear && afterOneYearSplit > figures.creditorsAfterOneYear) {
    problems.push(
      `bankLoansAfterOneYear, amountsOwedToDirectors and amountsOwedToGroupUndertakings (${afterOneYearSplit}) must not be more than creditorsAfterOneYear (${figures.creditorsAfterOneYear})`,
    );
  }
  return problems;
}

// The optional policy texts of the accounting policies note, in the order the note prints them.
export const SMALL_COMPANY_POLICY_FIELDS = [
  { field: "goingConcernStatement", heading: "Going concern", conceptKey: "descriptionGoingConcernStatus" },
  { field: "revenueRecognitionPolicy", heading: "Turnover", conceptKey: "revenueRecognitionPolicy" },
  { field: "tangibleFixedAssetsPolicy", heading: "Tangible fixed assets", conceptKey: "propertyPlantEquipmentMeasurementBasis" },
  { field: "propertyPlantEquipmentPolicy", heading: "Tangible fixed assets", conceptKey: "propertyPlantEquipmentPolicy" },
  { field: "depreciationMethodPolicy", heading: "Tangible fixed assets", conceptKey: "depreciationMethodPolicy" },
  { field: "intangibleAssetsPolicy", heading: "Intangible assets", conceptKey: "intangibleAssetsPolicy" },
  { field: "impairmentPolicy", heading: "Impairment", conceptKey: "impairmentPolicy" },
  { field: "inventoriesPolicy", heading: "Stocks", conceptKey: "inventoriesPolicy" },
  { field: "cashCashEquivalentsPolicy", heading: "Cash and cash equivalents", conceptKey: "cashCashEquivalentsPolicy" },
  { field: "financialInstrumentsPolicy", heading: "Financial instruments", conceptKey: "financialInstrumentsPolicy" },
  {
    field: "financialInstrumentsClassificationPolicy",
    heading: "Financial instruments",
    conceptKey: "financialInstrumentsClassificationPolicy",
  },
  { field: "employeeBenefitsPolicy", heading: "Employee benefits", conceptKey: "employeeBenefitsPolicy" },
  { field: "definedContributionPensionsPolicy", heading: "Employee benefits", conceptKey: "definedContributionPensionsPolicy" },
  { field: "foreignCurrencyTranslationPolicy", heading: "Foreign currency", conceptKey: "foreignCurrencyTranslationPolicy" },
  { field: "functionalPresentationCurrencyPolicy", heading: "Foreign currency", conceptKey: "functionalPresentationCurrencyPolicy" },
  { field: "leasesPolicy", heading: "Leases", conceptKey: "leasesPolicy" },
  { field: "taxPolicy", heading: "Taxation", conceptKey: "taxPolicy" },
  { field: "currentIncomeTaxPolicy", heading: "Taxation", conceptKey: "currentIncomeTaxPolicy" },
  { field: "deferredTaxPolicy", heading: "Taxation", conceptKey: "deferredTaxPolicy" },
  { field: "dividendPolicy", heading: "Dividends", conceptKey: "dividendPolicy" },
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

export const SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LINES = [
  "turnover",
  "changeInStocks",
  "ownWorkCapitalised",
  "otherOperatingIncome",
  "rawMaterialsConsumables",
  "otherExternalCharges",
  "staffCosts",
  "depreciation",
  "otherOperatingExpenses",
  "operatingProfit",
  "interestReceivable",
  "interestPayable",
  "profitBeforeTax",
  "tax",
  "profit",
];

export const INTANGIBLE_ASSET_FIELDS = [
  "costAtStart",
  "additions",
  "disposals",
  "amortisationAtStart",
  "amortisationCharge",
  "amortisationOnDisposals",
];

/**
 * The intangible assets note's closing figures, derived from its movements.
 * @param {object} figures - the INTANGIBLE_ASSET_FIELDS
 * @returns {{costAtEnd: number, amortisationAtEnd: number, netBookValue: number}}
 */
export function intangibleAssetClosingFigures(figures) {
  const costAtEnd = figures.costAtStart + figures.additions - figures.disposals;
  const amortisationAtEnd = figures.amortisationAtStart + figures.amortisationCharge - figures.amortisationOnDisposals;
  return { costAtEnd, amortisationAtEnd, netBookValue: costAtEnd - amortisationAtEnd };
}

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

export const FORMAT_2_PROFIT_AND_LOSS_CONCEPT_KEY = {
  turnover: "turnoverRevenue",
  changeInStocks: "increaseDecreaseInStocks",
  ownWorkCapitalised: "ownWorkCapitalised",
  otherOperatingIncome: "otherOperatingIncome",
  rawMaterialsConsumables: "rawMaterialsConsumablesUsed",
  otherExternalCharges: "otherExternalCharges",
  staffCosts: "staffCosts",
  depreciation: "depreciationWrittenOff",
  otherOperatingExpenses: "otherOperatingExpenses",
  operatingProfit: "operatingProfitLoss",
  interestReceivable: "otherInterestReceivable",
  interestPayable: "interestPayable",
  profitBeforeTax: "profitLossBeforeTax",
  tax: "taxOnProfitLoss",
  profit: "profitLoss",
};

const FORMAT_2_PROFIT_AND_LOSS_LABEL = {
  turnover: "Turnover",
  changeInStocks: "Change in stocks of finished goods and in work in progress",
  ownWorkCapitalised: "Own work capitalised",
  otherOperatingIncome: "Other operating income",
  rawMaterialsConsumables: "Raw materials and consumables",
  otherExternalCharges: "Other external charges",
  staffCosts: "Staff costs",
  depreciation: "Depreciation and other amounts written off tangible and intangible fixed assets",
  otherOperatingExpenses: "Other operating expenses",
  operatingProfit: "Operating profit",
  interestReceivable: "Interest receivable and similar income",
  interestPayable: "Interest payable and similar expenses",
  profitBeforeTax: "Profit on ordinary activities before taxation",
  tax: "Tax on profit on ordinary activities",
  profit: "Profit for the financial year",
};

export const PROFIT_AND_LOSS_FORMATS = [1, 2];

/**
 * The profit and loss lines of a format.
 * @param {1|2} format
 * @returns {string[]}
 */
export function profitAndLossLinesOf(format) {
  return format === 2 ? SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LINES : SMALL_COMPANY_PROFIT_AND_LOSS_LINES;
}

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
    creditorsWithinOneYear:
      (figures.bankLoansOverdrafts ?? 0) +
      figures.tradeCreditors +
      figures.corporationTax +
      (figures.taxationSocialSecurity ?? 0) +
      figures.otherCreditors +
      (figures.accruals ?? 0),
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
 * The Format 2 profit and loss identities a set of figures must hold, as messages; empty when they hold.
 * @param {object} figures - the lines of SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LINES
 * @returns {string[]}
 */
export function format2ProfitAndLossProblems(figures) {
  const problems = [];
  const operatingProfit =
    figures.turnover +
    figures.changeInStocks +
    figures.ownWorkCapitalised +
    figures.otherOperatingIncome -
    figures.rawMaterialsConsumables -
    figures.otherExternalCharges -
    figures.staffCosts -
    figures.depreciation -
    figures.otherOperatingExpenses;
  if (figures.operatingProfit !== operatingProfit)
    problems.push(
      "operatingProfit must equal turnover plus changeInStocks, ownWorkCapitalised and otherOperatingIncome, less rawMaterialsConsumables, otherExternalCharges, staffCosts, depreciation and otherOperatingExpenses",
    );
  if (figures.profitBeforeTax !== figures.operatingProfit + figures.interestReceivable - figures.interestPayable)
    problems.push("profitBeforeTax must equal operatingProfit plus interestReceivable less interestPayable");
  if (figures.profit !== figures.profitBeforeTax - figures.tax) problems.push("profit must equal profitBeforeTax less tax");
  return problems;
}

/**
 * The profit and loss identities of a format.
 * @param {object} figures
 * @param {1|2} [format]
 * @returns {string[]}
 */
export function profitAndLossProblemsOf(figures, format = 1) {
  return format === 2 ? format2ProfitAndLossProblems(figures) : profitAndLossProblems(figures);
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

function intangibleNetBookValue(intangibleAssetNote) {
  return intangibleAssetNote ? intangibleAssetClosingFigures(intangibleAssetNote).netBookValue : 0;
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

const FORMAT_2_PROFIT_AND_LOSS_ROW = {
  turnover: {},
  changeInStocks: {},
  ownWorkCapitalised: {},
  otherOperatingIncome: {},
  rawMaterialsConsumables: { deduction: true },
  otherExternalCharges: { deduction: true },
  staffCosts: { deduction: true },
  depreciation: { deduction: true },
  otherOperatingExpenses: { deduction: true },
  operatingProfit: { style: "subtotal" },
  interestReceivable: {},
  interestPayable: { deduction: true },
  profitBeforeTax: { style: "subtotal" },
  tax: { deduction: true },
  profit: { style: "total" },
};

const FORMAT_DETAILS = {
  1: {
    lines: SMALL_COMPANY_PROFIT_AND_LOSS_LINES,
    rows: PROFIT_AND_LOSS_ROW,
    concepts: PROFIT_AND_LOSS_CONCEPT_KEY,
    labels: PROFIT_AND_LOSS_LABEL,
  },
  2: {
    lines: SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LINES,
    rows: FORMAT_2_PROFIT_AND_LOSS_ROW,
    concepts: FORMAT_2_PROFIT_AND_LOSS_CONCEPT_KEY,
    labels: FORMAT_2_PROFIT_AND_LOSS_LABEL,
  },
};

function profitAndLossPage({ heading, refs, current, prior, columns, format }) {
  const details = FORMAT_DETAILS[format];
  const rows = details.lines.map((line) => {
    const { deduction, style } = details.rows[line];
    const conceptKey = details.concepts[line];
    const cells = [recordFigure(money(conceptKey, refs.current, current[line]), current[line], { deduction })];
    if (prior) cells.push(recordFigure(money(conceptKey, refs.prior, prior[line]), prior[line], { deduction }));
    return { label: details.labels[line], style, cells };
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

// Sub-lines marked optional show only when some year's figure is not 0.
const CREDITOR_SUB_LINES = [
  ["Bank loans and overdrafts", "bankBorrowingsOverdrafts", "bankLoansOverdrafts", true],
  ["Trade creditors", "tradeCreditors", "tradeCreditors"],
  ["Corporation tax", "corporationTaxPayable", "corporationTax"],
  ["Taxation and social security", "taxationSocialSecurityPayable", "taxationSocialSecurity", true],
  ["Other creditors", "otherCreditors", "otherCreditors"],
  ["Accruals", "accruedLiabilities", "accruals", true, "-accruals"],
];

function subLineRows(lines, yearFigures, contextRefs, contextSuffix) {
  const shown = lines.filter(([, , field, optional]) => !optional || yearFigures.some((figures) => (figures[field] ?? 0) !== 0));
  return shown.map(([label, conceptKey, field, , ownContextSuffix]) => ({
    label,
    cells: yearFigures.map((figures, index) =>
      recordFigure(
        money(conceptKey, `${contextRefs[index]}${ownContextSuffix ?? contextSuffix}`, figures[field] ?? 0),
        figures[field] ?? 0,
      ),
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

/**
 * The intangible assets note as printed: one column with the cost and amortisation movements and
 * the net book values at both balance sheet dates, tagged against the undimensioned contexts.
 */
function intangibleAssetNoteTable({ refs, intangibleAssetNote }) {
  const figures = { ...intangibleAssetNote, ...intangibleAssetClosingFigures(intangibleAssetNote) };
  const row = (label, conceptKey, contextRef, value, options = {}) => ({
    label,
    indent: options.indent,
    style: options.style,
    cells: [recordFigure(money(conceptKey, contextRef, value), value, { deduction: options.deduction })],
  });
  const startLabel = `At ${displayDate(refs.periodStartDate)}`;
  const endLabel = `At ${displayDate(refs.periodEndDate)}`;
  const priorEndLabel = `At ${displayDate(previousDay(refs.periodStartDate))}`;
  return recordTable({
    columns: ["Intangible assets"],
    rows: [
      { label: "Cost", style: "heading" },
      row(startLabel, "intangibleAssetsGrossCost", refs.priorInstant, figures.costAtStart, { indent: true }),
      row("Additions", "additionsIntangibleAssets", refs.current, figures.additions, { indent: true }),
      row("Disposals", "disposalsIntangibleAssets", refs.current, figures.disposals, { indent: true, deduction: true }),
      row(endLabel, "intangibleAssetsGrossCost", refs.currentInstant, figures.costAtEnd, { indent: true, style: "subtotal" }),
      { label: "Amortisation", style: "heading" },
      row(startLabel, "accumulatedAmortisationIntangibleAssets", refs.priorInstant, figures.amortisationAtStart, { indent: true }),
      row("Charge for the year", "amortisationChargeIntangibleAssets", refs.current, figures.amortisationCharge, { indent: true }),
      row("On disposals", "amortisationDisposalsIntangibleAssets", refs.current, figures.amortisationOnDisposals, {
        indent: true,
        deduction: true,
      }),
      row(endLabel, "accumulatedAmortisationIntangibleAssets", refs.currentInstant, figures.amortisationAtEnd, {
        indent: true,
        style: "subtotal",
      }),
      { label: "Net book value", style: "heading" },
      row(endLabel, "intangibleAssets", refs.currentInstant, figures.netBookValue, { indent: true, style: "total" }),
      row(priorEndLabel, "intangibleAssets", refs.priorInstant, figures.costAtStart - figures.amortisationAtStart, { indent: true }),
    ],
  });
}

// The after one year line splits into the bank loans and the rest when any year owes a bank.
const AFTER_ONE_YEAR_SPLIT_ROWS = [
  ["Bank loans", "bankBorrowingsOverdrafts", "bankLoansAfterOneYear"],
  ["Amounts owed to directors", "amountsOwedToDirectors", "amountsOwedToDirectors"],
  ["Amounts owed to group undertakings", "amountsOwedToGroupUndertakings", "amountsOwedToGroupUndertakings"],
];

function creditorAfterOneYearLines(yearFigures, contextRefs) {
  const shownSplits = AFTER_ONE_YEAR_SPLIT_ROWS.filter(([, , field]) => yearFigures.some((figures) => (figures[field] ?? 0) !== 0));
  if (shownSplits.length === 0) return undefined;
  const cells = (conceptKey, valueOf) =>
    yearFigures.map((figures, index) => {
      const value = valueOf(figures);
      return recordFigure(money(conceptKey, `${contextRefs[index]}-after-one-year`, value), value);
    });
  const splitTotal = (figures) => SMALL_COMPANY_AFTER_ONE_YEAR_SPLIT_LINES.reduce((total, field) => total + (figures[field] ?? 0), 0);
  return [
    ...shownSplits.map(([label, conceptKey, field]) => ({ label, cells: cells(conceptKey, (figures) => figures[field] ?? 0) })),
    {
      label: "Other creditors",
      cells: cells("otherCreditors", (figures) => figures.creditorsAfterOneYear - splitTotal(figures)),
    },
  ];
}

function refuseBreakdownProblems(label, figures) {
  if (!figures) return;
  const problems = balanceSheetBreakdownProblems(figures);
  if (problems.length > 0) throw new Error(`balanceSheet.${label}: ${problems.join("; ")}`);
}

// The provisions heading shows in every year once any year carries a figure; otherwise it is absent.
function showProvisionsInEveryYearOrNone(yearFigures) {
  const anyYearHasProvisions = yearFigures.some((figures) => (figures.provisionsForLiabilities ?? 0) !== 0);
  for (const figures of yearFigures) {
    if (anyYearHasProvisions) figures.provisionsForLiabilities ??= 0;
    else delete figures.provisionsForLiabilities;
  }
}

function hasDebtorsSplit(yearFigures) {
  return yearFigures.some((figures) => SMALL_COMPANY_DEBTORS_SPLIT_LINES.some((field) => (figures[field] ?? 0) !== 0));
}

const DEBTORS_NOTE_ROWS = [
  ["Trade debtors", "tradeDebtors", "tradeDebtors"],
  ["Other debtors", "otherDebtors", "otherDebtors"],
  ["Prepayments and accrued income", "prepaymentsInDebtors", "prepayments"],
];

// The debtors note shows the lines of the split that some year carries, above the total debtors.
function debtorsNoteTable({ balanceSheetYears, balanceSheetRefs, columns }) {
  const shownRows = DEBTORS_NOTE_ROWS.filter(([, , field]) => balanceSheetYears.some((figures) => (figures[field] ?? 0) !== 0));
  const cells = (valueOf, conceptKey) =>
    balanceSheetYears.map((figures, index) => {
      const value = valueOf(figures);
      return conceptKey ? recordFigure(money(conceptKey, balanceSheetRefs[index], value), value) : recordAmount(value);
    });
  return recordTable({
    columns: columns.slice(0, balanceSheetYears.length),
    rows: [
      ...shownRows.map(([label, conceptKey, field]) => ({ label, cells: cells((figures) => figures[field] ?? 0, conceptKey) })),
      { label: "Total debtors", style: "subtotal", cells: cells((figures) => figures.debtors) },
    ],
  });
}

function accountingPoliciesNote({ input, refs }) {
  const policies = SMALL_COMPANY_POLICY_FIELDS.filter(({ field }) => input[field]);
  const subheading = (text) => (policies.length > 0 ? `\n<h4>${text}</h4>` : "");
  const parts = [
    `<p>${renderTextFact("statementComplianceWithReportingFramework", refs.current, SMALL_COMPANY_FRAMEWORK_COMPLIANCE)}</p>`,
    `${subheading("Basis of preparation")}\n<p>${renderTextFact("generalDescriptionBasisMeasurement", refs.current, input.accountingPolicies)}</p>`,
  ];
  let previousHeading;
  for (const { field, heading, conceptKey } of policies) {
    const fact = `<p>${renderTextFact(conceptKey, refs.current, input[field])}</p>`;
    parts.push(heading === previousHeading ? `\n${fact}` : `${subheading(heading)}\n${fact}`);
    previousHeading = heading;
  }
  return { title: "Accounting policies", html: parts.join("").replace(/^\n/, "") };
}

function shareCapitalNoteHtml({ shareCapital, calledUpShareCapital, refs, entityIdentifierXml, periodXml, additionalContexts }) {
  const sharesIssued = sharesIssuedFor(calledUpShareCapital, shareCapital.nominalValue);
  const dimensionXml = dimensionMemberXml(DIMENSIONS.entityShareClasses, MEMBERS[shareCapital.shareClass]);
  const classContext = (periodKey, id) =>
    buildDimensionedContext({ additionalContexts, entityIdentifierXml, periodXml: periodXml[periodKey], dimensionXml, id });
  const durationContext = classContext(refs.current, `${refs.current}-share-class`);
  const instantContext = classContext(refs.currentInstant, `${refs.currentInstant}-share-class`);
  const description = `<ix:nonNumeric name="${qname(CONCEPTS.descriptionShareType)}" contextRef="${durationContext}">${escapeXmlText(SHARE_CLASS_LABEL[shareCapital.shareClass])}</ix:nonNumeric>`;
  const count = `<ix:nonFraction name="${qname(CONCEPTS.numberSharesIssuedFullyPaid)}" contextRef="${instantContext}" unitRef="shares" decimals="0" format="${NUMBER_FORMAT}">${formatMonetary(sharesIssued)}</ix:nonFraction>`;
  const parValue = `<ix:nonFraction name="${qname(CONCEPTS.parValueShare)}" contextRef="${durationContext}" unitRef="pure" decimals="INF">${formatNominalValue(shareCapital.nominalValue)}</ix:nonFraction>`;
  return `<p>Allotted, called up and fully paid: ${count} ${description} ${shareNoun(sharesIssued)} of £${parValue} each.</p>`;
}

function directorsReportPage({ heading, input, refs, additionalContexts, entityIdentifierXml, periodXml }) {
  const directorFacts = input.directors.map((name, index) => {
    const contextRef = buildOfficerContext({ additionalContexts, entityIdentifierXml, periodXml, refs, position: index + 1 });
    return renderTextFact("nameEntityOfficer", contextRef, name);
  });
  return `<div class="page">
${heading}<p>The directors present their report and the financial statements for the ${escapeXmlText(periodEndedPhrase(input.periodStart, input.periodEnd))}.</p>
<h3>Principal activity</h3>
${principalActivitySentence(input.principalActivity, refs)}
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
 * @param {object} input.registeredOffice - addressLine1, and optionally addressLine2, addressLine3, cityOrTown, countyRegion, postalCode and country
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
 * @param {1|2} [input.profitAndLossFormat] - 1 (by function, the default) or 2 (by nature)
 * @param {{current: object, prior?: object}} input.profitAndLoss - the lines of the format: SMALL_COMPANY_PROFIT_AND_LOSS_LINES or SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LINES
 * @param {Record<string, object>} [input.fixedAssetNote] - FIXED_ASSET_CLASSES to FIXED_ASSET_CLASS_FIELDS
 * @param {object} [input.intangibleAssetNote] - INTANGIBLE_ASSET_FIELDS of the one intangible assets note; its net book value is part of fixed assets
 * @param {string} [input.goingConcernStatement] - SMALL_COMPANY_POLICY_FIELDS texts (going concern, turnover, tangible fixed assets and depreciation, impairment, stocks, cash, financial instruments, employee benefits, foreign currency, leases, tax, current and deferred tax, dividends), each tagged in the accounting policies note under its subheading
 * @param {{accountantsName: string, statement: string}} [input.accountantsReport] - adds the accountants' report page and the audit exempt with accountants' report status
 * @param {{ultimate: boolean, name?: string}} [input.controllingParty] - adds the controlling party note; an ultimate party needs a name; without a name the note states that the company has no ultimate controlling party
 * @param {{shareClass: string, nominalValue: number}} [input.shareCapital] - adds a share capital note; the shares issued are the called up share capital over the nominal value
 * @returns {string} the XHTML document
 */
export function buildSmallCompanyAccounts(input) {
  const profitAndLossFormat = input.profitAndLossFormat ?? 1;
  if (!PROFIT_AND_LOSS_FORMATS.includes(profitAndLossFormat)) throw new Error("profitAndLossFormat must be 1 or 2");
  const priorBalanceSheet = input.balanceSheet.prior;
  for (const [label, figures] of [
    ["current", input.balanceSheet.current],
    ["prior", priorBalanceSheet],
  ]) {
    if ((figures?.bankLoansAfterOneYear ?? 0) > figures?.creditorsAfterOneYear) {
      throw new Error(`balanceSheet.${label}.bankLoansAfterOneYear exceeds creditorsAfterOneYear`);
    }
    refuseBreakdownProblems(label, figures);
  }
  if (input.controllingParty?.ultimate && !input.controllingParty.name) {
    throw new Error("controllingParty.name is required when the controlling party is ultimate");
  }
  const priorProfitAndLoss = input.profitAndLoss.prior;
  // The request carries no deferred tax, so the profit and loss tax charge is the current tax of the period.
  const showsTaxNote = [input.profitAndLoss.current, priorProfitAndLoss].some((figures) => (figures?.tax ?? 0) !== 0);
  const hasFixedAssetNote = Boolean(input.fixedAssetNote) && Object.keys(input.fixedAssetNote).length > 0;
  const hasIntangibleNote = Boolean(input.intangibleAssetNote);
  const {
    xml: contextsXml,
    refs,
    entityIdentifierXml,
    periodXml,
  } = buildContexts(input, {
    // The fixed asset note's opening balances sit at the prior balance sheet date.
    includePriorInstant: Boolean(priorBalanceSheet) || hasFixedAssetNote || hasIntangibleNote,
    includePriorPeriod: Boolean(priorProfitAndLoss) && (!input.filleted || showsTaxNote),
    // A filleted set has no profit and loss account, so its prior year duration carries only the tax note's dimensioned fact.
    priorPeriodFactsAreDimensioned: Boolean(input.filleted),
  });
  const additionalContexts = [];
  const hiddenFacts = [];

  const problems = [
    ...profitAndLossProblemsOf(input.profitAndLoss.current, profitAndLossFormat).map((message) => `profitAndLoss.current: ${message}`),
    ...(priorProfitAndLoss
      ? profitAndLossProblemsOf(priorProfitAndLoss, profitAndLossFormat).map((message) => `profitAndLoss.prior: ${message}`)
      : []),
  ];
  if (problems.length > 0) throw new Error(problems.join("; "));
  const noteNetBookValue =
    (input.fixedAssetNote ? fixedAssetNoteNetBookValue(input.fixedAssetNote) : 0) + intangibleNetBookValue(input.intangibleAssetNote);
  if ((input.fixedAssetNote || hasIntangibleNote) && noteNetBookValue !== input.balanceSheet.current.fixedAssets) {
    throw new Error(
      `The fixed asset notes' net book value (${noteNetBookValue}) does not equal fixed assets (${input.balanceSheet.current.fixedAssets})`,
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
    ...renderReportHeaderFacts({ refs, entityIdentifierXml, periodXml, additionalContexts }),
    ...renderCompanyDescriptionFacts({
      companyNumber: input.companyNumber,
      refs,
      entityIdentifierXml,
      periodXml,
      additionalContexts,
      revised: Boolean(input.revision),
    }),
    signingDirectorFact,
    `<ix:nonNumeric name="${qname(CONCEPTS.entityDormantTruefalse)}" contextRef="${refs.current}">false</ix:nonNumeric>`,
    renderFixedFact("entityTradingStatus", refs.current),
  );
  if (input.filleted) {
    hiddenFacts.push(
      `<ix:nonNumeric name="${qname(CONCEPTS.reportIncludesDetailedProfitLossStatement)}" contextRef="${refs.current}">false</ix:nonNumeric>`,
      `<ix:nonNumeric name="${qname(CONCEPTS.exemptionNotPublishingOwnProfitLossAccount)}" contextRef="${refs.current}">true</ix:nonNumeric>`,
    );
  } else {
    hiddenFacts.push(
      `<ix:nonNumeric name="${qname(CONCEPTS.reportIncludesDetailedProfitLossStatement)}" contextRef="${refs.current}">true</ix:nonNumeric>`,
      renderFixedFact("directorSigningDirectorsReport", refs.current),
    );
  }

  for (const [conceptKey, dimension, member, id] of [
    ["accountsStatusAuditedOrUnaudited", DIMENSIONS.accountsStatus, accountsStatusMember(input), "accounts-status"],
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
  showProvisionsInEveryYearOrNone(balanceSheetYears);
  const anyYearHasAccruals = balanceSheetYears.some((figures) => (figures.accruals ?? 0) !== 0);
  const years = balanceSheetYears.map((figures, index) =>
    balanceSheetFacts({
      withAccrualsContext: anyYearHasAccruals,
      contextRef: balanceSheetRefs[index],
      entityIdentifierXml,
      periodXml: periodXml[balanceSheetRefs[index]],
      additionalContexts,
      unitRef: "GBP",
      figures,
    }),
  );
  const columns = [input.periodEnd.slice(0, 4), (input.priorBalanceSheetDate || previousDay(input.periodStart)).slice(0, 4)];

  let controllingPartyContextRef;
  if (input.controllingParty) {
    const controllingPartyFacts = renderControllingPartyFacts({
      controllingParty: input.controllingParty,
      refs,
      entityIdentifierXml,
      periodXml,
      additionalContexts,
    });
    controllingPartyContextRef = controllingPartyFacts.contextRef;
    hiddenFacts.push(...controllingPartyFacts.facts);
  }
  if (input.goingConcernStatement) {
    hiddenFacts.push(renderTextFact("preparedOnGoingConcernBasis", refs.current, "true"));
  }

  const statementKeys = input.filleted
    ? [...SMALL_COMPANY_STATEMENT_KEYS, "statementProfitAndLossNotDelivered"]
    : SMALL_COMPANY_STATEMENT_KEYS;

  const notes = [
    companyInformationNote(
      {
        ...input,
        principalActivityShown: input.filleted ? input.principalActivity : undefined,
      },
      refs,
      { entityIdentifierXml, periodXml, additionalContexts },
    ),
    accountingPoliciesNote({ input, refs }),
    {
      title: "Employees",
      html: `<p>The average number of employees during the ${escapeXmlText(periodEndedPhrase(input.periodStart, input.periodEnd).split(" ")[0])} was <ix:nonFraction name="${qname(CONCEPTS.averageNumberEmployeesDuringPeriod)}" contextRef="${refs.current}" unitRef="pure" decimals="0" format="${NUMBER_FORMAT}">${formatMonetary(input.averageNumberOfEmployees)}</ix:nonFraction>.</p>`,
    },
  ];
  if (input.controllingParty) {
    notes.push(controllingPartyNote({ controllingParty: input.controllingParty, contextRef: controllingPartyContextRef }));
  }
  if (input.shareCapital) {
    notes.push({
      title: "Called up share capital",
      html: shareCapitalNoteHtml({
        shareCapital: input.shareCapital,
        calledUpShareCapital: input.balanceSheet.current.calledUpShareCapital,
        refs,
        entityIdentifierXml,
        periodXml,
        additionalContexts,
      }),
    });
  }
  const fixedAssetNoteNumbers = [];
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
    fixedAssetNoteNumbers.push(notes.length);
    const depreciationCharge = Object.values(input.fixedAssetNote).reduce(
      (total, classFigures) => total + classFigures.depreciationCharge,
      0,
    );
    const depreciationFact = money("depreciationExpensePropertyPlantEquipment", refs.current, depreciationCharge);
    notes.push(
      input.filleted
        ? { title: "Depreciation", html: `<p>Depreciation of tangible assets charged in the year was £${depreciationFact}.</p>` }
        : {
            title: "Operating profit",
            html: `<p>Operating profit is stated after charging depreciation of tangible assets of £${depreciationFact}.</p>`,
          },
    );
  }

  if (hasIntangibleNote) {
    notes.push({
      title: "Intangible assets",
      html: intangibleAssetNoteTable({
        refs: { ...refs, periodStartDate: input.periodStart, periodEndDate: input.periodEnd },
        intangibleAssetNote: input.intangibleAssetNote,
      }),
    });
    fixedAssetNoteNumbers.push(notes.length);
  }
  const fixedAssetNoteRef = fixedAssetNoteNumbers.join(", ");

  let debtorsNoteNumber;
  if (hasDebtorsSplit(balanceSheetYears)) {
    notes.push({ title: "Debtors", html: debtorsNoteTable({ balanceSheetYears, balanceSheetRefs, columns }) });
    debtorsNoteNumber = notes.length;
  }

  if (showsTaxNote) {
    const taxYears = [
      { figures: input.profitAndLoss.current, periodRef: refs.current },
      ...(priorProfitAndLoss ? [{ figures: priorProfitAndLoss, periodRef: refs.prior }] : []),
    ];
    const cells = taxYears.map(({ figures, periodRef }) => {
      const contextRef = buildDimensionedContext({
        additionalContexts,
        entityIdentifierXml,
        periodXml: periodXml[periodRef],
        dimensionXml: dimensionMemberXml(DIMENSIONS.taxJurisdiction, MEMBERS.ukTax),
        id: `${periodRef}-uk-tax`,
      });
      return recordFigure(money("currentTaxForPeriod", contextRef, figures.tax), figures.tax);
    });
    notes.push({
      title: "Tax on profit",
      html: recordTable({
        columns: columns.slice(0, taxYears.length),
        rows: [{ label: "UK corporation tax: current tax on profit for the year", cells }],
      }),
    });
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
  if (input.revision) {
    pages.push(
      revisionPage({
        heading: heading("Revised accounts", `for the ${period}`),
        periodEnd: input.periodEnd,
        revision: input.revision,
      }),
    );
  }
  const accountantsPage = input.accountantsReport
    ? accountantsReportPage({
        heading: heading(
          "Accountants' report",
          `to the board of directors of ${escapeXmlText(input.companyName)} on the unaudited financial statements for the ${period}`,
        ),
        accountantsReport: input.accountantsReport,
        refs,
      })
    : undefined;
  if (accountantsPage && input.filleted) pages.push(accountantsPage);
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
      ...(accountantsPage ? [accountantsPage] : []),
      profitAndLossPage({
        heading: heading("Profit and loss account", `for the ${period}`),
        refs,
        current: input.profitAndLoss.current,
        prior: priorProfitAndLoss,
        columns,
        format: profitAndLossFormat,
      }),
    );
  }
  pages.push(`<div class="page">
${heading("Balance sheet", `as at ${renderDateFact("balanceSheetDate", refs.currentInstant, input.periodEnd)}`)}${recordTable({
    columns: columns.slice(0, years.length),
    notes: Boolean(fixedAssetNoteRef) || Boolean(debtorsNoteNumber),
    rows: balanceSheetRows({
      years,
      currentAssetLines: subLineRows(CURRENT_ASSET_SUB_LINES, balanceSheetYears, balanceSheetRefs, "").map((line) =>
        line.label === "Debtors" && debtorsNoteNumber ? { ...line, note: debtorsNoteNumber } : line,
      ),
      creditorLines: subLineRows(CREDITOR_SUB_LINES, balanceSheetYears, balanceSheetRefs, "-within-one-year"),
      creditorAfterOneYearLines: creditorAfterOneYearLines(balanceSheetYears, balanceSheetRefs),
      notes: { fixedAssets: fixedAssetNoteRef || undefined },
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
