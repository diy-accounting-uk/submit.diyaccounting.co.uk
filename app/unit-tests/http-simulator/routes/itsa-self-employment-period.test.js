// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/itsa-self-employment-period.test.js

import { describe, test, expect } from "vitest";
import { findEmptyOptionalSections } from "@app/http-simulator/routes/itsa-self-employment-period.js";

describe("http-simulator/routes/itsa-self-employment-period", () => {
  describe("findEmptyOptionalSections", () => {
    test("returns no paths when periodIncome, periodExpenses and periodDisallowableExpenses are all populated", () => {
      const body = {
        periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
        periodIncome: { turnover: 1000, other: 0 },
        periodExpenses: { costOfGoods: 100, otherExpenses: 0 },
        periodDisallowableExpenses: { costOfGoodsDisallowable: 10 },
      };
      expect(findEmptyOptionalSections(body)).toEqual([]);
    });

    test("returns no paths when an optional section is omitted entirely", () => {
      const body = {
        periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
        periodIncome: { turnover: 1000, other: 0 },
        periodExpenses: { costOfGoods: 100, otherExpenses: 0 },
      };
      expect(findEmptyOptionalSections(body)).toEqual([]);
    });

    test("flags periodDisallowableExpenses submitted as an empty object", () => {
      const body = {
        periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
        periodIncome: { turnover: 1000, other: 0 },
        periodExpenses: { costOfGoods: 100, otherExpenses: 0 },
        periodDisallowableExpenses: {},
      };
      expect(findEmptyOptionalSections(body)).toEqual(["/periodDisallowableExpenses"]);
    });

    test("flags every optional section submitted as an empty object", () => {
      const body = {
        periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
        periodIncome: {},
        periodExpenses: {},
        periodDisallowableExpenses: {},
      };
      expect(findEmptyOptionalSections(body)).toEqual(["/periodIncome", "/periodExpenses", "/periodDisallowableExpenses"]);
    });
  });
});
