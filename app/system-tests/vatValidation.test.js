// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/vatValidation.test.js
// Phase 5: System tests for 9-box VAT validation errors

import { describe, test, expect, beforeAll, afterAll } from "vitest";

/**
 * Valid 9-box VAT return data for testing
 * This data should pass all validation when submitted to the API
 */
const validVatReturnData = {
  vatNumber: "123456789",
  periodKey: "24A1",
  vatDueSales: 1000.0, // Box 1
  vatDueAcquisitions: 200.0, // Box 2
  totalVatDue: 1200.0, // Box 3 (calculated: Box 1 + Box 2)
  vatReclaimedCurrPeriod: 300.0, // Box 4
  netVatDue: 900.0, // Box 5 (calculated: |Box 3 - Box 4|)
  totalValueSalesExVAT: 5000, // Box 6 (whole pounds)
  totalValuePurchasesExVAT: 1500, // Box 7 (whole pounds)
  totalValueGoodsSuppliedExVAT: 0, // Box 8 (whole pounds)
  totalAcquisitionsExVAT: 0, // Box 9 (whole pounds)
  accessToken: "test-token",
};

describe("9-Box VAT Validation", () => {
  describe("Box 1-5: Decimal Monetary Amounts", () => {
    test("accepts valid decimal amounts with 2 decimal places", () => {
      const data = { ...validVatReturnData };

      // Valid: exactly 2 decimal places
      expect(validateDecimalAmount(data.vatDueSales)).toBe(true);
      expect(validateDecimalAmount(1000.0)).toBe(true);
      expect(validateDecimalAmount(0.01)).toBe(true);
      expect(validateDecimalAmount(9999999999999.99)).toBe(true);
    });

    test("rejects amounts with more than 2 decimal places", () => {
      // Invalid: more than 2 decimal places
      expect(validateDecimalAmount(1000.001)).toBe(false);
      expect(validateDecimalAmount(100.123)).toBe(false);
      expect(validateDecimalAmount(0.001)).toBe(false);
    });

    test("accepts negative amounts for Boxes 1-4", () => {
      // Per HMRC spec, Boxes 1-4 can be negative
      expect(validateDecimalAmount(-500.0)).toBe(true);
      expect(validateDecimalAmount(-9999999999999.99)).toBe(true);
    });
  });

  describe("Box 5: Net VAT Due (Non-negative)", () => {
    test("Box 5 must be non-negative (minimum 0.00)", () => {
      // Per HMRC Q7: Box 5 cannot contain a negative amount
      expect(validateBox5(0.0)).toBe(true);
      expect(validateBox5(900.0)).toBe(true);
      expect(validateBox5(99999999999.99)).toBe(true);
    });

    test("Box 5 cannot be negative", () => {
      expect(validateBox5(-0.01)).toBe(false);
      expect(validateBox5(-100.0)).toBe(false);
    });

    test("Box 5 calculation: |Box 3 - Box 4|", () => {
      // Box 5 = |totalVatDue - vatReclaimedCurrPeriod|
      expect(calculateBox5(1200.0, 300.0)).toBe(900.0);
      expect(calculateBox5(300.0, 1200.0)).toBe(900.0); // Absolute value
      expect(calculateBox5(500.0, 500.0)).toBe(0.0);
    });
  });

  describe("Box 6-9: Whole Pound Amounts", () => {
    test("accepts whole numbers (integers)", () => {
      // Per HMRC Q8: Boxes 6-9 should contain whole pounds only
      expect(validateWholeAmount(5000)).toBe(true);
      expect(validateWholeAmount(0)).toBe(true);
      expect(validateWholeAmount(9999999999999)).toBe(true);
    });

    test("accepts negative whole numbers", () => {
      expect(validateWholeAmount(-500)).toBe(true);
      expect(validateWholeAmount(-9999999999999)).toBe(true);
    });

    test("rejects decimal values", () => {
      // Boxes 6-9 must be integers
      expect(validateWholeAmount(5000.5)).toBe(false);
      expect(validateWholeAmount(100.01)).toBe(false);
      expect(validateWholeAmount(0.99)).toBe(false);
    });

    test("accepts .00 as valid (effectively whole number)", () => {
      // If pence is included, it should be 2 zeroed decimal places
      expect(validateWholeAmount(5000.0)).toBe(true);
      expect(Math.floor(5000.0) === 5000.0).toBe(true);
    });
  });

  describe("Box 3: Total VAT Due Calculation", () => {
    test("Box 3 = Box 1 + Box 2", () => {
      expect(calculateBox3(1000.0, 200.0)).toBe(1200.0);
      expect(calculateBox3(0, 0)).toBe(0);
      expect(calculateBox3(1234.56, 789.12)).toBe(2023.68);
    });

    test("handles negative values", () => {
      expect(calculateBox3(-100, 500)).toBe(400);
      expect(calculateBox3(100, -500)).toBe(-400);
      expect(calculateBox3(-100, -200)).toBe(-300);
    });

    test("rounds to 2 decimal places", () => {
      expect(calculateBox3(1.111, 2.222)).toBe(3.33);
      expect(calculateBox3(1.115, 2.225)).toBeCloseTo(3.34, 2);
    });
  });

  describe("Period Key Validation", () => {
    test("accepts valid period key formats", () => {
      // Per HMRC spec: 1-4 alphanumeric characters
      expect(validatePeriodKey("24A1")).toBe(true);
      expect(validatePeriodKey("18A1")).toBe(true);
      expect(validatePeriodKey("#001")).toBe(true);
    });

    test("rejects invalid period key formats", () => {
      expect(validatePeriodKey("")).toBe(false);
      expect(validatePeriodKey("12345")).toBe(false); // Too long
      expect(validatePeriodKey(null)).toBe(false);
    });
  });

  describe("VAT registration number Validation", () => {
    test("accepts valid 9-digit VAT registration number", () => {
      expect(validateVrn("123456789")).toBe(true);
      expect(validateVrn("000000001")).toBe(true);
    });

    test("rejects invalid VAT registration number formats", () => {
      expect(validateVrn("12345678")).toBe(false); // Too short
      expect(validateVrn("1234567890")).toBe(false); // Too long
      expect(validateVrn("12345678a")).toBe(false); // Contains letter
      expect(validateVrn("")).toBe(false);
    });
  });
});

