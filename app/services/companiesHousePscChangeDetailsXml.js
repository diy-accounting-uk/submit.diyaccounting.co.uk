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
// The changes built here, in the order the schema has them:
// - an individual (PSC04): name, service address, usual residential address, nationality, country
//   or state of residence, natures of control;
// - a corporate entity (PSC05) or a legal person (PSC06): name, principal office address, legal
//   form and governing law (with, for a corporate entity, the register it is entered in), natures
//   of control.
// The natures of control given replace the set the register holds. LLP natures of control are not
// built: the forms here are a limited company's.
//
// The usual residential address is not on the public register. No problem message here repeats a
// value given, so a refused filing writes none of it to a log.

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
 * The reasons a set of natures of control cannot be filed, or [] when it can. PSC01 and PSC04 ask for
 * one band of shares and one of voting rights within each way of holding (directly, through a trust,
 * through a firm). Significant influence or control held directly is "Only tick if none of the above
 * apply"; held through a firm or a trust it is one of "Tick each that apply".
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
    if (!holding && held.includes("SIGINFLUENCECONTROL") && held.length > 1) {
      problems.push("SIGINFLUENCECONTROL only when no other nature of control applies");
    }
  }
  return problems;
}

/**
 * The reasons an address cannot be filed, or [] when it can. No reason repeats a value given.
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
  else if (address.country && !UK_COUNTRY_CODES.includes(address.country))
    problems.push("an address names a country this form does not have");
  return problems;
}

const longerThan = (value, max) => typeof value === "string" && value.length > max;

function newNameProblems(newName, individual) {
  if (!individual) {
    if (typeof newName !== "string" || !newName) return ["a new name is needed"];
    return longerThan(newName, 160) ? ["the new name is longer than 160 characters"] : [];
  }
  if (!newName || typeof newName !== "object" || !newName.surname) return ["a new name needs its surname"];
  return [
    ["title", 50],
    ["forename", 50],
    ["otherForenames", 50],
    ["surname", 160],
  ]
    .filter(([field, max]) => longerThan(newName[field], max))
    .map(([field, max]) => `the new ${field} is longer than ${max} characters`);
}

function identificationProblems(identification, elementName) {
  if (!identification || typeof identification !== "object") return ["a change of legal form or governing law is needed"];
  const problems = [];
  if (!identification.legalForm) problems.push("a change of legal form or governing law needs the legal form");
  if (!identification.lawGoverned) problems.push("a change of legal form or governing law needs the governing law");
  const register = ["placeRegistered", "registrationNumber", "countryOrState"];
  if (elementName === "LegalPerson" && register.some((field) => identification[field])) {
    problems.push("a legal person is entered in no register on this form");
  }
  if (elementName === "Corporate" && identification.placeRegistered && !identification.registrationNumber) {
    problems.push("a register named needs the registration number in it");
  }
  // The gateway refuses PSCRegistrationNumber and PSCPlaceRegistered without CountryOrState.
  if (
    elementName === "Corporate" &&
    identification.placeRegistered &&
    identification.registrationNumber &&
    !identification.countryOrState
  ) {
    problems.push("a register named and the number in it need the register's country or state");
  }
  for (const [field, max] of [
    ["legalForm", 160],
    ["lawGoverned", 160],
    ["placeRegistered", 160],
    ["registrationNumber", 160],
    ["countryOrState", 50],
  ]) {
    if (longerThan(identification[field], max)) problems.push(`${field} is longer than ${max} characters`);
  }
  return problems;
}

// The changes each kind of PSC has on the form.
const INDIVIDUAL_CHANGES = ["newName", "address", "residentialAddress", "nationality", "countryOfResidence", "naturesOfControl"];
const ENTITY_CHANGES = ["newName", "address", "identification", "naturesOfControl"];
const ALL_CHANGES = [...new Set([...INDIVIDUAL_CHANGES, ...ENTITY_CHANGES])];

const given = (value) => value !== undefined && value !== null;

/**
 * The reasons the changes given cannot be filed for this kind of PSC, or [] when they can. No
 * reason repeats a value given.
 * @param {object} input - as buildPscChangeDetailsBody reads it
 * @returns {string[]}
 */
export function changeDetailsProblems(input) {
  const elementName = pscElementName(input.kind);
  const individual = elementName === "Individual";
  const offered = individual ? INDIVIDUAL_CHANGES : ENTITY_CHANGES;
  const changes = ALL_CHANGES.filter((change) => given(input[change]));
  if (changes.length === 0) return ["a change of details needs a change"];
  const problems = changes
    .filter((change) => !offered.includes(change))
    .map((change) => `${change} is not a change this form makes for this kind of PSC`);
  if (given(input.newName)) problems.push(...newNameProblems(input.newName, individual));
  if (given(input.address)) problems.push(...addressProblems(input.address));
  if (individual && given(input.residentialAddress) && input.residentialAddress.sameAsServiceAddress !== true) {
    problems.push(...addressProblems(input.residentialAddress).map((problem) => `residential: ${problem}`));
  }
  for (const field of ["nationality", "countryOfResidence"]) {
    if (individual && given(input[field]) && (typeof input[field] !== "string" || !input[field] || input[field].length > 50)) {
      problems.push(`${field} must be 1 to 50 characters`);
    }
  }
  if (!individual && given(input.identification)) problems.push(...identificationProblems(input.identification, elementName));
  if (given(input.naturesOfControl)) problems.push(...natureOfControlProblems(input.naturesOfControl));
  return problems;
}

