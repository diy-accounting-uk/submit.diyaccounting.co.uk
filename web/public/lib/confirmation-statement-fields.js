// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/confirmation-statement-fields.js
// The confirmation statement form's fields with what the CT600's fields show: the label led by the
// section of the Companies Act 2006 that asks for the answer, and the note with its link to that
// section. The labels stay as the page writes them, in its language; this register adds the
// reference and the note. None of these answers has a cell in DIY Accounting's spreadsheets.

import { labelWithReference, noteOf } from "./field-detail.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

function companiesActSection(section) {
  return `https://www.legislation.gov.uk/ukpga/2006/46/section/${section}`;
}

function entry(id, section, hint) {
  return { id, reference: `CA ${section}`, termSource: companiesActSection(section), hint };
}

/** The fields of the review form, by the id of their input. */
export const CONFIRMATION_STATEMENT_FIELDS = [
  entry(
    "reviewDate",
    "853A",
    siteText(
      "ch.cs.field-review-date-hint",
      "The register must be right on this date. It cannot be later than the confirmation date Companies House holds for the company.",
    ),
  ),
  entry(
    "sicCodes",
    "853C",
    siteText(
      "ch.cs.field-sic-codes-hint",
      "The company's principal business activities as SIC codes. Enter up to four, separated by commas.",
    ),
  ),
  entry("totalAmountUnpaid", "853D", siteText("ch.cs.field-amount-unpaid-hint", "What the shareholders still owe on the issued shares.")),
  entry(
    "totalNumberOfIssuedShares",
    "853D",
    siteText("ch.cs.field-issued-shares-hint", "Every share the company has issued, across all its classes."),
  ),
  entry("shareCurrency", "853D", siteText("ch.cs.field-share-currency-hint", "The currency of the share capital, for example GBP.")),
  entry(
    "totalAggregateNominalValue",
    "853D",
    siteText("ch.cs.field-nominal-value-hint", "The nominal value of all the issued shares together."),
  ),
  entry(
    "registeredEmailAddress",
    "88A",
    siteText(
      "ch.cs.field-registered-email-hint",
      "Companies House writes to the company at this address. It is not on the public register.",
    ),
  ),
  entry(
    "lawfulPurposeStatement",
    "853BA",
    siteText("ch.cs.field-lawful-purpose-hint", "Every confirmation statement confirms that what the company intends to do is lawful."),
  ),
  entry(
    "stateConfirmation",
    "853A",
    siteText(
      "ch.cs.field-state-confirmation-hint",
      "The company confirms that Companies House holds everything it must, or gets it with this statement.",
    ),
  ),
];

/** A director's personal code on the review form. */
export const DIRECTOR_PERSONAL_CODE_FIELD = entry(
  "directorPersonalCode",
  "1110A",
  siteText(
    "ch.cs.field-director-code-hint",
    "The 11 characters Companies House gave the director when their identity was verified, for example CWMPS832223.",
  ),
);

/** A person with significant control's personal code, for the PSC verification statement. */
export const PSC_PERSONAL_CODE_FIELD = entry(
  "pscPersonalCode",
  "790LM",
  siteText(
    "ch.cs.field-psc-code-hint",
    "The 11 characters Companies House gave this person when their identity was verified. A person has one code for every role.",
  ),
);

/**
 * Lead the label of an input with its reference and put the field's note under the label (under the
 * choice, for a tick box), in place of a note already there. The input is described by the note.
 * @param {Document} doc
 * @param {{id: string, reference: string, termSource: string, hint: string}} field
 * @param {string} [inputId] - the input's id, when a row's input carries a suffix
 */
export function showFieldDetail(doc, field, inputId = field.id) {
  const input = doc.getElementById(inputId);
  const label = doc.querySelector(`label[for="${inputId}"]`);
  if (!input || !label) return;
  label.dataset.plainLabel ??= label.textContent.trim();
  label.textContent = labelWithReference({ ...field, label: label.dataset.plainLabel });
  const note = noteOf(field, inputId);
  const earlier = doc.getElementById(`${inputId}-hint`);
  if (earlier) earlier.replaceWith(note);
  else (label.closest(".choice") ?? label).after(note);
  const described = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((token) => token && token !== note.id);
  input.setAttribute("aria-describedby", [note.id, ...described].join(" "));
}

/** Show the reference and note on every field of the review form. */
export function showConfirmationStatementFields(doc) {
  for (const field of CONFIRMATION_STATEMENT_FIELDS) showFieldDetail(doc, field);
}
