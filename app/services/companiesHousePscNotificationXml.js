// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHousePscNotificationXml.js
// Builds the PSCNotification form body (companiesHouseXmlGateway.js wraps it in the FormSubmission
// envelope): the notice of a new person with significant control, the online form of Companies
// House's PSC01 (an individual), PSC02 (a relevant legal entity) and PSC03 (an other registrable
// person). PSCNotification-v1-2.xsd extends PSCBaseTypes-v1-4.xsd's PSCNotificationType: the PSC's
// full particulars, its natures of control, the date it became a registrable person and the date the
// company had confirmation of its status and particulars.
//
// An individual is PSCIndividualType: name, service address (or the registered office), full date
// of birth, nationality, country of residence, usual residential address (or the service address)
// and, when the individual has verified their identity, their Companies House personal code. A
// relevant legal entity is PSCCorporateEntityType and an other registrable person
// PSCLegalPersonType: name, principal office address, legal form and governing law, and for an
// entity the register it is entered in and its number there. An individual protected from
// disclosure (SuperSecureIndividual) files on paper, so no notice here names one; nor are LLP
// natures of control built.

import { optionalElement, pscElementName } from "./companiesHousePscParticularsXml.js";
import { addressProblems, addressXml, natureOfControlProblems, naturesOfControlXml } from "./companiesHousePscChangeDetailsXml.js";
import { gatewayTextProblem } from "./companiesHouseGatewayText.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The first day a person can have become registrable: Part 21A of the Companies Act 2006 began then. */
export const FIRST_NOTIFICATION_DATE = "2016-04-06";

/** NameMismatchReason's values, the reasons a PSC's name can differ from their verified name. */
export const NAME_MISMATCH_REASONS = ["PREFERRED_NAME", "LEGALLY_CHANGED", "TRANSLATION_OR_DIFF_CONV", "REGISTER_ERROR", "NOT_SAY"];

const PERSONAL_CODE = /^[A-Z0-9]{11}$/;

const tooLong = (problems, field, value, max) => {
  if (value && String(value).length > max) problems.push(`${field} is longer than ${max} characters`);
};

const ADDRESS_TEXT_FIELDS = ["premise", "street", "thoroughfare", "postTown", "county", "otherForeignCountry", "postcode"];

// The gateway's character check of each named field of a value, each failure under its prefix.
function textProblems(problems, prefix, value, fields) {
  for (const field of fields) {
    const problem = gatewayTextProblem(`${prefix}${field}`, value?.[field]);
    if (problem) problems.push(problem);
  }
}

/**
 * The reasons an individual's particulars cannot be filed, or [] when they can.
 * @param {object} individual - see buildPscNotificationBody
 * @returns {string[]}
 */
export function individualProblems(individual) {
  const problems = [];
  if (!individual.surname) problems.push("an individual PSC needs a surname");
  tooLong(problems, "surname", individual.surname, 160);
  tooLong(problems, "forename", individual.forename, 50);
  tooLong(problems, "otherForenames", individual.otherForenames, 50);
  tooLong(problems, "title", individual.title, 50);
  if (!ISO_DATE.test(individual.dateOfBirth ?? "")) problems.push("dateOfBirth must be YYYY-MM-DD");
  if (!individual.nationality) problems.push("an individual PSC needs a nationality");
  tooLong(problems, "nationality", individual.nationality, 50);
  if (!individual.countryOfResidence) problems.push("an individual PSC needs a country of residence");
  tooLong(problems, "countryOfResidence", individual.countryOfResidence, 50);
  textProblems(problems, "", individual, ["title", "forename", "otherForenames", "surname", "nationality", "countryOfResidence"]);
  const service = individual.serviceAddress;
  if (!service || (service.sameAsRegisteredOffice !== true && !service.address)) {
    problems.push("an individual PSC needs a service address or the registered office");
  } else if (service.sameAsRegisteredOffice !== true) {
    addressProblems(service.address).forEach((problem) => problems.push(`service address: ${problem}`));
    textProblems(problems, "service address ", service.address, ADDRESS_TEXT_FIELDS);
  }
  const residential = individual.residentialAddress;
  if (!residential || (residential.sameAsServiceAddress !== true && !residential.address)) {
    problems.push("an individual PSC needs a usual residential address or the service address");
  } else if (residential.sameAsServiceAddress === true) {
    if (service?.sameAsRegisteredOffice === true) {
      problems.push("the usual residential address cannot be the service address when that is the registered office");
    }
  } else {
    addressProblems(residential.address).forEach((problem) => problems.push(`usual residential address: ${problem}`));
    textProblems(problems, "usual residential address ", residential.address, ADDRESS_TEXT_FIELDS);
  }
  const verification = individual.verification;
  if (verification) {
    if (!PERSONAL_CODE.test(verification.personalCode ?? "")) problems.push("a personal code is 11 letters and digits");
    if (verification.nameMismatchReason && !NAME_MISMATCH_REASONS.includes(verification.nameMismatchReason)) {
      problems.push(`unknown name mismatch reason ${verification.nameMismatchReason}`);
    }
  }
  return problems;
}

