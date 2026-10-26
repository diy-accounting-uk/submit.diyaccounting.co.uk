// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/microEntityAccountsIxbrl.js
// Builds a micro-entity's FRS 105 annual accounts as one iXBRL (XHTML + inline XBRL) document,
// referencing the FRS 102 entry point the Companies House accounts TIS points micro-entity
// filings at. Hand-built templating: the output is a single XHTML file, so a string template
// with escaping is simpler than a general XBRL-authoring library.

import { escapeXmlText } from "../lib/xmlDom.js";
import {
  CONCEPTS,
  DIMENSIONS,
  MEMBERS,
  NUMBER_FORMAT,
  qname,
  buildContexts,
  formatMonetary,
  periodEndedPhrase,
  renderStatement,
  renderFixedFact,
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
  renderTextFact,
  renderMonetaryFact,
  renderSigningDirectorFact,
  renderCompanyDescriptionFacts,
  companyInformationNote,
} from "./accountsIxbrlCommon.js";
import { recordFigure, recordTable } from "../lib/submissionRecord.js";

// The FRS 105 micro-entity profit and loss account (Format 2) a Company Tax Return carries.
export const MICRO_PROFIT_AND_LOSS_LINES = [
  "turnover",
  "otherIncome",
  "rawMaterials",
  "staffCosts",
  "depreciation",
  "otherCharges",
  "profitBeforeTax",
  "tax",
  "profit",
];

const MICRO_PROFIT_AND_LOSS_CONCEPT_KEY = {
  turnover: "turnoverRevenue",
  otherIncome: "otherOperatingIncome",
  rawMaterials: "rawMaterialsConsumablesUsed",
  staffCosts: "staffCosts",
  depreciation: "depreciationWrittenOff",
  otherCharges: "otherOperatingExpenses",
  profitBeforeTax: "profitLossBeforeTax",
  tax: "taxOnProfitLoss",
  profit: "profitLoss",
};

const MICRO_PROFIT_AND_LOSS_ROW = {
  turnover: { label: "Turnover" },
  otherIncome: { label: "Other income" },
  rawMaterials: { label: "Raw materials and consumables", deduction: true },
  staffCosts: { label: "Staff costs", deduction: true },
  depreciation: { label: "Depreciation and other amounts written off assets", deduction: true },
  otherCharges: { label: "Other charges", deduction: true },
  profitBeforeTax: { label: "Profit or loss before tax", style: "subtotal" },
  tax: { label: "Tax", deduction: true },
  profit: { label: "Profit or loss for the financial year", style: "total" },
};

/**
 * The identities a micro-entity profit and loss account must hold, as messages; empty when they hold.
 * @param {object} figures - the lines of MICRO_PROFIT_AND_LOSS_LINES
 * @returns {string[]}
 */
export function microProfitAndLossProblems(figures) {
  const problems = [];
  const beforeTax =
    figures.turnover + figures.otherIncome - figures.rawMaterials - figures.staffCosts - figures.depreciation - figures.otherCharges;
  if (figures.profitBeforeTax !== beforeTax) {
    problems.push("profitBeforeTax must equal turnover plus otherIncome less rawMaterials, staffCosts, depreciation and otherCharges");
  }
  if (figures.profit !== figures.profitBeforeTax - figures.tax) problems.push("profit must equal profitBeforeTax less tax");
  return problems;
}

function microProfitAndLossPage({ heading, refs, current, prior, columns }) {
  const rows = MICRO_PROFIT_AND_LOSS_LINES.map((line) => {
    const { label, deduction, style } = MICRO_PROFIT_AND_LOSS_ROW[line];
    const conceptKey = MICRO_PROFIT_AND_LOSS_CONCEPT_KEY[line];
    const fact = (contextRef, value) => renderMonetaryFact(conceptKey, contextRef, "GBP", value);
    const cells = [recordFigure(fact(refs.current, current[line]), current[line], { deduction })];
    if (prior) cells.push(recordFigure(fact(refs.prior, prior[line]), prior[line], { deduction }));
    return { label, style, cells };
  });
  return `<div class="page">
${heading}${recordTable({ columns: prior ? columns : columns.slice(0, 1), rows })}
</div>`;
}

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

