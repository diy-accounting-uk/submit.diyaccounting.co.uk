// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseOfficerAppointmentXml.js
// Builds the OfficerAppointment form body (companiesHouseXmlGateway.js wraps it in the
// FormSubmission envelope): the notice that a director or a secretary has been appointed, the online
// form of Companies House's AP01 (a director who is a person), AP02 (a corporate director), AP03 (a
// secretary who is a person) and AP04 (a corporate secretary).
//
// OfficerAppointment-v2-9.xsd's OfficerApptType gives the appointment date, the consent to act,
// then the officer, whose types are in baseTypes-v3-7.xsd:
// - a director who is a person (DirectorAppointmentType's Person): the name, the service address,
//   the full date of birth, the nationality, the optional country of residence, any former names,
//   the residential address, and VerificationDetails: the 11-character Companies House personal code
//   and the statement INDIVIDUAL_VERIFIED that the person has verified their identity;
// - a secretary who is a person (SecretaryAppointmentType's Person): the name, the service address
//   and any former names, with no date of birth and no personal code;
// - a corporate director or secretary (CorporateOfficerAppointmentType): its name, its principal
//   office address, and either its UK registration number or, for another body, its legal form, the
//   law governing it and, where it has one, the register it is entered in and its number there.
// The schema's third choice, an LLP member, is not offered.

import { escapeXmlText } from "../lib/xmlDom.js";
import { isValidCompaniesHousePersonalCode } from "./companiesHouseApi.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The appointments this form makes, and the element each names in the form.
export const OFFICER_APPOINTMENT_ROLES = { director: "Director", secretary: "Secretary" };

// AddressBaseType's Country codes. A country outside the list goes in OtherForeignCountry as text.
export const OFFICER_ADDRESS_COUNTRY_CODES = [
  "GB-ENG",
  "GB-WLS",
  "GB-SCT",
  "GB-NIR",
  "GBR",
  "USA",
  "IRL",
  "DEU",
  "FRA",
  "ITA",
  "ESP",
  "PRT",
  "NLD",
  "POL",
  "BEL",
  "NOR",
  "SWE",
  "DNK",
  "AUS",
  "NZL",
  "CAN",
  "ZAF",
  "AUT",
  "HRV",
  "CYP",
  "CZE",
  "EST",
  "HUN",
  "GRC",
  "LTU",
];

// The schema's NameMismatchReason values: why the verified name differs from the name filed.
export const OFFICER_NAME_MISMATCH_REASONS = ["PREFERRED_NAME", "LEGALLY_CHANGED", "TRANSLATION_OR_DIFF_CONV", "REGISTER_ERROR", "NOT_SAY"];

function element(name, value) {
  return value === undefined || value === null || value === "" ? "" : `<${name}>${escapeXmlText(String(value))}</${name}>`;
}

/**
 * An address in AddressBaseType's order, with CompanyAddressType's optional care-of name and PO box
 * when the type carries them.
 */
export function addressXml(address, label) {
  if (!address?.premise) throw new Error(`${label} needs premise`);
  if (!address.postTown) throw new Error(`${label} needs postTown`);
  let countryXml;
  if (address.country) {
    if (!OFFICER_ADDRESS_COUNTRY_CODES.includes(address.country))
      throw new Error(`${label} has an unknown country code ${address.country}`);
    countryXml = element("Country", address.country);
  } else if (address.otherForeignCountry) {
    countryXml = element("OtherForeignCountry", address.otherForeignCountry);
  } else {
    throw new Error(`${label} needs country or otherForeignCountry`);
  }
  return (
    `<Address>${element("Premise", address.premise)}${element("Street", address.street)}${element("Thoroughfare", address.thoroughfare)}` +
    `${element("PostTown", address.postTown)}${element("County", address.county)}${countryXml}${element("Postcode", address.postcode)}</Address>`
  );
}

function serviceAddressXml(serviceAddress) {
  if (serviceAddress?.sameAsRegisteredOffice === true)
    return "<ServiceAddress><SameAsRegisteredOffice>true</SameAsRegisteredOffice></ServiceAddress>";
  return `<ServiceAddress>${addressXml(serviceAddress?.address, "the service address")}</ServiceAddress>`;
}

function residentialAddressXml(residentialAddress) {
  if (residentialAddress?.sameAsServiceAddress === true) {
    return "<ResidentialAddress><SameAsServiceAddress>true</SameAsServiceAddress></ResidentialAddress>";
  }
  return `<ResidentialAddress>${addressXml(residentialAddress?.address, "the residential address")}</ResidentialAddress>`;
}

function previousNamesXml(previousNames = []) {
  return previousNames
    .map((previous) => {
      if (!previous?.surname) throw new Error("a former name needs a surname");
      return `<PreviousNames>${element("Forename", previous.forename)}${element("Surname", previous.surname)}</PreviousNames>`;
    })
    .join("");
}

function namesXml({ role, title, forename, otherForenames, surname }) {
  if (!surname) throw new Error(`a ${role} who is a person needs a surname`);
  return `${element("Title", title)}${element("Forename", forename)}${element("OtherForenames", otherForenames)}${element("Surname", surname)}`;
}

