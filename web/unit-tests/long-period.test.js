// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/long-period.test.js

import { describe, test, expect } from "vitest";
import {
  addDays as serverAddDays,
  addMonths as serverAddMonths,
  lastDayOfTwelveMonths as serverLastDay,
} from "@app/services/ct600Figures.js";
import { accountingPeriodsOf } from "@app/services/ct600LongPeriod.js";
import {
  accountingPeriodDates,
  addDays,
  addMonths,
  lastDayOfTwelveMonths,
  longDateText,
  returnDueDate,
  taxDueDate,
} from "../public/lib/long-period.js";

const STARTS = ["2025-01-01", "2024-02-29", "2025-03-31", "2025-04-01", "2023-12-15", "2025-08-31", "2020-02-29"];
const END_OFFSETS = [0, 100, 364, 365, 366, 400, 455, 540, 546, 547, 600];

describe("the dates of a long period of account agree with the server's", () => {
  test.each(STARTS)("the first twelve months from %s end on the same day", (start) => {
    expect(lastDayOfTwelveMonths(start)).toBe(serverLastDay(start));
  });

  test.each(STARTS)("the two accounting periods from %s are the server's", (start) => {
    for (const offset of END_OFFSETS) {
      const end = serverAddDays(start, offset);
      let expected;
      try {
        expected = accountingPeriodsOf(start, end);
      } catch {
        expected = "refused";
      }
      const actual = accountingPeriodDates(start, end);
      if (expected === "refused") {
        expect(actual?.tooLong, `${start} to ${end}`).toBe(true);
      } else if (expected.length === 1) {
        expect(actual, `${start} to ${end}`).toBeUndefined();
      } else {
        expect(actual.tooLong, `${start} to ${end}`).toBe(false);
        expect(
          actual.periods.map(({ periodStart, periodEnd }) => ({ periodStart, periodEnd })),
          `${start} to ${end}`,
        ).toEqual(expected);
      }
    }
  });

  test("addDays and addMonths match the server across month ends", () => {
    for (const date of ["2025-01-31", "2025-12-31", "2024-02-29", "2026-03-31", "2025-08-31"]) {
      for (const months of [1, 9, 12]) expect(addMonths(date, months)).toBe(serverAddMonths(date, months));
      expect(addDays(date, 1)).toBe(serverAddDays(date, 1));
    }
  });
});

describe("the due dates", () => {
  test("tax is due the day after nine months from the end of each accounting period", () => {
    expect(taxDueDate("2025-12-31")).toBe("2026-10-01");
    expect(taxDueDate("2026-03-31")).toBe("2027-01-01");
    expect(taxDueDate("2025-12-15")).toBe("2026-09-16");
  });

  test("both returns are due 12 months after the period of account ends", () => {
    expect(returnDueDate("2026-03-31")).toBe("2027-03-31");
  });
});

describe("the period's days and a date as a person reads it", () => {
  test("a 15 month period has 455 days, 365 and 90 in its two accounting periods", () => {
    const { periods, days } = accountingPeriodDates("2025-01-01", "2026-03-31");
    expect([days, ...periods.map((period) => period.days)]).toEqual([455, 365, 90]);
  });

  test("a date reads as day, month and year", () => {
    expect(longDateText("2025-12-31")).toBe("31 December 2025");
  });
});
