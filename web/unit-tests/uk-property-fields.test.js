// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom

// web/unit-tests/uk-property-fields.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { labelWithReference, referenceText, sourceLinkOf } from "../public/lib/field-detail.js";
import { markUkPropertyFields, SA105_NOTES, UK_PROPERTY_FIELD_REGISTER } from "../public/lib/uk-property-fields.js";

const ITSA = join(process.cwd(), "web/public/hmrc/itsa");

describe("the UK property fields' SA105 boxes", () => {
  test("a field reads as its UK property box, and the total expenses as the boxes it replaces", () => {
    expect(referenceText({ id: "premisesRunningCosts", ...UK_PROPERTY_FIELD_REGISTER.premisesRunningCosts })).toBe("UK property box 24");
    expect(referenceText({ id: "propertyIncomeAllowance", ...UK_PROPERTY_FIELD_REGISTER.propertyIncomeAllowance })).toBe(
      "UK property box 20.1",
    );
    expect(referenceText({ id: "consolidatedExpenses", ...UK_PROPERTY_FIELD_REGISTER.consolidatedExpenses })).toBe(
      "UK property boxes 24 to 29",
    );
    expect(labelWithReference({ id: "travelCosts", label: "Travel costs", ...UK_PROPERTY_FIELD_REGISTER.travelCosts })).toBe(
      "UK property box 29: Travel costs",
    );
  });

  test("every field's note links to the SA105 notes", () => {
    for (const [id, entry] of Object.entries(UK_PROPERTY_FIELD_REGISTER)) {
      expect(sourceLinkOf({ id, ...entry }), id).toEqual({ href: SA105_NOTES, text: "UK property notes (SA105)" });
    }
  });

  test("every registered field is a field of one of the four pages, or of the period fields they mount", () => {
    const sources = ["ukPropertyAnnualSubmission.html", "ukPropertyAdjustments.html"]
      .map((file) => readFileSync(join(ITSA, file), "utf8"))
      .concat(readFileSync(join(process.cwd(), "web/public/lib/uk-property-period-fields.js"), "utf8"))
      .join("\n");
    for (const id of Object.keys(UK_PROPERTY_FIELD_REGISTER)) expect(sources, id).toMatch(new RegExp(`id(=|: )"${id}"`));
  });

  test("each of the four pages loads the register", () => {
    for (const page of ["ukPropertyPeriod", "ukPropertyPeriodAmend", "ukPropertyAnnualSubmission", "ukPropertyAdjustments"]) {
      expect(readFileSync(join(ITSA, `${page}.html`), "utf8"), page).toContain(
        '<script type="module" src="../../lib/uk-property-fields.js" data-uk-property-fields></script>',
      );
    }
  });
});

describe("marking the UK property fields on a page", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="form-group">
        <label for="repairsAndMaintenance">Repairs and maintenance</label>
        <p id="repairsAndMaintenance-money-hint" class="hint">For example, £600 or £193.54</p>
        <input id="repairsAndMaintenance" aria-describedby="repairsAndMaintenance-money-hint" />
      </div>
      <div class="form-group">
        <label for="unregistered">Something else</label>
        <input id="unregistered" />
      </div>`;
  });

  test("leads the label with the box, puts the note under it and describes the input by it, once", () => {
    expect(markUkPropertyFields()).toEqual(["repairsAndMaintenance"]);
    expect(markUkPropertyFields()).toEqual([]);

    const label = document.querySelector('label[for="repairsAndMaintenance"]');
    expect(label.textContent).toBe("UK property box 25: Repairs and maintenance");
    expect(label.dataset.baseLabel).toBe("UK property box 25: Repairs and maintenance");
    const note = label.nextElementSibling;
    expect(note.id).toBe("repairsAndMaintenance-term-hint");
    expect(note.querySelector("a").href).toBe(SA105_NOTES);
    expect(document.getElementById("repairsAndMaintenance").getAttribute("aria-describedby")).toBe(
      "repairsAndMaintenance-money-hint repairsAndMaintenance-term-hint",
    );
    expect(document.querySelector('label[for="unregistered"]').textContent).toBe("Something else");
  });
});
