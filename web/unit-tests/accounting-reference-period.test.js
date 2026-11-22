// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  latestEndWithinEighteenMonths,
  longerThanEighteenMonths,
  accountsDueNineMonthsAfter,
} from "../public/lib/accounting-reference-period.js";

describe("accounting-reference-period", () => {
  test("a period that starts on the first of a month can end 18 months on, on the last day of the month before", () => {
    expect(latestEndWithinEighteenMonths("2098-05-01")).toBe("2099-10-31");
    expect(latestEndWithinEighteenMonths("2025-09-01")).toBe("2027-02-28");
    expect(latestEndWithinEighteenMonths("2026-09-01")).toBe("2028-02-29");
  });

  test("a period that starts mid-month ends the day before the same day 18 months on", () => {
    expect(latestEndWithinEighteenMonths("2026-04-16")).toBe("2027-10-15");
    expect(latestEndWithinEighteenMonths("2025-08-31")).toBe("2027-02-27");
  });

  test("the last day within 18 months is allowed and the next day is too long", () => {
    expect(longerThanEighteenMonths("2098-05-01", "2099-10-31")).toBe(false);
    expect(longerThanEighteenMonths("2098-05-01", "2099-11-01")).toBe(true);
    expect(longerThanEighteenMonths("2098-05-01", "2099-03-31")).toBe(false);
  });

  test("accounts fall due nine months after the period's end, on the month's last day where it has no such day", () => {
    expect(accountsDueNineMonthsAfter("2099-03-31")).toBe("2099-12-31");
    expect(accountsDueNineMonthsAfter("2099-05-31")).toBe("2100-02-28");
    expect(accountsDueNineMonthsAfter("2099-09-30")).toBe("2100-06-30");
  });
});
