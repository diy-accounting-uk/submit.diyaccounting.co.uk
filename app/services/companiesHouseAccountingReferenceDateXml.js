// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseAccountingReferenceDateXml.js
// Builds the ChangeAccountingReferenceDate form body (companiesHouseXmlGateway.js wraps it in the
// FormSubmission envelope): the change of a company's accounting reference date, the online form of
// Companies House's AA01. ChangeAccountingReferenceDate-v2-7.xsd takes the end date of the period
// being changed (AccountRefDate), whether the period is shortened or extended (ChangeToPeriod), the
// new end date (AmendedAccountRefDate) and, for a company that has extended a period in the last
// five years, the ground that allows another extension (FiveYearExtensionDetails).

import { escapeXmlText } from "../lib/xmlDom.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The grounds AA01 section 4 gives for extending more than once in five years, and the schema's code for each.
export const FIVE_YEAR_EXTENSION_REASONS = {
  "administration": "ADMIN",
  "secretary-of-state-approval": "STATE",
  "uk-parent-or-subsidiary": "UKPAR",
};

/**
 * Whether a change shortens or extends the period, as the schema's ChangeToPeriod names it.
 * @param {string} currentPeriodEnd - ISO date
 * @param {string} newPeriodEnd - ISO date
 * @returns {"SHORT"|"EXTEND"|null} null when the two dates are the same
 */
export function changeToPeriod(currentPeriodEnd, newPeriodEnd) {
  if (newPeriodEnd < currentPeriodEnd) return "SHORT";
  return newPeriodEnd > currentPeriodEnd ? "EXTEND" : null;
}

/**
 * Build the ChangeAccountingReferenceDate form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.currentPeriodEnd - ISO end date of the accounting period being changed
 * @param {string} input.newPeriodEnd - ISO date the period now ends on
 * @param {string} [input.fiveYearExtensionReason] - a key of FIVE_YEAR_EXTENSION_REASONS, for a
 *   company that has extended a period in the last five years
 * @param {string} [input.extensionAuthorisedCode] - the four-character code of the Secretary of
 *   State's approval, with that reason only
 * @returns {string} the ChangeAccountingReferenceDate element's XML
 */
export function buildAccountingReferenceDateBody({ currentPeriodEnd, newPeriodEnd, fiveYearExtensionReason, extensionAuthorisedCode }) {
  if (!ISO_DATE.test(currentPeriodEnd ?? "")) throw new Error("currentPeriodEnd must be YYYY-MM-DD");
  if (!ISO_DATE.test(newPeriodEnd ?? "")) throw new Error("newPeriodEnd must be YYYY-MM-DD");
  const change = changeToPeriod(currentPeriodEnd, newPeriodEnd);
  if (!change) throw new Error("newPeriodEnd must differ from currentPeriodEnd");
  let extensionXml = "";
  if (fiveYearExtensionReason) {
    const reasonCode = FIVE_YEAR_EXTENSION_REASONS[fiveYearExtensionReason];
    if (!reasonCode) throw new Error(`unknown fiveYearExtensionReason ${fiveYearExtensionReason}`);
    if (change !== "EXTEND") throw new Error("fiveYearExtensionReason applies to an extended period only");
    if (extensionAuthorisedCode && reasonCode !== "STATE") {
      throw new Error("extensionAuthorisedCode applies to the Secretary of State's approval only");
    }
    if (extensionAuthorisedCode && String(extensionAuthorisedCode).length !== 4) {
      throw new Error("extensionAuthorisedCode must be 4 characters");
    }
    const codeXml = extensionAuthorisedCode
      ? `<ExtensionAuthorisedCode>${escapeXmlText(String(extensionAuthorisedCode))}</ExtensionAuthorisedCode>`
      : "";
    extensionXml = `<FiveYearExtensionDetails><ExtensionReason>${reasonCode}</ExtensionReason>${codeXml}</FiveYearExtensionDetails>`;
  } else if (extensionAuthorisedCode) {
    throw new Error("extensionAuthorisedCode needs fiveYearExtensionReason");
  }
  return (
    `<ChangeAccountingReferenceDate xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ChangeAccountingReferenceDate-v2-7.xsd">` +
    `<AccountRefDate>${currentPeriodEnd}</AccountRefDate><ChangeToPeriod>${change}</ChangeToPeriod>` +
    `<AmendedAccountRefDate>${newPeriodEnd}</AmendedAccountRefDate>${extensionXml}` +
    `</ChangeAccountingReferenceDate>`
  );
}
