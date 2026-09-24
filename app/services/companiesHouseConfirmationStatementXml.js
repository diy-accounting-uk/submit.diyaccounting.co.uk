// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseConfirmationStatementXml.js
// Builds the ConfirmationAndVerificationStatement form body (companiesHouseXmlGateway.js wraps it
// in the FormSubmission envelope) and checks a built body's element order against the xs:sequence
// read from the checked-in XSD, so a reorder fails a test before it can fail a filing with
// error 604.

import { parseXmlDocument, allElements, escapeXmlText } from "../lib/xmlDom.js";

// The ConfirmationAndVerificationStatement element's own xs:sequence, in schema order. Read
// directly from fixtures/companies-house-xmlgw/ConfirmationAndVerificationStatement-v1-0.xsd by
// readConfirmationStatementElementOrder() in tests; kept here as the order buildConfirmationStatementBody()
// itself always emits.
export const CONFIRMATION_STATEMENT_ELEMENT_ORDER = [
  "TradingOnMarket",
  "DTR5Applies",
  "PSCExemptAsTradingOnRegulatedMarket",
  "PSCExemptAsSharesAdmittedOnMarket",
  "PSCExemptAsTradingOnUKRegulatedMarket",
  "ReviewDate",
  "SICCodes",
  "StatementOfCapital",
  "Shareholdings",
  "RegisteredEmailAddress",
  "AcceptLawfulPurposeStatement",
  "StateConfirmation",
  "VerificationStatement",
];

function localName(element) {
  return element.tagName.includes(":") ? element.tagName.split(":").pop() : element.tagName;
}

function directChildren(element, wantedLocalName) {
  return Array.from(element.children).filter((child) => localName(child) === wantedLocalName);
}

/**
 * Read the ConfirmationAndVerificationStatement element's own xs:sequence child names, in schema
 * order, from the checked-in XSD text. ref attributes (e.g. SICCodes) are read the same as name
 * attributes: both are the element's tag name in an instance document.
 * @param {string} xsdXml
 * @returns {string[]}
 */
export function readConfirmationStatementElementOrder(xsdXml) {
  const document = parseXmlDocument(xsdXml);
  const rootElement = allElements(document, "xs:element").find(
    (element) => element.getAttribute("name") === "ConfirmationAndVerificationStatement",
  );
  if (!rootElement) {
    throw new Error("ConfirmationAndVerificationStatement element not found in schema");
  }
  const [complexType] = directChildren(rootElement, "complexType");
  const [sequence] = directChildren(complexType, "sequence");
  return directChildren(sequence, "element").map((element) => element.getAttribute("name") || element.getAttribute("ref"));
}

/**
 * Assert that a built ConfirmationAndVerificationStatement body's top-level elements appear in
 * the given schema order, skipping elements the body omits and allowing an element to repeat
 * (e.g. Shareholdings, maxOccurs unbounded). Throws on the first element that is either unknown
 * to the schema or appears before an element that must precede it.
 * @param {string} bodyXml - the built <ConfirmationAndVerificationStatement> element
 * @param {string[]} [elementOrder] - defaults to CONFIRMATION_STATEMENT_ELEMENT_ORDER
 */
export function assertConfirmationStatementElementOrder(bodyXml, elementOrder = CONFIRMATION_STATEMENT_ELEMENT_ORDER) {
  const document = parseXmlDocument(bodyXml);
  const root = document.documentElement;
  let lastIndex = -1;
  for (const child of Array.from(root.children)) {
    const tagName = localName(child);
    const index = elementOrder.indexOf(tagName);
    if (index === -1) {
      throw new Error(`Unexpected element ${tagName} in confirmation statement body`);
    }
    if (index < lastIndex) {
      throw new Error(`Element ${tagName} is out of schema order`);
    }
    lastIndex = index;
  }
}

function buildSicCodeXml(code) {
  return `<SICCode>${escapeXmlText(code)}</SICCode>`;
}

function buildAddressXml(address) {
  const tagNames = [
    ["premise", "Premise"],
    ["street", "Street"],
    ["thoroughfare", "Thoroughfare"],
    ["postTown", "PostTown"],
    ["county", "County"],
    ["country", "Country"],
    ["postcode", "Postcode"],
  ];
  const fieldsXml = tagNames
    .filter(([field]) => address[field])
    .map(([field, tag]) => `<${tag}>${escapeXmlText(address[field])}</${tag}>`)
    .join("");
  return `<Address>${fieldsXml}</Address>`;
}

function buildStatementOfCapitalXml({ totalAmountUnpaid, totalNumberOfIssuedShares, shareCurrency, totalAggregateNominalValue, shares }) {
  const sharesXml = (shares || [])
    .map(
      (share) =>
        `<Shares>` +
        `<ShareClass>${escapeXmlText(share.shareClass)}</ShareClass>` +
        `<PrescribedParticulars>${escapeXmlText(share.prescribedParticulars)}</PrescribedParticulars>` +
        `<NumShares>${share.numShares}</NumShares>` +
        `<AggregateNominalValue>${share.aggregateNominalValue}</AggregateNominalValue>` +
        `</Shares>`,
    )
    .join("");
  return (
    `<StatementOfCapital><Capital>` +
    `<TotalAmountUnpaid>${totalAmountUnpaid}</TotalAmountUnpaid>` +
    `<TotalNumberOfIssuedShares>${totalNumberOfIssuedShares}</TotalNumberOfIssuedShares>` +
    `<ShareCurrency>${escapeXmlText(shareCurrency)}</ShareCurrency>` +
    `<TotalAggregateNominalValue>${totalAggregateNominalValue}</TotalAggregateNominalValue>` +
    `${sharesXml}</Capital></StatementOfCapital>`
  );
}

