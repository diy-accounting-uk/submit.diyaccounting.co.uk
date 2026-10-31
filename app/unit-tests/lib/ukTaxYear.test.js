// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { taxYearOf } from "@app/lib/ukTaxYear.js";

describe("taxYearOf", () => {
  test("5 April and 6 April fall in different tax years", () => {
    expect(taxYearOf(new Date("2027-04-05T23:59:59.000Z"))).toBe("2026-27");
    expect(taxYearOf(new Date("2027-04-06T00:00:00.000Z"))).toBe("2027-28");
  });

  test("January belongs to the tax year that began the April before", () => {
    expect(taxYearOf(new Date("2027-01-15T00:00:00.000Z"))).toBe("2026-27");
  });

  test("the century rollover pads the short year", () => {
    expect(taxYearOf(new Date("2099-06-01T00:00:00.000Z"))).toBe("2099-00");
  });
});
