// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/self-employment-expenses.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("self-employment-expenses", () => {
  let expenses;
  const parse = (text) => (String(text).trim() === "" ? null : Number(text));
  const readFrom = (values) => (id) => values[id] ?? "";

  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/self-employment-expenses.js");
    expenses = window.selfEmploymentExpenses;
  });

  it("names the fifteen itemised expenses of HMRC's period summary", () => {
    expect(expenses.ITEMISED_FIELDS.map((field) => field.id)).toEqual([
      "costOfGoods",
      "paymentsToSubcontractors",
      "wagesAndStaffCosts",
      "carVanTravelExpenses",
      "premisesRunningCosts",
      "maintenanceCosts",
      "adminCosts",
      "businessEntertainmentCosts",
      "advertisingCosts",
      "interestOnBankOtherLoans",
      "financeCharges",
      "irrecoverableDebts",
      "professionalFees",
      "depreciation",
      "otherExpenses",
    ]);
  });

  it("always sends cost of goods and other expenses, and any other itemised figure the customer filled", () => {
    const { periodExpenses } = expenses.buildPeriodExpenses(readFrom({ costOfGoods: "10", adminCosts: "360.5", depreciation: "0" }), parse);
    expect(periodExpenses).toEqual({ costOfGoods: 10, otherExpenses: 0, adminCosts: 360.5, depreciation: 0 });
  });

  it("sends the total alone when only the total is filled", () => {
    const { periodExpenses } = expenses.buildPeriodExpenses(
      readFrom({ consolidatedExpenses: "9000", costOfGoods: "0", otherExpenses: "0" }),
      parse,
    );
    expect(periodExpenses).toEqual({ consolidatedExpenses: 9000 });
  });

  it("refuses a total beside a non-zero itemised figure", () => {
    const result = expenses.buildPeriodExpenses(readFrom({ consolidatedExpenses: "9000", adminCosts: "5" }), parse);
    expect(result.problem).toMatch(/not both/);
    expect(result.periodExpenses).toBeUndefined();
  });

  it("names the fifteen disallowable expenses of HMRC's period summary", () => {
    expect(expenses.DISALLOWABLE_IDS).toEqual(expenses.ITEMISED_FIELDS.map((field) => `${field.id}Disallowable`));
    expect(expenses.DISALLOWABLE_IDS).toHaveLength(15);
    expect(expenses.DISALLOWABLE_IDS).toContain("interestOnBankOtherLoansDisallowable");
    expect(expenses.DISALLOWABLE_IDS).toContain("depreciationDisallowable");
  });

  it("sends only the disallowable figures the customer filled, beside the itemised expenses", () => {
    const result = expenses.buildPeriodExpenses(
      readFrom({ adminCosts: "360", adminCostsDisallowable: "60.5", depreciationDisallowable: "0" }),
      parse,
    );
    expect(result.periodDisallowableExpenses).toEqual({ adminCostsDisallowable: 60.5, depreciationDisallowable: 0 });
  });

  it("sends an empty disallowable breakdown when none is filled", () => {
    expect(expenses.buildPeriodExpenses(readFrom({ adminCosts: "360" }), parse).periodDisallowableExpenses).toEqual({});
  });

  it("refuses a disallowable figure beside the total expenses", () => {
    const result = expenses.buildPeriodExpenses(readFrom({ consolidatedExpenses: "9000", adminCostsDisallowable: "5" }), parse);
    expect(result.problem).toMatch(/disallowable expenses go with the itemised expenses/);
    expect(result.periodExpenses).toBeUndefined();
  });

  it("sends the total with no disallowable figures when a disallowable field holds zero", () => {
    const result = expenses.buildPeriodExpenses(readFrom({ consolidatedExpenses: "9000", adminCostsDisallowable: "0" }), parse);
    expect(result.periodExpenses).toEqual({ consolidatedExpenses: 9000 });
    expect(result.periodDisallowableExpenses).toEqual({});
  });
});
