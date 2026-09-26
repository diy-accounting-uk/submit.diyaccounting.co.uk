// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/itsa-bsas.test.js

import { describe, test, expect } from "vitest";
import { getBsasSelfEmploymentForScenario, getBsasUkPropertyForScenario } from "@app/http-simulator/scenarios/itsa-bsas.js";

const NINO = "AB123456C";
const CALCULATION_ID = "71df19f1-bfa7-4255-a010-bd0b83ed2b68";
const TAX_YEAR = "2024-25";

describe("http-simulator/scenarios/itsa-bsas", () => {
  describe("getBsasSelfEmploymentForScenario", () => {
    test("no scenario header answers success with the triggered calculation id", () => {
      const result = getBsasSelfEmploymentForScenario(undefined, NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBeUndefined();
      expect(result.bsas.metadata.calculationId).toBe(CALCULATION_ID);
      expect(result.bsas.metadata.nino).toBe(NINO);
      expect(result.bsas.metadata.taxYear).toBe(TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.netProfit).toBe(6000);
    });

    test("STATEFUL answers the same success body as no scenario", () => {
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
    test("no scenario header answers success with the triggered calculation id", () => {
      const result = getBsasUkPropertyForScenario(undefined, NINO, CALCULATION_ID, TAX_YEAR);
      expect(result.status).toBeUndefined();
      expect(result.bsas.metadata.calculationId).toBe(CALCULATION_ID);
      expect(result.bsas.metadata.nino).toBe(NINO);
      expect(result.bsas.metadata.taxYear).toBe(TAX_YEAR);
      expect(result.bsas.adjustableSummaryCalculation.netProfit).toBe(6000);
    });

    test("STATEFUL answers the same success body as no scenario", () => {
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
});
