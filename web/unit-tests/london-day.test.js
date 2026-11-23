// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/london-day.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("the first and last instant of a UK day", () => {
  let londonDay;
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/london-day.js");
    londonDay = window.londonDay;
  });

  it.each([
    ["2027-06-15", "2027-06-14T23:00:00.000Z", "2027-06-15T22:59:59.999Z"],
    ["2026-12-31", "2026-12-31T00:00:00.000Z", "2026-12-31T23:59:59.999Z"],
    ["2027-03-28", "2027-03-28T00:00:00.000Z", "2027-03-28T22:59:59.999Z"],
    ["2027-10-31", "2027-10-30T23:00:00.000Z", "2027-10-31T23:59:59.999Z"],
  ])("a day %s starts at %s and ends at %s", (day, start, end) => {
    expect(londonDay.startOfLondonDay(day)).toBe(start);
    expect(londonDay.endOfLondonDay(day)).toBe(end);
  });

  it("ends a summer day on the same date in London", () => {
    const end = new Date(londonDay.endOfLondonDay("2027-05-22"));
    expect(end.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" })).toBe(
      "22 May 2027",
    );
  });
});
