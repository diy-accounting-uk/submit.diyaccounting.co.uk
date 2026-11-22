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
import { addressProblems, buildPscChangeDetailsBody, natureOfControlProblems } from "./companiesHousePscChangeDetailsXml.js";

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

function extractPscChangeDetails(body, errorMessages) {
  const { naturesOfControl, address } = body;
  if (naturesOfControl === undefined && address === undefined) {
    errorMessages.push("Missing change - give naturesOfControl, address, or both");
  }
  if (naturesOfControl !== undefined) {
    natureOfControlProblems(naturesOfControl).forEach((problem) => errorMessages.push(`Invalid naturesOfControl - ${problem}`));
  }
  const cleanAddress =
    address === undefined || address === null || typeof address !== "object"
      ? address
      : Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, trimmed(address[field]) || undefined]));
  if (address !== undefined) {
    addressProblems(cleanAddress).forEach((problem) => errorMessages.push(`Invalid address - ${problem}`));
  }
  return {
    ...extractPscParticulars(body, errorMessages),
    naturesOfControl,
    address: cleanAddress,
    ...extractEventAndConfirmationDates(body, "dateOfChange", errorMessages),
  };
}

/** Each form's request check and body builder, by the kind its filing state carries. */
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
};
