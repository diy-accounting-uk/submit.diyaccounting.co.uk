// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/registered-change.js
// What the registered office and registered email change pages share: the section of the Companies
// Act 2006 behind each field, with its note, and the failure panel when a filing call fails.

import { labelWithReference, noteOf } from "./field-detail.js";
import { classifyFilingFailure, showFailureDetail } from "./filing-failure.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

function companiesActSection(section) {
  return `https://www.legislation.gov.uk/ukpga/2006/46/section/${section}`;
}

// Each entry names the element whose words lead with the reference (labelFor) and the element the
// note follows (after). A statement's label already names its section, so it keeps its words.
function officeFields() {
  return [
    {
      id: "newAddress",
      labelFor: "#officeAddressForm h3",
      after: "#officeAddressForm h3",
      label: siteText("ch.office.new-address", "New address"),
      reference: "CA 87",
      termSource: companiesActSection(87),
      hint: siteText(
        "ch.office.new-address-hint",
        "The change takes effect when Companies House registers it. For 14 days after that, documents can still be served on the company at the old address.",
      ),
    },
    {
      id: "acceptOfficeStatement",
      describes: "#acceptOfficeStatement",
      after: "#acceptOfficeStatement",
      reference: "CA 86",
      termSource: companiesActSection(86),
      hint: siteText(
        "ch.office.statement-hint",
        "The notice of the change must include this statement. Post delivered to the address must reach someone acting for the company, and its delivery must be capable of being recorded.",
      ),
    },
  ];
}

function emailFields() {
  return [
    {
      id: "registeredEmailAddress",
      labelFor: 'label[for="registeredEmailAddress"]',
      describes: "#registeredEmailAddress",
      after: 'label[for="registeredEmailAddress"]',
      label: siteText("ch.email.new-address-label", "New registered email address"),
      reference: "CA 88B",
      termSource: companiesActSection("88B"),
      hint: siteText("ch.email.new-address-hint", "The change takes effect when Companies House registers it."),
    },
    {
      id: "acceptEmailStatement",
      describes: "#acceptEmailStatement",
      after: "#acceptEmailStatement",
      reference: "CA 88A",
      termSource: companiesActSection("88A"),
      hint: siteText(
        "ch.email.statement-hint",
        "The notice of the change must include this statement. Emails Companies House sends to the address must reach someone acting for the company.",
      ),
    },
  ];
}

/** The fields of a change form, each with its reference and note: "office" or "email". */
export function registeredChangeFields(form) {
  return form === "office" ? officeFields() : emailFields();
}

/**
 * Lead each field's words with its section and put its note under it. The note follows the label
 * of a text field and the whole choice of a statement, and the field is described by it.
 */
export function showRegisteredChangeFields(doc, form) {
  for (const field of registeredChangeFields(form)) {
    if (field.labelFor) doc.querySelector(field.labelFor).textContent = labelWithReference(field);
    const anchor = doc.querySelector(field.after);
    const place = anchor.closest(".choice") ?? anchor;
    doc.getElementById(`${field.id}-hint`)?.remove();
    place.after(noteOf(field));
    if (field.describes) {
      const input = doc.querySelector(field.describes);
      const described = (input.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
      if (!described.includes(`${field.id}-hint`)) input.setAttribute("aria-describedby", [...described, `${field.id}-hint`].join(" "));
    }
  }
}

// The page's own label for each field Companies House's filing API names in a validation error,
// by the key the route sends it under.
function fieldLabels(form) {
  if (form === "office") {
    return {
      premises: siteText("ch.address.premises", "Premises"),
      address_line_1: siteText("ch.address.line-1", "Address line 1"),
      address_line_2: siteText("ch.address.line-2", "Address line 2"),
      locality: siteText("ch.address.town", "Town or city"),
      region: siteText("ch.address.county", "County"),
      postal_code: siteText("ch.address.postcode", "Postcode"),
      country: siteText("ch.address.country", "Country"),
      accept_appropriate_office_address_statement: siteText("ch.office.statement-field", "The appropriate address statement"),
      reference_etag: siteText("ch.office.looked-up-address-field", "The current address you looked up"),
    };
  }
  return {
    registered_email_address: siteText("ch.email.new-address-label", "New registered email address"),
    accept_appropriate_email_address_statement: siteText("ch.email.statement-field", "The appropriate email address statement"),
  };
}

/**
 * One line of a validation error Companies House answered: the field's label and the error. The
 * location is a JSON path ("$.postal_code"); a field the page has no label for shows the error alone.
 * @param {"office"|"email"} form
 * @param {{error?: string, location?: string}} entry
 */
export function validationErrorText(form, entry) {
  const error = entry.error || siteText("ch.change.invalid-value", "invalid value");
  const key = String(entry.location ?? "").replace(/^\$\./, "");
  const label = fieldLabels(form)[key];
  return label ? siteText("ch.change.field-error", "{label}: {error}", { label, error }) : error;
}

// What reached Companies House before the failure, from the steps the filing has taken: the
// transaction opened, the change added to it, the transaction closed.
function sentText(filing) {
  if (!filing?.transactionId) return siteText("ch.change.failure-sent-nothing", "Nothing reached Companies House.");
  if (!filing.resourceAdded) {
    return siteText(
      "ch.change.failure-sent-transaction",
      "Companies House opened a transaction for the change but did not receive the change. Nothing has been filed.",
    );
  }
  return siteText("ch.change.failure-sent-change", "Companies House holds the change in an open transaction. It has not been filed.");
}

/**
 * Show the failure panel for a filing call that failed.
 * @param {Document} doc
 * @param {Error} error - the filing client's error
 * @param {{transactionId?: string, resourceAdded?: boolean}} filing - the steps the filing has taken
 * @param {{answersKept: boolean, errorsListedOnPage?: boolean}} options - whether the answers stay on
 *   the page for sending again, and whether the page lists Companies House's errors itself
 */
export function showRegisteredChangeFailure(doc, error, filing, { answersKept, errorsListedOnPage = false }) {
  const classified = classifyFilingFailure(error, { service: "companiesHouse" });
  const failure = errorsListedOnPage ? { ...classified, errors: [] } : classified;
  const answers = answersKept
    ? siteText(
        "ch.change.failure-answers-kept",
        "Your answers are still on this page. Sending again carries on from where the filing stopped.",
      )
    : siteText("ch.change.failure-answers-new", "Choose Start a new filing and enter the answers again with the correction.");
  return showFailureDetail(doc, { sent: sentText(filing), answers, failure });
}
