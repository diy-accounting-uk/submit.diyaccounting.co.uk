// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/obligations.test.js

import { describe, test, expect } from "vitest";
import { isValidPeriodKeyFormat, getObligationsForScenario } from "@app/http-simulator/scenarios/obligations.js";

/**
 * Period key validation tests based on HMRC MTD VAT API specification.
 * @see https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html
 *
 * Valid formats:
 * - Alphanumeric (YYXZ): 2-digit year + letter + alphanumeric
 *   - Monthly: 18AD, 18AE, 18AF (letter suffix)
 *   - Quarterly: 18A1, 18A2, 18A3, 18A4 (digit suffix)
 * - Numeric (NNNN): 4 digits (e.g., 0418, 1218)
 * - Special numeric: 0000 (no period) or 9999 (ceased trading)
 * - Hash format (#NNN): # followed by 3 digits (e.g., #001, #012)
 */
describe("http-simulator/scenarios/obligations", () => {
  describe("isValidPeriodKeyFormat", () => {
    // HMRC Alphanumeric format: YYXN (quarterly periods with digit suffix)
    test("accepts HMRC quarterly format - YYXN (e.g., 18A1, 18A2)", () => {
      expect(isValidPeriodKeyFormat("18A1")).toBe(true);
      expect(isValidPeriodKeyFormat("18A2")).toBe(true);
      expect(isValidPeriodKeyFormat("18A3")).toBe(true);
      expect(isValidPeriodKeyFormat("18A4")).toBe(true);
      expect(isValidPeriodKeyFormat("24B1")).toBe(true);
      expect(isValidPeriodKeyFormat("25A1")).toBe(true);
    });

    // HMRC Alphanumeric format: YYXX (monthly periods with letter suffix)
    test("accepts HMRC monthly format - YYXX (e.g., 18AD, 18AE, 18AF)", () => {
      expect(isValidPeriodKeyFormat("18AD")).toBe(true);
      expect(isValidPeriodKeyFormat("18AE")).toBe(true);
      expect(isValidPeriodKeyFormat("18AF")).toBe(true);
      expect(isValidPeriodKeyFormat("17NB")).toBe(true);
      expect(isValidPeriodKeyFormat("24AB")).toBe(true);
    });

    // HMRC Numeric format: NNNN (4 digits)
    test("accepts HMRC numeric format - NNNN (e.g., 0418, 1218)", () => {
      expect(isValidPeriodKeyFormat("0418")).toBe(true);
      expect(isValidPeriodKeyFormat("1218")).toBe(true);
      expect(isValidPeriodKeyFormat("0124")).toBe(true);
      expect(isValidPeriodKeyFormat("1224")).toBe(true);
    });

    // HMRC Special numeric values
    test("accepts HMRC special period keys - 0000 and 9999", () => {
      // 0000 = transactions not belonging to a particular period
      expect(isValidPeriodKeyFormat("0000")).toBe(true);
      // 9999 = period key when a company ceases trading
      expect(isValidPeriodKeyFormat("9999")).toBe(true);
    });

    // Hash format for annual/non-standard periods
    test("accepts HMRC hash format - #NNN (e.g., #001, #012)", () => {
      expect(isValidPeriodKeyFormat("#001")).toBe(true);
      expect(isValidPeriodKeyFormat("#012")).toBe(true);
      expect(isValidPeriodKeyFormat("#999")).toBe(true);
      expect(isValidPeriodKeyFormat("#000")).toBe(true);
    });

    test("accepts lowercase and converts to uppercase", () => {
      expect(isValidPeriodKeyFormat("24a1")).toBe(true);
      expect(isValidPeriodKeyFormat("25b2")).toBe(true);
      expect(isValidPeriodKeyFormat("17nb")).toBe(true);
      expect(isValidPeriodKeyFormat("18ad")).toBe(true);
    });

    test("rejects invalid period key formats", () => {
      expect(isValidPeriodKeyFormat("123")).toBe(false); // too short (3 chars)
      expect(isValidPeriodKeyFormat("12345")).toBe(false); // too long (5 chars)
      expect(isValidPeriodKeyFormat("ABCD")).toBe(false); // all letters (not valid)
      expect(isValidPeriodKeyFormat("2A11")).toBe(false); // wrong alphanumeric format
      expect(isValidPeriodKeyFormat("24A12")).toBe(false); // too long
      expect(isValidPeriodKeyFormat("#AB1")).toBe(false); // letters after # (must be digits)
      expect(isValidPeriodKeyFormat("#01")).toBe(false); // too short after #
      expect(isValidPeriodKeyFormat("#0001")).toBe(false); // too long after #
      expect(isValidPeriodKeyFormat("")).toBe(false); // empty
      expect(isValidPeriodKeyFormat("A123")).toBe(false); // starts with letter, not valid pattern
    });
  });

  describe("getObligationsForScenario", () => {
    test("returns obligations for default scenario (no scenario header)", () => {
      const result = getObligationsForScenario(undefined);
      expect(result).toHaveProperty("obligations");
      expect(Array.isArray(result.obligations)).toBe(true);
      expect(result.obligations.length).toBeGreaterThan(0);

      // Check that each obligation has the required fields
      for (const ob of result.obligations) {
        expect(ob).toHaveProperty("periodKey");
        expect(ob).toHaveProperty("start");
        expect(ob).toHaveProperty("end");
        expect(ob).toHaveProperty("due");
        expect(ob).toHaveProperty("status");
        // Period key should be valid HMRC format
        expect(isValidPeriodKeyFormat(ob.periodKey)).toBe(true);
      }
    });

    test("returns obligations for QUARTERLY_NONE_MET scenario", () => {
      const result = getObligationsForScenario("QUARTERLY_NONE_MET");
      expect(result).toHaveProperty("obligations");
      expect(result.obligations).toHaveLength(4);

      // All should be open
      for (const ob of result.obligations) {
        expect(ob.status).toBe("O");
        expect(isValidPeriodKeyFormat(ob.periodKey)).toBe(true);
      }
    });

    test("returns error for NOT_FOUND scenario", () => {
      const result = getObligationsForScenario("NOT_FOUND");
      expect(result).toHaveProperty("status", 404);
      expect(result).toHaveProperty("body");
      expect(result.body.code).toBe("NOT_FOUND");
    });

    test("returns error for INSOLVENT_TRADER scenario", () => {
      const result = getObligationsForScenario("INSOLVENT_TRADER");
      expect(result).toHaveProperty("status", 403);
      expect(result).toHaveProperty("body");
      expect(result.body.code).toBe("INSOLVENT_TRADER");
    });

    test("returns error for VRN_INVALID scenario", () => {
      const result = getObligationsForScenario("VRN_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result).toHaveProperty("body");
      expect(result.body.code).toBe("VRN_INVALID");
    });

    test("returns delay for slow scenario", () => {
      const result = getObligationsForScenario("SUBMIT_HMRC_API_HTTP_SLOW_10S");
      expect(result).toHaveProperty("delayMs", 10000);
      expect(result).toHaveProperty("obligations");
      expect(Array.isArray(result.obligations)).toBe(true);
    });

    test("handles case-insensitive scenario names", () => {
      const result1 = getObligationsForScenario("quarterly_none_met");
      const result2 = getObligationsForScenario("QUARTERLY_NONE_MET");

      expect(result1).toHaveProperty("obligations");
      expect(result2).toHaveProperty("obligations");
      expect(result1.obligations.length).toBe(result2.obligations.length);
    });

    test("returns default obligations for unknown scenario", () => {
      const result = getObligationsForScenario("UNKNOWN_SCENARIO_XYZ");
      expect(result).toHaveProperty("obligations");
      expect(Array.isArray(result.obligations)).toBe(true);
      expect(result.obligations.length).toBeGreaterThan(0);
    });

    test("randomizes period keys for each call", () => {
      const periodKeys = new Set();
      for (let i = 0; i < 10; i++) {
        const result = getObligationsForScenario(undefined);
        periodKeys.add(result.obligations[0].periodKey);
      }
      // Should have at least some variation (statistically almost certain with 10 calls)
      expect(periodKeys.size).toBeGreaterThan(1);
    });
  });
});
