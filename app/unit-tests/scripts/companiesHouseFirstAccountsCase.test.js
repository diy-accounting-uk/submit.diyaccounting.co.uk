// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/companiesHouseFirstAccountsCase.test.js
// The test-service case of a company's first micro-entity accounts, which have no prior year,
// built through the accounts route's own request check and document builder, as
// companies-house-test-service-run.js files it.

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import { ixbrlStructureProblems } from "@app/lib/ixbrlStructure.js";

const cases = JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases-first-accounts.json", "utf8"));

describe("the first accounts test-service case", () => {
  test("holds one micro-entity set whose period starts on the date of incorporation and has no prior year", () => {
    expect(cases.map((testCase) => testCase.name)).toEqual(["micro-entity-accounts-first"]);
    const [first] = cases;
    expect(first.type).toBe("accounts");
    expect(first.dateOfIncorporation).toBe(first.periodStart);
    expect(first.balanceSheet).not.toHaveProperty("priorYear");
  });

  test("files on a company the test service took earlier runs' filings for, with an invented director, and expects an answer", () => {
    const [first] = cases;
    const earlierCompanies = JSON.parse(readFileSync("scripts/fixtures/companies-house-test-service-cases.json", "utf8"))
      .filter((testCase) => testCase.type !== "accounts")
      .map((testCase) => testCase.companyNumber);
    expect(earlierCompanies).toContain(first.companyNumber);
    expect(first.companyNumber).not.toBe("06846849");
    expect(first.director.name).not.toMatch(/Cartwright/);
    expect(first.expectedOutcome.status).toBe("TERMINAL");
  });

  test("passes the accounts route's request check and builds a well-formed document with no prior year", () => {
    const { name, type, govTestScenario, expectedOutcome, ...requestBody } = cases[0];
    const errors = [];
    const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(requestBody) }, errors);
    expect(errors).toEqual([]);
    const document = buildAccountsIxbrl(accounts);
    expect(ixbrlStructureProblems(document)).toEqual([]);
    // A balance sheet's figures sit in contexts named for the year they end in: e2026 for this year,
    // e2025 for a prior year, which first accounts do not have.
    expect(document).toMatch(/contextRef="e2026"/);
    expect(document).not.toMatch(/contextRef="e2025/);
  });
});
