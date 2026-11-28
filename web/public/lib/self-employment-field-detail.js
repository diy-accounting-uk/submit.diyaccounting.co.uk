// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/self-employment-field-detail.js
// Gives the self-employment fields of the page their SA103F box, note and spreadsheet cell. The
// page names its set on this script's tag (data-field-set="quarterly", "annual" or "adjustments"),
// and calls window.applySelfEmploymentFieldDetail() again after it renders its fields afresh.

import { applyFieldDetail } from "./itsa-field-detail.js";
import { adjustmentFields, annualFields, quarterlyFields } from "./self-employment-fields.js";

const FIELD_SETS = { quarterly: quarterlyFields, annual: annualFields, adjustments: adjustmentFields };

const fieldSet = document.querySelector("script[data-field-set]")?.dataset.fieldSet;
const fieldsOf = FIELD_SETS[fieldSet];
if (!fieldsOf) throw new Error(`No self-employment field set named ${fieldSet}`);

/** Give the page's self-employment fields their reference, note and disclosure. */
export function applySelfEmploymentFieldDetail() {
  applyFieldDetail(document, fieldsOf());
}

window.applySelfEmploymentFieldDetail = applySelfEmploymentFieldDetail;
applySelfEmploymentFieldDetail();
