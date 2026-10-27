// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/smallCompanyAccountsRequest.test.js

import { describe, test, expect } from "vitest";
import { extractAndValidateSmallCompany } from "@app/services/smallCompanyAccountsRequest.js";
import { SMALL_COMPANY_CASE_INPUT, SMALL_COMPANY_FORMAT_2_CASE_INPUT } from "@app/test-helpers/accountsDocumentCases.js";

const STATEMENTS = {
  section477Exemption: true,
  membersNotRequiredAudit: true,
  directorsResponsibilities: true,
  smallCompaniesRegime: true,
};

function sectionFrom(caseInput, overrides = {}) {
  return {
    principalActivity: caseInput.principalActivity,
    accountingPolicies: caseInput.accountingPolicies,
    directors: caseInput.directors,
    balanceSheet: { currentYear: caseInput.balanceSheet.current, priorYear: caseInput.balanceSheet.prior },
    profitAndLoss: { currentYear: caseInput.profitAndLoss.current, priorYear: caseInput.profitAndLoss.prior },
    fixedAssetNote: caseInput.fixedAssetNote,
    ...overrides,
  };
}

function validate(section) {
  const errors = [];
  const result = extractAndValidateSmallCompany(section, STATEMENTS, errors);
  return { result, errors };
}

describe("services/smallCompanyAccountsRequest profit and loss format", () => {
  test("a Format 1 body without a format validates as Format 1", () => {
    const { result, errors } = validate(sectionFrom(SMALL_COMPANY_CASE_INPUT));
    expect(errors).toEqual([]);
    expect(result.profitAndLossFormat).toBe(1);
    expect(Object.keys(result.profitAndLoss.current)).toEqual(Object.keys(SMALL_COMPANY_CASE_INPUT.profitAndLoss.current));
  });

  test("a Format 2 body validates and keeps the Format 2 lines for both years", () => {
    const { result, errors } = validate(sectionFrom(SMALL_COMPANY_FORMAT_2_CASE_INPUT, { profitAndLossFormat: 2 }));
    expect(errors).toEqual([]);
    expect(result.profitAndLossFormat).toBe(2);
    expect(result.profitAndLoss.current).toEqual(SMALL_COMPANY_FORMAT_2_CASE_INPUT.profitAndLoss.current);
    expect(result.profitAndLoss.prior).toEqual(SMALL_COMPANY_FORMAT_2_CASE_INPUT.profitAndLoss.prior);
  });

  test("a Format 2 body that names no format is refused for its missing Format 1 lines", () => {
    const { errors } = validate(sectionFrom(SMALL_COMPANY_FORMAT_2_CASE_INPUT));
    expect(errors).toContain("Invalid or missing smallCompany.profitAndLoss.currentYear.costOfSales");
  });

  test("a Format 1 body that names Format 2 is refused for its missing Format 2 lines", () => {
    const { errors } = validate(sectionFrom(SMALL_COMPANY_CASE_INPUT, { profitAndLossFormat: 2 }));
    expect(errors).toContain("Invalid or missing smallCompany.profitAndLoss.currentYear.changeInStocks");
  });

  test("a format other than 1 or 2 is refused", () => {
    const { errors } = validate(sectionFrom(SMALL_COMPANY_CASE_INPUT, { profitAndLossFormat: 3 }));
    expect(errors).toContain("Invalid smallCompany.profitAndLossFormat - must be 1 or 2");
  });

  test("a Format 2 operating profit that is not the lines above it is refused", () => {
    const broken = { ...SMALL_COMPANY_FORMAT_2_CASE_INPUT.profitAndLoss.current, operatingProfit: 1 };
    const { errors } = validate(
      sectionFrom(SMALL_COMPANY_FORMAT_2_CASE_INPUT, {
        profitAndLossFormat: 2,
        profitAndLoss: { currentYear: broken },
      }),
    );
    expect(errors.some((message) => message.includes("operatingProfit must equal turnover plus"))).toBe(true);
  });
});
