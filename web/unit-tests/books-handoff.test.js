// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/books-handoff.test.js
// Figures a DIYA-GL page sends in the URL fragment: reading the fragment and validating what it carries.

import { describe, it, expect, beforeAll } from "vitest";

function toFragment(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return "#books=" + Buffer.from(text, "utf8").toString("base64url");
}

const vatHandoff = () => ({
  kind: "vat",
  sourceFileName: "brickwork.diya-gl.zip",
  packageVersion: "1.2.44",
  period: { periodStart: "2026-01-01", periodEnd: "2026-03-31" },
  figures: {
    vatDueSales: 5760,
    vatDueAcquisitions: 0,
    vatReclaimedCurrPeriod: 2679,
    totalValueSalesExVAT: 28800,
    totalValuePurchasesExVAT: 13395,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
  },
});

const quarterlyHandoff = () => ({
  kind: "itsa-quarterly",
  sourceFileName: "brickwork-se.diya-gl.zip",
  packageVersion: "1.2.44",
  period: { taxYear: "2025-26", periodStartDate: "2025-04-06", periodEndDate: "2025-07-05" },
  figures: {
    periodIncome: { turnover: 28050, other: 0 },
    periodExpenses: { costOfGoods: 6825, adminCosts: 360, otherExpenses: 1800 },
    periodDisallowableExpenses: { depreciationDisallowable: 300 },
  },
});

describe("books fragment", () => {
  let readBooksFragment;

  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/auth-url-builder.js");
    readBooksFragment = window.authUrlBuilder.readBooksFragment;
  });

  it("decodes the base64url JSON after #books=", () => {
    expect(JSON.parse(readBooksFragment(toFragment(vatHandoff())).text)).toEqual(vatHandoff());
  });

  it("decodes multi-byte text", () => {
    expect(readBooksFragment(toFragment("£ café")).text).toBe("£ café");
  });

  it("returns null for a hash that is not a books fragment", () => {
    expect(readBooksFragment("")).toBeNull();
    expect(readBooksFragment("#section")).toBeNull();
  });

  it("reports a fragment that is empty, has foreign characters or is not UTF-8", () => {
    expect(readBooksFragment("#books=").problem).toMatch(/expected form/);
    expect(readBooksFragment("#books=ab cd").problem).toMatch(/expected form/);
    expect(readBooksFragment("#books=" + Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url")).problem).toMatch(/decoded/);
  });

  it("reports a fragment longer than the limit", () => {
    expect(readBooksFragment("#books=" + "A".repeat(40000)).problem).toMatch(/expected form/);
  });
});

describe("books handoff validation", () => {
  let parseHandoff;

  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/self-employment-expenses.js");
    await import("../public/widgets/books-import.js");
    parseHandoff = window.booksImport.parseHandoff;
  });

  const parse = (value) => parseHandoff(typeof value === "string" ? value : JSON.stringify(value));

  it("accepts a VAT handoff and keeps its figures", () => {
    const handoff = parse(vatHandoff());
    expect(handoff.kind).toBe("vat");
    expect(handoff.period).toEqual({ periodStart: "2026-01-01", periodEnd: "2026-03-31" });
    expect(handoff.figures.vatDueSales).toBe(5760);
    expect(handoff.sourceFileName).toBe("brickwork.diya-gl.zip");
  });

  it("accepts a quarterly handoff", () => {
    const handoff = parse(quarterlyHandoff());
    expect(handoff.figures.periodExpenses.adminCosts).toBe(360);
    expect(handoff.figures.periodDisallowableExpenses).toEqual({ depreciationDisallowable: 300 });
  });

  it("accepts an annual handoff", () => {
    const handoff = parse({
      kind: "itsa-annual",
      sourceFileName: "b.zip",
      packageVersion: "1.2.44",
      period: { taxYear: "2025-26" },
      figures: { allowances: { annualInvestmentAllowance: 12000 }, adjustments: {} },
    });
    expect(handoff.figures.allowances.annualInvestmentAllowance).toBe(12000);
  });

  it("refuses text that is not JSON and JSON that is not an object", () => {
    expect(() => parse("not json")).toThrow(/not JSON/);
    expect(() => parse("[1]")).toThrow(/not an object/);
  });

  it("refuses an unknown kind", () => {
    expect(() => parse({ ...vatHandoff(), kind: "corporation-tax" })).toThrow(/not one this site fills/);
  });

  it("refuses a figure that is not a number", () => {
    const handoff = vatHandoff();
    handoff.figures.vatDueSales = "5760";
    expect(() => parse(handoff)).toThrow(/vatDueSales is not a number/);
  });

  it("refuses a figure name the form does not have", () => {
    const handoff = vatHandoff();
    handoff.figures.innerHTML = 1;
    expect(() => parse(handoff)).toThrow(/does not have/);
  });

  it("refuses a VAT handoff missing a box", () => {
    const handoff = vatHandoff();
    delete handoff.figures.totalAcquisitionsExVAT;
    expect(() => parse(handoff)).toThrow(/no totalAcquisitionsExVAT/);
  });

  it("refuses a date and a tax year in the wrong form", () => {
    const vat = vatHandoff();
    vat.period.periodEnd = "31/03/2026";
    expect(() => parse(vat)).toThrow(/period end is not a date/);
    const quarterly = quarterlyHandoff();
    quarterly.period.taxYear = "2025";
    expect(() => parse(quarterly)).toThrow(/tax year/);
  });

  it("refuses an expense name that is not a self-employment expense", () => {
    const handoff = quarterlyHandoff();
    handoff.figures.periodExpenses.consolidatedExpenses = 5;
    expect(() => parse(handoff)).toThrow(/consolidatedExpenses/);
  });

  it("refuses a missing source file name", () => {
    const handoff = vatHandoff();
    delete handoff.sourceFileName;
    expect(() => parse(handoff)).toThrow(/source file name/);
  });
});
