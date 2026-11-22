// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/approvalDateCheck.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import {
  APPROVAL_DATE_AFTER_TODAY_MESSAGE,
  approvalDateAfterTodayMessage,
  isApprovedAfterToday,
  todayInLondon,
} from "../public/lib/approval-date-check.js";

describe("an approval date after today", () => {
  test("today is the UK date: late on a summer evening in UTC it is already tomorrow in London", () => {
    expect(todayInLondon(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(todayInLondon(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });

  test("a date after today is refused and today is not", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    expect(isApprovedAfterToday("2026-11-23", now)).toBe(true);
    expect(isApprovedAfterToday("2026-11-22", now)).toBe(false);
    expect(isApprovedAfterToday("2026-01-15", now)).toBe(false);
  });

  test("the message names the date", () => {
    expect(approvalDateAfterTodayMessage("2026-11-23")).toBe(
      "The date approved, 2026-11-23, is after today. Enter the date the directors approved the accounts.",
    );
  });

  test("the page shows the route's words", () => {
    const page = fs.readFileSync("web/public/companies-house/fileMicroEntityAccounts.page.js", "utf8");
    expect(page).toContain(JSON.stringify(APPROVAL_DATE_AFTER_TODAY_MESSAGE));
  });
});
