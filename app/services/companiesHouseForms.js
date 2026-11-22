// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseForms.js
// The server half of each Companies House form that companiesHouseFormFiling.js files: the check
// of the form's own request fields and the builder of its body. The browser half of each row, its
// form identifier, schema, catalogue activity and words, is web/public/lib/companies-house-forms.js.
// A new form adds its row here and there, its builder, its route file and its page.

import { isValidCompaniesHousePersonalCode } from "./companiesHouseApi.js";
import { isValidIsoDate } from "../lib/hmrcValidation.js";
import { buildPscVerificationStatementBody } from "./companiesHousePscVerificationStatementXml.js";
import { buildPscCessationBody } from "./companiesHousePscCessationXml.js";
import { PSC_KIND_ELEMENTS } from "./companiesHousePscParticularsXml.js";
import { buildPscChangeDetailsBody, changeDetailsProblems, natureOfControlProblems } from "./companiesHousePscChangeDetailsXml.js";
import {
  buildAccountingReferenceDateBody,
  changeToPeriod,
  FIVE_YEAR_EXTENSION_REASONS,
} from "./companiesHouseAccountingReferenceDateXml.js";
import { buildOfficerResignationBody, OFFICER_RESIGNATION_ROLES } from "./companiesHouseOfficerResignationXml.js";
import { buildSailAddressBody, SAIL_ADDRESS_COUNTRIES, SAIL_ADDRESS_PARTS } from "./companiesHouseSailAddressXml.js";
import { buildRecordChangeOfLocationBody, RECORD_DESTINATIONS, RECORD_TYPES } from "./companiesHouseRecordLocationXml.js";
import {
  buildChangeOfNameBody,
  supportingDocumentFor,
  isValidProposedCompanyName,
  NAME_CHANGE_METHODS,
  NAME_SUPPORTING_DOCUMENTS,
} from "./companiesHouseChangeOfNameXml.js";
import {
  buildPscStatementNotificationBody,
  buildPscStatementWithdrawalBody,
  isLinkedStatement,
  PSC_STATEMENTS,
  RESTRICTIONS_WITHDRAWAL_REASONS,
} from "./companiesHousePscStatementXml.js";
import {
  buildPscNotificationBody,
  entityProblems,
  FIRST_NOTIFICATION_DATE,
  individualProblems,
} from "./companiesHousePscNotificationXml.js";

function extractPscVerificationStatement(body, errorMessages) {
  const { title, forename, otherForenames, surname, dobMonth, dobYear, personalCode } = body;
  if (!surname || typeof surname !== "string") {
    errorMessages.push("Missing surname");
  }
  const { valid: personalCodeValid, normalised: normalisedPersonalCode } = isValidCompaniesHousePersonalCode(personalCode);
  if (!personalCodeValid) {
    errorMessages.push("Invalid personalCode - must be the 11-character Companies House personal code, letters and digits");
  }
  if (dobMonth !== undefined && (dobMonth < 1 || dobMonth > 12)) {
    errorMessages.push("Invalid dobMonth - must be 1 to 12");
  }
  return { title, forename, otherForenames, surname, dobMonth, dobYear, personalCode: normalisedPersonalCode };
}

const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

// The particulars that name one PSC as the register shows it, as every PSC form's request gives them.
function extractPscParticulars(body, errorMessages) {
  const { pscKind, title, forename, otherForenames, surname, name, dobMonth, dobYear } = body;
  const elementName = PSC_KIND_ELEMENTS[pscKind];
  if (!elementName) {
    errorMessages.push(`Invalid pscKind - must be one of ${Object.keys(PSC_KIND_ELEMENTS).join(", ")}`);
  } else if (elementName === "Individual" && !trimmed(surname)) {
    errorMessages.push("Missing surname");
  } else if (elementName !== "Individual" && !trimmed(name)) {
    errorMessages.push("Missing name");
  }
  if (dobMonth !== undefined && dobMonth !== null && (!Number.isInteger(dobMonth) || dobMonth < 1 || dobMonth > 12)) {
    errorMessages.push("Invalid dobMonth - must be 1 to 12");
  }
  if (dobYear !== undefined && dobYear !== null && (!Number.isInteger(dobYear) || dobYear < 1900 || dobYear > 9999)) {
    errorMessages.push("Invalid dobYear - must be a four-digit year");
  }
  const individual = elementName === "Individual";
  return {
    kind: pscKind,
    title: individual ? trimmed(title) || undefined : undefined,
    forename: individual ? trimmed(forename) || undefined : undefined,
    otherForenames: individual ? trimmed(otherForenames) || undefined : undefined,
    surname: individual ? trimmed(surname) : undefined,
    name: individual ? undefined : trimmed(name),
    dobMonth: individual ? dobMonth : undefined,
    dobYear: individual ? dobYear : undefined,
  };
}