function buildShareholderNameXml(shareholder) {
  if (shareholder.amalgamatedName) {
    return `<AmalgamatedName>${escapeXmlText(shareholder.amalgamatedName)}</AmalgamatedName>`;
  }
  const forenameXml = shareholder.forename ? `<Forename>${escapeXmlText(shareholder.forename)}</Forename>` : "";
  return `<Surname>${escapeXmlText(shareholder.surname)}</Surname>${forenameXml}`;
}

function buildShareholdingXml({ shareClass, numberHeld, transfers, shareholders }) {
  if (!shareClass) {
    throw new Error("a shareholding must carry a share class");
  }
  const transfersXml = (transfers || [])
    .map(
      (transfer) =>
        `<Transfers>` +
        `<DateOfTransfer>${transfer.dateOfTransfer}</DateOfTransfer>` +
        `<NumberSharesTransferred>${transfer.numberSharesTransferred}</NumberSharesTransferred>` +
        `</Transfers>`,
    )
    .join("");
  const shareholdersXml = (shareholders || [])
    .map((shareholder) => {
      const addressXml = shareholder.address ? buildAddressXml(shareholder.address) : "";
      return `<Shareholders><Name>${buildShareholderNameXml(shareholder)}</Name>${addressXml}</Shareholders>`;
    })
    .join("");
  return (
    `<Shareholdings>` +
    `<ShareClass>${escapeXmlText(shareClass)}</ShareClass>` +
    `<NumberHeld>${numberHeld}</NumberHeld>` +
    `${transfersXml}${shareholdersXml}</Shareholdings>`
  );
}

function buildVerificationDirectorXml({ title, forename, otherForenames, surname, dob, personalCode, nameMismatchReason }) {
  if (!personalCode || personalCode.length !== 11) {
    throw new Error(`director ${surname || forename || ""}'s Companies House personal code must be 11 characters`);
  }
  const titleXml = title ? `<Title>${escapeXmlText(title)}</Title>` : "";
  const otherForenamesXml = otherForenames ? `<OtherForenames>${escapeXmlText(otherForenames)}</OtherForenames>` : "";
  const nameMismatchReasonXml = nameMismatchReason ? `<NameMismatchReason>${escapeXmlText(nameMismatchReason)}</NameMismatchReason>` : "";
  return (
    `<Director><Person>` +
    `${titleXml}<Forename>${escapeXmlText(forename)}</Forename>${otherForenamesXml}` +
    `<Surname>${escapeXmlText(surname)}</Surname><DOB>${dob}</DOB>` +
    `<VerificationDetails>` +
    `<CompaniesHousePersonalCode>${escapeXmlText(personalCode)}</CompaniesHousePersonalCode>` +
    `<VerificationStatements><VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual></VerificationStatements>` +
    `${nameMismatchReasonXml}</VerificationDetails>` +
    `</Person></Director>`
  );
}

/**
 * Build the ConfirmationAndVerificationStatement element (namespace http://xmlgw.companieshouse.gov.uk),
 * with elements in the schema's own order, from a form's answers. Optional data sets (SIC codes,
 * statement of capital, shareholdings, registered email) are sent only when given, matching the
 * schema's rule that a full set is sent if, and only if, it changed since the last confirmation.
 *
 * @param {object} input
 * @param {string} input.reviewDate - ISO date, not in the future
 * @param {string[]} [input.sicCodes] - at most four
 * @param {object} [input.statementOfCapital]
 * @param {object[]} [input.shareholdings]
 * @param {string} [input.registeredEmailAddress]
 * @param {object[]} input.directors - one row per current director, each carrying an 11-character
 *   Companies House personal code
 * @returns {string} the ConfirmationAndVerificationStatement element XML
 */
export function buildConfirmationStatementBody({
  reviewDate,
  sicCodes,
  statementOfCapital,
  shareholdings,
  registeredEmailAddress,
  directors,
}) {
  if (!reviewDate || Number.isNaN(Date.parse(reviewDate))) {
    throw new Error("reviewDate is required");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (reviewDate > today) {
    throw new Error(`reviewDate ${reviewDate} must not be in the future`);
  }
  if (sicCodes && sicCodes.length > 4) {
    throw new Error("at most four SIC codes are allowed");
  }
  if (!Array.isArray(directors) || directors.length === 0) {
    throw new Error("at least one director's verification statement is required");
  }

  const parts = ["<TradingOnMarket>false</TradingOnMarket>", "<DTR5Applies>false</DTR5Applies>", `<ReviewDate>${reviewDate}</ReviewDate>`];

  if (sicCodes && sicCodes.length > 0) {
    const sicCodesXml = sicCodes.map(buildSicCodeXml).join("");
    parts.push(`<SICCodes>${sicCodesXml}</SICCodes>`);
  }
  if (statementOfCapital) {
    parts.push(buildStatementOfCapitalXml(statementOfCapital));
  }
  if (shareholdings && shareholdings.length > 0) {
    parts.push(shareholdings.map(buildShareholdingXml).join(""));
  }
  if (registeredEmailAddress) {
    parts.push(`<RegisteredEmailAddress>${escapeXmlText(registeredEmailAddress)}</RegisteredEmailAddress>`);
  }
  parts.push("<AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>");
  parts.push("<StateConfirmation>true</StateConfirmation>");
  parts.push(`<VerificationStatement>${directors.map(buildVerificationDirectorXml).join("")}</VerificationStatement>`);

  const bodyXml = `<ConfirmationAndVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ConfirmationAndVerificationStatement-v1-0.xsd">${parts.join("")}</ConfirmationAndVerificationStatement>`;

  assertConfirmationStatementElementOrder(bodyXml);

  return bodyXml;
}
