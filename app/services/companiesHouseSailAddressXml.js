// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseSailAddressXml.js
// Builds the SailAddress form body (companiesHouseXmlGateway.js wraps it in the FormSubmission
// envelope): the notice of a company's single alternative inspection location (SAIL), the online
// form of Companies House's AD02. SailAddress-v2-6.xsd holds one UK address (UKAddressType of
// baseTypes-v2-10.xsd): Premise, Street, Thoroughfare, PostTown, County, Country, Postcode,
// CareofName and PoBox, in that order, with Premise, PostTown and Country required.

import { escapeXmlText } from "../lib/xmlDom.js";

// The UK country codes UKAddressType takes, and the part of the UK each names.
export const SAIL_ADDRESS_COUNTRIES = {
  "GB-ENG": "England",
  "GB-WLS": "Wales",
  "GB-SCT": "Scotland",
  "GB-NIR": "Northern Ireland",
};

// Each part of the address the form takes: its element and the most characters the schema allows.
export const SAIL_ADDRESS_PARTS = {
  premise: { element: "Premise", maxLength: 50, required: true },
  street: { element: "Street", maxLength: 50 },
  thoroughfare: { element: "Thoroughfare", maxLength: 50 },
  postTown: { element: "PostTown", maxLength: 50, required: true },
  county: { element: "County", maxLength: 50 },
  postcode: { element: "Postcode", maxLength: 15 },
  careOfName: { element: "CareofName", maxLength: 100 },
  poBox: { element: "PoBox", maxLength: 10 },
};

function element(name, value) {
  return value === undefined || value === null || value === "" ? "" : `<${name}>${escapeXmlText(String(value))}</${name}>`;
}

/**
 * Build the SailAddress form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} address
 * @param {string} address.premise - the building name or number
 * @param {string} [address.street]
 * @param {string} [address.thoroughfare] - the locality
 * @param {string} address.postTown
 * @param {string} [address.county]
 * @param {string} address.country - a key of SAIL_ADDRESS_COUNTRIES
 * @param {string} [address.postcode]
 * @param {string} [address.careOfName]
 * @param {string} [address.poBox]
 * @returns {string} the SailAddress element's XML
 */
export function buildSailAddressBody(address) {
  if (!address.premise) throw new Error("a SAIL address needs its building name or number");
  if (!address.postTown) throw new Error("a SAIL address needs its post town");
  if (!SAIL_ADDRESS_COUNTRIES[address.country]) throw new Error(`unknown SAIL address country ${address.country}`);
  const part = (field) => element(SAIL_ADDRESS_PARTS[field].element, address[field]);
  return (
    `<SailAddress xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/SailAddress-v2-6.xsd">` +
    `<Address>${part("premise")}${part("street")}${part("thoroughfare")}${part("postTown")}${part("county")}` +
    `<Country>${address.country}</Country>${part("postcode")}${part("careOfName")}${part("poBox")}</Address>` +
    `</SailAddress>`
  );
}
