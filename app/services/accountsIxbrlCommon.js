// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/accountsIxbrlCommon.js
// The parts of a Companies House annual accounts iXBRL document that every accounting regime
// shares: the FRS 102 entry point and namespaces, the concept, dimension and member names,
// context and fact writers, the fixed-wording statements and the document shell. The regime
// builders (microEntityAccountsIxbrl.js, smallCompanyAccountsIxbrl.js) choose which facts to write.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { escapeXmlText } from "../lib/xmlDom.js";
import { recordFigure, recordHeading } from "../lib/submissionRecord.js";
import { RECORD_STYLE } from "../lib/submissionRecordStyle.js";

export const FRS_102_ENTRY_POINT = "https://xbrl.frc.org.uk/FRS-102/2026-01-01/FRS-102-2026-01-01.xsd";

// Namespace identifiers, not fetched URLs: they are compared as exact strings against the FRC
// taxonomy schema (see fixtures/frc-taxonomy/frs-102-2026-concepts.json), which defines them as
// http, and a validator rejects a document whose namespace doesn't match byte for byte.
export const NAMESPACES = {
  // eslint-disable-next-line sonarjs/no-clear-text-protocols -- taxonomy namespace, not a fetch; see comment above
  bus: "http://xbrl.frc.org.uk/cd/2026-01-01/business",
  // eslint-disable-next-line sonarjs/no-clear-text-protocols -- taxonomy namespace, not a fetch; see comment above
  core: "http://xbrl.frc.org.uk/fr/2026-01-01/core",
  // eslint-disable-next-line sonarjs/no-clear-text-protocols -- taxonomy namespace, not a fetch; see comment above
  direp: "http://xbrl.frc.org.uk/reports/2026-01-01/direp",
};

