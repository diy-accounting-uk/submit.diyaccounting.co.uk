// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHousePscVerificationStatementXml.js
// Builds the PSCVerificationStatement form body (companiesHouseXmlGateway.js wraps it in the
// FormSubmission envelope) and checks a built body's element order against the xs:sequence read
// from the checked-in XSD, so a reorder fails a test before it can fail a filing with error 604 -
// the same discipline companiesHouseConfirmationStatementXml.js applies to its own form.
//
// PSCVerificationStatement-v1-0's root element carries exactly one Individual: a person with
// significant control, verified the same way a director is on the confirmation statement, filed
// separately for each director who is also a PSC, after the confirmation statement, inside the
// window starting the day after the review date.

import { parseXmlDocument, firstElement, allElements, escapeXmlText } from "../lib/xmlDom.js";

function localName(element) {
  return element.tagName.includes(":") ? element.tagName.split(":").pop() : element.tagName;
}

function directChildren(element, wantedLocalName) {
  return Array.from(element.children).filter((child) => localName(child) === wantedLocalName);
}

function findComplexType(document, name) {
  return allElements(document, "xs:complexType").find((element) => element.getAttribute("name") === name);
}

/**
 * Read the Individual element's own child order, in schema order, from the checked-in
 * PSCBaseTypes-v1-4.xsd text: PSCIdentificationType's sequence (Title, Surname, Forename,
 * OtherForenames, PartialDOB, each optional except Surname), followed by Change - the one element
 * PSCVerificationStatementType's Individual extension adds after everything PSCIdentificationType
 * carries.
 * @param {string} pscBaseTypesXsdXml
 * @returns {string[]}
 */
export function readPscVerificationIndividualElementOrder(pscBaseTypesXsdXml) {
  const document = parseXmlDocument(pscBaseTypesXsdXml);

  const identificationType = findComplexType(document, "PSCIdentificationType");
  if (!identificationType) {
    throw new Error("PSCIdentificationType complex type not found in schema");
  }
  const [identificationSequence] = directChildren(identificationType, "sequence");
  const identificationOrder = directChildren(identificationSequence, "element").map(
    (element) => element.getAttribute("name") || element.getAttribute("ref"),
  );

  const verificationStatementType = findComplexType(document, "PSCVerificationStatementType");
  if (!verificationStatementType) {
    throw new Error("PSCVerificationStatementType complex type not found in schema");
  }
  const [outerSequence] = directChildren(verificationStatementType, "sequence");
  const [choice] = directChildren(outerSequence, "choice");
  const [individualElement] = directChildren(choice, "element");
  const [individualComplexType] = directChildren(individualElement, "complexType");
  const [complexContent] = directChildren(individualComplexType, "complexContent");
  const [extension] = directChildren(complexContent, "extension");
  const [extensionSequence] = directChildren(extension, "sequence");
  const extensionOrder = directChildren(extensionSequence, "element").map(
    (element) => element.getAttribute("name") || element.getAttribute("ref"),
  );

  return [...identificationOrder, ...extensionOrder];
}

// Kept here as the order buildPscVerificationStatementBody() itself always emits; matched against
// readPscVerificationIndividualElementOrder() reading fixtures/companies-house-xmlgw/
// PSCBaseTypes-v1-4.xsd in tests.
export const PSC_VERIFICATION_INDIVIDUAL_ELEMENT_ORDER = ["Title", "Surname", "Forename", "OtherForenames", "PartialDOB", "Change"];

/**
 * Assert that a built PSCVerificationStatement body's Individual element's children appear in the
 * given schema order, skipping elements the body omits. Throws on the first element that is
 * either unknown to the schema or appears before an element that must precede it.
 * @param {string} bodyXml - the built <PSCVerificationStatement> element
 * @param {string[]} [elementOrder] - defaults to PSC_VERIFICATION_INDIVIDUAL_ELEMENT_ORDER
 */
export function assertPscVerificationStatementElementOrder(bodyXml, elementOrder = PSC_VERIFICATION_INDIVIDUAL_ELEMENT_ORDER) {
  const document = parseXmlDocument(bodyXml);
  const individual = firstElement(document, "Individual");
  if (!individual) {
    throw new Error("Individual element not found in PSC verification statement body");
  }
  let lastIndex = -1;
  for (const child of Array.from(individual.children)) {
    const tagName = localName(child);
    const index = elementOrder.indexOf(tagName);
    if (index === -1) {
      throw new Error(`Unexpected element ${tagName} in PSC verification statement body`);
    }
    if (index < lastIndex) {
      throw new Error(`Element ${tagName} is out of schema order`);
    }
    lastIndex = index;
  }
}

function buildPartialDobXml(dobMonth, dobYear) {
  if (dobMonth === undefined || dobMonth === null || dobYear === undefined || dobYear === null) {
    return "";
  }
  return `<PartialDOB><Month>${dobMonth}</Month><Year>${dobYear}</Year></PartialDOB>`;
}

/**
 * Build the PSC verification statement's root element (namespace
 * http://xmlgw.companieshouse.gov.uk), verifying one director who is also a person with
 * significant control. Companies House exposes only the month and year of a PSC's date of birth
 * on the public register, so PartialDOB carries at most those two fields, never a full date.
 *
 * @param {object} input
 * @param {string} [input.title]
 * @param {string} input.surname
 * @param {string} [input.forename]
 * @param {string} [input.otherForenames]
 * @param {number} [input.dobMonth] - 1 to 12
 * @param {number} [input.dobYear]
 * @param {string} input.personalCode - the PSC's 11-character Companies House personal code
 * @param {string} [input.nameMismatchReason] - only when the verified name differs from the
 *   register
 * @returns {string} the PSC verification statement's root element XML
 */
export function buildPscVerificationStatementBody({
  title,
  surname,
  forename,
  otherForenames,
  dobMonth,
  dobYear,
  personalCode,
  nameMismatchReason,
}) {
  if (!surname) {
    throw new Error("surname is required");
  }
  if (!personalCode || personalCode.length !== 11) {
    throw new Error("the PSC's Companies House personal code must be 11 characters");
  }

  const titleXml = title ? `<Title>${escapeXmlText(title)}</Title>` : "";
  const forenameXml = forename ? `<Forename>${escapeXmlText(forename)}</Forename>` : "";
  const otherForenamesXml = otherForenames ? `<OtherForenames>${escapeXmlText(otherForenames)}</OtherForenames>` : "";
  const partialDobXml = buildPartialDobXml(dobMonth, dobYear);
  const nameMismatchReasonXml = nameMismatchReason ? `<NameMismatchReason>${escapeXmlText(nameMismatchReason)}</NameMismatchReason>` : "";

  const individualXml =
    `<Individual>` +
    `${titleXml}<Surname>${escapeXmlText(surname)}</Surname>${forenameXml}${otherForenamesXml}${partialDobXml}` +
    `<Change><VerificationDetails>` +
    `<CompaniesHousePersonalCode>${escapeXmlText(personalCode)}</CompaniesHousePersonalCode>` +
    `<VerificationStatements><VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual></VerificationStatements>` +
    `${nameMismatchReasonXml}` +
    `</VerificationDetails></Change>` +
    `</Individual>`;

  const bodyXml =
    `<PSCVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/PSCVerificationStatement-v1-0.xsd">` +
    `${individualXml}</PSCVerificationStatement>`;

  assertPscVerificationStatementElementOrder(bodyXml);

  return bodyXml;
}
