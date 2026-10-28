// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companies-house-labels.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("companies-house-labels", () => {
  let labels;
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/companies-house-labels.js");
    labels = window.companiesHouseLabels;
  });

  it("writes an ISO date as a long en-GB date", () => {
    expect(labels.formatCompanyDate("2026-03-05")).toBe("5 March 2026");
    expect(labels.formatCompanyDate("2019-12-31")).toBe("31 December 2019");
  });

  it("returns an empty string for a missing date and the input for an unreadable one", () => {
    expect(labels.formatCompanyDate(undefined)).toBe("");
    expect(labels.formatCompanyDate("")).toBe("");
    expect(labels.formatCompanyDate("soon")).toBe("soon");
  });

  it("maps status, type and jurisdiction to words", () => {
    expect(labels.companyStatusLabel("active")).toBe("Active");
    expect(labels.companyTypeLabel("ltd")).toBe("Private limited company");
    expect(labels.jurisdictionLabel("england-wales")).toBe("England and Wales");
  });

  it("falls back to a spaced, capitalised slug for an unmapped value", () => {
    expect(labels.companyStatusLabel("some-new-state")).toBe("Some new state");
    expect(labels.companyStatusLabel(undefined)).toBe("");
  });

  it("puts the SIC text after the code and keeps an unknown code on its own", () => {
    expect(labels.formatSicCode("62012")).toBe("62012 - Business and domestic software development");
    expect(labels.formatSicCode("12345")).toBe("12345");
    expect(labels.formatSicCodes(["69201", "69202"])).toBe("69201 - Accounting and auditing activities; 69202 - Bookkeeping activities");
    expect(labels.formatSicCodes(undefined)).toBe("");
  });
});
