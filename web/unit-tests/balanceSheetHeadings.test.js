// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, test } from "vitest";
import { foldBalanceSheetHeadings } from "../public/lib/balance-sheet-headings.js";

const SMALL_LINES = ["fixedAssets", "debtors", "cashAtBank", "otherCreditors", "creditorsAfterOneYear", "provisionsForLiabilities"];
const MICRO_CT_LINES = ["fixedAssets", "currentAssets", "creditorsWithinOneYear", "creditorsAfterOneYear"];

describe("foldBalanceSheetHeadings", () => {
  test("a form with no box for a heading takes it into the line that holds it, and keeps the headings it has boxes for", () => {
    const year = {
      debtors: 1000,
      prepaymentsAccruedIncome: 200,
      calledUpShareCapitalNotPaid: 1,
      otherCreditors: 300,
      accrualsDeferredIncome: 40,
      creditorsAfterOneYear: 500,
      provisionsForLiabilities: 60,
    };

    expect(foldBalanceSheetHeadings(year, SMALL_LINES)).toEqual({
      debtors: 1201,
      otherCreditors: 340,
      creditorsAfterOneYear: 500,
      provisionsForLiabilities: 60,
    });
  });

  test("a form with neither the heading's box nor its first line takes it into the next line it has", () => {
    const year = {
      currentAssets: 5000,
      prepaymentsAccruedIncome: 200,
      creditorsWithinOneYear: 900,
      accrualsDeferredIncome: 40,
      provisionsForLiabilities: 60,
    };

    expect(foldBalanceSheetHeadings(year, MICRO_CT_LINES)).toEqual({
      currentAssets: 5200,
      creditorsWithinOneYear: 940,
      creditorsAfterOneYear: 60,
    });
  });

  test("a form with every heading's box changes nothing, and a missing year stays missing", () => {
    const year = { prepaymentsAccruedIncome: 200, accrualsDeferredIncome: 40 };

    expect(foldBalanceSheetHeadings(year, ["prepaymentsAccruedIncome", "accrualsDeferredIncome", "debtors"])).toEqual(year);
    expect(foldBalanceSheetHeadings(undefined, SMALL_LINES)).toBeUndefined();
  });
});
