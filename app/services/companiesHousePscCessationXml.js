// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHousePscCessationXml.js
// Builds the PSCCessation form body (companiesHouseXmlGateway.js wraps it in the FormSubmission
// envelope): the notice that a person with significant control has ceased to be one, the online
// form of Companies House's PSC07. PSCCessation-v1-2.xsd's PSCCessationType names one PSC, as the
// register shows it, then the date it ceased and the date the company had confirmation of that.
//
// The PSC is named by the particulars in companiesHousePscParticularsXml.js.

import { entityNameXml, individualIdentificationXml, pscElementName } from "./companiesHousePscParticularsXml.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build the PSCCessation form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.kind - a key of PSC_KIND_ELEMENTS
 * @param {string} [input.title] - an individual's
 * @param {string} [input.surname] - an individual's, required for one
 * @param {string} [input.forename]
 * @param {string} [input.otherForenames]
 * @param {number} [input.dobMonth] - 1 to 12, with dobYear, as the register shows it
 * @param {number} [input.dobYear]
 * @param {string} [input.name] - a corporate entity's or a legal person's name, required for one
 * @param {string} input.cessationDate - ISO date the PSC ceased to be one
 * @param {string} input.confirmationDate - ISO date the company had confirmation of the cessation
 *   and of its date, the later of the two
 * @returns {string} the PSCCessation element's XML
 */
export function buildPscCessationBody(input) {
  const elementName = pscElementName(input.kind);
  if (!ISO_DATE.test(input.cessationDate ?? "")) throw new Error("cessationDate must be YYYY-MM-DD");
  if (!ISO_DATE.test(input.confirmationDate ?? "")) throw new Error("confirmationDate must be YYYY-MM-DD");
  const pscXml =
    elementName === "Individual"
      ? `<Individual>${individualIdentificationXml(input)}</Individual>`
      : `<${elementName}>${entityNameXml(elementName, input.name)}</${elementName}>`;
  return (
    `<PSCCessation xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/PSCCessation-v1-2.xsd">` +
    `${pscXml}<CessationDate>${input.cessationDate}</CessationDate><ConfirmationDate>${input.confirmationDate}</ConfirmationDate>` +
    `</PSCCessation>`
  );
}
