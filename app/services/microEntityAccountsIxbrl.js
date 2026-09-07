// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/microEntityAccountsIxbrl.js
// Builds a micro-entity's FRS 105 annual accounts as one iXBRL (XHTML + inline XBRL) document,
// referencing the FRS 102 entry point the Companies House accounts TIS points micro-entity
// filings at. Hand-built templating: the output is a single XHTML file, so a string template
// with escaping is simpler than a general XBRL-authoring library.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { escapeXmlText } from "../lib/xmlDom.js";

const FRS_102_ENTRY_POINT = "https://xbrl.frc.org.uk/FRS-102/2026-01-01/FRS-102-2026-01-01.xsd";

const NAMESPACES = {
  bus: "http://xbrl.frc.org.uk/cd/2026-01-01/business",
  core: "http://xbrl.frc.org.uk/fr/2026-01-01/core",
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

  statementAuditExemptionSection477: {
    prefix: "direp",
    name: "StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies",
  },
  statementMembersNotRequiredAudit: { prefix: "direp", name: "StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit" },
  statementDirectorsResponsibilities: { prefix: "direp", name: "StatementThatDirectorsAcknowledgeTheirResponsibilitiesUnderCompaniesAct" },
  statementMicroEntityProvisions: {
    prefix: "direp",
    name: "StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
  },

  fixedAssets: { prefix: "core", name: "FixedAssets" },
  currentAssets: { prefix: "core", name: "CurrentAssets" },
  netCurrentAssetsLiabilities: { prefix: "core", name: "NetCurrentAssetsLiabilities" },
  totalAssetsLessCurrentLiabilities: { prefix: "core", name: "TotalAssetsLessCurrentLiabilities" },
  creditors: { prefix: "core", name: "Creditors" },
  netAssetsLiabilities: { prefix: "core", name: "NetAssetsLiabilities" },
  equity: { prefix: "core", name: "Equity" },
  averageNumberEmployeesDuringPeriod: { prefix: "core", name: "AverageNumberEmployeesDuringPeriod" },
};

const MANDATORY_CONCEPT_KEYS = [
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
];

const STATEMENT_KEYS = [
  "statementAuditExemptionSection477",
  "statementMembersNotRequiredAudit",
  "statementDirectorsResponsibilities",
  "statementMicroEntityProvisions",
];

const DIMENSIONS = {
  accountingStandards: { prefix: "bus", name: "AccountingStandardsDimension" },
  accountsStatus: { prefix: "bus", name: "AccountsStatusDimension" },
  accountsType: { prefix: "bus", name: "AccountsTypeDimension" },
  equityClasses: { prefix: "core", name: "EquityClassesDimension" },
  maturities: { prefix: "core", name: "MaturitiesOrExpirationPeriodsDimension" },
};

const MEMBERS = {
  microEntities: { prefix: "bus", name: "Micro-entities" },
  auditExemptNoAccountantsReport: { prefix: "bus", name: "AuditExempt-NoAccountantsReport" },
  fullAccounts: { prefix: "bus", name: "FullAccounts" },
  shareCapital: { prefix: "core", name: "ShareCapital" },
  retainedEarningsAccumulatedLosses: { prefix: "core", name: "RetainedEarningsAccumulatedLosses" },
  withinOneYear: { prefix: "core", name: "WithinOneYear" },
  afterOneYear: { prefix: "core", name: "AfterOneYear" },
};

const STATEMENT_TEXT = {
  statementAuditExemptionSection477:
    "The company is entitled to exemption from audit under section 477 of the Companies Act 2006 relating to small companies.",
  statementMembersNotRequiredAudit:
    "The members have not required the company to obtain an audit in accordance with section 476 of the Companies Act 2006.",
  statementDirectorsResponsibilities:
    "The directors acknowledge their responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts.",
  statementMicroEntityProvisions:
    "These accounts have been prepared in accordance with the provisions applicable to companies subject to the micro-entities regime.",
};

function qname(concept) {
  return `${concept.prefix}:${concept.name}`;
}