// Today's date in the United Kingdom, as YYYY-MM-DD.
const todayInUk = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

// A date the event happened on, and the date the company had confirmation of it, which cannot be
// earlier. The form gives notice of an event that has happened and been confirmed, so neither date
// is ahead of today.
function extractEventAndConfirmationDates(body, eventField, errorMessages) {
  const eventDate = body[eventField];
  const { confirmationDate } = body;
  const today = todayInUk();
  if (!eventDate || !isValidIsoDate(eventDate)) {
    errorMessages.push(`Invalid or missing ${eventField} - must be YYYY-MM-DD`);
  } else if (eventDate > today) {
    errorMessages.push(`Invalid ${eventField} - must not be in the future`);
  }
  if (!confirmationDate || !isValidIsoDate(confirmationDate)) {
    errorMessages.push("Invalid or missing confirmationDate - must be YYYY-MM-DD");
  } else if (eventDate && isValidIsoDate(eventDate) && confirmationDate < eventDate) {
    errorMessages.push(`Invalid confirmationDate - must not be before ${eventField}`);
  } else if (confirmationDate > today) {
    errorMessages.push("Invalid confirmationDate - must not be in the future");
  }
  return { [eventField]: eventDate, confirmationDate };
}

function extractPscCessation(body, errorMessages) {
  return {
    ...extractPscParticulars(body, errorMessages),
    ...extractEventAndConfirmationDates(body, "cessationDate", errorMessages),
  };
}

const ADDRESS_FIELDS = ["premise", "street", "thoroughfare", "postTown", "county", "country", "otherForeignCountry", "postcode"];
const NAME_FIELDS = ["title", "forename", "otherForenames", "surname"];
const IDENTIFICATION_FIELDS = ["legalForm", "lawGoverned", "placeRegistered", "registrationNumber", "countryOrState"];

// An object of the request with only the named fields, each trimmed, empty ones left out; any other
// value as it came, for the check to refuse.
function trimmedFields(value, fields) {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return Object.fromEntries(fields.map((field) => [field, trimmed(value[field]) || undefined]).filter(([, part]) => part !== undefined));
}

function trimmedText(value) {
  return typeof value === "string" ? trimmed(value) : value;
}

function extractResidentialAddress(residentialAddress) {
  if (residentialAddress?.sameAsServiceAddress === true) return { sameAsServiceAddress: true };
  return trimmedFields(residentialAddress, ADDRESS_FIELDS);
}

function extractPscChangeDetails(body, errorMessages) {
  const particulars = extractPscParticulars(body, errorMessages);
  const individual = PSC_KIND_ELEMENTS[body.pscKind] === "Individual";
  const changes = {
    newName: individual ? trimmedFields(body.newName, NAME_FIELDS) : trimmedText(body.newName),
    address: trimmedFields(body.address, ADDRESS_FIELDS),
    residentialAddress: extractResidentialAddress(body.residentialAddress),
    nationality: trimmedText(body.nationality),
    countryOfResidence: trimmedText(body.countryOfResidence),
    identification: trimmedFields(body.identification, IDENTIFICATION_FIELDS),
    naturesOfControl: body.naturesOfControl,
  };
  if (PSC_KIND_ELEMENTS[body.pscKind]) {
    changeDetailsProblems({ kind: body.pscKind, ...changes }).forEach((problem) => errorMessages.push(`Invalid change - ${problem}`));
  }
  return {
    ...particulars,
    ...changes,
    ...extractEventAndConfirmationDates(body, "dateOfChange", errorMessages),
  };
}

