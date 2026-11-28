// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/foreign-property-register.js
// Where each foreign property figure sits on the paper return's Foreign pages (SA106): the box or
// the column of the property summary, and the link to HMRC's notes. A field's label is led by its
// place ("SA106 box 17: Repairs and maintenance") and its note links the notes, through
// field-detail.js. The register is keyed by HMRC's Property Business name for the figure. The page
// scripts are not modules, so the module puts its functions on window.foreignPropertyRegister.

import { labelWithReference, noteOf } from "./field-detail.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const SA106_NOTES = "https://www.gov.uk/government/publications/self-assessment-foreign-sa106";

const box = (number) => `SA106 box ${number}`;
const column = (letter) => `SA106 column ${letter}`;

// A figure the SA106 asks for only as part of a total in one box.
const partOf = (number) => siteText("itsa.fp-part-of-box", "Counts towards the total in box {box}.", { box: number });

const ENTRIES = {
  rentAmount: { reference: box(14) },
  otherPropertyIncome: { reference: box(14) },
  totalRentsReceived: { reference: box(14) },
  propertyIncomeAllowance: { reference: box("14.1") },
  premiumsOfLeaseGrant: { reference: box(16) },
  consolidatedExpenses: { reference: box(17) },
  premisesRunningCosts: { reference: box(17), part: 17 },
  repairsAndMaintenance: { reference: box(17), part: 17 },
  financialCosts: { reference: box(17), part: 17 },
  professionalFees: { reference: box(17), part: 17 },
  costOfServices: { reference: box(17), part: 17 },
  travelCosts: { reference: box(17), part: 17 },
  other: { reference: box(17), part: 17 },
  privateUseAdjustment: { reference: box(19) },
  balancingCharge: { reference: box(20) },
  annualInvestmentAllowance: { reference: box(21), part: 21 },
  otherCapitalAllowance: { reference: box(21), part: 21 },
  zeroEmissionsGoodsVehicleAllowance: { reference: box(21), part: 21 },
  zeroEmissionsCarAllowance: { reference: box("21.1") },
  structuredBuildingAllowance: { reference: box("22.1") },
  electricChargePointAllowance: { reference: box("22.2") },
  costOfReplacingDomesticItems: { reference: box(23) },
  residentialFinancialCost: { reference: box("24.1") },
  broughtFwdResidentialFinancialCost: { reference: box("24.2") },
  countryCode: { reference: column("A") },
  foreignTaxPaidOrDeducted: { reference: column("C") },
  specialWithholdingTaxOrUkTaxPaid: { reference: column("D") },
  foreignTaxCreditRelief: { reference: column("E") },
};

/**
 * The field with its SA106 place, ready for field-detail.js: the label, the reference, the link to
 * the notes and, for a part of a total, the note that says so.
 * @param {string} key - HMRC's name for the figure
 * @param {{id: string, label: string}} field - the field as the page renders it
 */
export function registeredField(key, field) {
  const entry = ENTRIES[key];
  if (!entry) throw new Error(`No SA106 place for ${key}`);
  return { ...field, reference: entry.reference, termSource: SA106_NOTES, ...(entry.part ? { hint: partOf(entry.part) } : {}) };
}

/** The label led by the figure's SA106 place. */
export function labelOf(key, field) {
  return labelWithReference(registeredField(key, field));
}

/** The note under the label: the part-of-a-total line, if any, and the link to the SA106 notes. */
export function noteFor(key, field) {
  return noteOf(registeredField(key, field), field.id);
}

function describedBy(input, id) {
  const ids = (input.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
  input.setAttribute("aria-describedby", [...ids, id].join(" "));
}

/**
 * A money field of self-employment-expenses.js with its label led by the SA106 place and the note
 * under the money hint.
 * @param {string} key - HMRC's name for the figure
 * @param {{id: string, label: string, min?: number}} field - the field with its page id
 * @param {string} moneyHint - the hint on how to write the amount
 */
export function moneyGroup(key, field, moneyHint) {
  const group = window.selfEmploymentExpenses.moneyGroup({ ...field, label: labelOf(key, field) }, moneyHint);
  const note = noteFor(key, field);
  group.querySelector(`#${CSS.escape(field.id)}-money-hint`).after(note);
  describedBy(group.querySelector(`#${CSS.escape(field.id)}`), note.id);
  return group;
}

/**
 * Leads a label already on the page with the figure's SA106 place. The note's link joins the hint
 * the page already has under the label, or the note goes after the label.
 * @param {string} key - HMRC's name for the figure
 * @param {HTMLLabelElement} label - the label of the input whose id is its htmlFor
 */
export function registerLabel(key, label) {
  const field = { id: label.htmlFor, label: label.textContent.trim() };
  label.textContent = labelOf(key, field);
  const note = noteFor(key, field);
  const hint = document.getElementById(note.id);
  if (hint) {
    hint.append(" ", ...note.childNodes);
    return hint;
  }
  label.after(note);
  const input = document.getElementById(field.id);
  if (input) describedBy(input, note.id);
  return note;
}

if (typeof window !== "undefined") {
  window.foreignPropertyRegister = { registeredField, labelOf, noteFor, moneyGroup, registerLabel };
}
