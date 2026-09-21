// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/itsa-sandbox-year.test.js

import { describe, test, expect } from "vitest";

import {
  extractCheckpointId,
  buildStandardQuarterlyPeriods,
  buildCumulativeQuarterlyPeriods,
  buildCumulativeSelfEmploymentTestFigures,
  buildCumulativePropertyTestFigures,
  deriveAccountingPeriodFromPeriods,
  buildQuarterlyTestFigures,
  buildTestBusinessRequestBody,
  buildTestPropertyBusinessRequestBody,
  buildItsaStatusRequestBody,
  isFraudHeaderValidationClean,
  isLossesAndAdjustmentsSupportedTaxYear,
  bothBusinessesInCalculationIncomeSources,
  evaluateLossClaimsReadBack,
  evaluateSuspendTemporalValidationsHeaderOnWrites,
} from "../../../scripts/itsa-sandbox-year.js";

describe("extractCheckpointId", () => {
  test("reads checkpointId directly", () => {
    expect(extractCheckpointId({ checkpointId: "abc-123" })).toBe("abc-123");
  });

  test("falls back to id", () => {
    expect(extractCheckpointId({ id: "abc-456" })).toBe("abc-456");
  });

  test("falls back to a nested checkpoint.id", () => {
    expect(extractCheckpointId({ checkpoint: { id: "abc-789" } })).toBe("abc-789");
  });

  test("throws with the raw body when no id field is recognised", () => {
    expect(() => extractCheckpointId({ unexpected: "shape" })).toThrow(/unexpected/);
  });

  test("throws on an empty body", () => {
    expect(() => extractCheckpointId({})).toThrow(/recognisable id/);
  });
});

describe("buildStandardQuarterlyPeriods", () => {
  test("returns the four standard quarters of the tax year in order", () => {
    expect(buildStandardQuarterlyPeriods("2023-24")).toEqual([
      { periodStartDate: "2023-04-06", periodEndDate: "2023-07-05" },
      { periodStartDate: "2023-07-06", periodEndDate: "2023-10-05" },
      { periodStartDate: "2023-10-06", periodEndDate: "2024-01-05" },
      { periodStartDate: "2024-01-06", periodEndDate: "2024-04-05" },
    ]);
  });
});

describe("buildCumulativeQuarterlyPeriods", () => {
  test("each period runs from the tax year start to a standard quarter's end", () => {
    expect(buildCumulativeQuarterlyPeriods("2025-26")).toEqual([
      { fromDate: "2025-04-06", toDate: "2025-07-05" },
      { fromDate: "2025-04-06", toDate: "2025-10-05" },
      { fromDate: "2025-04-06", toDate: "2026-01-05" },
      { fromDate: "2025-04-06", toDate: "2026-04-05" },
    ]);
  });
});

describe("buildCumulativeSelfEmploymentTestFigures", () => {
  test("the first quarter's total equals its own quarterly figures", () => {
    const first = buildQuarterlyTestFigures(0);
    expect(buildCumulativeSelfEmploymentTestFigures(0)).toEqual({
      income: first.periodIncome,
      expenses: first.periodExpenses,
    });
  });

  test("later quarters carry the running total, not just that quarter's own figures", () => {
    const cumulative = buildCumulativeSelfEmploymentTestFigures(1);
    const secondQuarterOnly = buildQuarterlyTestFigures(1);

    expect(cumulative.income.turnover).toBeGreaterThan(secondQuarterOnly.periodIncome.turnover);
    expect(cumulative.expenses.consolidatedExpenses).toBeGreaterThan(secondQuarterOnly.periodExpenses.consolidatedExpenses);
  });

  test("the running total grows every quarter", () => {
    const totals = [0, 1, 2, 3].map((index) => buildCumulativeSelfEmploymentTestFigures(index));

    for (let index = 1; index < totals.length; index += 1) {
      expect(totals[index].income.turnover).toBeGreaterThan(totals[index - 1].income.turnover);
      expect(totals[index].expenses.consolidatedExpenses).toBeGreaterThan(totals[index - 1].expenses.consolidatedExpenses);
    }
  });
});

