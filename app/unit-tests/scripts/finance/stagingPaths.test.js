// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/finance/stagingPaths.test.js

import { describe, test, expect } from "vitest";

import { resolveYearEnd } from "../../../../scripts/finance/lib/staging-paths.js";

describe("resolveYearEnd", () => {
  test("March belongs to the year-end closing that March", () => {
    expect(resolveYearEnd(new Date(Date.UTC(2026, 2, 31)))).toBe("2025-2026");
  });

  test("January belongs to the year-end closing that March", () => {
    expect(resolveYearEnd(new Date(Date.UTC(2026, 0, 15)))).toBe("2025-2026");
  });

  test("April belongs to the year-end that opens that April", () => {
    expect(resolveYearEnd(new Date(Date.UTC(2026, 3, 1)))).toBe("2026-2027");
  });

  test("December belongs to the year-end that opens the same year's April", () => {
    expect(resolveYearEnd(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-2027");
  });
});
