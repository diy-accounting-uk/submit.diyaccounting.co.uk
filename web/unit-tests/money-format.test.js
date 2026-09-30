// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/money-format.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("money-format", () => {
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/money-format.js");
  });

  it("separates thousands and keeps two decimals", () => {
    expect(window.formatGbp(463872)).toBe("£463,872.00");
    expect(window.formatGbp(1000)).toBe("£1,000.00");
    expect(window.formatGbp("900.5")).toBe("£900.50");
    expect(window.formatGbp(0)).toBe("£0.00");
  });

  it("puts the minus sign before the pound sign", () => {
    expect(window.formatGbp(-1234.5)).toBe("-£1,234.50");
    expect(window.formatGbpWhole(-1234.4)).toBe("-£1,234");
  });

  it("formats whole pounds without decimals", () => {
    expect(window.formatGbpWhole(5000)).toBe("£5,000");
    expect(window.formatGbpWhole(0)).toBe("£0");
    expect(window.formatGbpWhole(1234567.6)).toBe("£1,234,568");
  });
});
