// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/http-simulator/scenarios/payments.test.js

import { describe, test, expect } from "vitest";
import { getPaymentsForScenario } from "@app/http-simulator/scenarios/payments.js";

describe("http-simulator/scenarios/payments", () => {
  describe("getPaymentsForScenario", () => {
    test("returns an empty list for the default scenario (no scenario header) - matches HMRC's own default", () => {
      const result = getPaymentsForScenario(undefined);
      expect(result).toHaveProperty("payments");
      expect(Array.isArray(result.payments)).toBe(true);
      expect(result.payments).toHaveLength(0);
    });

    test("returns payments for SINGLE_PAYMENT scenario", () => {
      const result = getPaymentsForScenario("SINGLE_PAYMENT");
      expect(result).toHaveProperty("payments");
      expect(result.payments).toHaveLength(1);
      const payment = result.payments[0];
      expect(payment).toHaveProperty("amount");
      expect(payment).toHaveProperty("received");
    });

    test("returns payments for MULTIPLE_PAYMENTS scenario, including one not yet received", () => {
      const result = getPaymentsForScenario("MULTIPLE_PAYMENTS");
      expect(result).toHaveProperty("payments");
      expect(result.payments.length).toBeGreaterThan(1);
      expect(result.payments.some((p) => p.received === undefined)).toBe(true);
    });

    test("returns error for INSOLVENT_TRADER scenario", () => {
      const result = getPaymentsForScenario("INSOLVENT_TRADER");
      expect(result).toHaveProperty("status", 403);
      expect(result.body.code).toBe("RULE_INSOLVENT_TRADER");
    });

    test("returns error for VRN_INVALID scenario", () => {
      const result = getPaymentsForScenario("VRN_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("VRN_INVALID");
    });

    test("returns error for DATE_FROM_INVALID scenario", () => {
      const result = getPaymentsForScenario("DATE_FROM_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("DATE_FROM_INVALID");
    });

    test("returns error for DATE_TO_INVALID scenario", () => {
      const result = getPaymentsForScenario("DATE_TO_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("DATE_TO_INVALID");
    });

    test("returns error for DATE_RANGE_INVALID scenario", () => {
      const result = getPaymentsForScenario("DATE_RANGE_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("DATE_RANGE_INVALID");
    });

    test("handles case-insensitive scenario names", () => {
      const result1 = getPaymentsForScenario("single_payment");
      const result2 = getPaymentsForScenario("SINGLE_PAYMENT");
      expect(result1.payments.length).toBe(result2.payments.length);
    });

    test("returns an empty list for an unknown scenario", () => {
      const result = getPaymentsForScenario("UNKNOWN_SCENARIO_XYZ");
      expect(result).toHaveProperty("payments");
      expect(result.payments).toHaveLength(0);
    });
  });
});
