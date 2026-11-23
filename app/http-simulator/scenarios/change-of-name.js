// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/change-of-name.js
// The simulator's answer to a ChangeOfName form, from the form's own content and the envelope's
// document: the rejection Companies House gives a name it does not allow without a supporting
// letter, and the change an accepted filing makes to the company's name on the simulated register.
// GOV.UK says a name "cannot contain a 'sensitive' word or expression ... unless you get
// permission", and that a 'same as' name needs "written confirmation that the company or LLP has
// no objection to your new name".

import { firstElement, firstElementText } from "../../lib/xmlDom.js";
import { companyNames, setCompanyName } from "./companies.js";

// A few of the words Companies House treats as sensitive; "Accredited" is GOV.UK's own example.
const SENSITIVE_WORDS = ["ACCREDITED", "CHARTERED", "ROYAL", "INSTITUTE"];

const rejection = (rejectCode, description) => ({ rejectCode, description, instanceNumber: "1" });

/** The fields of the form in a parsed envelope, and the category of the document sent with it. */
export function readChangeOfNameForm(document) {
  const form = firstElement(document, "ChangeOfName");
  const attached = firstElement(document, "Document");
  return {
    proposedName: firstElementText(form, "ProposedCompanyName"),
    documentCategory: attached ? firstElementText(attached, "Category") : null,
  };
}

/** The rejection for a name that needs a letter the filing does not carry, or null. */
export function changeOfNameRejection(companyNumber, form) {
  const words = form.proposedName.split(/[^A-Z0-9]+/);
  if (SENSITIVE_WORDS.some((word) => words.includes(word)) && form.documentCategory !== "SUPPNAMEAUTH") {
    return rejection(
      "9994",
      "The proposed name includes a sensitive word or expression, and no supporting document was sent with the form.",
    );
  }
  const heldByAnother = companyNames().some(({ number, name }) => number !== companyNumber && name === form.proposedName);
  if (heldByAnother && form.documentCategory !== "SUPPEXISTNAME") {
    return rejection("9995", "The proposed name is the same as a name already on the register.");
  }
  return null;
}

/** An accepted change gives the company its new name on the simulated register. */
export function acceptChangeOfName(companyNumber, form) {
  setCompanyName(companyNumber, form.proposedName);
}