function previousDay(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Build the xbrli contexts an accounts document needs: one duration context for the current
 * period, one instant context for the current balance sheet date (period end), one instant
 * context for the period start (StartDateForPeriodCoveredByReport is itself an instant-typed
 * fact), one instant context for the approval date, and, when prior year figures are supplied, a
 * matching prior-year instant context.
 *
 * @param {object} input - the same input buildMicroEntityAccounts receives
 * @returns {{xml: string, refs: {current: string, currentInstant: string, periodStartInstant: string, priorInstant?: string}, periodXml: Record<string,string>}}
 */
export function buildContexts(input) {
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

  if (input.balanceSheet.prior) {
    const priorBalanceSheetDate = input.priorBalanceSheetDate || previousDay(input.periodStart);
    const priorYear = priorBalanceSheetDate.slice(0, 4);
    refs.priorInstant = `e${priorYear}`;
    periodXml[refs.priorInstant] = `<xbrli:period><xbrli:instant>${priorBalanceSheetDate}</xbrli:instant></xbrli:period>`;
  }

  const contextsXml = Object.entries(periodXml)
    .map(([id, period]) => `<xbrli:context id="${id}"><xbrli:entity>${entityIdentifierXml}</xbrli:entity>${period}</xbrli:context>`)
    .join("");

  return { xml: contextsXml, refs, entityIdentifierXml, periodXml };
}

/**
 * Format a monetary value as whole pounds, matching decimals="0". Returns the absolute value;
 * callers add sign="-" to the ix:nonFraction tag when the underlying figure is negative, per the
 * XBRL convention of reporting magnitudes against the concept's declared balance direction.
 * @param {number} value
 * @returns {string}
 */
export function formatMonetary(value) {
  return String(Math.round(Math.abs(value)));
}

/**
 * Render one of the four fixed-wording audit-exemption / micro-entity statements as a tagged
 * ix:nonNumeric fact. The wording is fixed (the page never lets a user edit it), matching the
 * phrase checks Companies House runs on each statement.
 * @param {"statementAuditExemptionSection477"|"statementMembersNotRequiredAudit"|"statementDirectorsResponsibilities"|"statementMicroEntityProvisions"} key
 * @param {string} contextRef
 * @returns {string}
 */
export function renderStatement(key, contextRef) {
  const concept = CONCEPTS[key];
  const text = STATEMENT_TEXT[key];
  return `<ix:nonNumeric name="${qname(concept)}" contextRef="${contextRef}">${escapeXmlText(text)}</ix:nonNumeric>`;
}

function renderFixedFact(conceptKey, contextRef) {
  return `<ix:nonNumeric name="${qname(CONCEPTS[conceptKey])}" contextRef="${contextRef}"></ix:nonNumeric>`;
}

function renderMonetaryFact(conceptKey, contextRef, unitRef, value) {
  const signAttribute = value < 0 ? ' sign="-"' : "";
  return `<ix:nonFraction name="${qname(CONCEPTS[conceptKey])}" contextRef="${contextRef}" unitRef="${unitRef}" decimals="0"${signAttribute}>${formatMonetary(value)}</ix:nonFraction>`;
}

function dimensionMemberXml(dimension, member) {
  return `<xbrldi:explicitMember dimension="${qname(dimension)}">${qname(member)}</xbrldi:explicitMember>`;
}

// A dimensionally-qualified fact needs its own context (an XBRL context is identified by its
// full period + entity + dimensional segment, not by period alone). Builds one such context on
// top of an existing base context's period, and appends it to additionalContexts.
function buildDimensionedContext({ additionalContexts, entityIdentifierXml, periodXml, dimensionXml, id }) {
  additionalContexts.push(
    `<xbrli:context id="${id}"><xbrli:entity>${entityIdentifierXml}<xbrli:segment>${dimensionXml}</xbrli:segment></xbrli:entity>${periodXml}</xbrli:context>`,
  );
  return id;
}

function assembleBalanceSheetFacts({ contextRef, entityIdentifierXml, periodXml, additionalContexts, unitRef, figures }) {
  const facts = [];

  facts.push(renderMonetaryFact("fixedAssets", contextRef, unitRef, figures.fixedAssets));
  facts.push(renderMonetaryFact("currentAssets", contextRef, unitRef, figures.currentAssets));

  const netCurrentAssets = figures.currentAssets - figures.creditorsWithinOneYear;
  const totalAssetsLessCurrentLiabilities = figures.fixedAssets + netCurrentAssets;
  const netAssets = totalAssetsLessCurrentLiabilities - figures.creditorsAfterOneYear;

  if (Math.round(netAssets) !== Math.round(figures.capitalAndReserves)) {
    throw new Error(`Capital and reserves (${figures.capitalAndReserves}) does not equal net assets (${netAssets}) for context ${contextRef}`);
  }

  facts.push(renderMonetaryFact("netCurrentAssetsLiabilities", contextRef, unitRef, netCurrentAssets));
  facts.push(renderMonetaryFact("totalAssetsLessCurrentLiabilities", contextRef, unitRef, totalAssetsLessCurrentLiabilities));

  const withinOneYearContextId = buildDimensionedContext({
    additionalContexts,
    entityIdentifierXml,
    periodXml,
    dimensionXml: dimensionMemberXml(DIMENSIONS.maturities, MEMBERS.withinOneYear),
    id: `${contextRef}-within-one-year`,
  });
  facts.push(renderMonetaryFact("creditors", withinOneYearContextId, unitRef, figures.creditorsWithinOneYear));

  const afterOneYearContextId = buildDimensionedContext({
    additionalContexts,
    entityIdentifierXml,
    periodXml,
    dimensionXml: dimensionMemberXml(DIMENSIONS.maturities, MEMBERS.afterOneYear),
    id: `${contextRef}-after-one-year`,
  });
  facts.push(renderMonetaryFact("creditors", afterOneYearContextId, unitRef, figures.creditorsAfterOneYear));

  facts.push(renderMonetaryFact("netAssetsLiabilities", contextRef, unitRef, netAssets));

  const shareCapitalContextId = buildDimensionedContext({
    additionalContexts,
    entityIdentifierXml,
    periodXml,
    dimensionXml: dimensionMemberXml(DIMENSIONS.equityClasses, MEMBERS.shareCapital),
    id: `${contextRef}-share-capital`,
  });
  facts.push(renderMonetaryFact("equity", shareCapitalContextId, unitRef, figures.calledUpShareCapital));

  const profitAndLossContextId = buildDimensionedContext({
    additionalContexts,
    entityIdentifierXml,
    periodXml,
    dimensionXml: dimensionMemberXml(DIMENSIONS.equityClasses, MEMBERS.retainedEarningsAccumulatedLosses),
    id: `${contextRef}-profit-and-loss-account`,
  });
  facts.push(renderMonetaryFact("equity", profitAndLossContextId, unitRef, figures.profitAndLossAccount));

  facts.push(renderMonetaryFact("equity", contextRef, unitRef, figures.capitalAndReserves));

  return facts.join("");
}

/**
 * Build a micro-entity's FRS 105 annual accounts as one iXBRL document.
 *
 * @param {object} input
 * @param {string} input.companyNumber
 * @param {string} input.companyName
 * @param {string} input.periodStart - ISO date
 * @param {string} input.periodEnd - ISO date
 * @param {string} [input.priorBalanceSheetDate] - ISO date; defaults to the day before periodStart
 * @param {boolean} [input.dormant]
 * @param {number} input.averageNumberOfEmployees
 * @param {string} input.directorName
 * @param {string} input.dateOfApproval - ISO date
 * @param {object} input.balanceSheet
 * @param {object} input.balanceSheet.current - fixedAssets, currentAssets, creditorsWithinOneYear,
 *   creditorsAfterOneYear, calledUpShareCapital, profitAndLossAccount, capitalAndReserves
 * @param {object} [input.balanceSheet.prior] - the same shape as current, for the comparative year
 * @returns {string} the XHTML document
 */
export function buildMicroEntityAccounts(input) {
  const { xml: contextsXml, refs, entityIdentifierXml, periodXml } = buildContexts(input);
  const additionalContexts = [];

  const facts = [];

  facts.push(`<ix:nonNumeric name="${qname(CONCEPTS.companiesHouseRegisteredNumber)}" contextRef="${refs.current}">${escapeXmlText(input.companyNumber)}</ix:nonNumeric>`);
  facts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.entityCurrentLegalOrRegisteredName)}" contextRef="${refs.current}">${escapeXmlText(input.companyName)}</ix:nonNumeric>`,
  );
  facts.push(`<ix:nonNumeric name="${qname(CONCEPTS.balanceSheetDate)}" contextRef="${refs.currentInstant}">${input.periodEnd}</ix:nonNumeric>`);
  // Companies House's validator requires this fact in the same current-period context as the
  // balance sheet date, not a bespoke one keyed to the approval date's own value.
  facts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.dateAuthorisationFinancialStatementsForIssue)}" contextRef="${refs.currentInstant}">${input.dateOfApproval}</ix:nonNumeric>`,
  );
  // DirectorSigningFinancialStatements is a fixed (zero-length) fact: it marks that a director
  // signed. The director's own name is plain prose next to it, not part of the tagged data.
  facts.push(renderFixedFact("directorSigningFinancialStatements", refs.current));
  facts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.entityDormantTruefalse)}" contextRef="${refs.current}">${input.dormant ? "true" : "false"}</ix:nonNumeric>`,
  );
  facts.push(`<ix:nonNumeric name="${qname(CONCEPTS.startDateForPeriodCoveredByReport)}" contextRef="${refs.periodStartInstant}">${input.periodStart}</ix:nonNumeric>`);
  facts.push(`<ix:nonNumeric name="${qname(CONCEPTS.endDateForPeriodCoveredByReport)}" contextRef="${refs.currentInstant}">${input.periodEnd}</ix:nonNumeric>`);
  // EntityTradingStatus is reported at its default member (trading) with no dimension: a
  // dimension at its default value must not be reported.
  facts.push(renderFixedFact("entityTradingStatus", refs.current));

  const accountsStatusContextId = buildDimensionedContext({
    additionalContexts,
    entityIdentifierXml,
    periodXml: periodXml[refs.current],
    dimensionXml: dimensionMemberXml(DIMENSIONS.accountsStatus, MEMBERS.auditExemptNoAccountantsReport),
    id: `${refs.current}-accounts-status`,
  });
  facts.push(renderFixedFact("accountsStatusAuditedOrUnaudited", accountsStatusContextId));

  const accountsTypeContextId = buildDimensionedContext({
    additionalContexts,
    entityIdentifierXml,
    periodXml: periodXml[refs.current],
    dimensionXml: dimensionMemberXml(DIMENSIONS.accountsType, MEMBERS.fullAccounts),
    id: `${refs.current}-accounts-type`,
  });
  facts.push(renderFixedFact("accountsType", accountsTypeContextId));

  const accountingStandardsContextId = buildDimensionedContext({
    additionalContexts,
    entityIdentifierXml,
    periodXml: periodXml[refs.current],
    dimensionXml: dimensionMemberXml(DIMENSIONS.accountingStandards, MEMBERS.microEntities),
    id: `${refs.current}-accounting-standards`,
  });
  facts.push(renderFixedFact("accountingStandardsApplied", accountingStandardsContextId));

  for (const statementKey of STATEMENT_KEYS) {
    facts.push(renderStatement(statementKey, refs.current));
  }

  facts.push(
    `<ix:nonFraction name="${qname(CONCEPTS.averageNumberEmployeesDuringPeriod)}" contextRef="${refs.current}" unitRef="pure" decimals="0">${formatMonetary(input.averageNumberOfEmployees)}</ix:nonFraction>`,
  );

  facts.push(
    assembleBalanceSheetFacts({
      contextRef: refs.currentInstant,
      entityIdentifierXml,
      periodXml: periodXml[refs.currentInstant],
      additionalContexts,
      unitRef: "GBP",
      figures: input.balanceSheet.current,
    }),
  );

  if (input.balanceSheet.prior) {
    facts.push(
      assembleBalanceSheetFacts({
        contextRef: refs.priorInstant,
        entityIdentifierXml,
        periodXml: periodXml[refs.priorInstant],
        additionalContexts,
        unitRef: "GBP",
        figures: input.balanceSheet.prior,
      }),
    );
  }

  const namespaceAttributes = Object.entries(NAMESPACES)
    .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
    .join(" ");

  return `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" ${namespaceAttributes}>
<head><title>${escapeXmlText(input.companyName)} - annual accounts</title></head>
<body>
<ix:header>
<ix:references><link:schemaRef xlink:type="simple" xlink:href="${FRS_102_ENTRY_POINT}"/></ix:references>
<ix:resources>
${contextsXml}${additionalContexts.join("")}
<xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
<xbrli:unit id="pure"><xbrli:measure>pure</xbrli:measure></xbrli:unit>
</ix:resources>
</ix:header>
<h1>${escapeXmlText(input.companyName)}</h1>
<p>Company number ${escapeXmlText(input.companyNumber)}</p>
<p>Annual accounts for the period from ${input.periodStart} to ${input.periodEnd}</p>
<p>Approved on behalf of the board on ${input.dateOfApproval} by ${escapeXmlText(input.directorName)}</p>
${facts.join("\n")}
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

export { MANDATORY_CONCEPT_KEYS, STATEMENT_KEYS };
