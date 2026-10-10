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
  qname,
  buildContexts,
  formatMonetary,
  renderStatement,
  renderFixedFact,
  dimensionMemberXml,
  buildDimensionedContext,
  assembleBalanceSheetFacts,
  renderAccountsDocument,
} from "./accountsIxbrlCommon.js";

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
 * @returns {string} the XHTML document
 */
export function buildMicroEntityAccounts(input) {
  const { xml: contextsXml, refs, entityIdentifierXml, periodXml } = buildContexts(input);
  const additionalContexts = [];

  const facts = [];

  facts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.companiesHouseRegisteredNumber)}" contextRef="${refs.current}">${escapeXmlText(input.companyNumber)}</ix:nonNumeric>`,
  );
  facts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.entityCurrentLegalOrRegisteredName)}" contextRef="${refs.current}">${escapeXmlText(input.companyName)}</ix:nonNumeric>`,
  );
  facts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.balanceSheetDate)}" contextRef="${refs.currentInstant}">${input.periodEnd}</ix:nonNumeric>`,
  );
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
  facts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.startDateForPeriodCoveredByReport)}" contextRef="${refs.periodStartInstant}">${input.periodStart}</ix:nonNumeric>`,
  );
  facts.push(
    `<ix:nonNumeric name="${qname(CONCEPTS.endDateForPeriodCoveredByReport)}" contextRef="${refs.currentInstant}">${input.periodEnd}</ix:nonNumeric>`,
  );
  if (input.dormant) {
    const tradingStatusContextId = buildDimensionedContext({
      additionalContexts,
      entityIdentifierXml,
      periodXml: periodXml[refs.current],
      dimensionXml: dimensionMemberXml(DIMENSIONS.entityTradingStatus, MEMBERS[input.dormantTradingStatus]),
      id: `${refs.current}-trading-status`,
    });
    facts.push(renderFixedFact("entityTradingStatus", tradingStatusContextId));
  } else {
    // EntityTradingStatus is reported at its default member (trading) with no dimension: a
    // dimension at its default value must not be reported.
    facts.push(renderFixedFact("entityTradingStatus", refs.current));
  }

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

  for (const statementKey of input.dormant ? DORMANT_STATEMENT_KEYS : STATEMENT_KEYS) {
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

  let shareNoteHtml = "";
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
    facts.push(
      `<ix:nonFraction name="${qname(CONCEPTS.numberSharesIssuedFullyPaid)}" contextRef="${shareClassInstantContextId}" unitRef="shares" decimals="0">${sharesIssued}</ix:nonFraction>`,
      `<ix:nonFraction name="${qname(CONCEPTS.nominalValueAllottedShareCapital)}" contextRef="${shareClassDurationContextId}" unitRef="GBP" decimals="INF">${input.nominalValue}</ix:nonFraction>`,
    );
    shareNoteHtml = `<p>Share capital: ${sharesIssued} ${SHARE_CLASS_LABEL[input.shareClass]} shares of £${input.nominalValue} each, allotted and fully paid</p>\n`;
  }

  const bodyHtml = `<h1>${escapeXmlText(input.companyName)}</h1>
<p>Company number ${escapeXmlText(input.companyNumber)}</p>
<p>Annual accounts for the period from ${input.periodStart} to ${input.periodEnd}</p>
<p>Approved on behalf of the board on ${input.dateOfApproval} by ${escapeXmlText(input.directorName)}</p>
${shareNoteHtml}${facts.join("\n")}`;

  return renderAccountsDocument({ companyName: input.companyName, contextsXml: `${contextsXml}${additionalContexts.join("")}`, bodyHtml });
}

export { MANDATORY_CONCEPT_KEYS, STATEMENT_KEYS, DORMANT_STATEMENT_KEYS };
