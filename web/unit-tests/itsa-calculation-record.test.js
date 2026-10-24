// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/itsa-calculation-record.test.js

import { describe, test, expect } from "vitest";
import {
  businessLabel,
  calculationCopyHtml,
  calculationTypeLabel,
  declarationCopyHtml,
  formatLongDate,
  formatNino,
  formatTimestamp,
} from "../public/lib/itsa-calculation-record.js";

const NEVER_PRINTED = /undefined|null|NaN|\[object|Invalid Date|\(\)/;

describe("formatLongDate", () => {
  test("reads a date and the date of a timestamp", () => {
    expect(formatLongDate("2025-04-05")).toBe("5 April 2025");
    expect(formatLongDate("2025-04-05T23:00:00Z")).toBe("5 April 2025");
  });
  test.each([undefined, null, 5, "", "soon", "2025-13-01", "2025-00-10", "2025-04-45"])("returns null for %s", (value) => {
    expect(formatLongDate(value)).toBeNull();
  });
});

describe("formatTimestamp", () => {
  test("prints UK time, in summer and in winter", () => {
    expect(formatTimestamp("2026-10-24T13:03:44.000Z")).toBe("24 October 2026 at 14:03");
    expect(formatTimestamp("2026-12-01T09:05:00Z")).toBe("1 December 2026 at 09:05");
  });
  test.each([undefined, null, "", "2026-10-24", "not a timestamp", "2026-99-99T00:00:00Z"])("returns null for %s", (value) => {
    expect(formatTimestamp(value)).toBeNull();
  });
});

describe("labels", () => {
  test("a National Insurance number prints in groups, or as given, or not at all", () => {
    expect(formatNino("ab123456c")).toBe("AB 12 34 56 C");
    expect(formatNino("QQ ODD")).toBe("QQ ODD");
    expect(formatNino("")).toBeNull();
    expect(formatNino(undefined)).toBeNull();
  });
  test("a calculation type prints in words", () => {
    expect(calculationTypeLabel("intent-to-finalise")).toBe("Intent to finalise");
    expect(calculationTypeLabel("new-hmrc-type")).toBe("New hmrc type");
    expect(calculationTypeLabel(undefined)).toBeNull();
  });
  test("a business prints by name, then kind, with its id only when HMRC gave one", () => {
    expect(businessLabel({ incomeSourceName: "Joinery", incomeSourceId: "X1" })).toBe("Joinery (X1)");
    expect(businessLabel({ incomeSourceType: "uk-property", incomeSourceId: "X2" })).toBe("UK property (X2)");
    expect(businessLabel({ incomeSourceType: "self-employment" })).toBe("Self-employment");
    expect(businessLabel({})).toBe("Business");
    expect(businessLabel(null)).toBe("Business");
  });
});

describe("calculationCopyHtml", () => {
  const rows = [
    { field: "a", label: "Income Tax", value: 6200.12, kind: "money", valueId: "incomeTaxAmount" },
    { field: "b", label: "National Insurance", value: undefined, kind: "money" },
  ];

  test("prints HMRC's figures, id, period and timestamp", () => {
    const html = calculationCopyHtml({
      calculation: {
        metadata: {
          calculationId: "abc-123",
          calculationTimestamp: "2026-10-24T13:03:44Z",
          periodFrom: "2025-04-06",
          periodTo: "2026-04-05",
        },
        calculation: { taxCalculation: { totalIncomeTaxAndNicsDue: 7654.32 } },
      },
      nino: "AB123456C",
      taxYear: "2025-26",
      calculationType: "in-year",
      breakdownRows: rows,
      allowanceRows: [{ field: "p", label: "Personal Allowance", value: 12570, kind: "money" }],
    });
    expect(html).toContain('<span id="totalIncomeTaxAndNicsDue">7,654.32</span>');
    expect(html).toContain('<span id="incomeTaxAmount">6,200.12</span>');
    expect(html).toContain("abc-123");
    expect(html).toContain("6 April 2025 to 5 April 2026");
    expect(html).toContain("24 October 2026 at 14:03");
    expect(html).toContain("AB 12 34 56 C");
    expect(html).toContain("Estimate calculated by HMRC");
    expect(html).not.toMatch(NEVER_PRINTED);
  });

  test.each([undefined, null, {}, { metadata: null, calculation: null }, { metadata: "x", calculation: [] }])(
    "prints only dashes and plain words for a calculation of %j",
    (calculation) => {
      const html = calculationCopyHtml({ calculation, breakdownRows: rows, allowanceRows: [] });
      expect(html).not.toMatch(NEVER_PRINTED);
      expect(html).toContain("Not given by HMRC");
      expect(html).toContain("HMRC's calculation carries no allowances or deductions.");
      expect(html).not.toContain("Your businesses");
    },
  );

  test("puts one column in the business table for each business, skipping entries that are not objects", () => {
    const html = calculationCopyHtml({
      calculation: {
        calculation: { businessProfitAndLoss: [null, "x", { incomeSourceId: "X1", taxableProfit: -5 }, { taxableProfit: 10 }] },
      },
      breakdownRows: [],
      allowanceRows: [],
    });
    expect(html).toContain("Business (X1)</th>");
    expect(html).toContain("(5.00)");
    expect(html.match(/<th class="figure">Business/g) || []).toHaveLength(2);
    expect(html).not.toMatch(NEVER_PRINTED);
  });

  test("escapes HMRC text that reaches the page", () => {
    const html = calculationCopyHtml({
      calculation: { calculation: { businessProfitAndLoss: [{ incomeSourceName: "<img src=x>", taxableProfit: 1 }] } },
      nino: "<b>",
      breakdownRows: [],
      allowanceRows: [],
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
  });
});

describe("declarationCopyHtml", () => {
  test("shows the total, calculation id and the declaration time, accepted", () => {
    const html = declarationCopyHtml({
      calculation: {
        metadata: { calculationTimestamp: "2026-10-24T13:03:44Z" },
        calculation: { taxCalculation: { totalIncomeTaxAndNicsDue: 100 } },
      },
      nino: "AB123456C",
      taxYear: "2025-26",
      calculationId: "calc-1",
      filedAt: "2026-10-24T13:20:05.123Z",
      breakdownRows: [{ field: "a", label: "Income Tax", value: 90, kind: "money" }],
    });
    expect(html).toContain("Accepted by HMRC");
    expect(html).toContain("calc-1");
    expect(html).toContain("24 October 2026 at 14:20");
    expect(html).toContain("Based on the calculation HMRC made on 24 October 2026 at 14:03");
    expect(html).toContain('<span id="declaredTotalDue">100.00</span>');
    expect(html).toContain("How the total is made up");
    expect(html).not.toMatch(NEVER_PRINTED);
  });

  test("leaves out the breakdown when the page no longer holds the calculation, and a time it was not given", () => {
    const html = declarationCopyHtml({
      calculation: { calculation: { taxCalculation: { totalIncomeTaxAndNicsDue: 100 } } },
      calculationId: "calc-1",
      filedAt: "garbage",
      breakdownRows: [{ field: "a", label: "Income Tax", value: undefined, kind: "money" }],
    });
    expect(html).not.toContain("How the total is made up");
    expect(html).toContain("Not recorded");
    expect(html).not.toMatch(NEVER_PRINTED);
  });
});
