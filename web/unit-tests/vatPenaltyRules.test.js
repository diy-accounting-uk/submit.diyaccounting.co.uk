// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { loadSources } from "../../scripts/tax-sources.mjs";
import {
  FREQUENCIES,
  PENALTY_POUNDS,
  POINTS_EXPIRE_MONTHS,
  addMonthsToPeriodEnd,
  assessLateReturns,
  returnDueDate,
  returnsInWindow,
} from "../public/lib/vat/penalty-rules.js";

const quoteOf = (name) => loadSources().find((source) => source.name === name).quote;

describe("VAT penalty rule table against the source files", () => {
  test("the thresholds are the ones in the threshold table", () => {
    const quote = quoteOf("vat-penalty-points-thresholds");
    expect(quote).toContain(
      `Annually ${FREQUENCIES.annual.threshold} Quarterly ${FREQUENCIES.quarterly.threshold} Monthly ${FREQUENCIES.monthly.threshold}`,
    );
  });

  test("the period of compliance and its returns are the ones in the compliance table", () => {
    const quote = quoteOf("vat-penalty-compliance-period");
    const { annual, quarterly, monthly } = FREQUENCIES;
    expect(quote).toContain(
      `Annual ${annual.complianceMonths} months ${annual.complianceReturns} Quarterly ${quarterly.complianceMonths} months ${quarterly.complianceReturns} Monthly ${monthly.complianceMonths} months ${monthly.complianceReturns}`,
    );
  });

  test("the penalty is the sum in the penalty quote, for the threshold and for each later late return", () => {
    const quote = quoteOf("vat-penalty-200");
    expect(quote).toContain(`£${PENALTY_POUNDS} penalty`);
    expect(quote).toContain(`further £${PENALTY_POUNDS} penalty for each subsequent late submission`);
  });

  test("the points expire after the months in the expiry quote", () => {
    expect(quoteOf("vat-penalty-points-expire")).toContain(`${POINTS_EXPIRE_MONTHS} months after this`);
    expect(quoteOf("vat-penalty-points-removal")).toContain(`previous ${POINTS_EXPIRE_MONTHS} months`);
  });

  test("the due date rule is the one in the due date quote", () => {
    expect(quoteOf("vat-return-due-date")).toContain("one calendar month and 7 days after the end of an accounting period");
  });
});

describe("VAT return due date", () => {
  test.each([
    ["2023-03-31", "2023-05-07"],
    ["2023-06-30", "2023-08-07"],
    ["2023-09-30", "2023-11-07"],
    ["2023-12-31", "2024-02-07"],
    ["2024-01-31", "2024-03-07"],
    ["2024-02-29", "2024-04-07"],
    ["2026-03-15", "2026-04-22"],
  ])("a period ending %s is due %s", (periodEnd, due) => {
    expect(returnDueDate(periodEnd)).toBe(due);
  });

  test("stepping back by months keeps the last day of a month", () => {
    expect(addMonthsToPeriodEnd("2024-05-31", -3)).toBe("2024-02-29");
    expect(addMonthsToPeriodEnd("2024-03-31", -1)).toBe("2024-02-29");
  });

  test("the returns in the window cover the expiry months for each frequency", () => {
    expect(returnsInWindow("2026-09-30", "annual")).toHaveLength(2);
    expect(returnsInWindow("2026-09-30", "quarterly")).toHaveLength(8);
    expect(returnsInWindow("2026-09-30", "monthly")).toHaveLength(24);
    expect(returnsInWindow("2026-09-30", "quarterly")[1].periodEnd).toBe("2026-06-30");
  });
});

describe("late returns", () => {
  test("points count up to the threshold and then stay there", () => {
    expect(assessLateReturns("quarterly", 3)).toMatchObject({ points: 3, penalties: 0, atThreshold: false });
    expect(assessLateReturns("quarterly", 4)).toMatchObject({ points: 4, penalties: 1, penaltyPounds: 200, atThreshold: true });
    expect(assessLateReturns("quarterly", 6)).toMatchObject({ points: 4, penalties: 3, penaltyPounds: 600 });
  });

  test("each frequency reaches its own threshold", () => {
    expect(assessLateReturns("annual", 2).penalties).toBe(1);
    expect(assessLateReturns("monthly", 4).penalties).toBe(0);
    expect(assessLateReturns("monthly", 5).penalties).toBe(1);
  });
});