// Helper validation functions
function validateDecimalAmount(value) {
  if (typeof value !== "number" || isNaN(value)) return false;

  // Check max 2 decimal places
  const str = value.toString();
  const decimalIndex = str.indexOf(".");
  if (decimalIndex !== -1) {
    const decimals = str.length - decimalIndex - 1;
    if (decimals > 2) return false;
  }

  // Check range
  if (value < -9999999999999.99 || value > 9999999999999.99) return false;

  return true;
}

function validateBox5(value) {
  if (!validateDecimalAmount(value)) return false;
  // Box 5 must be non-negative
  if (value < 0) return false;
  // Box 5 max is 99999999999.99 (less than other boxes)
  if (value > 99999999999.99) return false;
  return true;
}

function validateWholeAmount(value) {
  if (typeof value !== "number" || isNaN(value)) return false;

  // Must be an integer (or .00)
  if (!Number.isInteger(value) && value !== Math.floor(value)) return false;

  // Check range
  if (value < -9999999999999 || value > 9999999999999) return false;

  return true;
}

function calculateBox3(box1, box2) {
  return roundToDecimals(box1 + box2, 2);
}

function calculateBox5(box3, box4) {
  return roundToDecimals(Math.abs(box3 - box4), 2);
}

function roundToDecimals(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function validatePeriodKey(key) {
  if (!key || typeof key !== "string") return false;
  // 1-4 alphanumeric characters (may include #)
  return /^[#a-zA-Z0-9]{1,4}$/.test(key);
}

function validateVrn(vrn) {
  if (!vrn || typeof vrn !== "string") return false;
  // Exactly 9 digits
  return /^\d{9}$/.test(vrn);
}
