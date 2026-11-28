// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounts-page-fields.js
// The micro-entity and small company accounts pages' fields that are not ledger lines, with what the
// CT600's fields show: the label led by the section of the Companies Act 2006 or the paragraph of
// Schedule 1 to the Small Companies Regulations that asks for the answer, and the note with its link.
// A field the CT600 also has takes its entry from ct600-fields.js. A note the page already writes
// keeps its words, in the page's language, and gains the link.

import { labelWithReference, noteOf, sourceDisclosure } from "./field-detail.js";
import { ACCOUNTS_TEXT_FIELDS } from "./ct600-fields.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

function companiesActSection(section) {
  return `https://www.legislation.gov.uk/ukpga/2006/46/section/${section}`;
}

function regulationsParagraph(paragraph) {
  return `https://www.legislation.gov.uk/uksi/2008/409/schedule/1/paragraph/${paragraph}`;
}

const SHARED_IDS = [
  "principalActivity",
  "accountingPolicies",
  "directors",
  "averageEmployees",
  "directorName",
  "directorDateApproved",
  "directorsAdvanceName",
  "directorsAdvanceTerms",
  "directorsAdvanceAtStart",
  "directorsAdvanceMade",
  "directorsAdvanceRepaid",
];

const MORE_POLICY_IDS = [
  "goingConcernStatement",
  "revenueRecognitionPolicy",
  "tangibleFixedAssetsPolicy",
  "propertyPlantEquipmentPolicy",
  "depreciationMethodPolicy",
  "intangibleAssetsPolicy",
  "impairmentPolicy",
  "inventoriesPolicy",
  "cashCashEquivalentsPolicy",
  "financialInstrumentsPolicy",
  "financialInstrumentsClassificationPolicy",
  "employeeBenefitsPolicy",
  "definedContributionPensionsPolicy",
  "foreignCurrencyTranslationPolicy",
  "functionalPresentationCurrencyPolicy",
  "leasesPolicy",
  "taxPolicy",
  "currentIncomeTaxPolicy",
  "deferredTaxPolicy",
  "dividendPolicy",
];

/** The entries only these pages have, by the id of their input. */
function ownEntries() {
  const shareClassHint = siteText(
    "ch.accounts.field-share-class-hint",
    "Shares are of one class when the rights attached to them are the same in every respect.",
  );
  const shareClass = { reference: "CA 629", termSource: companiesActSection(629), hint: shareClassHint };
  const nominalValue = { reference: "CA 542", termSource: companiesActSection(542) };
  const policy = { reference: "R44", termSource: regulationsParagraph(44) };
  return [
    { id: "dormant", reference: "CA 1169", termSource: companiesActSection(1169) },
    { id: "shareClass", ...shareClass },
    { id: "shareCapitalClass", ...shareClass },
    { id: "nominalValue", ...nominalValue },
    { id: "shareCapitalNominalValue", ...nominalValue },
    { id: "includeShareCapitalNote", reference: "R47", termSource: regulationsParagraph(47) },
    { id: "directorsAdvanceAtEnd", reference: "CA 413(3)", termSource: companiesActSection(413) },
    ...MORE_POLICY_IDS.map((id) => ({ id, ...policy, noteOnSection: true })),
  ];
}

/** The registered office section's entry: its heading leads with the section, and its note follows the page's. */
export function registeredOfficeEntry() {
  return { id: "registeredOffice", reference: "CA 86", termSource: companiesActSection(86) };
}

/**
 * Every non-ledger field's entry, by the id of its input, whichever page it is on. The statements
 * keep their words, which already name their section.
 */
export function accountsPageFields() {
  return [...ACCOUNTS_TEXT_FIELDS.filter((field) => SHARED_IDS.includes(field.id)), ...ownEntries()];
}

function describe(input, noteId) {
  const described = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((token) => token && token !== noteId);
  input.setAttribute("aria-describedby", [noteId, ...described].join(" "));
}

/**
 * Lead the label of an input with its reference and give it the note with the link to its source.
 * A note the page wrote keeps its words and gains the link; one that already links stays as it is.
 * A label the page hides, in a table of figures, gains the reference and no visible note, and so
 * does a field whose section's note carries the link for all its fields.
 * @param {Document} doc
 * @param {{id: string, reference: string, termSource: string, hint?: string, source?: object}} field
 * @param {string} [inputId] - the input's id, when a row's input carries a suffix
 */
export function showAccountsField(doc, field, inputId = field.id) {
  const input = doc.getElementById(inputId);
  const label = doc.querySelector(`label[for="${inputId}"]`);
  if (!input || !label) return;
  label.dataset.plainLabel ??= label.textContent.trim();
  label.textContent = labelWithReference({ ...field, label: label.dataset.plainLabel });
  if (label.classList.contains("visually-hidden") || field.noteOnSection) return;
  const noteId = `${inputId}-hint`;
  const earlier = doc.getElementById(noteId);
  if (earlier) {
    if (!earlier.querySelector("a")) earlier.replaceChildren(...noteOf({ ...field, hint: earlier.textContent.trim() }, inputId).childNodes);
  } else {
    (label.closest(".choice") ?? label).after(noteOf(field, inputId));
  }
  if (field.source && !doc.getElementById(`${inputId}-source`)) doc.getElementById(noteId).after(sourceDisclosure(field, { id: inputId }));
  describe(input, noteId);
}

/** Lead the registered office heading with its section and put the link under the page's note. */
export function showRegisteredOffice(doc) {
  const pageNote = doc.getElementById("officeHint");
  const heading = pageNote?.previousElementSibling;
  if (!heading) return;
  const entry = registeredOfficeEntry();
  heading.dataset.plainLabel ??= heading.textContent.trim();
  heading.textContent = labelWithReference({ ...entry, label: heading.dataset.plainLabel });
  doc.getElementById(`${entry.id}-hint`)?.remove();
  pageNote.after(noteOf(entry));
}

/** Give the further accounting policies' note, which introduces all of them, the link to paragraph 44. */
export function showMorePoliciesNote(doc) {
  const pageNote = doc.querySelector("#morePolicies > p.hint");
  if (!pageNote || pageNote.querySelector("a")) return;
  const policy = { id: "morePolicies", reference: "R44", termSource: regulationsParagraph(44), hint: pageNote.textContent.trim() };
  pageNote.replaceChildren(...noteOf(policy).childNodes);
}

/** Show the reference and note on every non-ledger field of the page. */
export function showAccountsPageFields(doc) {
  for (const field of accountsPageFields()) showAccountsField(doc, field);
  showRegisteredOffice(doc);
  showMorePoliciesNote(doc);
}

if (typeof document !== "undefined") showAccountsPageFields(document);
