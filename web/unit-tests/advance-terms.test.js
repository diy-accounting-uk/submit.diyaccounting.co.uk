// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/advance-terms.test.js

import { describe, test, expect } from "vitest";
import { DEFAULT_ADVANCE_TERMS, SECTION_413_URL, anyAdvanceAbove0, followedTerms } from "../public/lib/advance-terms.js";

describe("advance-terms", () => {
  test("the default names the interest, the security and the repayment", () => {
    expect(DEFAULT_ADVANCE_TERMS).toBe("Interest free if repaid within 12 months of the year end; unsecured; repayable on demand.");
    expect(SECTION_413_URL).toBe("https://www.legislation.gov.uk/ukpga/2006/46/section/413");
  });

  test("an amount above 0 in any of the advance's boxes counts, in the forms the boxes take", () => {
    expect(anyAdvanceAbove0(["", "0", undefined])).toBe(false);
    expect(anyAdvanceAbove0(["", "1,200", ""])).toBe(true);
    expect(anyAdvanceAbove0(["£600", "", ""])).toBe(true);
    expect(anyAdvanceAbove0(["", "", "-5"])).toBe(false);
    expect(anyAdvanceAbove0(["lots", "", ""])).toBe(false);
  });

  test("an empty field takes the default while an amount is above 0", () => {
    expect(followedTerms({ terms: "", amounts: ["", "500", ""], typed: false })).toBe(DEFAULT_ADVANCE_TERMS);
    expect(followedTerms({ terms: "  ", amounts: ["100", "", ""], typed: false })).toBe(DEFAULT_ADVANCE_TERMS);
  });

  test("the default clears when every amount is 0 again", () => {
    expect(followedTerms({ terms: DEFAULT_ADVANCE_TERMS, amounts: ["0", "", "0"], typed: false })).toBe("");
  });

  test("terms from a book, a file or a filing stay, with amounts or without", () => {
    expect(followedTerms({ terms: "4% a year, repaid in March", amounts: ["", "500", ""], typed: false })).toBeNull();
    expect(followedTerms({ terms: "4% a year, repaid in March", amounts: ["", "0", ""], typed: false })).toBeNull();
  });

  test("a field the person has typed in is left alone, even when empty or holding the default", () => {
    expect(followedTerms({ terms: "", amounts: ["", "500", ""], typed: true })).toBeNull();
    expect(followedTerms({ terms: DEFAULT_ADVANCE_TERMS, amounts: ["", "0", ""], typed: true })).toBeNull();
  });

  test("an empty field with no amount stays empty", () => {
    expect(followedTerms({ terms: "", amounts: ["", "", ""], typed: false })).toBeNull();
  });
});
