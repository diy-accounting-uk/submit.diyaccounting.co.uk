// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it } from "vitest";
import { isLateReturn, returnDueDate } from "../public/lib/allotment-dates.js";

describe("the date a return of allotment is due", () => {
  it("is the same day of the next month", () => {
    expect(returnDueDate("2026-11-02")).toBe("2026-12-02");
    expect(returnDueDate("2026-12-15")).toBe("2027-01-15");
  });

  it("is the next month's last day when it has no such day", () => {
    expect(returnDueDate("2026-01-31")).toBe("2026-02-28");
    expect(returnDueDate("2028-01-30")).toBe("2028-02-29");
    expect(returnDueDate("2026-03-31")).toBe("2026-04-30");
  });

  it("makes a return late only after its due date", () => {
    expect(isLateReturn("2026-10-20", "2026-11-20")).toBe(false);
    expect(isLateReturn("2026-10-20", "2026-11-21")).toBe(true);
    expect(isLateReturn("2026-01-31", "2026-02-28")).toBe(false);
    expect(isLateReturn("2026-01-31", "2026-03-01")).toBe(true);
  });
});
