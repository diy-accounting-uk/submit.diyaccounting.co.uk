// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/ct600-box-text.test.js

import { describe, test, expect } from "vitest";
import { ct600BoxText } from "../public/lib/filing-record.js";

describe("a CT600 box's value as the review and the filed copy show it", () => {
  test("an indicator box filed as yes reads Yes", () => {
    expect(ct600BoxText(50, "yes")).toBe("Yes");
    expect(ct600BoxText(85, "yes")).toBe("Yes");
    expect(ct600BoxText(329, "yes")).toBe("Yes");
  });

  test("an amount box has no text, so the record shows it as a figure", () => {
    expect(ct600BoxText(440, 19273.46)).toBeNull();
  });
});