/**
 * The reasons an entity's particulars cannot be filed, or [] when they can.
 * @param {object} entity - see buildPscNotificationBody
 * @param {boolean} corporate - a relevant legal entity, which may name its register and number
 * @returns {string[]}
 */
export function entityProblems(entity, corporate) {
  const problems = [];
  if (!entity.name) problems.push(corporate ? "a relevant legal entity needs its name" : "an other registrable person needs its name");
  tooLong(problems, "name", entity.name, 160);
  addressProblems(entity.address).forEach((problem) => problems.push(`principal office address: ${problem}`));
  textProblems(problems, "principal office address ", entity.address, ADDRESS_TEXT_FIELDS);
  textProblems(problems, "", entity, ["name", "legalForm", "lawGoverned", "placeRegistered", "registrationNumber", "countryOrState"]);
  for (const field of ["legalForm", "lawGoverned"]) {
    if (!entity[field]) problems.push(`${field} is needed`);
    tooLong(problems, field, entity[field], 160);
  }
  if (corporate) {
    tooLong(problems, "placeRegistered", entity.placeRegistered, 160);
    tooLong(problems, "registrationNumber", entity.registrationNumber, 160);
    tooLong(problems, "countryOrState", entity.countryOrState, 50);
    if (entity.placeRegistered && !entity.registrationNumber) {
      problems.push("an entity entered in a register needs its registration number there");
    }
  }
  return problems;
}

function individualXml(individual) {
  const service =
    individual.serviceAddress.sameAsRegisteredOffice === true
      ? "<SameAsRegisteredOffice>true</SameAsRegisteredOffice>"
      : addressXml(individual.serviceAddress.address);
  const residential =
    individual.residentialAddress.sameAsServiceAddress === true
      ? "<SameAsServiceAddress>true</SameAsServiceAddress>"
      : addressXml(individual.residentialAddress.address);
  const verification = individual.verification
    ? `<VerificationDetails>${optionalElement("CompaniesHousePersonalCode", individual.verification.personalCode)}` +
      `<VerificationStatements><VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual></VerificationStatements>` +
      `${optionalElement("NameMismatchReason", individual.verification.nameMismatchReason)}</VerificationDetails>`
    : "";
  return (
    `<Individual>${optionalElement("Title", individual.title)}${optionalElement("Forename", individual.forename)}` +
    `${optionalElement("OtherForenames", individual.otherForenames)}${optionalElement("Surname", individual.surname)}` +
    `<ServiceAddress>${service}</ServiceAddress><DOB>${individual.dateOfBirth}</DOB>` +
    `${optionalElement("Nationality", individual.nationality)}${optionalElement("CountryOfResidence", individual.countryOfResidence)}` +
    `<ResidentialAddress>${residential}</ResidentialAddress>${verification}</Individual>`
  );
}

