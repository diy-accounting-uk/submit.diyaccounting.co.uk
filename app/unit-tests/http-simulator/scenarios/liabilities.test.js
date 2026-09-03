// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/http-simulator/scenarios/liabilities.test.js

import { describe, test, expect } from "vitest";
import { getLiabilitiesForScenario } from "@app/http-simulator/scenarios/liabilities.js";

describe("http-simulator/scenarios/liabilities", () => {
  describe("getLiabilitiesForScenario", () => {
    test("returns an empty list for the default scenario (no scenario header) - matches HMRC's own default", () => {
      const result = getLiabilitiesForScenario(undefined);
      expect(result).toHaveProperty("liabilities");
      expect(Array.isArray(result.liabilities)).toBe(true);
      expect(result.liabilities).toHaveLength(0);
    });

    test("returns liabilities for SINGLE_LIABILITY scenario", () => {
      const result = getLiabilitiesForScenario("SINGLE_LIABILITY");
      expect(result).toHaveProperty("liabilities");
      expect(result.liabilities).toHaveLength(1);
      const liability = result.liabilities[0];
      expect(liability).toHaveProperty("taxPeriod");
      expect(liability).toHaveProperty("type");
      expect(liability).toHaveProperty("originalAmount");
      expect(liability).toHaveProperty("outstandingAmount");
      expect(liability).toHaveProperty("due");
    });

    test("returns liabilities for MULTIPLE_LIABILITIES scenario", () => {
      const result = getLiabilitiesForScenario("MULTIPLE_LIABILITIES");
      expect(result).toHaveProperty("liabilities");
      expect(result.liabilities.length).toBeGreaterThan(1);
    });

    test("returns error for NOT_FOUND scenario", () => {
      const result = getLiabilitiesForScenario("NOT_FOUND");
      expect(result).toHaveProperty("status", 404);
      expect(result.body.code).toBe("NOT_FOUND");
    });

    test("returns error for INSOLVENT_TRADER scenario", () => {
      const result = getLiabilitiesForScenario("INSOLVENT_TRADER");
      expect(result).toHaveProperty("status", 403);
      expect(result.body.code).toBe("RULE_INSOLVENT_TRADER");
    });

    test("returns error for VRN_INVALID scenario", () => {
      const result = getLiabilitiesForScenario("VRN_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("VRN_INVALID");
    });

    test("returns error for DATE_FROM_INVALID scenario", () => {
      const result = getLiabilitiesForScenario("DATE_FROM_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("DATE_FROM_INVALID");
    });

    test("returns error for DATE_TO_INVALID scenario", () => {
      const result = getLiabilitiesForScenario("DATE_TO_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("DATE_TO_INVALID");
    });

    test("returns error for DATE_RANGE_INVALID scenario", () => {
      const result = getLiabilitiesForScenario("DATE_RANGE_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("DATE_RANGE_INVALID");
    });

    test("handles case-insensitive scenario names", () => {
      const result1 = getLiabilitiesForScenario("single_liability");
      const result2 = getLiabilitiesForScenario("SINGLE_LIABILITY");
      expect(result1.liabilities.length).toBe(result2.liabilities.length);
    });

    test("returns an empty list for an unknown scenario", () => {
      const result = getLiabilitiesForScenario("UNKNOWN_SCENARIO_XYZ");
      expect(result).toHaveProperty("liabilities");
      expect(result.liabilities).toHaveLength(0);
    });
  });
});
