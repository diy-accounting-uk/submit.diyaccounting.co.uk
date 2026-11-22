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
import { buildPscCessationBody, PSC_CESSATION_KINDS } from "./companiesHousePscCessationXml.js";

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

function extractPscCessation(body, errorMessages) {
  const { pscKind, title, forename, otherForenames, surname, name, dobMonth, dobYear, cessationDate, confirmationDate } = body;
  const elementName = PSC_CESSATION_KINDS[pscKind];
  if (!elementName) {
    errorMessages.push(`Invalid pscKind - must be one of ${Object.keys(PSC_CESSATION_KINDS).join(", ")}`);
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
  if (!cessationDate || !isValidIsoDate(cessationDate)) {
    errorMessages.push("Invalid or missing cessationDate - must be YYYY-MM-DD");
  }
  if (!confirmationDate || !isValidIsoDate(confirmationDate)) {
    errorMessages.push("Invalid or missing confirmationDate - must be YYYY-MM-DD");
  } else if (cessationDate && isValidIsoDate(cessationDate) && confirmationDate < cessationDate) {
    errorMessages.push("Invalid confirmationDate - must not be before cessationDate");
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
    cessationDate,
    confirmationDate,
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
};
