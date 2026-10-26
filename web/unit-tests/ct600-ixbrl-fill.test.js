// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/ct600-ixbrl-fill.test.js
// The Company Tax Return form's values from an iXBRL accounts document the diya-gl reader mapped.

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import { mapIxbrlAccounts } from "@diy-accounting-uk/diya-gl/dist/app/lib/ixbrl-accounts.js";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import { formEntriesFromIxbrl } from "../public/lib/ct600-fields.js";

const cases = JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases.json", "utf8")).filter(
  (testCase) => testCase.type === "accounts",
);
const caseNamed = (name) => cases.find((testCase) => testCase.name === name);

function mappedCase(name, expect = {}) {
  const { name: caseName, type, govTestScenario, expectedOutcome, ...requestBody } = caseNamed(name);
  const errors = [];
  const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(requestBody) }, errors);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return mapIxbrlAccounts(buildAccountsIxbrl(accounts), { regime: "any", ...expect });
}

const valueOf = (entries, id) => Object.fromEntries(entries)[id];

describe("the form values from a small company's iXBRL accounts", () => {
  const entries = formEntriesFromIxbrl(mappedCase("small-company-accounts-full"));

  test("opens the small company regime on the document's period", () => {
    expect(valueOf(entries, "regimeSmall")).toBe(true);
    expect(valueOf(entries, "regimeMicro")).toBeUndefined();
    expect(valueOf(entries, "periodStart")).toBe("2025-04-01");
    expect(valueOf(entries, "periodEnd")).toBe("2026-03-31");
  });

  test("carries the profit and loss account and the balance sheets for both years", () => {
    expect(valueOf(entries, "currentTurnover")).toBe("8500");
    expect(valueOf(entries, "currentCostOfSales")).toBe("0");
    expect(valueOf(entries, "currentTax")).toBe("1102");
    expect(valueOf(entries, "currentCashAtBank")).toBe("5200");
    expect(valueOf(entries, "includeComparatives")).toBe(true);
    expect(valueOf(entries, "priorTurnover")).toBe("7639");
    expect(valueOf(entries, "priorCreditorsAfterOneYear")).toBe("0");
  });

  test("starts the depreciation added back as the fixed asset note's charge for the year", () => {
    expect(valueOf(entries, "includeFixedAssetNote")).toBe(true);
    expect(valueOf(entries, "noteComputerEquipmentDepreciationCharge")).toBe("400");
    expect(valueOf(entries, "depreciation")).toBe("400");
  });

  test("carries the text answers, the employees and the director", () => {
    expect(valueOf(entries, "principalActivity")).toBe("Retailer of accounting software");
    expect(valueOf(entries, "tradeName")).toBe("Retailer of accounting software");
    expect(valueOf(entries, "directors")).toBe("Antony Christopher Cartwright\nSamantha Ashley Cartwright\nJane Elizabeth Grundy");
    expect(valueOf(entries, "averageEmployees")).toBe("0");
    expect(valueOf(entries, "directorName")).toBe("Antony Christopher Cartwright");
    expect(valueOf(entries, "declarantName")).toBe("Antony Christopher Cartwright");
  });
});

describe("the form values from a micro-entity's iXBRL accounts", () => {
  const entries = formEntriesFromIxbrl(mappedCase("micro-entity-accounts"));

  test("opens the micro-entity regime and fills its balance sheets", () => {
    expect(valueOf(entries, "regimeMicro")).toBe(true);
    expect(valueOf(entries, "regimeSmall")).toBeUndefined();
    expect(valueOf(entries, "microCurrentFixedAssets")).toBe("0");
    expect(valueOf(entries, "microCurrentCurrentAssets")).toBe("8300");
    expect(valueOf(entries, "microPriorFixedAssets")).toBe("0");
  });

  test("names the micro-entity's trade after the company", () => {
    expect(valueOf(entries, "tradeName")).toBe("DIY ACCOUNTING LIMITED");
  });

  test("leaves the small company fields and the depreciation alone", () => {
    const ids = entries.map(([id]) => id);
    expect(ids).not.toContain("depreciation");
    expect(ids).not.toContain("currentTurnover");
    expect(ids).not.toContain("includeFixedAssetNote");
  });
});

describe("a document that does not match the form", () => {
  test("another company number is refused", () => {
    expect(() => mappedCase("small-company-accounts-full", { companyNumber: "99999999" })).toThrow(/99999999/);
  });

  test("another period is refused", () => {
    expect(() => mappedCase("small-company-accounts-full", { periodStart: "2024-04-01", periodEnd: "2025-03-31" })).toThrow(
      /end on 2026-03-31/,
    );
  });
});
