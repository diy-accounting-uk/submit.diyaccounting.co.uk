// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/ixbrlRoundTrip.test.js
// The accounts our builders write, read back by the diya-gl iXBRL reader, carry the figures they were built from.

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import { mapIxbrlAccounts } from "@diy-accounting-uk/diya-gl/dist/app/lib/ixbrl-accounts.js";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";

const cases = JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases.json", "utf8")).filter(
  (testCase) => testCase.type === "accounts",
);

function builtDocument(testCase) {
  const { name, type, govTestScenario, expectedOutcome, ...requestBody } = testCase;
  const errors = [];
  const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(requestBody) }, errors);
  expect(errors).toEqual([]);
  return buildAccountsIxbrl(accounts);
}

function figuresOf(mapped, lines) {
  return Object.fromEntries(lines.filter((line) => line in mapped).map((line) => [line, mapped[line]]));
}

describe("the builders' accounts read back through the diya-gl reader", () => {
  test("the fixture holds the four accounts cases", () => {
    expect(cases.map((testCase) => testCase.name)).toEqual([
      "micro-entity-accounts",
      "micro-entity-accounts-dormant",
      "small-company-accounts-full",
      "small-company-accounts-filleted",
    ]);
  });

  test.each(cases.filter((testCase) => !testCase.smallCompany))(
    "$name: the micro-entity balance sheets, period, employees and director",
    (testCase) => {
      const mapped = mapIxbrlAccounts(builtDocument(testCase), { regime: "micro", companyNumber: testCase.companyNumber });

      expect(mapped.regime).toBe("micro");
      expect(mapped.company).toEqual({ number: testCase.companyNumber, name: testCase.companyName });
      expect(mapped.period).toEqual({ start: testCase.periodStart, end: testCase.periodEnd });
      expect(mapped.dormant).toBe(Boolean(testCase.dormant));
      for (const year of ["currentYear", "priorYear"]) {
        expect(figuresOf(mapped.balanceSheet[year], Object.keys(testCase.balanceSheet[year]))).toEqual(testCase.balanceSheet[year]);
      }
      expect(mapped.averageEmployees).toBe(testCase.averageEmployees);
      expect(mapped.signer).toBe(testCase.director.name);
      expect(mapped.approvalDate).toBe(testCase.director.dateApproved);
      if (testCase.dormant) {
        expect(mapped.shareNote.nominalValue).toBe(testCase.nominalValue);
        expect(mapped.shareNote.shares).toBe(testCase.balanceSheet.currentYear.calledUpShareCapital / testCase.nominalValue);
      }
    },
  );

  test.each(cases.filter((testCase) => testCase.smallCompany))(
    "$name: the small company balance sheets, profit and loss, note and directors",
    (testCase) => {
      const small = testCase.smallCompany;
      const mapped = mapIxbrlAccounts(builtDocument(testCase), { regime: "small", companyNumber: testCase.companyNumber });

      expect(mapped.regime).toBe("small");
      expect(mapped.period).toEqual({ start: testCase.periodStart, end: testCase.periodEnd });
      expect(mapped.filleted).toBe(small.filleted);
      for (const year of ["currentYear", "priorYear"]) {
        expect(figuresOf(mapped.balanceSheet[year], Object.keys(small.balanceSheet[year]))).toEqual(small.balanceSheet[year]);
      }
      if (small.filleted) {
        expect(mapped.profitAndLoss).toBeNull();
      } else {
        for (const year of ["currentYear", "priorYear"]) {
          expect(figuresOf(mapped.profitAndLoss[year], Object.keys(small.profitAndLoss[year]))).toEqual(small.profitAndLoss[year]);
        }
      }
      expect(mapped.fixedAssetNote).toEqual(small.fixedAssetNote);
      expect(mapped.averageEmployees).toBe(testCase.averageEmployees);
      expect(mapped.principalActivity).toBe(small.principalActivity);
      expect(mapped.directors).toEqual(small.filleted ? [testCase.director.name] : small.directors);
      expect(mapped.signer).toBe(testCase.director.name);
    },
  );

  test("a micro-entity document is refused by the small company page and the reverse", () => {
    const micro = builtDocument(cases[0]);
    const small = builtDocument(cases[2]);

    expect(() => mapIxbrlAccounts(micro, { regime: "small" })).toThrow(/micro-entity/);
    expect(() => mapIxbrlAccounts(small, { regime: "micro" })).toThrow(/small company/);
  });

  test("a document for another company number is refused", () => {
    expect(() => mapIxbrlAccounts(builtDocument(cases[0]), { companyNumber: "99999999" })).toThrow(/99999999/);
  });
});
