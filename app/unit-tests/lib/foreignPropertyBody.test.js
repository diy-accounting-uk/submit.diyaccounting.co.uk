// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/foreignPropertyBody.test.js

import { describe, test, expect } from "vitest";
import {
  buildForeignPropertyEntries,
  buildForeignPropertyDetailsBody,
  buildForeignFhlEeaSection,
  ForeignPropertyValidationError,
} from "@app/lib/foreignPropertyBody.js";

describe("buildForeignPropertyEntries", () => {
  test("keys an entry by countryCode for 2025-26", () => {
    const result = buildForeignPropertyEntries("2025-26", [{ countryCode: "FRA", income: { rentIncome: { rentAmount: 1200.456 } } }]);
    expect(result).toEqual([{ countryCode: "FRA", income: { rentIncome: { rentAmount: 1200.46 } } }]);
  });

  test("keys an entry by propertyId for 2026-27", () => {
    const result = buildForeignPropertyEntries("2026-27", [{ propertyId: "P123456789", expenses: { consolidatedExpenses: 50 } }]);
    expect(result).toEqual([{ propertyId: "P123456789", expenses: { consolidatedExpenses: 50 } }]);
  });

  test("refuses a countryCode entry in 2026-27 and a propertyId entry in 2025-26", () => {
    expect(() => buildForeignPropertyEntries("2026-27", [{ countryCode: "FRA", income: { x: 1 } }])).toThrow(
      ForeignPropertyValidationError,
    );
    expect(() => buildForeignPropertyEntries("2025-26", [{ propertyId: "P1", income: { x: 1 } }])).toThrow(
      /identifies an entry by countryCode/,
    );
  });

  test("drops an entry with no figures and keeps false", () => {
    const result = buildForeignPropertyEntries("2025-26", [
      { countryCode: "FRA", income: { rentIncome: { rentAmount: "" }, otherPropertyIncome: null } },
      { countryCode: "ESP", income: { foreignTaxCreditRelief: false } },
    ]);
    expect(result).toEqual([{ countryCode: "ESP", income: { foreignTaxCreditRelief: false } }]);
  });

  test("returns no entries for an absent or empty list", () => {
    expect(buildForeignPropertyEntries("2025-26", undefined)).toEqual([]);
    expect(buildForeignPropertyEntries("2025-26", [])).toEqual([]);
  });

  test("refuses a repeated country before HMRC", () => {
    const entries = [
      { countryCode: "FRA", income: { otherPropertyIncome: 1 } },
      { countryCode: "FRA", income: { otherPropertyIncome: 2 } },
    ];
    expect(() => buildForeignPropertyEntries("2025-26", entries)).toThrow(/appears in more than one entry/);
    try {
      buildForeignPropertyEntries("2025-26", entries);
    } catch (error) {
      expect(error.code).toBe("RULE_DUPLICATE_COUNTRY_CODE");
    }
  });

  test("refuses a repeated property", () => {
    const entries = [
      { propertyId: "P1", income: { otherPropertyIncome: 1 } },
      { propertyId: "P1", income: { otherPropertyIncome: 2 } },
    ];
    try {
      buildForeignPropertyEntries("2026-27", entries);
      expect.unreachable();
    } catch (error) {
      expect(error.code).toBe("RULE_DUPLICATE_PROPERTY_ID");
    }
  });

  test("refuses itemised and consolidated expenses in one entry", () => {
    const entries = [{ countryCode: "FRA", expenses: { consolidatedExpenses: 10, travelCosts: 5 } }];
    try {
      buildForeignPropertyEntries("2025-26", entries);
      expect.unreachable();
    } catch (error) {
      expect(error.code).toBe("RULE_BOTH_EXPENSES_SUPPLIED");
    }
  });

  test("refuses a missing or malformed key", () => {
    expect(() => buildForeignPropertyEntries("2025-26", [{ income: { a: 1 } }])).toThrow(/needs a countryCode/);
    expect(() => buildForeignPropertyEntries("2025-26", [{ countryCode: "fra", income: { a: 1 } }])).toThrow(/Invalid countryCode/);
    expect(() => buildForeignPropertyEntries("2026-27", [{ propertyId: "has space", income: { a: 1 } }])).toThrow(/Invalid propertyId/);
  });

  test("refuses entries that are not a list of objects", () => {
    expect(() => buildForeignPropertyEntries("2025-26", { countryCode: "FRA" })).toThrow(/must be a list/);
    expect(() => buildForeignPropertyEntries("2025-26", ["FRA"])).toThrow(/must be an object/);
  });

  test("refuses a malformed tax year", () => {
    expect(() => buildForeignPropertyEntries("2025-27", [])).toThrow(/Invalid taxYear format/);
  });

  test("passes structured building allowance rows through", () => {
    const rows = [
      { amount: 100, firstYear: { qualifyingAmountExpenditure: 5000, qualifyingDate: "2026-04-06" }, building: { name: "Villa" } },
    ];
    const result = buildForeignPropertyEntries("2026-27", [{ propertyId: "P1", allowances: { structuredBuildingAllowance: rows } }]);
    expect(result[0].allowances.structuredBuildingAllowance).toEqual(rows);
  });
});