// Resolved from the FRS 102 entry point by scripts/generate-frc-taxonomy-concepts.js (see
// fixtures/frc-taxonomy/frs-102-2026-concepts.json), not guessed from the accounts TIS prose. The
// TIS names UKCompaniesHouseRegisteredNumber .. AccountingStandardsApplied by their concept names
// directly; the balance sheet figures and AccountsTypeFullOrAbbreviated are not named in the TIS,
// so their entries below are resolved substitutes:
// - "AccountsTypeFullOrAbbreviated" does not exist in the taxonomy. The real concept is
//   AccountsType, dimensioned by AccountsTypeDimension; abbreviated accounts were abolished in
//   2016, so every filing reports the FullAccounts member.
// - The balance sheet lines (fixed assets, current assets, creditors, called up share capital,
//   profit and loss account, capital and reserves) are core:FixedAssets, core:CurrentAssets,
//   core:Creditors (dimensioned by MaturitiesOrExpirationPeriodsDimension for the within/after
//   one year split) and core:Equity (dimensioned by EquityClassesDimension for the share capital
//   and profit and loss account components; the total capital and reserves figure is core:Equity
//   at its default, undimensioned member).
export const CONCEPTS = {
  companiesHouseRegisteredNumber: { prefix: "bus", name: "UKCompaniesHouseRegisteredNumber" },
  entityCurrentLegalOrRegisteredName: { prefix: "bus", name: "EntityCurrentLegalOrRegisteredName" },
  balanceSheetDate: { prefix: "bus", name: "BalanceSheetDate" },
  dateAuthorisationFinancialStatementsForIssue: { prefix: "core", name: "DateAuthorisationFinancialStatementsForIssue" },
  directorSigningFinancialStatements: { prefix: "core", name: "DirectorSigningFinancialStatements" },
  entityDormantTruefalse: { prefix: "bus", name: "EntityDormantTruefalse" },
  startDateForPeriodCoveredByReport: { prefix: "bus", name: "StartDateForPeriodCoveredByReport" },
  endDateForPeriodCoveredByReport: { prefix: "bus", name: "EndDateForPeriodCoveredByReport" },
  entityTradingStatus: { prefix: "bus", name: "EntityTradingStatus" },
  accountsStatusAuditedOrUnaudited: { prefix: "bus", name: "AccountsStatusAuditedOrUnaudited" },
  accountsType: { prefix: "bus", name: "AccountsType" },
  accountingStandardsApplied: { prefix: "bus", name: "AccountingStandardsApplied" },
  applicableLegislation: { prefix: "bus", name: "ApplicableLegislation" },

  statementAuditExemptionSection477: {
    prefix: "direp",
    name: "StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies",
  },
  statementAuditExemptionSection480: {
    prefix: "direp",
    name: "StatementThatCompanyEntitledToExemptionFromAuditUnderSection480CompaniesAct2006RelatingToDormantCompanies",
  },
  statementMembersNotRequiredAudit: { prefix: "direp", name: "StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit" },
  statementDirectorsResponsibilities: { prefix: "direp", name: "StatementThatDirectorsAcknowledgeTheirResponsibilitiesUnderCompaniesAct" },
  statementMicroEntityProvisions: {
    prefix: "direp",
    name: "StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
  },
  statementSmallCompaniesRegimeAccounts: {
    prefix: "direp",
    name: "StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
  },
  statementSmallCompaniesRegimeDirectorsReport: {
    prefix: "direp",
    name: "StatementThatDirectorsReportHasBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
  },
  statementProfitAndLossNotDelivered: {
    prefix: "direp",
    name: "StatementThatDirectorsHaveElectedNotToDeliverProfitLossAccountUnderSection4445ACompaniesAct2006",
  },

  descriptionPrincipalActivities: { prefix: "bus", name: "DescriptionPrincipalActivities" },
  nameEntityOfficer: { prefix: "bus", name: "NameEntityOfficer" },
  directorSigningDirectorsReport: { prefix: "direp", name: "DirectorSigningDirectorsReport" },

  turnoverRevenue: { prefix: "core", name: "TurnoverRevenue" },
  costSales: { prefix: "core", name: "CostSales" },
  grossProfitLoss: { prefix: "core", name: "GrossProfitLoss" },
  administrativeExpenses: { prefix: "core", name: "AdministrativeExpenses" },
  operatingProfitLoss: { prefix: "core", name: "OperatingProfitLoss" },
  otherInterestReceivable: { prefix: "core", name: "OtherInterestReceivableSimilarIncomeFinanceIncome" },
  profitLossBeforeTax: { prefix: "core", name: "ProfitLossOnOrdinaryActivitiesBeforeTax" },
  taxOnProfitLoss: { prefix: "core", name: "TaxTaxCreditOnProfitOrLossOnOrdinaryActivities" },
  profitLoss: { prefix: "core", name: "ProfitLoss" },

  fixedAssets: { prefix: "core", name: "FixedAssets" },
  currentAssets: { prefix: "core", name: "CurrentAssets" },
  netCurrentAssetsLiabilities: { prefix: "core", name: "NetCurrentAssetsLiabilities" },
  totalAssetsLessCurrentLiabilities: { prefix: "core", name: "TotalAssetsLessCurrentLiabilities" },
  creditors: { prefix: "core", name: "Creditors" },
  netAssetsLiabilities: { prefix: "core", name: "NetAssetsLiabilities" },
  equity: { prefix: "core", name: "Equity" },
  totalInventories: { prefix: "core", name: "TotalInventories" },
  debtors: { prefix: "core", name: "Debtors" },
  cashBankOnHand: { prefix: "core", name: "CashBankOnHand" },
  tradeCreditors: { prefix: "core", name: "TradeCreditorsTradePayables" },
  corporationTaxPayable: { prefix: "core", name: "CorporationTaxPayable" },
  otherCreditors: { prefix: "core", name: "OtherCreditors" },
  averageNumberEmployeesDuringPeriod: { prefix: "core", name: "AverageNumberEmployeesDuringPeriod" },
  numberSharesIssuedFullyPaid: { prefix: "core", name: "NumberSharesIssuedFullyPaid" },
  nominalValueAllottedShareCapital: { prefix: "core", name: "NominalValueAllottedShareCapital" },

  propertyPlantEquipment: { prefix: "core", name: "PropertyPlantEquipment" },
  propertyPlantEquipmentGrossCost: { prefix: "core", name: "PropertyPlantEquipmentGrossCost" },
  additionsPropertyPlantEquipment: { prefix: "core", name: "AdditionsOtherThanThroughBusinessCombinationsPropertyPlantEquipment" },
  disposalsPropertyPlantEquipment: { prefix: "core", name: "DisposalsPropertyPlantEquipment" },
  accumulatedDepreciationPropertyPlantEquipment: { prefix: "core", name: "AccumulatedDepreciationImpairmentPropertyPlantEquipment" },
  depreciationChargePropertyPlantEquipment: { prefix: "core", name: "IncreaseFromDepreciationChargeForYearPropertyPlantEquipment" },
  depreciationDisposalsPropertyPlantEquipment: { prefix: "core", name: "DisposalsDecreaseInDepreciationImpairmentPropertyPlantEquipment" },
};

