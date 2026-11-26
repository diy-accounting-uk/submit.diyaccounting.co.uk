// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/ct600-carry-forward.test.js

import { describe, test, expect } from "vitest";
import {
  carryForwardEntries,
  lastFiledReturn,
  lastYearOfFiledAccounts,
  lastYearOfRegisterAccounts,
  nextPeriodAfter,
  priorYearEntries,
} from "../public/lib/ct600-carry-forward.js";

const FILED_RECORD = {
  kind: "company-tax-return",
  periodEnd: "2026-03-31",
  filed: {
    boxes: { 2: "00000001", 30: "2025-04-01", 35: "2026-03-31", 315: 41250, 326: 1, 440: 9198, 975: "Eleanor Bramwell", 985: "Director" },
  },
  formRequest: {
    company: { companyNumber: "00000001", companyName: "Harbour Lane Joinery Limited" },
    values: {
      periodStart: "2025-04-01",
      periodEnd: "2026-03-31",
      tradeName: "Harbour Lane Joinery",
      associatedCompanies: "1",
      declarantName: "Eleanor Bramwell",
      declarantStatus: "Director",
      currentTurnover: "250000",
      statementSection477Exemption: true,
      statementMembersNotRequiredAudit: true,
      statementDirectorsResponsibilities: true,
      statementSmallCompaniesRegime: true,
      statementMicroEntityProvisions: false,
      declarationAccepted: true,
    },
  },
};

describe("ct600-carry-forward", () => {
  test("the next period is the 12 months after the last, and a year to 29 February ends on 28 February", () => {
    expect(nextPeriodAfter("2026-03-31")).toEqual({ periodStart: "2026-04-01", periodEnd: "2027-03-31" });
    expect(nextPeriodAfter("2024-02-29")).toEqual({ periodStart: "2024-03-01", periodEnd: "2025-02-28" });
    expect(nextPeriodAfter("2025-12-31")).toEqual({ periodStart: "2026-01-01", periodEnd: "2026-12-31" });
  });

  test("the last return filed is the company's Company Tax Return whose period ends latest", () => {
    const receipts = [
      { name: "a", kind: "company-tax-return", companyNumber: "00000001", periodEnd: "2025-03-31", timestamp: "2025-10-01" },
      { name: "b", kind: "company-tax-return", companyNumber: "00000001", periodEnd: "2026-03-31", timestamp: "2026-10-01" },
      { name: "c", kind: "companies-house-accounts", companyNumber: "00000001", periodEnd: "2027-03-31", timestamp: "2027-10-01" },
      { name: "d", kind: "company-tax-return", companyNumber: "00000002", periodEnd: "2027-03-31", timestamp: "2027-10-02" },
    ];
    expect(lastFiledReturn(receipts, "00000001").name).toBe("b");
    expect(lastFiledReturn(receipts, "00000009")).toBeNull();
  });

  test("a filed return carries the next period, box 160, box 315, box 326, the trade name, the declarant and the statements, and no figure of this year", () => {
    const entries = Object.fromEntries(carryForwardEntries(FILED_RECORD, { lossesCarriedForward: 3500 }));
    expect(entries).toEqual({
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
      lossesBroughtForward: "3500",
      priorPeriodChargeableProfits: "41250",
      associatedCompanies: "1",
      tradeName: "Harbour Lane Joinery",
      declarantName: "Eleanor Bramwell",
      declarantStatus: "Director",
      statementSection477Exemption: true,
      statementMembersNotRequiredAudit: true,
      statementDirectorsResponsibilities: true,
      statementSmallCompaniesRegime: true,
    });
  });

  test("losses that could not be worked leave box 160 out, and a return with no answers carries its boxes", () => {
    const entries = Object.fromEntries(carryForwardEntries({ ...FILED_RECORD, formRequest: undefined }, { lossesCarriedForward: null }));
    expect(entries).not.toHaveProperty("lossesBroughtForward");
    expect(entries).toMatchObject({
      associatedCompanies: "1",
      declarantName: "Eleanor Bramwell",
      declarantStatus: "Director",
      priorPeriodChargeableProfits: "41250",
    });
    expect(entries).not.toHaveProperty("tradeName");
  });

  test("small company accounts filed with last year's return fill this year's last-year column, with their profit and loss", () => {
    const mapped = {
      regime: "small",
      balanceSheet: { currentYear: { fixedAssets: 8000, cashAtBank: 9000, calledUpShareCapital: 100 }, priorYear: { fixedAssets: 1 } },
      profitAndLoss: { currentYear: { turnover: 60000, costOfSales: 24000 } },
    };
    const entries = Object.fromEntries(priorYearEntries(lastYearOfFiledAccounts(mapped)));
    expect(entries).toEqual({
      regimeSmall: true,
      includeComparatives: true,
      priorFixedAssets: "8000",
      priorCashAtBank: "9000",
      priorCalledUpShareCapital: "100",
      priorTurnover: "60000",
      priorCostOfSales: "24000",
    });
  });

  test("micro-entity accounts on the register fill the micro-entity last-year column", () => {
    const registerAccounts = {
      regime: "micro",
      balanceSheet: {
        fixedAssets: 800,
        currentAssets: 6000,
        creditorsWithinOneYear: 1968,
        calledUpShareCapital: 100,
        profitAndLossAccount: 4732,
      },
      profitAndLoss: null,
    };
    const entries = Object.fromEntries(priorYearEntries(lastYearOfRegisterAccounts(registerAccounts)));
    expect(entries).toEqual({
      regimeMicro: true,
      microPriorFixedAssets: "800",
      microPriorCurrentAssets: "6000",
      microPriorCreditorsWithinOneYear: "1968",
      microPriorCalledUpShareCapital: "100",
      microPriorProfitAndLossAccount: "4732",
    });
  });
});