describe("buildForeignPropertyDetailsBody", () => {
  test("builds a create body", () => {
    expect(buildForeignPropertyDetailsBody({ propertyName: "Villa", countryCode: "FRA" }, { create: true })).toEqual({
      propertyName: "Villa",
      countryCode: "FRA",
    });
  });

  test("builds an update body that ends a property", () => {
    expect(
      buildForeignPropertyDetailsBody(
        { propertyName: "Villa", endDate: "2026-12-31", endReason: "disposal", countryCode: "FRA" },
        { create: false },
      ),
    ).toEqual({ propertyName: "Villa", endDate: "2026-12-31", endReason: "disposal" });
  });

  test("refuses endReason without endDate", () => {
    expect(() => buildForeignPropertyDetailsBody({ propertyName: "Villa", endReason: "disposal" }, { create: false })).toThrow(
      /endReason needs an endDate/,
    );
  });

  test("refuses a name over 105 characters and a create without name or country", () => {
    expect(() => buildForeignPropertyDetailsBody({ propertyName: "x".repeat(106), countryCode: "FRA" }, { create: true })).toThrow(
      /1 to 105 characters/,
    );
    expect(() => buildForeignPropertyDetailsBody({ countryCode: "FRA" }, { create: true })).toThrow(/Missing propertyName/);
    expect(() => buildForeignPropertyDetailsBody({ propertyName: "Villa", countryCode: "fr" }, { create: true })).toThrow(
      /three upper-case letters/,
    );
  });

  test("refuses a bad end date and an empty update", () => {
    expect(() => buildForeignPropertyDetailsBody({ propertyName: "Villa", endDate: "2026-02-30" }, { create: false })).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => buildForeignPropertyDetailsBody({}, { create: false })).toThrow(/Missing propertyName/);
  });
});

describe("buildForeignFhlEeaSection", () => {
  test("returns undefined for nothing and for a section with no figures", () => {
    expect(buildForeignFhlEeaSection(undefined)).toBeUndefined();
    expect(buildForeignFhlEeaSection({ income: {}, expenses: { travelCosts: "" } })).toBeUndefined();
  });

  test("rounds amounts and keeps an answered zero", () => {
    expect(buildForeignFhlEeaSection({ income: { rentAmount: 10.456 }, expenses: { travelCosts: 0 } })).toEqual({
      income: { rentAmount: 10.46 },
      expenses: { travelCosts: 0 },
    });
  });

  test("refuses itemised and consolidated expenses together", () => {
    expect(() => buildForeignFhlEeaSection({ expenses: { consolidatedExpenses: 5, travelCosts: 1 } })).toThrow(/both itemised/);
  });

  test("refuses a section that is not an object", () => {
    expect(() => buildForeignFhlEeaSection([1])).toThrow(/must be an object/);
  });
});