function extractAccountingReferenceDate(body, errorMessages) {
  const { currentPeriodEnd, newPeriodEnd } = body;
  const fiveYearExtensionReason = trimmed(body.fiveYearExtensionReason) || undefined;
  const extensionAuthorisedCode = trimmed(body.extensionAuthorisedCode) || undefined;
  const currentValid = Boolean(currentPeriodEnd) && isValidIsoDate(currentPeriodEnd);
  const newValid = Boolean(newPeriodEnd) && isValidIsoDate(newPeriodEnd);
  if (!currentValid) errorMessages.push("Invalid or missing currentPeriodEnd - must be YYYY-MM-DD");
  if (!newValid) errorMessages.push("Invalid or missing newPeriodEnd - must be YYYY-MM-DD");
  const change = currentValid && newValid ? changeToPeriod(currentPeriodEnd, newPeriodEnd) : undefined;
  if (change === null) errorMessages.push("Invalid newPeriodEnd - must differ from currentPeriodEnd");
  if (fiveYearExtensionReason && !FIVE_YEAR_EXTENSION_REASONS[fiveYearExtensionReason]) {
    errorMessages.push(`Invalid fiveYearExtensionReason - must be one of ${Object.keys(FIVE_YEAR_EXTENSION_REASONS).join(", ")}`);
  } else if (fiveYearExtensionReason && change === "SHORT") {
    errorMessages.push("Invalid fiveYearExtensionReason - applies only when the period is extended");
  }
  if (extensionAuthorisedCode && fiveYearExtensionReason !== "secretary-of-state-approval") {
    errorMessages.push("Invalid extensionAuthorisedCode - applies only with fiveYearExtensionReason secretary-of-state-approval");
  } else if (extensionAuthorisedCode && extensionAuthorisedCode.length !== 4) {
    errorMessages.push("Invalid extensionAuthorisedCode - must be 4 characters");
  }
  return { currentPeriodEnd, newPeriodEnd, fiveYearExtensionReason, extensionAuthorisedCode };
}

function extractOfficerResignation(body, errorMessages) {
  const { officerRole, corporate, corporateName, title, forename, otherForenames, surname, dateOfBirth, resignationDate } = body;
  if (!OFFICER_RESIGNATION_ROLES[officerRole]) {
    errorMessages.push(`Invalid officerRole - must be one of ${Object.keys(OFFICER_RESIGNATION_ROLES).join(", ")}`);
  }
  if (typeof corporate !== "boolean") {
    errorMessages.push("Invalid corporate - must be true or false");
  } else if (corporate && !trimmed(corporateName)) {
    errorMessages.push("Missing corporateName");
  } else if (!corporate && !trimmed(surname)) {
    errorMessages.push("Missing surname");
  }
  const directorPerson = officerRole === "director" && corporate === false;
  if (!resignationDate || !isValidIsoDate(resignationDate)) {
    errorMessages.push("Invalid or missing resignationDate - must be YYYY-MM-DD");
  }
  if (directorPerson && (!dateOfBirth || !isValidIsoDate(dateOfBirth))) {
    errorMessages.push("Invalid or missing dateOfBirth - a director who is a person needs it as YYYY-MM-DD");
  } else if (directorPerson && resignationDate && isValidIsoDate(resignationDate) && dateOfBirth >= resignationDate) {
    errorMessages.push("Invalid dateOfBirth - must be before resignationDate");
  }
  const person = corporate === false;
  return {
    role: officerRole,
    corporate,
    corporateName: person ? undefined : trimmed(corporateName),
    title: person ? trimmed(title) || undefined : undefined,
    forename: person ? trimmed(forename) || undefined : undefined,
    otherForenames: person ? trimmed(otherForenames) || undefined : undefined,
    surname: person ? trimmed(surname) : undefined,
    dateOfBirth: directorPerson ? dateOfBirth : undefined,
    resignationDate,
  };
}

