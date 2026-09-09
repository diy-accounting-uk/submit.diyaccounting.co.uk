// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/vatReturnCsv.test.js

import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";
import { parseVatReturnCsv, VatReturnCsvError } from "@app/lib/vatReturnCsv.js";

const fixturesDir = path.resolve(process.cwd(), "fixtures/vat-return-csv");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

describe("parseVatReturnCsv: valid fixtures", () => {
  test("valid-quarterly-return.csv parses to one nine-box return", () => {
    const [result] = parseVatReturnCsv(readFixture("valid-quarterly-return.csv"));
    expect(result).toEqual({
      vrn: "193054661",
      periodStart: "2025-01-01",
      periodEnd: "2025-03-31",
      vatDueSales: 1250.0,
      vatDueAcquisitions: 0,
      totalVatDue: 1250.0,
      vatReclaimedCurrPeriod: 320.45,
      netVatDue: 929.55,
      totalValueSalesExVAT: 15000,
      totalValuePurchasesExVAT: 8500,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    });
  });

  test("valid-negative-adjustment.csv accepts negative box 1, 3 and 6 values", () => {
    const [result] = parseVatReturnCsv(readFixture("valid-negative-adjustment.csv"));
    expect(result.vatDueSales).toBe(-45.2);
    expect(result.totalVatDue).toBe(-45.2);
    expect(result.totalValueSalesExVAT).toBe(-300);
    expect(result.netVatDue).toBe(165.2);
  });

  test("valid-multi-period.csv parses one entry per data row in file order", () => {
    const results = parseVatReturnCsv(readFixture("valid-multi-period.csv"));
    expect(results).toHaveLength(2);
    expect(results[0].periodStart).toBe("2025-01-01");
    expect(results[1].periodStart).toBe("2025-04-01");
  });
});

describe("parseVatReturnCsv: invalid fixtures are rejected with a named reason", () => {
  const cases = [
    ["invalid-missing-column.csv", "MISSING_COLUMN"],
    ["invalid-unknown-column.csv", "UNKNOWN_COLUMN"],
    ["invalid-bad-date-format.csv", "INVALID_DATE_FORMAT"],
    ["invalid-period-end-before-start.csv", "PERIOD_END_BEFORE_START"],
    ["invalid-box-arithmetic.csv", "BOX_ARITHMETIC_BOX3"],
    ["invalid-box5-arithmetic.csv", "BOX_ARITHMETIC_BOX5"],
    ["invalid-negative-net-vat-due.csv", "NEGATIVE_NET_VAT_DUE"],
    ["invalid-non-integer-box6.csv", "INVALID_WHOLE_AMOUNT"],
    ["invalid-too-many-decimals-box1.csv", "INVALID_MONETARY_AMOUNT"],
    ["invalid-bad-vrn.csv", "INVALID_VRN"],
    ["invalid-non-numeric-value.csv", "INVALID_MONETARY_AMOUNT"],
    ["invalid-not-finalised.csv", "NOT_FINALISED"],
    ["invalid-no-data-rows.csv", "NO_DATA_ROWS"],
  ];

  test.each(cases)("%s is rejected with reason %s", (fixture, expectedReason) => {
    const csvText = readFixture(fixture);
    let caught = null;
    try {
      parseVatReturnCsv(csvText);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(VatReturnCsvError);
    expect(caught.reason).toBe(expectedReason);
  });
});

describe("parseVatReturnCsv: file-level rejections", () => {
  test("rejects an empty string", () => {
    expect(() => parseVatReturnCsv("")).toThrow(VatReturnCsvError);
  });

  test("rejects a non-string input", () => {
    expect(() => parseVatReturnCsv(null)).toThrow(VatReturnCsvError);
  });

  test("strips a leading UTF-8 byte-order mark before parsing the header", () => {
    const withBom = "﻿" + readFixture("valid-quarterly-return.csv");
    const [result] = parseVatReturnCsv(withBom);
    expect(result.vrn).toBe("193054661");
  });
});

describe("parseVatReturnCsv: every fixture is exercised", () => {
  test("the fixtures directory has no file this suite does not cover", () => {
    const covered = new Set([
      "valid-quarterly-return.csv",
      "valid-negative-adjustment.csv",
      "valid-multi-period.csv",
      "invalid-missing-column.csv",
      "invalid-unknown-column.csv",
      "invalid-bad-date-format.csv",
      "invalid-period-end-before-start.csv",
      "invalid-box-arithmetic.csv",
      "invalid-box5-arithmetic.csv",
      "invalid-negative-net-vat-due.csv",
      "invalid-non-integer-box6.csv",
      "invalid-too-many-decimals-box1.csv",
      "invalid-bad-vrn.csv",
      "invalid-non-numeric-value.csv",
      "invalid-not-finalised.csv",
      "invalid-no-data-rows.csv",
    ]);
    const actual = new Set(fs.readdirSync(fixturesDir).filter((name) => name.endsWith(".csv")));
    expect(actual).toEqual(covered);
  });
});