describe("buildCumulativePropertyTestFigures", () => {
  test("reports income under periodAmount, not turnover - the property field name", () => {
    const figures = buildCumulativePropertyTestFigures(0);

    expect(figures.income).toHaveProperty("periodAmount");
    expect(figures.income).not.toHaveProperty("turnover");
  });

  test("the running total grows every quarter", () => {
    const totals = [0, 1, 2, 3].map((index) => buildCumulativePropertyTestFigures(index));

    for (let index = 1; index < totals.length; index += 1) {
      expect(totals[index].income.periodAmount).toBeGreaterThan(totals[index - 1].income.periodAmount);
      expect(totals[index].expenses.consolidatedExpenses).toBeGreaterThan(totals[index - 1].expenses.consolidatedExpenses);
    }
  });
});

describe("deriveAccountingPeriodFromPeriods", () => {
  test("spans the earliest start to the latest end", () => {
    const periods = [
      { periodStartDate: "2023-07-06", periodEndDate: "2023-10-05" },
      { periodStartDate: "2023-04-06", periodEndDate: "2023-07-05" },
      { periodStartDate: "2024-01-06", periodEndDate: "2024-04-05" },
      { periodStartDate: "2023-10-06", periodEndDate: "2024-01-05" },
    ];

    expect(deriveAccountingPeriodFromPeriods(periods)).toEqual({
      accountingPeriodStartDate: "2023-04-06",
      accountingPeriodEndDate: "2024-04-05",
    });
  });

  test("throws on an empty period list", () => {
    expect(() => deriveAccountingPeriodFromPeriods([])).toThrow(/empty period list/);
  });
});

describe("buildQuarterlyTestFigures", () => {
  test("varies turnover and expenses by quarter index", () => {
    const first = buildQuarterlyTestFigures(0);
    const second = buildQuarterlyTestFigures(1);

    expect(first.periodIncome.turnover).toBeLessThan(second.periodIncome.turnover);
    expect(first.periodExpenses.consolidatedExpenses).toBeLessThan(second.periodExpenses.consolidatedExpenses);
  });

  test("never sends both consolidatedExpenses and an itemised expense field", () => {
    const figures = buildQuarterlyTestFigures(2);

    expect(Object.keys(figures.periodExpenses)).toEqual(["consolidatedExpenses"]);
  });
});

describe("buildTestBusinessRequestBody", () => {
  test("carries every field HMRC's test-support create-business endpoint requires for self-employment", () => {
    const body = buildTestBusinessRequestBody();

    expect(body.typeOfBusiness).toBe("self-employment");
    expect(body.tradingType).toBeTruthy();
    expect(body.tradingName).toBeTruthy();
    expect(body.businessAddressLineOne).toBeTruthy();
    expect(body.businessAddressCountryCode).toBe("GB");
  });
});

describe("buildTestPropertyBusinessRequestBody", () => {
  test("carries only typeOfBusiness", () => {
    expect(buildTestPropertyBusinessRequestBody()).toEqual({ typeOfBusiness: "uk-property" });
  });

  test("carries no business address, trading type or trading name - all self-employment-only fields", () => {
    const body = buildTestPropertyBusinessRequestBody();

    expect(body.businessAddressLineOne).toBeUndefined();
    expect(body.tradingType).toBeUndefined();
    expect(body.tradingName).toBeUndefined();
  });
});

