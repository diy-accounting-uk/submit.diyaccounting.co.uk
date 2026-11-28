// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/itsa-year-end-fields.js
// The note under each field of the Income Tax year-end forms, the tax liability adjustments and the
// losses and claims, in HMRC's terms from its API definitions, with a link to HMRC's description.

import { noteOf } from "./field-detail.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const HMRC_API_DOCS = "https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service";
const TAX_LIABILITY_ADJUSTMENTS_API = `${HMRC_API_DOCS}/individuals-tax-liability-adjustments-api/1.0`;
const INDIVIDUAL_LOSSES_API = `${HMRC_API_DOCS}/individual-losses-api/7.0`;

function taxLiabilityAdjustmentsFields() {
  return [
    {
      id: "incomeTax",
      termSource: TAX_LIABILITY_ADJUSTMENTS_API,
      hint: siteText(
        "itsa-tla.income-tax-note",
        "The decrease in Income Tax from carrying a loss back. It is worked out from an earlier year's liability and taken off this year's total.",
      ),
    },
    {
      id: "class4",
      termSource: TAX_LIABILITY_ADJUSTMENTS_API,
      hint: siteText(
        "itsa-tla.class4-note",
        "The decrease in Class 4 National Insurance from carrying a loss back. It is worked out from an earlier year's liability and taken off this year's total.",
      ),
    },
    {
      id: "capitalGainsTax",
      termSource: TAX_LIABILITY_ADJUSTMENTS_API,
      hint: siteText(
        "itsa-tla.capital-gains-tax-note",
        "The decrease in Capital Gains Tax from carrying a loss back. It is worked out from an earlier year's liability and taken off this year's total.",
      ),
    },
  ];
}

function lossesAndClaimsFields() {
  return [
    {
      id: "broughtForwardLosses",
      termSource: INDIVIDUAL_LOSSES_API,
      hint: siteText("itsa-losses.brought-forward-note", "Losses from earlier years set against this year's profits."),
    },
    {
      id: "currentYearLosses",
      termSource: INDIVIDUAL_LOSSES_API,
      hint: siteText(
        "itsa-losses.current-year-losses-note",
        "This year's trading loss carried forward, to set against future profits of the same trade.",
      ),
    },
    {
      id: "previousYearsLosses",
      termSource: INDIVIDUAL_LOSSES_API,
      hint: siteText(
        "itsa-losses.previous-years-losses-note",
        "Trading losses from earlier years carried forward, to set against future profits of the same trade.",
      ),
    },
    {
      id: "currentYearGeneralIncome",
      termSource: INDIVIDUAL_LOSSES_API,
      hint: siteText("itsa-losses.current-year-general-income-note", "This year's trading loss set against this year's other income."),
    },
    {
      id: "previousYearGeneralIncome",
      termSource: INDIVIDUAL_LOSSES_API,
      hint: siteText(
        "itsa-losses.previous-year-general-income-note",
        "This year's trading loss carried back, to set against the other income of an earlier year.",
      ),
    },
    {
      id: "earlyYearLosses",
      termSource: INDIVIDUAL_LOSSES_API,
      hint: siteText(
        "itsa-losses.early-year-losses-note",
        "This year's trading loss carried back, to set against the other income of earlier years.",
      ),
    },
    {
      id: "terminalLosses",
      termSource: INDIVIDUAL_LOSSES_API,
      hint: siteText(
        "itsa-losses.terminal-losses-note",
        "This year's trading loss carried back against the profits of the three years before, the latest year first.",
      ),
    },
    {
      id: "applyFirst",
      termSource: INDIVIDUAL_LOSSES_API,
      hint: siteText(
        "itsa-losses.apply-first-note",
        "Which claim HMRC applies first when this year's loss is set against both this year's and an earlier year's other income.",
      ),
    },
  ];
}

/** The fields of a year-end form, each with its note: "taxLiabilityAdjustments" or "lossesAndClaims". */
export function yearEndFields(form) {
  return form === "taxLiabilityAdjustments" ? taxLiabilityAdjustmentsFields() : lossesAndClaimsFields();
}

/** Put each field's note under its label, and describe the field by it. */
export function showYearEndFields(doc, form) {
  for (const field of yearEndFields(form)) {
    const input = doc.getElementById(field.id);
    doc.getElementById(`${field.id}-hint`)?.remove();
    doc.querySelector(`label[for="${field.id}"]`).after(noteOf(field));
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    if (!described.includes(`${field.id}-hint`)) input.setAttribute("aria-describedby", [`${field.id}-hint`, ...described].join(" "));
  }
}
