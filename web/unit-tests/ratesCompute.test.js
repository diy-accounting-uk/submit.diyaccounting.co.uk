// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { computeSelfEmployed, computeLimitedCompany, twelveMonthPeriodStart, vatPosition } from "../public/lib/rates/rates-compute.js";
import { SELF_EMPLOYED, LIMITED_COMPANY, SOURCED } from "../public/lib/rates/rates-data.js";

const VAT = { registration_threshold: 90000, standard_rate: 0.2 };

const baseInputs = {
  income: 45000,
  expenses: 5000,
  miles: 0,
  equipment: 0,
  poolBroughtForward: 0,
  personalAllowance: 12570,
  associatedCompanies: 0,
  vatRegistered: false,
  vatScheme: "standard",
  flatRatePercent: 16.5,
  cis: false,
  cisStatus: "registered",
  cisLabour: 0,
  yearEnd: "2027-03-31",
};

const selfEmployed = (overrides, year = "2026-27") =>
  computeSelfEmployed({ ...baseInputs, ...overrides }, SELF_EMPLOYED[year], SOURCED[year]);
const company = (overrides) =>
  computeLimitedCompany({ ...baseInputs, expenses: 0, ...overrides }, LIMITED_COMPANY, { ...SOURCED["2026-27"], ...SOURCED.fy2026 });

describe("self-employed calculator", () => {
  test("taxes 40000 of profit with Class 4 and no Class 2", () => {
    const r = selfEmployed({});
    expect(r.taxableProfit).toBeCloseTo(40000, 2);
    expect(r.incomeTax).toBeCloseTo(5486, 2);
    expect(r.class4).toBeCloseTo(1645.8, 2);
    expect(r.taxAndNi).toBeCloseTo(7131.8, 2);
    expect(r.class2Voluntary).toBe(0);
    expect(r.profitAfterTax).toBeCloseTo(32868.2, 2);
  });

  test("an edited personal allowance of 0 taxes all profit", () => {
    expect(selfEmployed({ personalAllowance: 0 }).incomeTax).toBeCloseTo(8460, 2);
  });

  test("the personal allowance tapers above 100000", () => {
    expect(selfEmployed({ income: 110000, expenses: 0 }).personalAllowance).toBeCloseTo(7570, 2);
  });

  test("the writing down rate follows the tax year", () => {
    expect(selfEmployed({ poolBroughtForward: 10000 }, "2025-26").capitalAllowances.writingDownAllowance).toBeCloseTo(1800, 2);
    expect(selfEmployed({ poolBroughtForward: 10000 }, "2026-27").capitalAllowances.writingDownAllowance).toBeCloseTo(1400, 2);
  });

  test("equipment bought in the period claims the annual investment allowance in full", () => {
    expect(selfEmployed({ equipment: 20000 }).capitalAllowances.total).toBeCloseTo(20000, 2);
  });

  test("equipment over the annual investment allowance limit adds a message", () => {
    expect(selfEmployed({ equipment: 1500000 }).messages.join(" ")).toContain("£1,000,000");
  });

  test("12000 business miles allow 5000", () => {
    expect(selfEmployed({ miles: 12000 }, "2025-26").mileageAllowance).toBeCloseTo(5000, 2);
  });

  test("CIS deducted at the registered rate comes off the amount left to pay", () => {
    const r = selfEmployed({ cis: true, cisStatus: "registered", cisLabour: 30000 });
    expect(r.cisDeducted).toBeCloseTo(6000, 2);
    expect(r.leftToPay).toBeCloseTo(1131.8, 2);
  });

  test("gross payment status deducts nothing", () => {
    expect(selfEmployed({ cis: true, cisStatus: "gross", cisLabour: 30000 }).cisDeducted).toBe(0);
  });

  test("CIS labour over income adds a message", () => {
    expect(selfEmployed({ cis: true, cisLabour: 50000 }).messages.length).toBe(1);
  });
});

describe("VAT", () => {
  test("standard scheme takes output VAT less input VAT", () => {
    const vat = selfEmployed({ vatRegistered: true }).vat;
    expect(vat.outputVat).toBeCloseTo(9000, 2);
    expect(vat.inputVat).toBeCloseTo(1000, 2);
    expect(vat.vatDue).toBeCloseTo(8000, 2);
  });

  test("flat rate scheme charges the percentage of gross income", () => {
    const vat = selfEmployed({ vatRegistered: true, vatScheme: "flat-rate" }).vat;
    expect(vat.vatDue).toBeCloseTo(8910, 2);
    expect(vat.incomeForTax).toBeCloseTo(45090, 2);
    expect(vat.expensesForTax).toBeCloseTo(6000, 2);
  });

  test("income over the registration threshold adds a message naming it", () => {
    const r = selfEmployed({ income: 95000 });
    expect(r.vat.overThreshold).toBe(true);
    expect(r.messages.join(" ")).toContain("£90,000");
  });

  test("a registered business over the threshold adds no message", () => {
    expect(vatPosition({ ...baseInputs, income: 95000, vatRegistered: true }, VAT).overThreshold).toBe(false);
  });
});

describe("limited company calculator", () => {
  test("marginal relief applies between the limits", () => {
    const r = company({ income: 100000 });
    expect(r.corporationTax).toBeCloseTo(22750, 2);
    expect(r.marginalRelief).toBeCloseTo(2250, 2);
  });

  test("profit under the lower limit pays the small profits rate", () => {
    expect(company({ income: 40000 }).corporationTax).toBeCloseTo(7600, 2);
  });

  test("profit over the upper limit pays the main rate", () => {
    expect(company({ income: 300000 }).corporationTax).toBeCloseTo(75000, 2);
  });

  test("an associated company halves the limits", () => {
    expect(company({ income: 100000, associatedCompanies: 1 }).corporationTax).toBeCloseTo(24625, 2);
  });

  test("a period crossing 1 April splits into 90 and 275 days", () => {
    const r = company({ income: 100000, yearEnd: "2026-12-31" });
    expect(r.rows.map((row) => row.days)).toEqual([90, 275]);
    expect(r.rows.map((row) => row.year)).toEqual([2025, 2026]);
    expect(r.marginalRelief).toBeCloseTo(2250, 2);
  });

  test("a year end with no rates throws", () => {
    expect(() => company({ yearEnd: "2031-03-31" })).toThrow("No rates for financial year 2030");
  });

  test("the period runs twelve months to the year end", () => {
    const r = company({ income: 100000 });
    expect(r.periodStart.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(r.periodEnd.toISOString().slice(0, 10)).toBe("2027-03-31");
  });
});

describe("twelveMonthPeriodStart", () => {
  test.each([
    ["2027-03-31", "2026-04-01"],
    ["2028-02-29", "2027-03-01"],
    ["2026-12-31", "2026-01-01"],
  ])("year end %s starts %s", (yearEnd, expected) => {
    expect(
      twelveMonthPeriodStart(new Date(`${yearEnd}T00:00:00Z`))
        .toISOString()
        .slice(0, 10),
    ).toBe(expected);
  });
});