function verificationDetailsXml({ personalCode, identityVerified, nameMismatchReason }) {
  const { valid, normalised } = isValidCompaniesHousePersonalCode(personalCode);
  if (!valid) throw new Error("a director who is a person needs the 11-character Companies House personal code");
  if (identityVerified !== true) throw new Error("a director who is a person must have verified their identity");
  if (nameMismatchReason !== undefined && !OFFICER_NAME_MISMATCH_REASONS.includes(nameMismatchReason)) {
    throw new Error(`unknown nameMismatchReason ${nameMismatchReason}`);
  }
  return (
    `<VerificationDetails><CompaniesHousePersonalCode>${normalised}</CompaniesHousePersonalCode>` +
    `<VerificationStatements><VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual></VerificationStatements>` +
    `${element("NameMismatchReason", nameMismatchReason)}</VerificationDetails>`
  );
}

function directorPersonXml(input) {
  if (!ISO_DATE.test(input.dateOfBirth ?? "")) throw new Error("a director who is a person needs dateOfBirth as YYYY-MM-DD");
  if (!input.nationality) throw new Error("a director who is a person needs a nationality");
  return (
    `<Person>${namesXml(input)}${serviceAddressXml(input.serviceAddress)}<DOB>${input.dateOfBirth}</DOB>` +
    `${element("Nationality", input.nationality)}${element("CountryOfResidence", input.countryOfResidence)}${previousNamesXml(input.previousNames)}` +
    `${residentialAddressXml(input.residentialAddress)}${verificationDetailsXml(input)}</Person>`
  );
}

function secretaryPersonXml(input) {
  return `<Person>${namesXml(input)}${serviceAddressXml(input.serviceAddress)}${previousNamesXml(input.previousNames)}</Person>`;
}

export function companyIdentificationXml(identification) {
  if (identification?.uk) {
    if (!identification.uk.registrationNumber) throw new Error("a UK-registered corporate officer needs its registrationNumber");
    return `<CompanyIdentification><UK>${element("RegistrationNumber", identification.uk.registrationNumber)}</UK></CompanyIdentification>`;
  }
  const nonUk = identification?.nonUk;
  if (!nonUk) throw new Error("a corporate officer needs companyIdentification as uk or nonUk");
  if (!nonUk.lawGoverned) throw new Error("a corporate officer registered outside the UK needs lawGoverned");
  if (!nonUk.legalForm) throw new Error("a corporate officer registered outside the UK needs legalForm");
  return (
    `<CompanyIdentification><NonUK>${element("PlaceRegistered", nonUk.placeRegistered)}${element("RegistrationNumber", nonUk.registrationNumber)}` +
    `${element("LawGoverned", nonUk.lawGoverned)}${element("LegalForm", nonUk.legalForm)}</NonUK></CompanyIdentification>`
  );
}

function corporateXml({ role, corporateName, address, companyIdentification }) {
  if (!corporateName) throw new Error(`a corporate ${role} needs its name`);
  return `<Corporate>${element("CorporateName", corporateName)}${addressXml(address, "the principal office address")}${companyIdentificationXml(companyIdentification)}</Corporate>`;
}

/**
 * Build the OfficerAppointment form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.role - a key of OFFICER_APPOINTMENT_ROLES
 * @param {boolean} input.corporate - true for a corporate officer
 * @param {string} input.appointmentDate - ISO date of the appointment
 * @param {boolean} input.consentToAct - must be true: the company confirms the officer consented to act
 * @param {string} [input.title] - a person's
 * @param {string} [input.forename]
 * @param {string} [input.otherForenames]
 * @param {string} [input.surname] - a person's, required for one
 * @param {{sameAsRegisteredOffice: true}|{address: object}} [input.serviceAddress] - a person's
 * @param {{forename?: string, surname: string}[]} [input.previousNames] - a person's former names
 * @param {string} [input.dateOfBirth] - ISO date, a director who is a person's
 * @param {string} [input.nationality] - a director who is a person's
 * @param {string} [input.countryOfResidence] - a director who is a person's
 * @param {{sameAsServiceAddress: true}|{address: object}} [input.residentialAddress] - a director who is a person's
 * @param {string} [input.personalCode] - a director who is a person's Companies House personal code
 * @param {boolean} [input.identityVerified] - true: the director has verified their identity
 * @param {string} [input.nameMismatchReason] - one of OFFICER_NAME_MISMATCH_REASONS
 * @param {string} [input.corporateName] - a corporate officer's
 * @param {object} [input.address] - a corporate officer's principal office address
 * @param {{uk: {registrationNumber: string}}|{nonUk: object}} [input.companyIdentification] - a corporate officer's
 * @returns {string} the OfficerAppointment element's XML
 */
export function buildOfficerAppointmentBody(input) {
  const roleElement = OFFICER_APPOINTMENT_ROLES[input.role];
  if (!roleElement) throw new Error(`unknown officer role ${input.role}`);
  if (!ISO_DATE.test(input.appointmentDate ?? "")) throw new Error("appointmentDate must be YYYY-MM-DD");
  if (input.consentToAct !== true) throw new Error("the officer's consent to act must be confirmed");
  let officerXml;
  if (input.corporate) officerXml = corporateXml(input);
  else if (input.role === "director") officerXml = directorPersonXml(input);
  else officerXml = secretaryPersonXml(input);
  return (
    `<OfficerAppointment xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/OfficerAppointment-v2-9.xsd">` +
    `<AppointmentDate>${input.appointmentDate}</AppointmentDate><ConsentToAct>true</ConsentToAct><${roleElement}>${officerXml}</${roleElement}>` +
    `</OfficerAppointment>`
  );
}
