// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/firstAccounts.test.js

import { describe, test, expect } from "vitest";
import { isFirstAccountsPeriod, comparativesFinding, marksFirstAccounts } from "../public/lib/first-accounts.js";

describe("when small company accounts may leave out the prior year", () => {
  test("a period that starts on the day of incorporation, with no accounts on the register, is the first", () => {
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-04-01" }, "2025-04-01")).toBe(true);
  });

  test("the revision of first accounts is still the first: the register's last accounts are these", () => {
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-04-01", accountsLastPeriodStart: "2025-04-01" }, "2025-04-01")).toBe(true);
  });

  test("a period after accounts on the register, or not starting on the day of incorporation, is not the first", () => {
    expect(isFirstAccountsPeriod({ dateOfCreation: "2024-04-01", accountsLastPeriodStart: "2024-04-01" }, "2025-04-01")).toBe(false);
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-03-15" }, "2025-04-01")).toBe(false);
    expect(isFirstAccountsPeriod({}, "2025-04-01")).toBe(false);
    expect(isFirstAccountsPeriod({ dateOfCreation: "2025-04-01" }, "")).toBe(false);
  });

  test("accounts that are not the first need the prior year, and first accounts start on incorporation and have none", () => {
    expect(comparativesFinding({ periodStart: "2025-04-01", hasPriorYear: true })).toBeNull();
    expect(comparativesFinding({ periodStart: "2025-04-01", hasPriorYear: false })).toBe("prior-year-required");
    expect(comparativesFinding({ periodStart: "2025-04-01", dateOfIncorporation: "2025-04-01", hasPriorYear: false })).toBeNull();
    expect(comparativesFinding({ periodStart: "2025-04-01", dateOfIncorporation: "2025-03-01", hasPriorYear: false })).toBe(
      "first-accounts-start-on-incorporation",
    );
    expect(comparativesFinding({ periodStart: "2025-04-01", dateOfIncorporation: "2025-04-01", hasPriorYear: true })).toBe(
      "first-accounts-have-no-prior-year",
    );
  });

  test("a filed document marks first accounts by a date of incorporation that reads as the period's start date", () => {
    const start =
      '<ix:nonNumeric name="bus:StartDateForPeriodCoveredByReport" contextRef="p2026" format="ixt2:datedaymonthyearen">1 July 2025</ix:nonNumeric>';
    const incorporated = (date) =>
      `<ix:nonNumeric name="bus:DateFormationOrIncorporation" contextRef="p2026" format="ixt2:datedaymonthyearen">${date}</ix:nonNumeric>`;
    expect(marksFirstAccounts(`${start}${incorporated("1 July 2025")}`)).toBe(true);
    expect(marksFirstAccounts(`${start}${incorporated("1 June 2025")}`)).toBe(false);
    expect(marksFirstAccounts(start)).toBe(false);
  });
});
