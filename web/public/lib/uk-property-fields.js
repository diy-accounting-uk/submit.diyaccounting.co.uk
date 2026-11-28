// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/uk-property-fields.js
// The register of the UK property pages' money fields: the box of HMRC's Self Assessment UK property
// pages (SA105) each figure goes in, and the notes that say what belongs there. Each field's label
// is led by its box ("UK property box 24: Rent, rates, insurance and ground rents") and a note under
// the label links to the SA105 notes, through field-detail.js as the Company Tax Return's fields are.
// A UK property figure in a DIYA-GL book comes from the accounts the book tags for it, so no workbook
// cell holds it and the fields carry no "In DIY Accounting's spreadsheets" disclosure.
//
// The boxes are those of the 2025 to 2026 form (SA105 2026): income in boxes 20 to 23, expenses in
// boxes 24 to 29 (travel goes in box 29), the adjustments and allowances in boxes 30 to 37, and the
// residential finance costs in boxes 44 and 45.

import { labelWithReference, noteOf } from "./field-detail.js";

export const SA105_NOTES = "https://www.gov.uk/government/publications/self-assessment-uk-property-sa105";

const box = (number) => ({ reference: `SA105 box ${number}`, termSource: SA105_NOTES });

/** Each money field's register entry, by the id of its input. */
export const UK_PROPERTY_FIELD_REGISTER = {
  // The period summary (uk-property-period-fields.js), on the update and the amend.
  periodAmount: box(20),
  otherIncome: box(20),
  rentARoomRentsReceived: box(20),
  taxDeducted: box(21),
  premiumsOfLeaseGrant: box(22),
  reversePremiums: box(23),
  premisesRunningCosts: box(24),
  repairsAndMaintenance: box(25),
  financialCosts: box(26),
  professionalFees: box(27),
  costOfServices: box(28),
  otherExpenses: box(29),
  travelCosts: box(29),
  consolidatedExpenses: { reference: "SA105 boxes 24 to 29", termSource: SA105_NOTES },
  rentARoomAmountClaimed: box(37),
  residentialFinancialCost: box(44),
  residentialFinancialCostsCarriedForward: box(45),
  // The annual submission.
  propertyIncomeAllowance: box(20.1),
  privateUseAdjustment: box(30),
  balancingCharge: box(31),
  annualInvestmentAllowance: box(32),
  zeroEmissionsCarAllowance: box(34.1),
  otherCapitalAllowance: box(35),
  costOfReplacingDomesticItems: box(36),
  // The year-end adjustments.
  adjustTotalRentsReceived: box(20),
  adjustRepairsAndMaintenance: box(25),
};

/**
 * Leads each registered field's label on the page with its box and puts the note that links to the
 * SA105 notes under the label. A label rewritten later from its data-base-label keeps the box.
 * @param {Document|Element} [root]
 * @returns {string[]} the ids of the fields it marked
 */
export function markUkPropertyFields(root = document) {
  const marked = [];
  for (const [id, entry] of Object.entries(UK_PROPERTY_FIELD_REGISTER)) {
    const input = root.querySelector(`#${id}`);
    const label = root.querySelector(`label[for="${id}"]`);
    if (!input || !label || label.dataset.reference) continue;
    const field = { id, label: label.dataset.baseLabel || label.textContent.trim(), ...entry };
    const text = labelWithReference(field);
    label.textContent = text;
    label.dataset.baseLabel = text;
    label.dataset.reference = entry.reference;
    const note = noteOf({ id, termSource: entry.termSource }, `${id}-term`);
    label.after(note);
    const describedBy = new Set((input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    describedBy.add(note.id);
    input.setAttribute("aria-describedby", [...describedBy].join(" "));
    marked.push(id);
  }
  return marked;
}

if (typeof document !== "undefined" && document.querySelector?.("[data-uk-property-fields]")) markUkPropertyFields();