// The characters the gateway's name and address strings take: the set that the pattern of
// nameAddressString in the base types names.
export const NAME_ADDRESS_CHARACTERS =
  /^[-,.:; 0-9A-Z&@$\u00A3\u00A5\u20AC'"\u00AB\u00BB\u2018\u2019\u201C\u201D?!/\\()[\]{}<>*=#%+\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5\u0100\u0102\u0104\u00C6\u01FC\u00C7\u0106\u0108\u010A\u010C\u00DE\u010E\u00D0\u00C8\u00C9\u00CA\u00CB\u0112\u0114\u0116\u0118\u011A\u011C\u011E\u0120\u0122\u0124\u0126\u00CC\u00CD\u00CE\u00CF\u0128\u012A\u012C\u012E\u0130\u0134\u0136\u0139\u013B\u013D\u013F\u0141\u00D1\u0143\u0145\u0147\u014A\u00D2\u00D3\u00D4\u00D5\u00D6\u00D8\u014C\u014E\u0150\u01FE\u0152\u0154\u0156\u0158\u015A\u015C\u015E\u0160\u0162\u0164\u0166\u00D9\u00DA\u00DB\u00DC\u0168\u016A\u016C\u016E\u0170\u0172\u0174\u1E80\u1E82\u1E84\u1EF2\u00DD\u0176\u0178\u0179\u017B\u017Da-z\u017F\u0192\u01FA\u01FF\u1E85\u1EF3]*$/u;

function extractSailAddress(body, errorMessages) {
  const given = body.address && typeof body.address === "object" && !Array.isArray(body.address) ? body.address : null;
  if (!given) {
    errorMessages.push("Missing address");
    return {};
  }
  const address = {};
  for (const [field, { maxLength, required }] of Object.entries(SAIL_ADDRESS_PARTS)) {
    const value = trimmed(given[field]);
    if (required && !value) errorMessages.push(`Missing address.${field}`);
    if (value.length > maxLength) errorMessages.push(`Invalid address.${field} - must be at most ${maxLength} characters`);
    if (!NAME_ADDRESS_CHARACTERS.test(value))
      errorMessages.push(`Invalid address.${field} - has a character Companies House does not take`);
    if (value) address[field] = value;
  }
  if (!SAIL_ADDRESS_COUNTRIES[given.country]) {
    errorMessages.push(`Invalid address.country - must be one of ${Object.keys(SAIL_ADDRESS_COUNTRIES).join(", ")}`);
  }
  return { address: { ...address, country: given.country } };
}

function extractRecordLocation(body, errorMessages) {
  const { destination, removeSailAddress } = body;
  const records = body.records ?? [];
  if (!RECORD_DESTINATIONS.includes(destination)) {
    errorMessages.push(`Invalid destination - must be one of ${RECORD_DESTINATIONS.join(", ")}`);
  }
  if (removeSailAddress !== undefined && typeof removeSailAddress !== "boolean") {
    errorMessages.push("Invalid removeSailAddress - must be true or false");
  }
  const removing = removeSailAddress === true;
  if (!Array.isArray(records) || records.some((record) => !RECORD_TYPES.includes(record))) {
    errorMessages.push(`Invalid records - each must be one of ${RECORD_TYPES.join(", ")}`);
  } else if (new Set(records).size !== records.length) {
    errorMessages.push("Invalid records - a record is named twice");
  } else if (removing && records.length > 0) {
    errorMessages.push("Invalid records - removeSailAddress moves every record, so name none");
  } else if (!removing && records.length === 0) {
    errorMessages.push("Missing records - name at least one record that has moved");
  }
  if (removing && destination === "sail") {
    errorMessages.push("Invalid removeSailAddress - the SAIL address is removed only by a move to the registered office");
  }
  return { destination, records: Array.isArray(records) ? records : [], removeSailAddress: removing };
}

// A supporting letter is a PDF of at most this many bytes: the request reaches a Lambda, whose
// payload holds 6 MB, and the letter travels in it as base64.
const MAX_SUPPORTING_DOCUMENT_BYTES = 3_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function readSupportingDocument(value, errorMessages) {
  if (value === undefined || value === null) return undefined;
  const kind = trimmed(value.kind);
  const contentBase64 = typeof value.contentBase64 === "string" ? value.contentBase64.replace(/\s+/g, "") : "";
  if (!NAME_SUPPORTING_DOCUMENTS[kind]) {
    errorMessages.push(`Invalid supportingDocument.kind - must be one of ${Object.keys(NAME_SUPPORTING_DOCUMENTS).join(", ")}`);
    return undefined;
  }
  if (!contentBase64 || contentBase64.length % 4 !== 0 || !BASE64.test(contentBase64)) {
    errorMessages.push("Invalid supportingDocument.contentBase64 - must be the PDF as base64");
    return undefined;
  }
  const bytes = Buffer.from(contentBase64, "base64");
  if (bytes.length > MAX_SUPPORTING_DOCUMENT_BYTES) {
    errorMessages.push(`Invalid supportingDocument.contentBase64 - the PDF must be at most ${MAX_SUPPORTING_DOCUMENT_BYTES} bytes`);
    return undefined;
  }
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    errorMessages.push("Invalid supportingDocument.contentBase64 - must be a PDF");
    return undefined;
  }
  return { kind, contentBase64 };
}

