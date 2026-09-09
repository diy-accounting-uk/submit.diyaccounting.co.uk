// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/itsa-sandbox-year.test.js

import { describe, test, expect } from "vitest";

import {
  extractCheckpointId,
  selectOpenObligationPeriods,
  deriveAccountingPeriodFromObligationPeriods,
  buildQuarterlyTestFigures,
  buildTestBusinessRequestBody,
  buildItsaStatusRequestBody,
  isFraudHeaderValidationClean,
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

describe("selectOpenObligationPeriods", () => {
  const businessId = "XAIS12345678901";

  test("returns open periods sorted by periodStartDate", () => {
    const body = {
      obligations: [
        {
          businessId,
          obligationDetails: [
            { periodStartDate: "2023-10-06", periodEndDate: "2024-01-05", dueDate: "2024-02-05", status: "open" },
            { periodStartDate: "2023-04-06", periodEndDate: "2023-07-05", dueDate: "2023-08-05", status: "open" },
            { periodStartDate: "2023-07-06", periodEndDate: "2023-10-05", dueDate: "2023-11-05", status: "fulfilled" },
          ],
        },
      ],
    };

    const result = selectOpenObligationPeriods(body, businessId);

    expect(result.map((period) => period.periodStartDate)).toEqual(["2023-04-06", "2023-10-06"]);
  });

  test("throws when the business has no open obligations", () => {
    const body = {
      obligations: [
        {
          businessId,
          obligationDetails: [{ periodStartDate: "2023-04-06", periodEndDate: "2023-07-05", dueDate: "2023-08-05", status: "fulfilled" }],
        },
      ],
    };

    expect(() => selectOpenObligationPeriods(body, businessId)).toThrow(/No open income-and-expenditure obligations/);
  });

  test("throws when the business is not present in the response", () => {
    expect(() => selectOpenObligationPeriods({ obligations: [] }, businessId)).toThrow(/No open income-and-expenditure obligations/);
  });
});

describe("deriveAccountingPeriodFromObligationPeriods", () => {
  test("spans the earliest start to the latest end", () => {
    const periods = [
      { periodStartDate: "2023-07-06", periodEndDate: "2023-10-05" },
      { periodStartDate: "2023-04-06", periodEndDate: "2023-07-05" },
      { periodStartDate: "2024-01-06", periodEndDate: "2024-04-05" },
      { periodStartDate: "2023-10-06", periodEndDate: "2024-01-05" },
    ];

    expect(deriveAccountingPeriodFromObligationPeriods(periods)).toEqual({
      accountingPeriodStartDate: "2023-04-06",
      accountingPeriodEndDate: "2024-04-05",
    });
  });

  test("throws on an empty period list", () => {
    expect(() => deriveAccountingPeriodFromObligationPeriods([])).toThrow(/empty obligation period list/);
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