export const DIMENSIONS = {
  entityTradingStatus: { prefix: "bus", name: "EntityTradingStatusDimension" },
  entityShareClasses: { prefix: "bus", name: "EntityShareClassesDimension" },
  entityOfficers: { prefix: "bus", name: "EntityOfficersDimension" },
  accountingStandards: { prefix: "bus", name: "AccountingStandardsDimension" },
  applicableLegislation: { prefix: "bus", name: "ApplicableLegislationDimension" },
  accountsStatus: { prefix: "bus", name: "AccountsStatusDimension" },
  accountsType: { prefix: "bus", name: "AccountsTypeDimension" },
  equityClasses: { prefix: "core", name: "EquityClassesDimension" },
  maturities: { prefix: "core", name: "MaturitiesOrExpirationPeriodsDimension" },
  propertyPlantEquipmentClasses: { prefix: "core", name: "PropertyPlantEquipmentClassesDimension" },
};

export const MEMBERS = {
  microEntities: { prefix: "bus", name: "Micro-entities" },
  frs102: { prefix: "bus", name: "FRS102" },
  smallCompaniesRegimeForAccounts: { prefix: "bus", name: "SmallCompaniesRegimeForAccounts" },
  auditExemptNoAccountantsReport: { prefix: "bus", name: "AuditExempt-NoAccountantsReport" },
  fullAccounts: { prefix: "bus", name: "FullAccounts" },
  shareCapital: { prefix: "core", name: "ShareCapital" },
  neverTraded: { prefix: "bus", name: "EntityHasNeverTraded" },
  noLongerTrading: { prefix: "bus", name: "EntityNoLongerTradingButTradedInPast" },
  ordinaryShares: { prefix: "bus", name: "OrdinaryShareClass1" },
  preferenceShares: { prefix: "bus", name: "PreferenceShareClass1" },
  deferredShares: { prefix: "bus", name: "DeferredShareClass1" },
  otherShares: { prefix: "bus", name: "OtherShareClass1" },
  retainedEarningsAccumulatedLosses: { prefix: "core", name: "RetainedEarningsAccumulatedLosses" },
  withinOneYear: { prefix: "core", name: "WithinOneYear" },
  afterOneYear: { prefix: "core", name: "AfterOneYear" },
  landBuildings: { prefix: "core", name: "LandBuildings" },
  plantMachinery: { prefix: "core", name: "PlantMachinery" },
  furnitureFittings: { prefix: "core", name: "FurnitureFittings" },
  computerEquipment: { prefix: "core", name: "ComputerEquipment" },
  motorVehicles: { prefix: "core", name: "MotorVehicles" },
};

export const STATEMENT_TEXT = {
  statementAuditExemptionSection480:
    "The company is entitled to exemption from audit under section 480 of the Companies Act 2006 relating to dormant companies.",
  statementAuditExemptionSection477:
    "The company is entitled to exemption from audit under section 477 of the Companies Act 2006 relating to small companies.",
  statementMembersNotRequiredAudit:
    "The members have not required the company to obtain an audit in accordance with section 476 of the Companies Act 2006.",
  statementDirectorsResponsibilities:
    "The directors acknowledge their responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts.",
  statementMicroEntityProvisions:
    "These accounts have been prepared in accordance with the provisions applicable to companies subject to the micro-entities regime.",
  statementSmallCompaniesRegimeAccounts:
    "These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime.",
  statementSmallCompaniesRegimeDirectorsReport:
    "This report has been prepared in accordance with the provisions applicable to companies entitled to the small companies regime.",
  statementProfitAndLossNotDelivered:
    "The directors have elected not to deliver a copy of the profit and loss account to the registrar of companies in accordance with section 444(5A) of the Companies Act 2006.",
};

export function qname(concept) {
  return `${concept.prefix}:${concept.name}`;
}

