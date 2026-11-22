// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHousePscCessationXml.js
// Builds the PSCCessation form body (companiesHouseXmlGateway.js wraps it in the FormSubmission
// envelope): the notice that a person with significant control has ceased to be one, the online
// form of Companies House's PSC07. PSCCessation-v1-2.xsd's PSCCessationType names one PSC, as the
// register shows it, then the date it ceased and the date the company had confirmation of that.
//
// The register shows three kinds of PSC this form names: an individual (Surname and the optional
// Title, Forename, OtherForenames and PartialDOB), a corporate entity (CorporateName) and a legal
// person (LegalPersonName). An individual protected from disclosure (SuperSecureIndividual) is not
// on the public register, so it is not offered.

import { escapeXmlText } from "../lib/xmlDom.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The register's PSC kinds, as the PSC route answers them, and the element each names in the form.
export const PSC_CESSATION_KINDS = {
  "individual-person-with-significant-control": "Individual",
  "corporate-entity-person-with-significant-control": "Corporate",
  "legal-person-person-with-significant-control": "LegalPerson",
};

function element(name, value) {
  return value === undefined || value === null || value === "" ? "" : `<${name}>${escapeXmlText(String(value))}</${name}>`;
}

function individualXml({ title, surname, forename, otherForenames, dobMonth, dobYear }) {
  if (!surname) throw new Error("an individual PSC needs a surname");
  const partialDob =
    dobMonth !== undefined && dobMonth !== null && dobYear !== undefined && dobYear !== null
      ? `<PartialDOB><Month>${Number(dobMonth)}</Month><Year>${Number(dobYear)}</Year></PartialDOB>`
      : "";
  return (
    `<Individual>${element("Title", title)}${element("Surname", surname)}${element("Forename", forename)}` +
    `${element("OtherForenames", otherForenames)}${partialDob}</Individual>`
  );
}

/**
 * Build the PSCCessation form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.kind - a key of PSC_CESSATION_KINDS
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
  const elementName = PSC_CESSATION_KINDS[input.kind];
  if (!elementName) throw new Error(`unknown PSC kind ${input.kind}`);
  if (!ISO_DATE.test(input.cessationDate ?? "")) throw new Error("cessationDate must be YYYY-MM-DD");
  if (!ISO_DATE.test(input.confirmationDate ?? "")) throw new Error("confirmationDate must be YYYY-MM-DD");
  let pscXml;
  if (elementName === "Individual") {
    pscXml = individualXml(input);
  } else {
    if (!input.name) throw new Error(`a ${elementName === "Corporate" ? "corporate entity" : "legal person"} PSC needs its name`);
    const nameElement = elementName === "Corporate" ? "CorporateName" : "LegalPersonName";
    pscXml = `<${elementName}>${element(nameElement, input.name)}</${elementName}>`;
  }
  return (
    `<PSCCessation xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/PSCCessation-v1-2.xsd">` +
    `${pscXml}<CessationDate>${input.cessationDate}</CessationDate><ConfirmationDate>${input.confirmationDate}</ConfirmationDate>` +
    `</PSCCessation>`
  );
}
