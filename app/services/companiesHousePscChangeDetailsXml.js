// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHousePscChangeDetailsXml.js
// Builds the PSCChangeDetails form body (companiesHouseXmlGateway.js wraps it in the FormSubmission
// envelope): the notice that a person with significant control's details have changed, the online
// form of Companies House's PSC04 (an individual) and PSC05 (a relevant legal entity).
// PSCChangeDetails-v1-2.xsd's PSCChangeDetailsType names one PSC as the register shows it
// (companiesHousePscParticularsXml.js), then its Change, then the date of the change and the date
// the company had confirmation of it.
//
// The changes built here are the PSC's natures of control, which replace the set the register
// holds, and its address: an individual's service address, or an entity's address. A change of
// name, identification, nationality, country of residence or residential address is not built.

import { entityNameXml, individualIdentificationXml, optionalElement, pscElementName } from "./companiesHousePscParticularsXml.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const HOLDINGS = ["", "_AS_TRUST", "_AS_FIRM"];
const BANDS = ["25TO50PERCENT", "50TO75PERCENT", "75TO100PERCENT"];

/** NatureOfControlsType's 24 values, in the schema's order. */
export const NATURE_OF_CONTROL_CODES = [
  ...["OWNERSHIPOFSHARES", "VOTINGRIGHTS"].flatMap((right) =>
    HOLDINGS.flatMap((holding) => BANDS.map((band) => `${right}_${band}${holding}`)),
  ),
  ...HOLDINGS.map((holding) => `RIGHTTOAPPOINTANDREMOVEDIRECTORS${holding}`),
  ...HOLDINGS.map((holding) => `SIGINFLUENCECONTROL${holding}`),
];

/** The AddressBaseType Country codes an address here may name; any other country is OtherForeignCountry. */
export const UK_COUNTRY_CODES = ["GB-ENG", "GB-WLS", "GB-SCT", "GB-NIR", "GBR"];

const holdingOf = (code) => HOLDINGS.find((holding) => holding && code.endsWith(holding)) || "";

/**
 * The reasons a set of natures of control cannot be filed, or [] when it can. PSC04 asks for one
 * band of shares and one of voting rights, and for significant influence or control only when none
 * of the other three statements applies; each holds within one way of holding (directly, through a
 * trust, through a firm).
 * @param {string[]} codes
 * @returns {string[]}
 */
export function natureOfControlProblems(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return ["at least one nature of control is needed"];
  const problems = [];
  const unknown = codes.filter((code) => !NATURE_OF_CONTROL_CODES.includes(code));
  if (unknown.length) problems.push(`unknown nature of control ${unknown.join(", ")}`);
  if (new Set(codes).size !== codes.length) problems.push("a nature of control is given twice");
  for (const holding of HOLDINGS) {
    const held = codes.filter((code) => NATURE_OF_CONTROL_CODES.includes(code) && holdingOf(code) === holding);
    for (const right of ["OWNERSHIPOFSHARES", "VOTINGRIGHTS"]) {
      if (held.filter((code) => code.startsWith(right)).length > 1) problems.push(`more than one band of ${right}${holding}`);
    }
    if (held.includes(`SIGINFLUENCECONTROL${holding}`) && held.length > 1) {
      const heldAs = holding ? " " + holding : "";
      problems.push(`SIGINFLUENCECONTROL${holding} only when no other nature of control${heldAs} applies`);
    }
  }
  return problems;
}

/**
 * The reasons an address cannot be filed, or [] when it can.
 * @param {object} address - premise, street, thoroughfare, postTown, county, country (a UK_COUNTRY_CODES
 *   code) or otherForeignCountry, postcode
 * @returns {string[]}
 */
export function addressProblems(address) {
  const problems = [];
  if (!address || typeof address !== "object") return ["an address is needed"];
  if (!address.premise) problems.push("an address needs its premise");
  if (!address.postTown) problems.push("an address needs its post town");
  if (Boolean(address.country) === Boolean(address.otherForeignCountry)) problems.push("an address needs one country");
  else if (address.country && !UK_COUNTRY_CODES.includes(address.country)) problems.push(`unknown country ${address.country}`);
  for (const [field, max] of [
    ["premise", 50],
    ["street", 50],
    ["thoroughfare", 50],
    ["postTown", 50],
    ["county", 50],
    ["otherForeignCountry", 50],
    ["postcode", 15],
  ]) {
    if (address[field] && String(address[field]).length > max) problems.push(`${field} is longer than ${max} characters`);
  }
  return problems;
}

function addressXml(address) {
  const country = address.country
    ? optionalElement("Country", address.country)
    : optionalElement("OtherForeignCountry", address.otherForeignCountry);
  return (
    `<Address>${optionalElement("Premise", address.premise)}${optionalElement("Street", address.street)}` +
    `${optionalElement("Thoroughfare", address.thoroughfare)}${optionalElement("PostTown", address.postTown)}` +
    `${optionalElement("County", address.county)}` +
    `${country}${optionalElement("Postcode", address.postcode)}</Address>`
  );
}

function naturesOfControlXml(codes) {
  const controls = codes.map((code) => optionalElement("NatureOfControl", code)).join("");
  return `<NatureOfControls>${controls}</NatureOfControls>`;
}

/**
 * Build the PSCChangeDetails form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.kind - a key of PSC_KIND_ELEMENTS
 * @param {string} [input.title] - an individual's particulars, as for companiesHousePscParticularsXml.js
 * @param {string} [input.surname]
 * @param {string} [input.forename]
 * @param {string} [input.otherForenames]
 * @param {number} [input.dobMonth]
 * @param {number} [input.dobYear]
 * @param {string} [input.name] - a corporate entity's or a legal person's name
 * @param {string[]} [input.naturesOfControl] - NATURE_OF_CONTROL_CODES, every one that applies after the change
 * @param {object} [input.address] - the new address, as addressProblems reads it
 * @param {string} input.dateOfChange - ISO date the change occurred
 * @param {string} input.confirmationDate - ISO date the company had confirmation of the change, how
 *   the details changed and the date of the change
 * @returns {string} the PSCChangeDetails element's XML
 */
export function buildPscChangeDetailsBody(input) {
  const elementName = pscElementName(input.kind);
  if (!ISO_DATE.test(input.dateOfChange ?? "")) throw new Error("dateOfChange must be YYYY-MM-DD");
  if (!ISO_DATE.test(input.confirmationDate ?? "")) throw new Error("confirmationDate must be YYYY-MM-DD");
  if (!input.naturesOfControl && !input.address) throw new Error("a change of details needs a change");
  const problems = [
    ...(input.naturesOfControl ? natureOfControlProblems(input.naturesOfControl) : []),
    ...(input.address ? addressProblems(input.address) : []),
  ];
  if (problems.length) throw new Error(problems.join("; "));
  const individual = elementName === "Individual";
  let address = input.address ? addressXml(input.address) : "";
  if (address && individual) address = `<ServiceAddress>${address}</ServiceAddress>`;
  const change = `<Change>${address}${input.naturesOfControl ? naturesOfControlXml(input.naturesOfControl) : ""}</Change>`;
  const particulars = individual ? individualIdentificationXml(input) : entityNameXml(elementName, input.name);
  return (
    `<PSCChangeDetails xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/PSCChangeDetails-v1-2.xsd">` +
    `<${elementName}>${particulars}${change}</${elementName}>` +
    `<DateOfChange>${input.dateOfChange}</DateOfChange><ConfirmationDate>${input.confirmationDate}</ConfirmationDate>` +
    `</PSCChangeDetails>`
  );
}