export function addressXml(address) {
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

export function naturesOfControlXml(codes) {
  const controls = codes.map((code) => optionalElement("NatureOfControl", code)).join("");
  return `<NatureOfControls>${controls}</NatureOfControls>`;
}

function individualChangeXml(input) {
  const name = input.newName;
  const nameXml = name
    ? `<Name>${optionalElement("Title", name.title)}${optionalElement("Surname", name.surname)}` +
      `${optionalElement("Forename", name.forename)}${optionalElement("OtherForenames", name.otherForenames)}</Name>`
    : "";
  const serviceXml = input.address ? `<ServiceAddress>${addressXml(input.address)}</ServiceAddress>` : "";
  let residentialXml = "";
  if (input.residentialAddress) {
    const residence = input.residentialAddress.sameAsServiceAddress
      ? "<SameAsServiceAddress>true</SameAsServiceAddress>"
      : addressXml(input.residentialAddress);
    residentialXml = `<ResidentialAddress>${residence}</ResidentialAddress>`;
  }
  return (
    `${nameXml}${serviceXml}${residentialXml}${optionalElement("Nationality", input.nationality)}` +
    `${optionalElement("CountryOfResidence", input.countryOfResidence)}`
  );
}

function entityChangeXml(input, elementName) {
  const corporate = elementName === "Corporate";
  const id = input.identification;
  let identificationXml = "";
  if (id) {
    const register = corporate
      ? `${optionalElement("PSCPlaceRegistered", id.placeRegistered)}${optionalElement("PSCRegistrationNumber", id.registrationNumber)}`
      : "";
    const lawAndForm = `${optionalElement("LawGoverned", id.lawGoverned)}${optionalElement("LegalForm", id.legalForm)}`;
    const countryOrState = corporate ? optionalElement("CountryOrState", id.countryOrState) : "";
    const wrapper = corporate ? "PSCCompanyIdentification" : "LegalPersonIdentification";
    identificationXml = `<${wrapper}>${register}${lawAndForm}${countryOrState}</${wrapper}>`;
  }
  const nameElement = corporate ? "CorporateName" : "LegalPersonName";
  const nameXml = optionalElement(nameElement, input.newName);
  return `${nameXml}${input.address ? addressXml(input.address) : ""}${identificationXml}`;
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
 * @param {object} [input.address] - the new service address (an individual) or principal office
 *   address (an entity), as addressProblems reads it
 * @param {object|string} [input.newName] - an individual's {title, forename, otherForenames, surname},
 *   or an entity's new name
 * @param {object} [input.residentialAddress] - an individual's usual residential address, as
 *   addressProblems reads it, or {sameAsServiceAddress: true}
 * @param {string} [input.nationality] - an individual's
 * @param {string} [input.countryOfResidence] - an individual's country or state of residence
 * @param {object} [input.identification] - an entity's {legalForm, lawGoverned} and, for a corporate
 *   entity, {placeRegistered, registrationNumber, countryOrState}
 * @param {string} input.dateOfChange - ISO date the change occurred
 * @param {string} input.confirmationDate - ISO date the company had confirmation of the change, how
 *   the details changed and the date of the change
 * @returns {string} the PSCChangeDetails element's XML
 */
export function buildPscChangeDetailsBody(input) {
  const elementName = pscElementName(input.kind);
  if (!ISO_DATE.test(input.dateOfChange ?? "")) throw new Error("dateOfChange must be YYYY-MM-DD");
  if (!ISO_DATE.test(input.confirmationDate ?? "")) throw new Error("confirmationDate must be YYYY-MM-DD");
  const problems = changeDetailsProblems(input);
  if (problems.length) throw new Error(problems.join("; "));
  const individual = elementName === "Individual";
  const changed = individual ? individualChangeXml(input) : entityChangeXml(input, elementName);
  const controls = input.naturesOfControl ? naturesOfControlXml(input.naturesOfControl) : "";
  const change = `<Change>${changed}${controls}</Change>`;
  const particulars = individual ? individualIdentificationXml(input) : entityNameXml(elementName, input.name);
  return (
    `<PSCChangeDetails xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/PSCChangeDetails-v1-2.xsd">` +
    `<${elementName}>${particulars}${change}</${elementName}>` +
    `<DateOfChange>${input.dateOfChange}</DateOfChange><ConfirmationDate>${input.confirmationDate}</ConfirmationDate>` +
    `</PSCChangeDetails>`
  );
}
