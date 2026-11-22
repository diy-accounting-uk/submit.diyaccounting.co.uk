// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/balanceSheetCheck.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import {
  CAPITAL_AND_RESERVES_MESSAGE,
  YEAR_NAMES,
  capitalAndReservesMismatch,
  capitalAndReservesMessage,
} from "../public/lib/balance-sheet-check.js";

describe("balance sheet check", () => {
  test("finds capital and reserves that differ from share capital plus the profit and loss account", () => {
    expect(capitalAndReservesMismatch({ calledUpShareCapital: 100, profitAndLossAccount: 1900, capitalAndReserves: 2900 })).toEqual({
      capital: 2900,
      sum: 2000,
    });
  });

  test("passes accounts that add up, dormant accounts of share capital alone, and a first year of zeros", () => {
    expect(capitalAndReservesMismatch({ calledUpShareCapital: 100, profitAndLossAccount: 2800, capitalAndReserves: 2900 })).toBeNull();
    expect(capitalAndReservesMismatch({ calledUpShareCapital: 1, profitAndLossAccount: 0, capitalAndReserves: 1 })).toBeNull();
    expect(capitalAndReservesMismatch({ calledUpShareCapital: 0, profitAndLossAccount: 0, capitalAndReserves: 0 })).toBeNull();
  });

  test("leaves a year with a figure that is not a number to the check of missing figures", () => {
    expect(capitalAndReservesMismatch({ calledUpShareCapital: Number.NaN, profitAndLossAccount: 0, capitalAndReserves: 1 })).toBeNull();
  });

  test("names the year and both figures", () => {
    expect(capitalAndReservesMessage({ capital: 2900, sum: 2000 }, YEAR_NAMES.priorYear)).toBe(
      "Capital and reserves of 2900 for the prior year do not equal called up share capital plus the profit and loss account, which add up to 2000.",
    );
  });

  test("the accounts form states the same words as the route", () => {
    const page = fs.readFileSync(new URL("../public/companies-house/fileMicroEntityAccounts.page.js", import.meta.url), "utf8");
    expect(page).toContain(JSON.stringify(CAPITAL_AND_RESERVES_MESSAGE));
    expect(page).toContain(JSON.stringify(YEAR_NAMES.currentYear));
    expect(page).toContain(JSON.stringify(YEAR_NAMES.priorYear));
  });
});