const DORMANT_STATEMENT_KEYS = STATEMENT_KEYS.map((key) =>
  key === "statementAuditExemptionSection477" ? "statementAuditExemptionSection480" : key,
);

// A micro-entity need not describe its principal activity; Companies House's own examples carry this text.
const NO_PRINCIPAL_ACTIVITY_DESCRIPTION = "No description of principal activity";

const DORMANT_NEVER_TRADED_SENTENCE =
  "The company has not traded during the year or the preceding financial period. During this time the company received no income and incurred no expenditure and therefore no profit and loss account is presented.";

export const DORMANT_TRADING_STATUSES = ["neverTraded", "noLongerTrading"];
export const SHARE_CLASSES = ["ordinaryShares", "preferenceShares", "deferredShares", "otherShares"];

const SHARE_CLASS_LABEL = {
  ordinaryShares: "ordinary",
  preferenceShares: "preference",
  deferredShares: "deferred",
  otherShares: "other",
};

/**
 * The number of shares a fully paid share capital figure represents at a nominal value, or null
 * when the capital is not a whole number of shares.
 * @param {number} calledUpShareCapital
 * @param {number} nominalValue
 * @returns {number|null}
 */
export function sharesIssuedFor(calledUpShareCapital, nominalValue) {
  if (!Number.isFinite(nominalValue) || nominalValue <= 0 || !Number.isFinite(calledUpShareCapital)) return null;
  const shares = Math.round((calledUpShareCapital / nominalValue) * 1e6) / 1e6;
  return Number.isInteger(shares) ? shares : null;
}

/**
 * Build a micro-entity's FRS 105 annual accounts as one iXBRL document.
 *
 * @param {object} input
 * @param {string} input.companyNumber
 * @param {string} input.companyName
 * @param {string} input.registeredOffice - the registered office address on one line
 * @param {string} input.periodStart - ISO date
 * @param {string} input.periodEnd - ISO date
 * @param {string} [input.priorBalanceSheetDate] - ISO date; defaults to the day before periodStart
 * @param {boolean} [input.dormant] - section 480 statement and a trading status member replace the
 *   section 477 statement and the default trading status
 * @param {"neverTraded"|"noLongerTrading"} [input.dormantTradingStatus] - required when dormant
 * @param {"ordinaryShares"|"preferenceShares"|"deferredShares"|"otherShares"} [input.shareClass] - required when dormant
 * @param {number} [input.nominalValue] - pounds per share; required when dormant
 * @param {number} input.averageNumberOfEmployees
 * @param {string} input.directorName
 * @param {string} input.dateOfApproval - ISO date
 * @param {object} input.balanceSheet
 * @param {object} input.balanceSheet.current - fixedAssets, currentAssets, creditorsWithinOneYear,
 *   creditorsAfterOneYear, calledUpShareCapital, profitAndLossAccount, capitalAndReserves
 * @param {object} [input.balanceSheet.prior] - the same shape as current, for the comparative year
 * @param {{current: object, prior?: object}} [input.profitAndLoss] - MICRO_PROFIT_AND_LOSS_LINES; when
 *   present the document is the full copy HMRC takes with a Company Tax Return, with the profit and
 *   loss account and no section 444 exemption; when absent it is the Companies House copy
 * @returns {string} the XHTML document
 */