function extractChangeOfName(body, errorMessages) {
  const { method, meetingDate, sameDay, noticeGiven, dateSigned } = body;
  const proposedName = trimmed(body.proposedName).toUpperCase();
  if (!NAME_CHANGE_METHODS[method]) {
    errorMessages.push(`Invalid method - must be one of ${Object.keys(NAME_CHANGE_METHODS).join(", ")}`);
  }
  if (!isValidProposedCompanyName(proposedName)) {
    errorMessages.push("Invalid proposedName - must be 3 to 160 characters that Companies House allows in a company name");
  } else if (proposedName === trimmed(body.companyName).toUpperCase()) {
    errorMessages.push("Invalid proposedName - must differ from the company's present name");
  }
  const meetingDateGiven = meetingDate !== undefined && meetingDate !== null && meetingDate !== "";
  if (method === "resolution" && !meetingDateGiven) {
    errorMessages.push("Missing meetingDate - a change by resolution needs the date the resolution was passed");
  } else if (meetingDateGiven && !isValidIsoDate(meetingDate)) {
    errorMessages.push("Invalid meetingDate - must be YYYY-MM-DD");
  } else if (meetingDateGiven && dateSigned && isValidIsoDate(dateSigned) && meetingDate > dateSigned) {
    errorMessages.push("Invalid meetingDate - must not be after dateSigned");
  }
  if (sameDay !== undefined && typeof sameDay !== "boolean") {
    errorMessages.push("Invalid sameDay - must be true or false");
  }
  if (noticeGiven !== true) {
    errorMessages.push("Missing noticeGiven - must be true: notice of the change of name has been given");
  }
  return {
    method,
    proposedName,
    meetingDate: meetingDateGiven ? meetingDate : undefined,
    sameDay: sameDay === true,
    supportingDocument: readSupportingDocument(body.supportingDocument, errorMessages),
  };
}

// A statement, and for a statement linked to a PSC the particulars that name the PSC.
function extractPscStatement(body, errorMessages, statements) {
  const { statement } = body;
  if (!statements.includes(statement)) {
    errorMessages.push(`Invalid statement - must be one of ${statements.join(", ")}`);
    return { statement };
  }
  return isLinkedStatement(statement) ? { statement, ...extractPscParticulars(body, errorMessages) } : { statement };
}

function validDate(body, field, errorMessages) {
  if (!body[field] || !isValidIsoDate(body[field])) errorMessages.push(`Invalid or missing ${field} - must be YYYY-MM-DD`);
  return body[field];
}

function extractPscStatementNotification(body, errorMessages) {
  const notifiable = Object.keys(PSC_STATEMENTS).filter((statement) => PSC_STATEMENTS[statement].notifiable);
  return {
    ...extractPscStatement(body, errorMessages, notifiable),
    relevantDate: validDate(body, "relevantDate", errorMessages),
  };
}

function extractPscStatementWithdrawal(body, errorMessages) {
  const { statement, restrictionsWithdrawalReason } = body;
  const restrictions = statement === "RESTRICTIONS_NOTICE_ISSUED_TO_PSC";
  if (restrictions && !RESTRICTIONS_WITHDRAWAL_REASONS.includes(restrictionsWithdrawalReason)) {
    errorMessages.push(`Invalid restrictionsWithdrawalReason - must be one of ${RESTRICTIONS_WITHDRAWAL_REASONS.join(", ")}`);
  } else if (!restrictions && restrictionsWithdrawalReason !== undefined) {
    errorMessages.push("Invalid restrictionsWithdrawalReason - only for RESTRICTIONS_NOTICE_ISSUED_TO_PSC");
  }
  return {
    ...extractPscStatement(body, errorMessages, Object.keys(PSC_STATEMENTS)),
    withdrawalDate: validDate(body, "withdrawalDate", errorMessages),
    restrictionsWithdrawalReason: restrictions ? restrictionsWithdrawalReason : undefined,
  };
}

// An address as a request gives it, each field trimmed and an empty field left out.
const requestAddress = (address) =>
  address && typeof address === "object"
    ? Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, trimmed(address[field]) || undefined]))
    : undefined;

