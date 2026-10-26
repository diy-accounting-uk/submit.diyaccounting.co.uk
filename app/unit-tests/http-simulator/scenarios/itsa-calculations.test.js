// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/itsa-calculations.test.js

import { describe, test, expect } from "vitest";
import { getCalculationForScenario } from "@app/http-simulator/scenarios/itsa-calculations.js";

describe("http-simulator/scenarios/itsa-calculations", () => {
  test("a default calculation carries the period and date of the tax year asked for", () => {
    const { calculation } = getCalculationForScenario(undefined, "AA123456A", "2026-27", "calc-1", "in-year");

    expect(calculation.metadata.taxYear).toBe("2026-27");
    expect(calculation.metadata.periodFrom).toBe("2026-04-06");
    expect(calculation.metadata.periodTo).toBe("2027-04-05");
    expect(calculation.metadata.calculationTimestamp).toBe("2026-06-15T09:30:00.000Z");
  });

  test("the Gift Aid example carries the period of the tax year asked for", () => {
    const { calculation } = getCalculationForScenario("UK_SE_GIFTAID_EXAMPLE", "AA123456A", "2025-26", "calc-2", "intent-to-finalise");

    expect(calculation.metadata.periodFrom).toBe("2025-04-06");
    expect(calculation.metadata.periodTo).toBe("2026-04-05");
    expect(calculation.metadata.calculationType).toBe("intent-to-finalise");
  });

  test("a calculation that has errors carries the period of the tax year asked for", () => {
    const { calculation } = getCalculationForScenario("ERROR_MESSAGES_EXIST", "AA123456A", "2024-25", "calc-3");

    expect(calculation.metadata.periodFrom).toBe("2024-04-06");
    expect(calculation.metadata.periodTo).toBe("2025-04-05");
  });
});
