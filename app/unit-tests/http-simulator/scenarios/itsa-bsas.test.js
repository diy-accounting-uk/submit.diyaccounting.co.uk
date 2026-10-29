// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/itsa-bsas.test.js

import { describe, test, expect } from "vitest";
import {
  getBsasSelfEmploymentForScenario,
  getBsasUkPropertyForScenario,
  getBsasForeignPropertyForScenario,
  getBsasForeignPropertyAdjustErrorForScenario,
} from "@app/http-simulator/scenarios/itsa-bsas.js";

const NINO = "AB123456C";
const CALCULATION_ID = "71df19f1-bfa7-4255-a010-bd0b83ed2b68";
const TAX_YEAR = "2024-25";

describe("http-simulator/scenarios/itsa-bsas", () => {
  describe("getBsasSelfEmploymentForScenario", () => {
    test("no scenario header answers no data found", () => {
      const result = getBsasSelfEmploymentForScenario(undefined, NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBe(404);
      expect(result.body.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    test("STATEFUL answers a success body", () => {
      const result = getBsasSelfEmploymentForScenario("STATEFUL", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.calculationId).toBe(CALCULATION_ID);
      expect(result.bsas.adjustableSummaryCalculation.netProfit).toBe(6000);
    });

    test("SELF_EMPLOYMENT_PROFIT answers a net profit", () => {
      const result = getBsasSelfEmploymentForScenario("SELF_EMPLOYMENT_PROFIT", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.netProfit).toBe(6000);
      expect(result.bsas.adjustableSummaryCalculation.netLoss).toBeUndefined();
    });

    test("SELF_EMPLOYMENT_LOSS answers a net loss", () => {
      const result = getBsasSelfEmploymentForScenario("SELF_EMPLOYMENT_LOSS", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.netLoss).toBe(6000);
    });

    test("SELF_EMPLOYMENT_CONSOLIDATED answers consolidated expenses", () => {
      const result = getBsasSelfEmploymentForScenario("SELF_EMPLOYMENT_CONSOLIDATED", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.expenses).toEqual({ consolidatedExpenses: 4000 });
    });

    test("TRADING_ALLOWANCE answers a trading income allowance", () => {
      const result = getBsasSelfEmploymentForScenario("TRADING_ALLOWANCE", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.tradingIncomeAllowance).toBe(1000);
    });

    test("SELF_EMPLOYMENT_STATUS_INVALID answers an invalid summary status", () => {
      const result = getBsasSelfEmploymentForScenario("SELF_EMPLOYMENT_STATUS_INVALID", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.summaryStatus).toBe("invalid");
    });

    test("SELF_EMPLOYMENT_STATUS_SUPERSEDED answers a superseded summary status", () => {
      const result = getBsasSelfEmploymentForScenario("SELF_EMPLOYMENT_STATUS_SUPERSEDED", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.summaryStatus).toBe("superseded");
    });

    test("a DYNAMIC_ prefix reflects the request's own nino, calculation id and tax year back", () => {
      const result = getBsasSelfEmploymentForScenario("DYNAMIC_SELF_EMPLOYMENT_PROFIT", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.calculationId).toBe(CALCULATION_ID);
      expect(result.bsas.metadata.nino).toBe(NINO);
      expect(result.bsas.metadata.taxYear).toBe(TAX_YEAR);
    });

    test("an unrecognised scenario answers not found", () => {
      const result = getBsasSelfEmploymentForScenario("SOME_UNKNOWN_SCENARIO", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBe(404);
      expect(result.body.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });
  });

  describe("getBsasUkPropertyForScenario", () => {
    test("no scenario header answers no data found", () => {
      const result = getBsasUkPropertyForScenario(undefined, NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBe(404);
      expect(result.body.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });

    test("STATEFUL answers a success body", () => {
      const result = getBsasUkPropertyForScenario("STATEFUL", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.calculationId).toBe(CALCULATION_ID);
      expect(result.bsas.adjustableSummaryCalculation.netProfit).toBe(6000);
    });

    test("UK_PROPERTY_PROFIT answers a net profit", () => {
      const result = getBsasUkPropertyForScenario("UK_PROPERTY_PROFIT", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.netProfit).toBe(6000);
      expect(result.bsas.adjustableSummaryCalculation.netLoss).toBeUndefined();
    });

    test("UK_PROPERTY_LOSS answers a net loss", () => {
      const result = getBsasUkPropertyForScenario("UK_PROPERTY_LOSS", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.netLoss).toBe(6000);
    });

    test("UK_PROPERTY_CONSOLIDATED answers consolidated deductions", () => {
      const result = getBsasUkPropertyForScenario("UK_PROPERTY_CONSOLIDATED", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.deductions).toEqual({ consolidatedExpenses: 4000 });
    });

    test("UK_PROPERTY_ALLOWANCE answers a property income allowance", () => {
      const result = getBsasUkPropertyForScenario("UK_PROPERTY_ALLOWANCE", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.deductions.propertyAllowance).toBe(1000);
    });

    test("UK_PROPERTY_STATUS_INVALID answers an invalid summary status", () => {
      const result = getBsasUkPropertyForScenario("UK_PROPERTY_STATUS_INVALID", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.summaryStatus).toBe("invalid");
    });

    test("UK_PROPERTY_STATUS_SUPERSEDED answers a superseded summary status", () => {
      const result = getBsasUkPropertyForScenario("UK_PROPERTY_STATUS_SUPERSEDED", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.summaryStatus).toBe("superseded");
    });

    test("NOT_UK_PROPERTY answers the type-of-business error", () => {
      const result = getBsasUkPropertyForScenario("NOT_UK_PROPERTY", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("RULE_TYPE_OF_BUSINESS_INCORRECT");
    });

    test("a DYNAMIC_ prefix reflects the request's own nino, calculation id and tax year back", () => {
      const result = getBsasUkPropertyForScenario("DYNAMIC_UK_PROPERTY_PROFIT", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.calculationId).toBe(CALCULATION_ID);
      expect(result.bsas.metadata.nino).toBe(NINO);
      expect(result.bsas.metadata.taxYear).toBe(TAX_YEAR);
    });

    test("an unrecognised scenario answers not found", () => {
      const result = getBsasUkPropertyForScenario("SOME_UNKNOWN_SCENARIO", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBe(404);
      expect(result.body.code).toBe("MATCHING_RESOURCE_NOT_FOUND");
    });
  });

  describe("getBsasForeignPropertyForScenario", () => {
    test("no scenario header answers no data found", () => {
      const result = getBsasForeignPropertyForScenario(undefined, NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBe(404);
    });

    test("FOREIGN_PROPERTY_PROFIT answers a country level and no property level before 2026-27", () => {
      const calculation = getBsasForeignPropertyForScenario("FOREIGN_PROPERTY_PROFIT", NINO, CALCULATION_ID, TAX_YEAR).bsas
        .adjustableSummaryCalculation;
      expect(calculation.netProfit).toBe(9000);
      expect(calculation.countryLevelDetail[0].countryCode).toBe("FRA");
      expect(calculation.countryLevelDetail[0].propertyLevelDetail).toBeUndefined();
    });

    test("FOREIGN_PROPERTY_PROFIT answers one country level entry for each submitted country and totals them", () => {
      const calculation = getBsasForeignPropertyForScenario("FOREIGN_PROPERTY_PROFIT", NINO, CALCULATION_ID, TAX_YEAR, undefined, [
        "FRA",
        "ESP",
      ]).bsas.adjustableSummaryCalculation;
      expect(calculation.countryLevelDetail.map((entry) => entry.countryCode)).toEqual(["FRA", "ESP"]);
      expect(calculation.totalIncome).toBe(20000);
      expect(calculation.income.totalRentsReceived).toBe(18000);
      expect(calculation.netProfit).toBe(18000);
      expect(calculation.expenses.premisesRunningCosts).toBe(1000);
    });

    test("FOREIGN_PROPERTY_PROFIT answers the held property at the property level from 2026-27", () => {
      const result = getBsasForeignPropertyForScenario(
        "FOREIGN_PROPERTY_PROFIT",
        NINO,
        CALCULATION_ID,
        "2026-27",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      expect(result.bsas.adjustableSummaryCalculation.countryLevelDetail[0].propertyLevelDetail[0].propertyId).toBe(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      expect(result.bsas.inputs.accountingPeriodStartDate).toBe("2026-04-06");
    });

    test("FOREIGN_PROPERTY_LOSS answers a net loss", () => {
      const calculation = getBsasForeignPropertyForScenario("FOREIGN_PROPERTY_LOSS", NINO, CALCULATION_ID, TAX_YEAR).bsas
        .adjustableSummaryCalculation;
      expect(calculation.netLoss).toBe(6000);
      expect(calculation.netProfit).toBeUndefined();
    });

    test("FOREIGN_PROPERTY_CONSOLIDATED answers consolidated expenses", () => {
      const result = getBsasForeignPropertyForScenario("FOREIGN_PROPERTY_CONSOLIDATED", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.expenses).toEqual({ consolidatedExpenses: 1000 });
    });

    test("FOREIGN_PROPERTY_ALLOWANCE answers the property income allowance", () => {
      const result = getBsasForeignPropertyForScenario("FOREIGN_PROPERTY_ALLOWANCE", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.deductions).toEqual({ propertyAllowance: 1000 });
    });

    test.each([
      ["FOREIGN_PROPERTY_STATUS_INVALID", "invalid"],
      ["FOREIGN_PROPERTY_STATUS_SUPERSEDED", "superseded"],
      ["FOREIGN_PROPERTY_ZERO_ADJUSTMENTS", "valid"],
    ])("%s answers summaryStatus %s", (scenario, summaryStatus) => {
      const result = getBsasForeignPropertyForScenario(scenario, NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.summaryStatus).toBe(summaryStatus);
    });

    test("NOT_FOREIGN_PROPERTY answers the type-of-business error", () => {
      const result = getBsasForeignPropertyForScenario("NOT_FOREIGN_PROPERTY", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.body.code).toBe("RULE_TYPE_OF_BUSINESS_INCORRECT");
    });

    test("a DYNAMIC_ prefix reflects the request's own nino, calculation id and tax year back", () => {
      const result = getBsasForeignPropertyForScenario("DYNAMIC_FOREIGN_PROPERTY_PROFIT", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata).toEqual(expect.objectContaining({ calculationId: CALCULATION_ID, nino: NINO, taxYear: TAX_YEAR }));
    });

    test("STATEFUL answers a success body", () => {
      const result = getBsasForeignPropertyForScenario("STATEFUL", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.bsas.metadata.calculationId).toBe(CALCULATION_ID);
    });

    test("an unrecognised scenario answers not found", () => {
      const result = getBsasForeignPropertyForScenario("SOME_UNKNOWN_SCENARIO", NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBe(404);
    });
  });

  describe("getBsasForeignPropertyAdjustErrorForScenario", () => {
    test("the default and STATEFUL accept the adjustment", () => {
      expect(getBsasForeignPropertyAdjustErrorForScenario(undefined)).toBeNull();
      expect(getBsasForeignPropertyAdjustErrorForScenario("STATEFUL")).toBeNull();
    });

    test.each([
      ["FOREIGN_PROPERTY_OVER_CONSOLIDATED_EXPENSES_THRESHOLD", "RULE_OVER_CONSOLIDATED_EXPENSES_THRESHOLD"],
      ["FOREIGN_PROPERTY_INCOME_ALLOWANCE_CLAIMED", "RULE_PROPERTY_INCOME_ALLOWANCE_CLAIMED"],
      ["PROPERTY_ID_MISMATCH", "RULE_PROPERTY_ID_MISMATCH"],
      ["ALREADY_ADJUSTED", "RULE_ALREADY_ADJUSTED"],
      ["TYPE_OF_BUSINESS_INCORRECT", "RULE_TYPE_OF_BUSINESS_INCORRECT"],
    ])("%s answers %s", (scenario, code) => {
      expect(getBsasForeignPropertyAdjustErrorForScenario(scenario).body.code).toBe(code);
    });
  });
});
