// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseOfficerChangeXml.js
// Builds the OfficerChangeDetails form body (companiesHouseXmlGateway.js wraps it in the
// FormSubmission envelope): the notice that a director's or a secretary's details have changed, the
// online form of Companies House's CH01 (a director who is a person), CH02 (a corporate director),
// CH03 (a secretary who is a person) and CH04 (a corporate secretary).
//
// OfficerChangeDetails-v2-10.xsd's OfficerChangeDetailsType gives the date of change, then the
// officer as the register holds it now, then a Change element with only what has changed:
// - a person is found by PersonChangeType: Title, Surname, Forename and OtherForenames, in that
//   order; a director who is a person also by the full date of birth (DOB);
// - a person's Change (PersonChangeDetails) carries a new Name, a new ServiceAddress with the
//   optional ResidentialAddressUnchangedInd, and, for a director, a new ResidentialAddress, a new
//   Nationality and a new CountryOfResidence;
// - a corporate officer is found by its CorporateName, and its Change carries a new CorporateName, a
//   new principal office Address and new CompanyIdentification.
// The schema's third choice, an LLP member, is not offered.

import { escapeXmlText } from "../lib/xmlDom.js";
import { addressXml, companyIdentificationXml } from "./companiesHouseOfficerAppointmentXml.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The officers this form changes, and the element each names in the form.
export const OFFICER_CHANGE_ROLES = { director: "Director", secretary: "Secretary" };

function element(name, value) {
  return value === undefined || value === null || value === "" ? "" : `<${name}>${escapeXmlText(String(value))}</${name}>`;
}

// PersonChangeType's and NewNameDetailsType's order: the surname comes before the forenames.
function personNamesXml({ title, surname, forename, otherForenames }, label) {
  if (!surname) throw new Error(`${label} needs a surname`);
  return `${element("Title", title)}${element("Surname", surname)}${element("Forename", forename)}${element("OtherForenames", otherForenames)}`;
}

function serviceAddressChangeXml(serviceAddress, residentialAddressUnchanged) {
  const unchangedXml = residentialAddressUnchanged === true ? "<ResidentialAddressUnchangedInd>true</ResidentialAddressUnchangedInd>" : "";
  if (serviceAddress.sameAsRegisteredOffice === true) {
    return `<ServiceAddress><SameAsRegisteredOffice>true</SameAsRegisteredOffice>${unchangedXml}</ServiceAddress>`;
  }
  return `<ServiceAddress>${addressXml(serviceAddress.address, "the new service address")}${unchangedXml}</ServiceAddress>`;
}

function residentialAddressChangeXml(residentialAddress) {
  if (residentialAddress.sameAsServiceAddress === true) {
    return "<ResidentialAddress><SameAsServiceAddress>true</SameAsServiceAddress></ResidentialAddress>";
  }
  return `<ResidentialAddress>${addressXml(residentialAddress.address, "the new residential address")}</ResidentialAddress>`;
}

function personChangeXml(input, director) {
  const { newName, serviceAddress, residentialAddressUnchanged, residentialAddress, nationality, countryOfResidence } = input;
  if (!director && (residentialAddress || nationality || countryOfResidence || residentialAddressUnchanged)) {
    throw new Error("a secretary's change carries only a new name and a new service address");
  }
  if (!newName && !serviceAddress && !residentialAddress && !nationality && !countryOfResidence) {
    throw new Error("a change needs at least one new detail");
  }
  if (residentialAddressUnchanged === true && !serviceAddress) {
    throw new Error("residentialAddressUnchanged goes with a new service address");
  }
  if (residentialAddressUnchanged === true && residentialAddress) {
    throw new Error("a new residential address and residentialAddressUnchanged cannot both be given");
  }
  if (director && serviceAddress && residentialAddressUnchanged !== true && !residentialAddress) {
    throw new Error("a director's new service address needs residentialAddressUnchanged or a new residential address");
  }
  if (residentialAddress?.sameAsServiceAddress === true && serviceAddress?.sameAsRegisteredOffice === true) {
    throw new Error("the residential address cannot be the same as a service address that is the registered office");
  }
  const nameXml = newName ? `<Name>${personNamesXml(newName, "the new name")}</Name>` : "";
  const serviceXml = serviceAddress ? serviceAddressChangeXml(serviceAddress, residentialAddressUnchanged) : "";
  if (!director) return `<Change>${nameXml}${serviceXml}</Change>`;
  const residentialXml = residentialAddress ? residentialAddressChangeXml(residentialAddress) : "";
  return `<Change>${nameXml}${serviceXml}${residentialXml}${element("Nationality", nationality)}${element("CountryOfResidence", countryOfResidence)}</Change>`;
}