export function buildMicroEntityAccounts(input) {
  const profitAndLoss = input.profitAndLoss;
  const {
    xml: contextsXml,
    refs,
    entityIdentifierXml,
    periodXml,
  } = buildContexts(input, { includePriorPeriod: Boolean(profitAndLoss?.prior) });
  const additionalContexts = [];
  const hiddenFacts = [];

  if (profitAndLoss) {
    const problems = [
      ...microProfitAndLossProblems(profitAndLoss.current).map((message) => `profitAndLoss.current: ${message}`),
      ...(profitAndLoss.prior ? microProfitAndLossProblems(profitAndLoss.prior).map((message) => `profitAndLoss.prior: ${message}`) : []),
    ];
    if (problems.length > 0) throw new Error(problems.join("; "));
  }

  // DirectorSigningFinancialStatements is a fixed (zero-length) fact on the signing director's
  // officer context; the same context carries the director's NameEntityOfficer on the approval line.
  const { fact: signingDirectorFact, officerContextRef } = renderSigningDirectorFact({
    additionalContexts,
    entityIdentifierXml,
    periodXml,
    refs,
    position: 1,
  });
  hiddenFacts.push(signingDirectorFact);
  hiddenFacts.push(...renderProductionSoftwareFacts(refs.current));
  hiddenFacts.push(
    ...renderCompanyDescriptionFacts({ companyNumber: input.companyNumber, refs, entityIdentifierXml, periodXml, additionalContexts }),
  );
  hiddenFacts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.reportIncludesDetailedProfitLossStatement)}" contextRef="${refs.current}">${profitAndLoss ? "true" : "false"}</ix:nonNumeric>`,
  );
  if (!profitAndLoss) {
    hiddenFacts.push(
      `<ix:nonNumeric name="${qname(CONCEPTS.exemptionNotPublishingOwnProfitLossAccount)}" contextRef="${refs.current}">true</ix:nonNumeric>`,
    );
  }
  hiddenFacts.push(
    renderTextFact("descriptionPrincipalActivities", refs.current, input.dormant ? "Dormant company" : NO_PRINCIPAL_ACTIVITY_DESCRIPTION),
  );
  hiddenFacts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.entityDormantTruefalse)}" contextRef="${refs.current}">${input.dormant ? "true" : "false"}</ix:nonNumeric>`,
  );
  if (input.dormant) {
    const tradingStatusContextId = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.current],
      dimensionXml: dimensionMemberXml(DIMENSIONS.entityTradingStatus, MEMBERS[input.dormantTradingStatus]),
      id: `${refs.current}-trading-status`,
    });
    hiddenFacts.push(renderFixedFact("entityTradingStatus", tradingStatusContextId));
  } else {
    // EntityTradingStatus is reported at its default member (trading) with no dimension: a
    // dimension at its default value must not be reported.
    hiddenFacts.push(renderFixedFact("entityTradingStatus", refs.current));
  }

  for (const [conceptKey, dimension, member, id] of [
    ["accountsStatusAuditedOrUnaudited", DIMENSIONS.accountsStatus, MEMBERS.auditExemptNoAccountantsReport, "accounts-status"],
    ["accountsType", DIMENSIONS.accountsType, profitAndLoss ? MEMBERS.fullAccounts : MEMBERS.filletedAccounts, "accounts-type"],
    ["accountingStandardsApplied", DIMENSIONS.accountingStandards, MEMBERS.microEntities, "accounting-standards"],
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

  const years = [
    balanceSheetFacts({
      contextRef: refs.currentInstant,
      entityIdentifierXml,
      periodXml: periodXml[refs.currentInstant],
      additionalContexts,
      unitRef: "GBP",
      figures: input.balanceSheet.current,
    }),
  ];
  const columns = [input.periodEnd.slice(0, 4)];
  if (input.balanceSheet.prior) {
    years.push(
      balanceSheetFacts({
        contextRef: refs.priorInstant,
        entityIdentifierXml,
        periodXml: periodXml[refs.priorInstant],
        additionalContexts,
        unitRef: "GBP",
        figures: input.balanceSheet.prior,
      }),
    );
    columns.push(refs.priorInstant.slice(1));
  }

  const notes = [
    companyInformationNote(input, refs),
    {
      title: "Accounting policies",
      html: `<p>${renderTextFact("statementComplianceWithReportingFramework", refs.current, "These financial statements have been prepared in accordance with FRS 105 The Financial Reporting Standard applicable to the Micro-entities Regime.")}</p>`,
    },
    {
      title: "Employees",
      html: `<p>The average number of employees during the ${periodEndedPhrase(input.periodStart, input.periodEnd).split(" ")[0]} was <ix:nonFraction name="${qname(CONCEPTS.averageNumberEmployeesDuringPeriod)}" contextRef="${refs.current}" unitRef="pure" decimals="0" format="${NUMBER_FORMAT}">${formatMonetary(input.averageNumberOfEmployees)}</ix:nonFraction>.</p>`,
    },
  ];

  let shareCapitalNote;
  if (input.dormant) {
    const sharesIssued = sharesIssuedFor(input.balanceSheet.current.calledUpShareCapital, input.nominalValue);
    const shareClassDimensionXml = dimensionMemberXml(DIMENSIONS.entityShareClasses, MEMBERS[input.shareClass]);
    // The number of shares is held at the balance sheet date (an instant); the nominal value is
    // a duration item in the FRC taxonomy, so each fact takes its own share-class context.
    const shareClassInstantContextId = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.currentInstant],
      dimensionXml: shareClassDimensionXml,
      id: `${refs.currentInstant}-share-class`,
    });
    const shareClassDurationContextId = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.current],
      dimensionXml: shareClassDimensionXml,
      id: `${refs.current}-share-class`,
    });
    notes.push({
      title: "Called up share capital",
      html: `<p>Allotted, called up and fully paid: <ix:nonFraction name="${qname(CONCEPTS.numberSharesIssuedFullyPaid)}" contextRef="${shareClassInstantContextId}" unitRef="shares" decimals="0" format="${NUMBER_FORMAT}">${formatMonetary(sharesIssued)}</ix:nonFraction> ${SHARE_CLASS_LABEL[input.shareClass]} shares of £<ix:nonFraction name="${qname(CONCEPTS.nominalValueAllottedShareCapital)}" contextRef="${shareClassDurationContextId}" unitRef="GBP" decimals="INF">${input.nominalValue}</ix:nonFraction> each.</p>`,
    });
    shareCapitalNote = notes.length;
  }

  const heading = (title, subtitleHtml) =>
    pageHeading({ companyName: input.companyName, companyNumber: input.companyNumber, title, subtitleHtml });
  const statementKeys = input.dormant ? DORMANT_STATEMENT_KEYS : STATEMENT_KEYS;

  const bodyHtml = `${coverPage({
    refs,
    companyName: input.companyName,
    companyNumber: input.companyNumber,
    title: input.dormant ? "Unaudited dormant micro-entity accounts" : "Unaudited micro-entity accounts",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })}
<div class="page">
${heading("Balance sheet", `as at ${renderDateFact("balanceSheetDate", refs.currentInstant, input.periodEnd)}`)}${recordTable({
    columns,
    notes: Boolean(shareCapitalNote),
    rows: balanceSheetRows({ years, notes: { calledUpShareCapital: shareCapitalNote } }),
  })}
${statementKeys.map((key) => `<p>${renderStatement(key, refs.current)}</p>`).join("\n")}
${input.dormant && input.dormantTradingStatus === "neverTraded" ? `<p>${escapeXmlText(DORMANT_NEVER_TRADED_SENTENCE)}</p>` : ""}
${approvalHtml({ refs, dateOfApproval: input.dateOfApproval, directorName: input.directorName, officerContextRef })}
</div>
${
  profitAndLoss
    ? microProfitAndLossPage({
        heading: heading("Profit and loss account", `for the ${escapeXmlText(periodEndedPhrase(input.periodStart, input.periodEnd))}`),
        refs,
        current: profitAndLoss.current,
        prior: profitAndLoss.prior,
        columns: [input.periodEnd.slice(0, 4), ...(profitAndLoss.prior ? [refs.prior.slice(1)] : [])],
      })
    : ""
}
<div class="page">
${heading("Notes to the financial statements", `for the ${escapeXmlText(periodEndedPhrase(input.periodStart, input.periodEnd))}`)}${notes
    .map((note, index) => `<h3>${index + 1}. ${escapeXmlText(note.title)}</h3>\n${note.html}`)
    .join("\n")}
</div>`;

  return renderAccountsDocument({
    title: `${input.companyName} - Accounts`,
    contextsXml: `${contextsXml}${additionalContexts.join("")}`,
    hiddenFactsXml: hiddenFacts.join("\n"),
    bodyHtml,
  });
}

export { MANDATORY_CONCEPT_KEYS, STATEMENT_KEYS, DORMANT_STATEMENT_KEYS };
