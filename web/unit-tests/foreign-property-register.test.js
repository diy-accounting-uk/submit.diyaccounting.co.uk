// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom

// web/unit-tests/foreign-property-register.test.js

import { describe, test, expect } from "vitest";
import { SA106_NOTES, labelOf, noteFor, registeredField } from "../public/lib/foreign-property-register.js";

describe("a foreign property figure's place on the SA106", () => {
  test("leads the label with the box, the decimal box or the summary column", () => {
    expect(labelOf("rentAmount", { id: "fp-1-rentAmount", label: "Rental income" })).toBe("SA106 box 14: Rental income");
    expect(labelOf("residentialFinancialCost", { id: "x", label: "Residential property finance costs" })).toBe(
      "SA106 box 24.1: Residential property finance costs",
    );
    expect(labelOf("foreignTaxPaidOrDeducted", { id: "x", label: "Foreign tax taken off or paid" })).toBe(
      "SA106 column C: Foreign tax taken off or paid",
    );
  });

  test("notes a part of a total and links HMRC's SA106 notes", () => {
    const note = noteFor("repairsAndMaintenance", { id: "fp-1-repairsAndMaintenance", label: "Repairs and maintenance" });
    expect(note.id).toBe("fp-1-repairsAndMaintenance-hint");
    expect(note.textContent).toBe("Counts towards the total in box 17. Foreign (SA106) notes.");
    expect(note.querySelector("a").getAttribute("href")).toBe(SA106_NOTES);
  });

  test("a whole box's note is the link alone", () => {
    expect(noteFor("consolidatedExpenses", { id: "total", label: "Total expenses" }).textContent).toBe("Foreign (SA106) notes.");
  });

  test("a figure with no SA106 place is refused", () => {
    expect(() => registeredField("unknownFigure", { id: "x", label: "X" })).toThrow("No SA106 place for unknownFigure");
  });
});
