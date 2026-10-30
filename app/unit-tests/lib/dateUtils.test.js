// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";

import { calculateTtl, calculateHmrcTaxRecordTtl, recentPullDays } from "@app/lib/dateUtils.js";

// 2026-10-25 01:00 UTC is when Europe/London goes from BST to GMT. This base is half an hour
// before that change in local wall-clock time on the same day.
const BASE_BEFORE_CLOCK_CHANGE = new Date("2026-10-24T23:30:00.000Z");

describe("calculateTtl", () => {
  test("a seven-day offset across a Europe/London clock change is exactly 7 times 86400 seconds", () => {
    const baseSeconds = Math.floor(BASE_BEFORE_CLOCK_CHANGE.getTime() / 1000);

    const { ttl } = calculateTtl(BASE_BEFORE_CLOCK_CHANGE, { days: 7 });

    expect(ttl - baseSeconds).toBe(7 * 86400);
  });

  test("an hour offset across a Europe/London clock change is exactly 3600 seconds per hour", () => {
    const baseSeconds = Math.floor(BASE_BEFORE_CLOCK_CHANGE.getTime() / 1000);

    const { ttl } = calculateTtl(BASE_BEFORE_CLOCK_CHANGE, { hours: 2 });

    expect(ttl - baseSeconds).toBe(2 * 3600);
  });

  test("ttl_datestamp is the UTC ISO form of the same epoch second as ttl", () => {
    const { ttl, ttl_datestamp } = calculateTtl(BASE_BEFORE_CLOCK_CHANGE, { days: 7 });

    expect(ttl_datestamp).toBe(new Date(ttl * 1000).toISOString());
  });

  test("the HMRC tax record preset adds 2555 days in seconds", () => {
    const baseSeconds = Math.floor(BASE_BEFORE_CLOCK_CHANGE.getTime() / 1000);

    const { ttl } = calculateHmrcTaxRecordTtl(BASE_BEFORE_CLOCK_CHANGE);

    expect(ttl - baseSeconds).toBe(2555 * 86400);
  });
});

describe("recentPullDays", () => {
  test("is yesterday then today, in UTC", () => {
    expect(recentPullDays(new Date("2026-03-01T00:30:00Z"))).toEqual(["2026-02-28", "2026-03-01"]);
  });

  test("a late-evening UTC time is still that UTC day", () => {
    expect(recentPullDays(new Date("2026-10-24T23:59:00Z"))).toEqual(["2026-10-23", "2026-10-24"]);
  });
});