function extractPscNotification(body, errorMessages) {
  const { pscKind, naturesOfControl, serviceAddress, residentialAddress, personalCode, nameMismatchReason } = body;
  const elementName = PSC_KIND_ELEMENTS[pscKind];
  if (!elementName) errorMessages.push(`Invalid pscKind - must be one of ${Object.keys(PSC_KIND_ELEMENTS).join(", ")}`);
  const form =
    elementName === "Individual"
      ? {
          kind: pscKind,
          title: trimmed(body.title) || undefined,
          forename: trimmed(body.forename) || undefined,
          otherForenames: trimmed(body.otherForenames) || undefined,
          surname: trimmed(body.surname),
          dateOfBirth: body.dateOfBirth,
          nationality: trimmed(body.nationality),
          countryOfResidence: trimmed(body.countryOfResidence),
          serviceAddress:
            serviceAddress?.sameAsRegisteredOffice === true
              ? { sameAsRegisteredOffice: true }
              : { address: requestAddress(serviceAddress?.address) },
          residentialAddress:
            residentialAddress?.sameAsServiceAddress === true
              ? { sameAsServiceAddress: true }
              : { address: requestAddress(residentialAddress?.address) },
          verification:
            personalCode === undefined || personalCode === null || personalCode === ""
              ? undefined
              : { personalCode: trimmed(personalCode).toUpperCase(), nameMismatchReason: nameMismatchReason || undefined },
        }
      : {
          kind: pscKind,
          name: trimmed(body.name),
          address: requestAddress(body.address),
          legalForm: trimmed(body.legalForm),
          lawGoverned: trimmed(body.lawGoverned),
          placeRegistered: elementName === "Corporate" ? trimmed(body.placeRegistered) || undefined : undefined,
          registrationNumber: elementName === "Corporate" ? trimmed(body.registrationNumber) || undefined : undefined,
          countryOrState: elementName === "Corporate" ? trimmed(body.countryOrState) || undefined : undefined,
        };
  if (elementName === "Individual") {
    individualProblems(form).forEach((problem) => errorMessages.push(`Invalid particulars - ${problem}`));
  } else if (elementName) {
    entityProblems(form, elementName === "Corporate").forEach((problem) => errorMessages.push(`Invalid particulars - ${problem}`));
  }
  natureOfControlProblems(naturesOfControl).forEach((problem) => errorMessages.push(`Invalid naturesOfControl - ${problem}`));
  const dates = extractEventAndConfirmationDates(body, "notificationDate", errorMessages);
  if (isValidIsoDate(dates.notificationDate ?? "") && dates.notificationDate < FIRST_NOTIFICATION_DATE) {
    errorMessages.push(`Invalid notificationDate - must not be before ${FIRST_NOTIFICATION_DATE}`);
  }
  return { ...form, naturesOfControl, ...dates };
}

/**
 * Each form's request check and body builder, by the kind its filing state carries. A form whose
 * filing carries a document in the envelope has buildDocument as well.
 */
export const GATEWAY_FORM_BUILDERS = {
  "psc-verification-statement": {
    extractAndValidate: extractPscVerificationStatement,
    buildFormXml: (form) =>
      buildPscVerificationStatementBody({
        title: form.title,
        forename: form.forename,
        otherForenames: form.otherForenames,
        surname: form.surname,
        dobMonth: form.dobMonth,
        dobYear: form.dobYear,
        personalCode: form.personalCode,
      }),
  },
  "psc-cessation": {
    extractAndValidate: extractPscCessation,
    buildFormXml: (form) => buildPscCessationBody(form),
  },
  "psc-change-details": {
    extractAndValidate: extractPscChangeDetails,
    buildFormXml: (form) => buildPscChangeDetailsBody(form),
  },
  "accounting-reference-date": {
    extractAndValidate: extractAccountingReferenceDate,
    buildFormXml: (form) => buildAccountingReferenceDateBody(form),
  },
  "officer-resignation": {
    extractAndValidate: extractOfficerResignation,
    buildFormXml: (form) => buildOfficerResignationBody(form),
  },
  "sail-address": {
    extractAndValidate: extractSailAddress,
    buildFormXml: (form) => buildSailAddressBody(form.address),
  },
  "record-location": {
    extractAndValidate: extractRecordLocation,
    buildFormXml: (form) => buildRecordChangeOfLocationBody(form),
  },
  "change-of-name": {
    extractAndValidate: extractChangeOfName,
    buildFormXml: (form) => buildChangeOfNameBody(form),
    buildDocument: (form) =>
      form.supportingDocument ? supportingDocumentFor({ ...form.supportingDocument, date: form.dateSigned }) : undefined,
  },
  "psc-statement-notification": {
    extractAndValidate: extractPscStatementNotification,
    buildFormXml: (form) => buildPscStatementNotificationBody(form),
  },
  "psc-statement-withdrawal": {
    extractAndValidate: extractPscStatementWithdrawal,
    buildFormXml: (form) => buildPscStatementWithdrawalBody(form),
  },
  "psc-notification": {
    extractAndValidate: extractPscNotification,
    buildFormXml: (form) => buildPscNotificationBody(form),
  },
};
