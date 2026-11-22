// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHousePscParticularsXml.js
// The particulars by which a PSC form names a person with significant control as the register
// shows it, in PSCBaseTypes-v1-4.xsd's terms: an individual by PSCIdentificationType (Surname and
// the optional Title, Forename, OtherForenames and PartialDOB), a corporate entity by CorporateName
// and a legal person by LegalPersonName. An individual protected from disclosure
// (SuperSecureIndividual) is not on the public register, so no form here names one.

import { escapeXmlText } from "../lib/xmlDom.js";

// The register's PSC kinds, as the PSC route answers them, and the element each names in a form.
export const PSC_KIND_ELEMENTS = {
  "individual-person-with-significant-control": "Individual",
  "corporate-entity-person-with-significant-control": "Corporate",
  "legal-person-person-with-significant-control": "LegalPerson",
};

/** An element with its text escaped, or "" when there is no value. */
export function optionalElement(name, value) {
  return value === undefined || value === null || value === "" ? "" : `<${name}>${escapeXmlText(String(value))}</${name}>`;
}

/** The form element a kind of PSC is named in; throws for a kind no form here names. */
export function pscElementName(kind) {
  const elementName = PSC_KIND_ELEMENTS[kind];
  if (!elementName) throw new Error(`unknown PSC kind ${kind}`);
  return elementName;
}

/** An individual's PSCIdentificationType content, without the element that wraps it. */
export function individualIdentificationXml({ title, surname, forename, otherForenames, dobMonth, dobYear }) {
  if (!surname) throw new Error("an individual PSC needs a surname");
  const partialDob =
    dobMonth !== undefined && dobMonth !== null && dobYear !== undefined && dobYear !== null
      ? `<PartialDOB><Month>${Number(dobMonth)}</Month><Year>${Number(dobYear)}</Year></PartialDOB>`
      : "";
  return (
    `${optionalElement("Title", title)}${optionalElement("Surname", surname)}${optionalElement("Forename", forename)}` +
    `${optionalElement("OtherForenames", otherForenames)}${partialDob}`
  );
}

/** A corporate entity's CorporateName or a legal person's LegalPersonName element. */
export function entityNameXml(elementName, name) {
  if (!name) throw new Error(`a ${elementName === "Corporate" ? "corporate entity" : "legal person"} PSC needs its name`);
  return optionalElement(elementName === "Corporate" ? "CorporateName" : "LegalPersonName", name);
}
