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
  formatPounds,
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
      "Capital and reserves of £2,900 for the prior year do not equal called up share capital plus the profit and loss account, which add up to £2,000.",
    );
  });

  test("writes money as the forms do, with the pound sign and thousands separated", () => {
    expect(formatPounds(10000)).toBe("£10,000");
    expect(formatPounds(0)).toBe("£0");
    expect(formatPounds(-1250)).toBe("-£1,250");
  });

  test("states the figures as money in the Welsh message too", () => {
    const welsh = capitalAndReservesMessage(
      { capital: 10000, sum: 8000 },
      "y flwyddyn flaenorol",
      "Nid yw cyfalaf a chronfeydd wrth gefn o {capital} ar gyfer {year} yn hafal i’r cyfalaf cyfranddaliadau a alwyd i fyny ynghyd â’r cyfrif elw a cholled, sy’n dod i {sum}.",
    );
    expect(welsh).toBe(
      "Nid yw cyfalaf a chronfeydd wrth gefn o £10,000 ar gyfer y flwyddyn flaenorol yn hafal i’r cyfalaf cyfranddaliadau a alwyd i fyny ynghyd â’r cyfrif elw a cholled, sy’n dod i £8,000.",
    );
  });

  test("the accounts form states the same words as the route", () => {
    const page = fs.readFileSync(new URL("../public/companies-house/fileMicroEntityAccounts.page.js", import.meta.url), "utf8");
    expect(page).toContain(JSON.stringify(CAPITAL_AND_RESERVES_MESSAGE));
    expect(page).toContain(JSON.stringify(YEAR_NAMES.currentYear));
    expect(page).toContain(JSON.stringify(YEAR_NAMES.priorYear));
  });
});