export function previousDay(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function sameDayOneYearEarlier(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Build the xbrli contexts an accounts document needs: one duration context for the current
 * period, one instant context for the current balance sheet date (period end), one instant
 * context for the period start (StartDateForPeriodCoveredByReport is itself an instant-typed
 * fact), and, when comparatives are supplied, a prior-year instant context and a prior-year
 * duration context.
 *
 * @param {object} input - periodStart, periodEnd, companyNumber, and optionally priorBalanceSheetDate and priorPeriodStart
 * @param {object} [options]
 * @param {boolean} [options.includePriorInstant] - defaults to whether input.balanceSheet.prior is present
 * @param {boolean} [options.includePriorPeriod] - add the prior-year duration context (profit and loss comparatives)
 * @returns {{xml: string, refs: object, entityIdentifierXml: string, periodXml: Record<string,string>}}
 */
export function buildContexts(input, options = {}) {
  const { includePriorInstant = Boolean(input.balanceSheet?.prior), includePriorPeriod = false } = options;
  const currentYear = input.periodEnd.slice(0, 4);
  const refs = {
    current: `y${currentYear}`,
    currentInstant: `e${currentYear}`,
    periodStartInstant: `p${currentYear}`,
  };

  const entityIdentifierXml = `<xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${escapeXmlText(input.companyNumber)}</xbrli:identifier>`;

  const periodXml = {
    [refs.current]: `<xbrli:period><xbrli:startDate>${input.periodStart}</xbrli:startDate><xbrli:endDate>${input.periodEnd}</xbrli:endDate></xbrli:period>`,
    [refs.currentInstant]: `<xbrli:period><xbrli:instant>${input.periodEnd}</xbrli:instant></xbrli:period>`,
    [refs.periodStartInstant]: `<xbrli:period><xbrli:instant>${input.periodStart}</xbrli:instant></xbrli:period>`,
  };

  const priorBalanceSheetDate = input.priorBalanceSheetDate || previousDay(input.periodStart);
  const priorYear = priorBalanceSheetDate.slice(0, 4);
  if ((includePriorInstant || includePriorPeriod) && priorYear === currentYear) {
    throw new Error(`The prior period ends in ${priorYear}, the same year as the current period, so their context ids would collide`);
  }
  if (includePriorInstant) {
    refs.priorInstant = `e${priorYear}`;
    periodXml[refs.priorInstant] = `<xbrli:period><xbrli:instant>${priorBalanceSheetDate}</xbrli:instant></xbrli:period>`;
  }
  if (includePriorPeriod) {
    const priorPeriodStart = input.priorPeriodStart || sameDayOneYearEarlier(input.periodStart);
    refs.prior = `y${priorYear}`;
    periodXml[refs.prior] =
      `<xbrli:period><xbrli:startDate>${priorPeriodStart}</xbrli:startDate><xbrli:endDate>${priorBalanceSheetDate}</xbrli:endDate></xbrli:period>`;
  }

  const contextsXml = Object.entries(periodXml)
    .map(([id, period]) => `<xbrli:context id="${id}"><xbrli:entity>${entityIdentifierXml}</xbrli:entity>${period}</xbrli:context>`)
    .join("");

  return { xml: contextsXml, refs, entityIdentifierXml, periodXml };
}

// The Inline XBRL transformation registry 2 namespace. Companies House and HMRC both accept it,
// and it carries the two transforms a printed set of accounts needs: figures with thousands
// separators and dates written out in English.
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- transformation registry namespace, compared byte for byte, not fetched
export const IXT2_NAMESPACE = "http://www.xbrl.org/inlineXBRL/transformation/2011-07-31";
export const NUMBER_FORMAT = "ixt2:numdotdecimal";
export const DATE_FORMAT = "ixt2:datedaymonthyearen";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Format a value as whole units with thousands separators, matching decimals="0" and the
 * ixt2:numdotdecimal transform. Returns the magnitude; callers add sign="-" to the ix:nonFraction
 * tag when the underlying figure is negative, and show the brackets outside the tag.
 * @param {number} value
 * @returns {string}
 */
export function formatMonetary(value) {
  return Math.round(Math.abs(value)).toLocaleString("en-GB");
}

/**
 * An ISO date as printed accounts write it, the form ixt2:datedaymonthyearen reads back.
 * @param {string} isoDate
 * @returns {string} e.g. "31 December 2025"
 */
export function displayDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * "year ended 31 December 2025" for a period of exactly one year, "period ended ..." otherwise.
 * @param {string} periodStart
 * @param {string} periodEnd
 * @returns {string}
 */
export function periodEndedPhrase(periodStart, periodEnd) {
  const start = new Date(`${periodStart}T00:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() + 1);
  const isOneYear = previousDay(start.toISOString().slice(0, 10)) === periodEnd;
  return `${isOneYear ? "year" : "period"} ended ${displayDate(periodEnd)}`;
}

/**
 * Render one of the fixed-wording statements as a tagged ix:nonNumeric fact. The wording is fixed
 * (the page never lets a user edit it), matching the phrase checks Companies House runs on each
 * statement.
 * @param {keyof typeof STATEMENT_TEXT} key
 * @param {string} contextRef
 * @returns {string}
 */
export function renderStatement(key, contextRef) {
  const concept = CONCEPTS[key];
  const text = STATEMENT_TEXT[key];
  return `<ix:nonNumeric name="${qname(concept)}" contextRef="${contextRef}">${escapeXmlText(text)}</ix:nonNumeric>`;
}

export function renderFixedFact(conceptKey, contextRef) {
  return `<ix:nonNumeric name="${qname(CONCEPTS[conceptKey])}" contextRef="${contextRef}"></ix:nonNumeric>`;
}

export function renderTextFact(conceptKey, contextRef, text) {
  return `<ix:nonNumeric name="${qname(CONCEPTS[conceptKey])}" contextRef="${contextRef}">${escapeXmlText(text)}</ix:nonNumeric>`;
}

export function renderDateFact(conceptKey, contextRef, isoDate) {
  return `<ix:nonNumeric name="${qname(CONCEPTS[conceptKey])}" contextRef="${contextRef}" format="${DATE_FORMAT}">${displayDate(isoDate)}</ix:nonNumeric>`;
}

export function renderMonetaryFact(conceptKey, contextRef, unitRef, value) {
  const signAttribute = value < 0 ? ' sign="-"' : "";
  return `<ix:nonFraction name="${qname(CONCEPTS[conceptKey])}" contextRef="${contextRef}" unitRef="${unitRef}" decimals="0" format="${NUMBER_FORMAT}"${signAttribute}>${formatMonetary(value)}</ix:nonFraction>`;
}

export function dimensionMemberXml(dimension, member) {
  return `<xbrldi:explicitMember dimension="${qname(dimension)}">${qname(member)}</xbrldi:explicitMember>`;
}

// A dimensionally-qualified fact needs its own context (an XBRL context is identified by its
// full period + entity + dimensional segment, not by period alone). Builds one such context on
// top of an existing base context's period, and appends it to additionalContexts.
export function buildDimensionedContext({ additionalContexts, entityIdentifierXml, periodXml, dimensionXml, id }) {
  additionalContexts.push(
    `<xbrli:context id="${id}"><xbrli:entity>${entityIdentifierXml}<xbrli:segment>${dimensionXml}</xbrli:segment></xbrli:entity>${periodXml}</xbrli:context>`,
  );
  return id;
}

/**
 * The heading every page of the accounts carries: the company name and registered number, then
 * the page's title and the line under it.
 * @param {object} heading
 * @param {string} heading.companyName
 * @param {string} heading.companyNumber
 * @param {string} heading.title
 * @param {string} heading.subtitleHtml - already escaped, may hold a tagged fact
 * @returns {string}
 */
export function pageHeading({ companyName, companyNumber, title, subtitleHtml }) {
  return recordHeading({
    nameHtml: escapeXmlText(companyName),
    referenceHtml: [`Registered number: ${escapeXmlText(companyNumber)}`],
    title,
    subtitleHtml,
  });
}

/**
 * The cover page: the company name and registered number tagged, the kind of accounts, and the
 * period with its start and end dates tagged.
 */
export function coverPage({ refs, companyName, companyNumber, title, periodStart, periodEnd }) {
  return `<div class="page cover">
<p class="cover-name">${renderTextFact("entityCurrentLegalOrRegisteredName", refs.current, companyName)}</p>
<p class="cover-line">Registered number: ${renderTextFact("companiesHouseRegisteredNumber", refs.current, companyNumber)}</p>
<p class="cover-title">${escapeXmlText(title)}</p>
<p class="cover-line">for the ${escapeXmlText(periodEndedPhrase(periodStart, periodEnd))}</p>
<p class="cover-line">Period from ${renderDateFact("startDateForPeriodCoveredByReport", refs.periodStartInstant, periodStart)} to ${renderDateFact("endDateForPeriodCoveredByReport", refs.currentInstant, periodEnd)}</p>
</div>`;
}

/**
 * The approval line under the balance sheet statements: the tagged approval date and the name of
 * the director who signs.
 */
export function approvalHtml({ refs, dateOfApproval, directorName }) {
  return `<p class="approval">Approved by the board of directors on ${renderDateFact("dateAuthorisationFinancialStatementsForIssue", refs.currentInstant, dateOfApproval)} and signed on its behalf by:</p>
<p class="signature">${escapeXmlText(directorName)}<br/>Director</p>`;
}

function netLabel(base, values) {
  return values.some((value) => value < 0) ? `${base} (liabilities)` : base;
}

/**
 * The balance sheet facts for one balance sheet date, keyed by line: fixed assets, current
 * assets, creditors by maturity, net current assets, total assets less current liabilities, net
 * assets and the equity components, each one ix:nonFraction element with its value. Builds the
 * dimensioned contexts the creditors and equity lines need. Throws when capital and reserves does
 * not equal the net assets derived from the lines.
 * @returns {Record<string, {xml: string, value: number}>}
 */
export function balanceSheetFacts({ contextRef, entityIdentifierXml, periodXml, additionalContexts, unitRef, figures }) {
  const netCurrentAssets = figures.currentAssets - figures.creditorsWithinOneYear;
  const totalAssetsLessCurrentLiabilities = figures.fixedAssets + netCurrentAssets;
  const netAssets = totalAssetsLessCurrentLiabilities - figures.creditorsAfterOneYear;

  if (Math.round(netAssets) !== Math.round(figures.capitalAndReserves)) {
    throw new Error(
      `Capital and reserves (${figures.capitalAndReserves}) does not equal net assets (${netAssets}) for context ${contextRef}`,
    );
  }

  const dimensioned = (dimension, member, suffix) =>
    buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml,
      dimensionXml: dimensionMemberXml(dimension, member),
      id: `${contextRef}-${suffix}`,
    });
  const fact = (conceptKey, factContextRef, value) => ({ xml: renderMonetaryFact(conceptKey, factContextRef, unitRef, value), value });

  return {
    fixedAssets: fact("fixedAssets", contextRef, figures.fixedAssets),
    currentAssets: fact("currentAssets", contextRef, figures.currentAssets),
    creditorsWithinOneYear: fact(
      "creditors",
      dimensioned(DIMENSIONS.maturities, MEMBERS.withinOneYear, "within-one-year"),
      figures.creditorsWithinOneYear,
    ),
    netCurrentAssets: fact("netCurrentAssetsLiabilities", contextRef, netCurrentAssets),
    totalAssetsLessCurrentLiabilities: fact("totalAssetsLessCurrentLiabilities", contextRef, totalAssetsLessCurrentLiabilities),
    creditorsAfterOneYear: fact(
      "creditors",
      dimensioned(DIMENSIONS.maturities, MEMBERS.afterOneYear, "after-one-year"),
      figures.creditorsAfterOneYear,
    ),
    netAssets: fact("netAssetsLiabilities", contextRef, netAssets),
    calledUpShareCapital: fact(
      "equity",
      dimensioned(DIMENSIONS.equityClasses, MEMBERS.shareCapital, "share-capital"),
      figures.calledUpShareCapital,
    ),
    profitAndLossAccount: fact(
      "equity",
      dimensioned(DIMENSIONS.equityClasses, MEMBERS.retainedEarningsAccumulatedLosses, "profit-and-loss-account"),
      figures.profitAndLossAccount,
    ),
    capitalAndReserves: fact("equity", contextRef, figures.capitalAndReserves),
  };
}

/**
 * The balance sheet rows in the Companies Act format 1 order, one figure column per year. The
 * current assets and creditors lines can carry indented sub-lines above their subtotal.
 *
 * @param {object} rowsInput
 * @param {Array<Record<string, {xml: string, value: number}>>} rowsInput.years - balanceSheetFacts per column
 * @param {object[]} [rowsInput.currentAssetLines] - {label, cells} rows shown under "Current assets"
 * @param {object[]} [rowsInput.creditorLines] - {label, cells} rows shown under the creditors heading
 * @param {object} [rowsInput.notes] - note numbers keyed by line (fixedAssets, calledUpShareCapital)
 * @returns {object[]} recordTable rows
 */
export function balanceSheetRows({ years, currentAssetLines, creditorLines, notes = {} }) {
  const cells = (line, options) => years.map((year) => recordFigure(year[line].xml, year[line].value, options));
  const values = (line) => years.map((year) => year[line].value);
  const rows = [{ label: "Fixed assets", note: notes.fixedAssets, cells: cells("fixedAssets") }];
  if (currentAssetLines) {
    rows.push({ label: "Current assets", style: "heading" }, ...currentAssetLines.map((line) => ({ ...line, indent: true })));
    rows.push({ label: "", style: "subtotal", cells: cells("currentAssets") });
  } else {
    rows.push({ label: "Current assets", cells: cells("currentAssets") });
  }
  if (creditorLines) {
    rows.push(
      { label: "Creditors: amounts falling due within one year", style: "heading" },
      ...creditorLines.map((line) => ({ ...line, indent: true })),
    );
    rows.push({ label: "", style: "subtotal", cells: cells("creditorsWithinOneYear", { deduction: true }) });
  } else {
    rows.push({ label: "Creditors: amounts falling due within one year", cells: cells("creditorsWithinOneYear", { deduction: true }) });
  }
  rows.push(
    { label: netLabel("Net current assets", values("netCurrentAssets")), style: "subtotal", cells: cells("netCurrentAssets") },
    { label: "Total assets less current liabilities", cells: cells("totalAssetsLessCurrentLiabilities") },
    {
      label: "Creditors: amounts falling due after more than one year",
      cells: cells("creditorsAfterOneYear", { deduction: true }),
    },
    { label: netLabel("Net assets", values("netAssets")), style: "total", cells: cells("netAssets") },
    { label: "Capital and reserves", style: "heading" },
    { label: "Called up share capital", note: notes.calledUpShareCapital, indent: true, cells: cells("calledUpShareCapital") },
    { label: "Profit and loss account", indent: true, cells: cells("profitAndLossAccount") },
    { label: "Shareholders' funds", style: "total", cells: cells("capitalAndReserves") },
  );
  return rows;
}

/**
 * Wrap rendered contexts, hidden facts and the visible pages in the iXBRL document shell. The
 * ix:header sits inside a hidden div, so a browser shows the pages and nothing of the header.
 * @param {object} parts
 * @param {string} parts.title - the document title, e.g. "ACME LIMITED - Accounts"
 * @param {string} parts.contextsXml - every xbrli:context, already concatenated
 * @param {string} parts.hiddenFactsXml - facts with no place on the face of the accounts
 * @param {string} parts.bodyHtml - the visible pages with their tagged facts
 * @returns {string}
 */
export function renderAccountsDocument({ title, contextsXml, hiddenFactsXml, bodyHtml }) {
  const namespaceAttributes = Object.entries(NAMESPACES)
    .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
    .join(" ");

  return `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:ixt2="${IXT2_NAMESPACE}" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" ${namespaceAttributes}>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<title>${escapeXmlText(title)}</title>
<style type="text/css">${RECORD_STYLE}</style>
</head>
<body>
<div style="display:none">
<ix:header>
<ix:hidden>
${hiddenFactsXml}
</ix:hidden>
<ix:references><link:schemaRef xlink:type="simple" xlink:href="${FRS_102_ENTRY_POINT}"/></ix:references>
<ix:resources>
${contextsXml}
<xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
<xbrli:unit id="pure"><xbrli:measure>pure</xbrli:measure></xbrli:unit>
<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
</ix:resources>
</ix:header>
</div>
${bodyHtml}
</body>
</html>
`;
}

let cachedConceptList;

/**
 * The checked-in list of concept qualified names the FRS 102 entry point declares, produced by
 * scripts/generate-frc-taxonomy-concepts.js. Cached across calls within one process.
 * @returns {string[]}
 */
export function loadFrcTaxonomyConcepts() {
  if (!cachedConceptList) {
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "frc-taxonomy", "frs-102-2026-concepts.json");
    const data = JSON.parse(readFileSync(fixturePath, "utf8"));
    cachedConceptList = data.concepts;
  }
  return cachedConceptList;
}