function personXml(input) {
  const director = input.role === "director";
  const namesXml = personNamesXml(input, `a ${input.role} who is a person`);
  if (!director) return `<Person>${namesXml}${personChangeXml(input, false)}</Person>`;
  if (!ISO_DATE.test(input.dateOfBirth ?? "")) throw new Error("a director who is a person needs dateOfBirth as YYYY-MM-DD");
  return `<Person>${namesXml}<DOB>${input.dateOfBirth}</DOB>${personChangeXml(input, true)}</Person>`;
}

function corporateXml({ role, corporateName, newCorporateName, address, companyIdentification }) {
  if (!corporateName) throw new Error(`a corporate ${role} needs its name as the register holds it`);
  if (!newCorporateName && !address && !companyIdentification) throw new Error("a change needs at least one new detail");
  const changeXml =
    `${element("CorporateName", newCorporateName)}${address ? addressXml(address, "the new principal office address") : ""}` +
    `${companyIdentification ? companyIdentificationXml(companyIdentification) : ""}`;
  return `<Corporate>${element("CorporateName", corporateName)}<Change>${changeXml}</Change></Corporate>`;
}

/**
 * Build the OfficerChangeDetails form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.role - a key of OFFICER_CHANGE_ROLES
 * @param {boolean} input.corporate - true for a corporate officer
 * @param {string} input.dateOfChange - ISO date the details changed
 * @param {string} [input.title] - a person's, as the register holds it
 * @param {string} [input.surname] - a person's, as the register holds it, required for one
 * @param {string} [input.forename]
 * @param {string} [input.otherForenames]
 * @param {string} [input.dateOfBirth] - ISO date, required for a director who is a person
 * @param {{title?: string, surname: string, forename?: string, otherForenames?: string}} [input.newName] - a person's new name
 * @param {{sameAsRegisteredOffice: true}|{address: object}} [input.serviceAddress] - a person's new service address
 * @param {boolean} [input.residentialAddressUnchanged] - true: a director's residential address stays as it is
 * @param {{sameAsServiceAddress: true}|{address: object}} [input.residentialAddress] - a director's new residential address
 * @param {string} [input.nationality] - a director's new nationality
 * @param {string} [input.countryOfResidence] - a director's new country or state of residence
 * @param {string} [input.corporateName] - a corporate officer's name as the register holds it, required for one
 * @param {string} [input.newCorporateName] - a corporate officer's new name
 * @param {object} [input.address] - a corporate officer's new principal office address
 * @param {{uk: {registrationNumber: string}}|{nonUk: object}} [input.companyIdentification] - a corporate officer's new legal details
 * @returns {string} the OfficerChangeDetails element's XML
 */
export function buildOfficerChangeBody(input) {
  const roleElement = OFFICER_CHANGE_ROLES[input.role];
  if (!roleElement) throw new Error(`unknown officer role ${input.role}`);
  if (!ISO_DATE.test(input.dateOfChange ?? "")) throw new Error("dateOfChange must be YYYY-MM-DD");
  const officerXml = input.corporate ? corporateXml(input) : personXml(input);
  return (
    `<OfficerChangeDetails xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/OfficerChangeDetails-v2-10.xsd">` +
    `<DateOfChange>${input.dateOfChange}</DateOfChange><${roleElement}>${officerXml}</${roleElement}>` +
    `</OfficerChangeDetails>`
  );
}
