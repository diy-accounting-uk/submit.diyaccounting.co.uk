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
});
