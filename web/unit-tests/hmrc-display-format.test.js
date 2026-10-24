// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/hmrc-display-format.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("hmrc-display-format", () => {
  let format;

  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/money-format.js");
    await import("../public/lib/hmrc-display-format.js");
    format = window.HmrcDisplayFormat;
  });

  it("shows a dash for a date that is missing or unreadable", () => {
    for (const value of [undefined, null, "", "not a date", "2026-13-45"]) {
      expect(format.formatDate(value)).toBe("—");
    }
  });

  it("shows a date-only string as the same calendar day in any time zone", () => {
    expect(format.formatDate("2026-07-01")).toBe("1 Jul 2026");
    expect(format.formatDate("2026-08-31")).toBe("31 Aug 2026");
  });

  it("shows a date range only when both ends are readable", () => {
    expect(format.formatDateRange("2026-07-01", "2026-08-31")).toBe("1 Jul 2026 to 31 Aug 2026");
    expect(format.formatDateRange("2026-07-01", undefined)).toBe("—");
    expect(format.formatDateRange("junk", "2026-08-31")).toBe("—");
  });

  it("shows a date and time, or a dash when the timestamp is unreadable", () => {
    expect(format.formatDateTime("2026-09-30T10:15:00.000Z")).toMatch(/^30 September 2026 at \d{2}:\d{2}$/);
    expect(format.formatDateTime("2026-09-30T99:99:00.000Z")).toBe("—");
    expect(format.formatDateTime(undefined)).toBe("—");
  });

  it("formats amounts in pounds, and shows a dash for anything that is not a number", () => {
    expect(format.formatAmount(1234.5)).toBe("£1,234.50");
    expect(format.formatAmount("900.5")).toBe("£900.50");
    expect(format.formatAmount(0)).toBe("£0.00");
    expect(format.formatWholeAmount(5000)).toBe("£5,000");
    for (const value of [undefined, null, "", "abc", NaN, Infinity, true, {}]) {
      expect(format.formatAmount(value)).toBe("—");
      expect(format.formatWholeAmount(value)).toBe("—");
    }
  });

  it("shows a dash for text that is missing or blank", () => {
    expect(format.formatText(undefined)).toBe("—");
    expect(format.formatText(null)).toBe("—");
    expect(format.formatText("  ")).toBe("—");
    expect(format.formatText(" VAT ")).toBe("VAT");
    expect(format.sentenceCase("posted")).toBe("Posted");
    expect(format.sentenceCase(undefined)).toBe("—");
  });
});