describe("buildItsaStatusRequestBody", () => {
  test("carries one itsaStatusDetails entry with a timestamped submittedOn", () => {
    const body = buildItsaStatusRequestBody();

    expect(body.itsaStatusDetails).toHaveLength(1);
    expect(body.itsaStatusDetails[0].status).toBe("MTD Mandated");
    expect(body.itsaStatusDetails[0].submittedOn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("isFraudHeaderValidationClean", () => {
  test("is clean when HMRC reports VALID_HEADERS", () => {
    expect(isFraudHeaderValidationClean({ code: "VALID_HEADERS" })).toBe(true);
  });

  test("is clean when the only warning names gov-client-multi-factor", () => {
    const body = {
      code: "POTENTIALLY_INVALID_HEADERS",
      warnings: [{ code: "POTENTIALLY_INVALID_HEADER", message: "missing", headers: ["gov-client-multi-factor"] }],
    };

    expect(isFraudHeaderValidationClean(body)).toBe(true);
  });

  test("is not clean when a warning names a different header", () => {
    const body = {
      code: "POTENTIALLY_INVALID_HEADERS",
      warnings: [{ code: "POTENTIALLY_INVALID_HEADER", message: "missing", headers: ["gov-client-user-ids"] }],
    };

    expect(isFraudHeaderValidationClean(body)).toBe(false);
  });

  test("is not clean when any error is present", () => {
    const body = { code: "INVALID_HEADERS", errors: [{ code: "MISSING_HEADER", message: "missing", headers: ["gov-client-device-id"] }] };

    expect(isFraudHeaderValidationClean(body)).toBe(false);
  });

  test("is not clean when a warning mixes an acceptable and an unacceptable header", () => {
    const body = {
      code: "POTENTIALLY_INVALID_HEADERS",
      warnings: [{ code: "POTENTIALLY_INVALID_HEADER", message: "mixed", headers: ["gov-client-multi-factor", "gov-client-user-ids"] }],
    };

    expect(isFraudHeaderValidationClean(body)).toBe(false);
  });
});

describe("isLossesAndAdjustmentsSupportedTaxYear", () => {
  test("is false for a tax year below Individual Losses 7.0's minimum", () => {
    expect(isLossesAndAdjustmentsSupportedTaxYear("2023-24")).toBe(false);
    expect(isLossesAndAdjustmentsSupportedTaxYear("2025-26")).toBe(false);
  });

  test("is true for the minimum supported tax year and later", () => {
    expect(isLossesAndAdjustmentsSupportedTaxYear("2026-27")).toBe(true);
    expect(isLossesAndAdjustmentsSupportedTaxYear("2027-28")).toBe(true);
  });
});

describe("bothBusinessesInCalculationIncomeSources", () => {
  test("is true when both business ids appear in the recorded income sources", () => {
    const transcript = [
      { step: "calculation-retrieve-income-sources", businessIncomeSources: [{ businessId: "B1" }, { businessId: "P1" }] },
    ];

    expect(bothBusinessesInCalculationIncomeSources(transcript, "B1", "P1")).toBe(true);
  });

  test("is false when only one business id appears", () => {
    const transcript = [{ step: "calculation-retrieve-income-sources", businessIncomeSources: [{ businessId: "B1" }] }];

    expect(bothBusinessesInCalculationIncomeSources(transcript, "B1", "P1")).toBe(false);
  });

  test("is false when the transcript carries no such entry", () => {
    expect(bothBusinessesInCalculationIncomeSources([], "B1", "P1")).toBe(false);
  });

  test("is false when businessIncomeSources is not an array", () => {
    const transcript = [{ step: "calculation-retrieve-income-sources", businessIncomeSources: [null] }];

    expect(bothBusinessesInCalculationIncomeSources(transcript, "B1", "P1")).toBe(false);
  });
});

describe("evaluateLossClaimsReadBack", () => {
  test("is skipped when the loss claim sequence did not run", () => {
    expect(evaluateLossClaimsReadBack([])).toBe("skipped");
  });

  test("is true when the self-employment and tax liability read-backs carry the expected fields, with no property leg", () => {
    const transcript = [
      { step: "self-employment-loss-claim-get", responseBody: { claims: { carryBack: { previousYearGeneralIncome: 100 } } } },
      { step: "tax-liability-adjustments-get", responseBody: { carryBackLossesDecrease: { incomeTax: 20 } } },
    ];

    expect(evaluateLossClaimsReadBack(transcript)).toBe(true);
  });

  test("is true when the property leg also read back its carry-forward and its carry-back 400", () => {
    const transcript = [
      { step: "self-employment-loss-claim-get", responseBody: { claims: { carryBack: { previousYearGeneralIncome: 100 } } } },
      { step: "tax-liability-adjustments-get", responseBody: { carryBackLossesDecrease: { incomeTax: 20 } } },
      { step: "uk-property-loss-claim-get", responseBody: { claims: { carryForward: { currentYearLosses: 300 } } } },
      { step: "property-carry-back-rejected", status: 400 },
    ];

    expect(evaluateLossClaimsReadBack(transcript)).toBe(true);
  });

  test("is false when the self-employment read-back carries no claims.carryBack", () => {
    const transcript = [
      { step: "self-employment-loss-claim-get", responseBody: { claims: {} } },
      { step: "tax-liability-adjustments-get", responseBody: { carryBackLossesDecrease: { incomeTax: 20 } } },
    ];

    expect(evaluateLossClaimsReadBack(transcript)).toBe(false);
  });

  test("is false when the tax liability read-back carries no carryBackLossesDecrease", () => {
    const transcript = [
      { step: "self-employment-loss-claim-get", responseBody: { claims: { carryBack: { previousYearGeneralIncome: 100 } } } },
      { step: "tax-liability-adjustments-get", responseBody: {} },
    ];

    expect(evaluateLossClaimsReadBack(transcript)).toBe(false);
  });

  test("is false when the property carry-back was not actually rejected with 400", () => {
    const transcript = [
      { step: "self-employment-loss-claim-get", responseBody: { claims: { carryBack: { previousYearGeneralIncome: 100 } } } },
      { step: "tax-liability-adjustments-get", responseBody: { carryBackLossesDecrease: { incomeTax: 20 } } },
      { step: "uk-property-loss-claim-get", responseBody: { claims: { carryForward: { currentYearLosses: 300 } } } },
      { step: "property-carry-back-rejected", status: 200 },
    ];

    expect(evaluateLossClaimsReadBack(transcript)).toBe(false);
  });
});

describe("evaluateSuspendTemporalValidationsHeaderOnWrites", () => {
  test("is skipped when no losses-or-adjustments write ran", () => {
    expect(evaluateSuspendTemporalValidationsHeaderOnWrites([])).toBe("skipped");
  });

  test("is true when every write carried the kebab-case header", () => {
    const transcript = [
      { step: "self-employment-loss-claim-put", requestHeaders: { "suspend-temporal-validations": "true" } },
      { step: "tax-liability-adjustments-put", requestHeaders: { "suspend-temporal-validations": "true" } },
      { step: "uk-property-loss-claim-put", requestHeaders: { "suspend-temporal-validations": "true" } },
      { step: "property-carry-back-rejected", requestHeaders: { "suspend-temporal-validations": "true" } },
    ];

    expect(evaluateSuspendTemporalValidationsHeaderOnWrites(transcript)).toBe(true);
  });

  test("is false when one write is missing the header", () => {
    const transcript = [
      { step: "self-employment-loss-claim-put", requestHeaders: { "suspend-temporal-validations": "true" } },
      { step: "tax-liability-adjustments-put", requestHeaders: {} },
    ];

    expect(evaluateSuspendTemporalValidationsHeaderOnWrites(transcript)).toBe(false);
  });

  test("ignores steps outside the losses-and-adjustments write list", () => {
    const transcript = [
      { step: "self-employment-loss-claim-put", requestHeaders: { "suspend-temporal-validations": "true" } },
      { step: "self-employment-loss-claim-get", requestHeaders: {} },
    ];

    expect(evaluateSuspendTemporalValidationsHeaderOnWrites(transcript)).toBe(true);
  });
});