function corporateXml(entity) {
  return (
    `<Corporate>${optionalElement("CorporateName", entity.name)}${addressXml(entity.address)}` +
    `<PSCCompanyIdentification>${optionalElement("PSCPlaceRegistered", entity.placeRegistered)}` +
    `${optionalElement("PSCRegistrationNumber", entity.registrationNumber)}${optionalElement("LawGoverned", entity.lawGoverned)}` +
    `${optionalElement("LegalForm", entity.legalForm)}${optionalElement("CountryOrState", entity.countryOrState)}` +
    `</PSCCompanyIdentification></Corporate>`
  );
}

function legalPersonXml(entity) {
  return (
    `<LegalPerson>${optionalElement("LegalPersonName", entity.name)}${addressXml(entity.address)}` +
    `<LegalPersonIdentification>${optionalElement("LawGoverned", entity.lawGoverned)}${optionalElement("LegalForm", entity.legalForm)}` +
    `</LegalPersonIdentification></LegalPerson>`
  );
}

// Each kind's particulars, by the element PSC_KIND_ELEMENTS names for it.
const PARTICULARS_XML = { Individual: individualXml, Corporate: corporateXml, LegalPerson: legalPersonXml };

/**
 * Build the PSCNotification form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.kind - a key of PSC_KIND_ELEMENTS
 * @param {string} [input.title] - an individual's name parts
 * @param {string} [input.forename]
 * @param {string} [input.otherForenames]
 * @param {string} [input.surname]
 * @param {string} [input.dateOfBirth] - an individual's full date of birth, YYYY-MM-DD
 * @param {string} [input.nationality]
 * @param {string} [input.countryOfResidence]
 * @param {{sameAsRegisteredOffice?: boolean, address?: object}} [input.serviceAddress] - an individual's
 *   service address, as addressProblems reads an address
 * @param {{sameAsServiceAddress?: boolean, address?: object}} [input.residentialAddress] - an individual's usual
 *   residential address
 * @param {{personalCode: string, nameMismatchReason?: string}} [input.verification] - given only when the
 *   individual has verified their identity and shared their personal code
 * @param {string} [input.name] - an entity's name
 * @param {object} [input.address] - an entity's principal office address
 * @param {string} [input.legalForm] - an entity's legal form
 * @param {string} [input.lawGoverned] - the law an entity is governed by
 * @param {string} [input.placeRegistered] - the register a relevant legal entity is entered in
 * @param {string} [input.registrationNumber] - its number in that register
 * @param {string} [input.countryOrState] - the country or state of that register
 * @param {string[]} input.naturesOfControl - NATURE_OF_CONTROL_CODES, every one that applies
 * @param {string} input.notificationDate - ISO date the PSC became a registrable person
 * @param {string} input.confirmationDate - ISO date the company had confirmation of the PSC's status and
 *   all its particulars, the later of the two
 * @returns {string} the PSCNotification element's XML
 */
export function buildPscNotificationBody(input) {
  const elementName = pscElementName(input.kind);
  if (!ISO_DATE.test(input.notificationDate ?? "")) throw new Error("notificationDate must be YYYY-MM-DD");
  if (!ISO_DATE.test(input.confirmationDate ?? "")) throw new Error("confirmationDate must be YYYY-MM-DD");
  const problems = [
    ...(elementName === "Individual" ? individualProblems(input) : entityProblems(input, elementName === "Corporate")),
    ...natureOfControlProblems(input.naturesOfControl),
  ];
  if (input.notificationDate < FIRST_NOTIFICATION_DATE) problems.push(`notificationDate cannot be before ${FIRST_NOTIFICATION_DATE}`);
  if (input.confirmationDate < input.notificationDate) problems.push("confirmationDate cannot be before notificationDate");
  if (problems.length) throw new Error(problems.join("; "));
  const particulars = PARTICULARS_XML[elementName](input);
  return (
    `<PSCNotification xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/PSCNotification-v1-2.xsd">` +
    `${particulars}${naturesOfControlXml(input.naturesOfControl)}` +
    `<NotificationDate>${input.notificationDate}</NotificationDate><ConfirmationDate>${input.confirmationDate}</ConfirmationDate>` +
    `</PSCNotification>`
  );
}
