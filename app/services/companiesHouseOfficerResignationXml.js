// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseOfficerResignationXml.js
// Builds the OfficerResignation form body (companiesHouseXmlGateway.js wraps it in the
// FormSubmission envelope): the notice that a director or a secretary no longer holds the
// appointment, the online form of Companies House's TM01 (a director) and TM02 (a secretary).
// OfficerResignation-v2-6.xsd's OfficerResignationType gives the date the appointment ended, then
// the officer: a corporate officer by CorporateName, a person by Surname and the optional Title,
// Forename and OtherForenames. A director who is a person also needs the full date of birth (DOB);
// a secretary does not. The schema's third choice, an LLP member, is not offered.

import { escapeXmlText } from "../lib/xmlDom.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The appointments this form ends, and the element each names in the form.
export const OFFICER_RESIGNATION_ROLES = { director: "Director", secretary: "Secretary" };

function element(name, value) {
  return value === undefined || value === null || value === "" ? "" : `<${name}>${escapeXmlText(String(value))}</${name}>`;
}

function personXml({ role, title, surname, forename, otherForenames, dateOfBirth }) {
  if (!surname) throw new Error(`a ${role} who is a person needs a surname`);
  const names = `${element("Title", title)}${element("Surname", surname)}${element("Forename", forename)}${element("OtherForenames", otherForenames)}`;
  if (role !== "director") return `<Person>${names}</Person>`;
  if (!ISO_DATE.test(dateOfBirth ?? "")) throw new Error("a director who is a person needs dateOfBirth as YYYY-MM-DD");
  return `<Person>${names}<DOB>${dateOfBirth}</DOB></Person>`;
}

/**
 * Build the OfficerResignation form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.role - a key of OFFICER_RESIGNATION_ROLES
 * @param {boolean} input.corporate - true for a corporate officer, named by input.corporateName
 * @param {string} [input.corporateName] - a corporate officer's name, required for one
 * @param {string} [input.title] - a person's
 * @param {string} [input.surname] - a person's, required for one
 * @param {string} [input.forename]
 * @param {string} [input.otherForenames]
 * @param {string} [input.dateOfBirth] - ISO date, required for a director who is a person
 * @param {string} input.resignationDate - ISO date the appointment ended
 * @returns {string} the OfficerResignation element's XML
 */
export function buildOfficerResignationBody(input) {
  const roleElement = OFFICER_RESIGNATION_ROLES[input.role];
  if (!roleElement) throw new Error(`unknown officer role ${input.role}`);
  if (!ISO_DATE.test(input.resignationDate ?? "")) throw new Error("resignationDate must be YYYY-MM-DD");
  let officerXml;
  if (input.corporate) {
    if (!input.corporateName) throw new Error(`a corporate ${input.role} needs its name`);
    officerXml = element("CorporateName", input.corporateName);
  } else {
    officerXml = personXml(input);
  }
  return (
    `<OfficerResignation xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/OfficerResignation-v2-6.xsd">` +
    `<ResignationDate>${input.resignationDate}</ResignationDate><${roleElement}>${officerXml}</${roleElement}>` +
    `</OfficerResignation>`
  );
}
