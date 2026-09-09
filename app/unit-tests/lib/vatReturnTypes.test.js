// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/vatReturnTypes.test.js

import { describe, test, expect } from "vitest";
import {
  VAT_BOX_CONFIG,
  calculateTotalVatDue,
  calculateNetVatDue,
  roundToDecimals,
  isValidMonetaryAmount,
  isValidWholeAmount,
  validateVatReturnBody,
  buildVatReturnBody,
  buildVatReturnBodyFromLegacy,
  detectRequestFormat,
} from "@app/lib/vatReturnTypes.js";

describe("vatReturnTypes", () => {
  describe("roundToDecimals", () => {
    test("rounds to 2 decimal places", () => {
      expect(roundToDecimals(1.234, 2)).toBe(1.23);
      expect(roundToDecimals(1.235, 2)).toBe(1.24);
      expect(roundToDecimals(1.2, 2)).toBe(1.2);
    });

    test("rounds to 0 decimal places", () => {
      expect(roundToDecimals(1.5, 0)).toBe(2);
      expect(roundToDecimals(1.4, 0)).toBe(1);
    });
  });

  describe("calculateTotalVatDue (Box 3)", () => {
    test("calculates sum of Box 1 and Box 2", () => {
      expect(calculateTotalVatDue(1000.0, 200.0)).toBe(1200.0);
      expect(calculateTotalVatDue(0, 0)).toBe(0);
      expect(calculateTotalVatDue(1234.56, 789.12)).toBe(2023.68);
    });

    test("handles negative values", () => {
      expect(calculateTotalVatDue(-100, 500)).toBe(400);
      expect(calculateTotalVatDue(100, -500)).toBe(-400);
    });

    test("rounds to 2 decimal places", () => {
      expect(calculateTotalVatDue(1.111, 2.222)).toBe(3.33);
    });
  });

  describe("calculateNetVatDue (Box 5)", () => {
    test("calculates absolute difference of Box 3 and Box 4", () => {
      expect(calculateNetVatDue(1000.0, 200.0)).toBe(800.0);
      expect(calculateNetVatDue(200.0, 1000.0)).toBe(800.0); // Absolute value
      expect(calculateNetVatDue(500.0, 500.0)).toBe(0);
    });

    test("always returns positive value", () => {
      expect(calculateNetVatDue(-1000, 500)).toBeGreaterThanOrEqual(0);
      expect(calculateNetVatDue(500, -1000)).toBeGreaterThanOrEqual(0);
    });

    test("rounds to 2 decimal places", () => {
      expect(calculateNetVatDue(1000.115, 100.005)).toBe(900.11);
    });
  });

  describe("isValidMonetaryAmount", () => {
    test("accepts valid monetary amounts (2 decimals)", () => {
      expect(isValidMonetaryAmount(1000.0)).toBe(true);
      expect(isValidMonetaryAmount(0)).toBe(true);
      expect(isValidMonetaryAmount(-500.5)).toBe(true);
      expect(isValidMonetaryAmount(9999999999999.99)).toBe(true);
    });

    test("rejects amounts with more than 2 decimals", () => {
      expect(isValidMonetaryAmount(1000.001)).toBe(false);
      expect(isValidMonetaryAmount(100.123)).toBe(false);
    });

    test("rejects amounts outside HMRC range", () => {
      expect(isValidMonetaryAmount(99999999999999.99)).toBe(false);
      expect(isValidMonetaryAmount(-99999999999999.99)).toBe(false);
    });

    test("rejects non-numbers", () => {
      expect(isValidMonetaryAmount("1000")).toBe(false);
      expect(isValidMonetaryAmount(null)).toBe(false);
      expect(isValidMonetaryAmount(undefined)).toBe(false);
      expect(isValidMonetaryAmount(NaN)).toBe(false);
      expect(isValidMonetaryAmount(Infinity)).toBe(false);
    });
  });

  describe("isValidWholeAmount (Boxes 6-9)", () => {
    test("accepts valid integers", () => {
      expect(isValidWholeAmount(1000)).toBe(true);
      expect(isValidWholeAmount(0)).toBe(true);
      expect(isValidWholeAmount(-500)).toBe(true);
    });

    test("rejects decimal values", () => {
      expect(isValidWholeAmount(1000.5)).toBe(false);
      expect(isValidWholeAmount(100.01)).toBe(false);
    });

    test("rejects non-numbers", () => {
      expect(isValidWholeAmount("1000")).toBe(false);
      expect(isValidWholeAmount(null)).toBe(false);
    });
  });

  describe("validateVatReturnBody", () => {
    const validBody = {
      periodKey: "24A1",
      vatDueSales: 1000.0,
      vatDueAcquisitions: 200.0,
      totalVatDue: 1200.0,
      vatReclaimedCurrPeriod: 300.0,
      netVatDue: 900.0,
      totalValueSalesExVAT: 5000,
      totalValuePurchasesExVAT: 1500,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
    };

    test("accepts valid 9-box body", () => {
      const result = validateVatReturnBody(validBody);
      expect(result.valid).toBe(true);
    });

    test("rejects missing periodKey", () => {
      const body = { ...validBody, periodKey: undefined };
      const result = validateVatReturnBody(body);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_REQUEST");
    });

    test("rejects missing required fields", () => {
      const body = { ...validBody, vatDueSales: undefined };
      const result = validateVatReturnBody(body);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_REQUEST");
    });

    test("rejects invalid monetary amounts", () => {
      const body = { ...validBody, vatDueSales: 1000.001 };
      const result = validateVatReturnBody(body);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_MONETARY_AMOUNT");
    });

    test("rejects invalid whole amounts", () => {
      const body = { ...validBody, totalValueSalesExVAT: 1000.5 };
      const result = validateVatReturnBody(body);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_WHOLE_AMOUNT");
    });

    test("rejects negative netVatDue", () => {
      const body = { ...validBody, netVatDue: -100 };
      const result = validateVatReturnBody(body);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_NET_VAT_DUE");
    });

    test("rejects null body", () => {
      const result = validateVatReturnBody(null);
      expect(result.valid).toBe(false);
    });
  });

  describe("buildVatReturnBody", () => {
    test("builds complete body with calculated fields", () => {
      const params = {
        periodKey: "24A1",
        vatDueSales: 1000,
        vatDueAcquisitions: 200,
        vatReclaimedCurrPeriod: 300,
        totalValueSalesExVAT: 5000,
        totalValuePurchasesExVAT: 1500,
        totalValueGoodsSuppliedExVAT: 100,
        totalAcquisitionsExVAT: 50,
      };

      const result = buildVatReturnBody(params);

      expect(result.periodKey).toBe("24A1");
      expect(result.vatDueSales).toBe(1000);
      expect(result.vatDueAcquisitions).toBe(200);
      expect(result.totalVatDue).toBe(1200); // Calculated: 1000 + 200
      expect(result.vatReclaimedCurrPeriod).toBe(300);
      expect(result.netVatDue).toBe(900); // Calculated: |1200 - 300|
      expect(result.totalValueSalesExVAT).toBe(5000);
      expect(result.totalValuePurchasesExVAT).toBe(1500);
      expect(result.totalValueGoodsSuppliedExVAT).toBe(100);
      expect(result.totalAcquisitionsExVAT).toBe(50);
      expect(result.finalised).toBe(true);
    });

    test("rounds decimal values correctly", () => {
      const params = {
        periodKey: "24A1",
        vatDueSales: 1000.115,
        vatDueAcquisitions: 200.225,
        vatReclaimedCurrPeriod: 300.335,
        totalValueSalesExVAT: 5000.7,
        totalValuePurchasesExVAT: 1500.3,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
      };

      const result = buildVatReturnBody(params);

      expect(result.vatDueSales).toBe(1000.12);
      expect(result.vatDueAcquisitions).toBe(200.23);
      expect(result.totalValueSalesExVAT).toBe(5001); // Rounded to integer
      expect(result.totalValuePurchasesExVAT).toBe(1500); // Rounded to integer
    });
  });

  describe("buildVatReturnBodyFromLegacy", () => {
    test("builds body from single vatDue field", () => {
      const params = { periodKey: "24A1", vatDue: 1000 };
      const result = buildVatReturnBodyFromLegacy(params);

      expect(result.periodKey).toBe("24A1");
      expect(result.vatDueSales).toBe(1000);
      expect(result.vatDueAcquisitions).toBe(0);
      expect(result.totalVatDue).toBe(1000);
      expect(result.vatReclaimedCurrPeriod).toBe(0);
      expect(result.netVatDue).toBe(1000);
      expect(result.totalValueSalesExVAT).toBe(0);
      expect(result.totalValuePurchasesExVAT).toBe(0);
      expect(result.totalValueGoodsSuppliedExVAT).toBe(0);
      expect(result.totalAcquisitionsExVAT).toBe(0);
      expect(result.finalised).toBe(true);
    });

    test("handles string vatDue", () => {
      const params = { periodKey: "24A1", vatDue: "500.50" };
      const result = buildVatReturnBodyFromLegacy(params);

      expect(result.vatDueSales).toBe(500.5);
      expect(result.netVatDue).toBe(500.5);
    });

    test("handles negative vatDue", () => {
      const params = { periodKey: "24A1", vatDue: -100 };
      const result = buildVatReturnBodyFromLegacy(params);

      expect(result.vatDueSales).toBe(-100);
      expect(result.netVatDue).toBe(100); // Absolute value
    });
  });

  describe("detectRequestFormat", () => {
    test("detects 9-box format when vatDueSales present", () => {
      const body = { vatDueSales: 1000 };
      expect(detectRequestFormat(body)).toBe("nine-box");
    });

    test("detects legacy format when only vatDue present", () => {
      const body = { vatDue: 1000 };
      expect(detectRequestFormat(body)).toBe("legacy");
    });

    test("defaults to legacy for null body", () => {
      expect(detectRequestFormat(null)).toBe("legacy");
    });

    test("defaults to legacy for empty body", () => {
      expect(detectRequestFormat({})).toBe("legacy");
    });
  });

  describe("VAT_BOX_CONFIG", () => {
    test("has correct box numbers", () => {
      expect(VAT_BOX_CONFIG.vatDueSales.box).toBe(1);
      expect(VAT_BOX_CONFIG.vatDueAcquisitions.box).toBe(2);
      expect(VAT_BOX_CONFIG.totalVatDue.box).toBe(3);
      expect(VAT_BOX_CONFIG.vatReclaimedCurrPeriod.box).toBe(4);
      expect(VAT_BOX_CONFIG.netVatDue.box).toBe(5);
      expect(VAT_BOX_CONFIG.totalValueSalesExVAT.box).toBe(6);
      expect(VAT_BOX_CONFIG.totalValuePurchasesExVAT.box).toBe(7);
      expect(VAT_BOX_CONFIG.totalValueGoodsSuppliedExVAT.box).toBe(8);
      expect(VAT_BOX_CONFIG.totalAcquisitionsExVAT.box).toBe(9);
    });

    test("marks calculated fields", () => {
      expect(VAT_BOX_CONFIG.totalVatDue.calculated).toBe(true);
      expect(VAT_BOX_CONFIG.netVatDue.calculated).toBe(true);
      expect(VAT_BOX_CONFIG.vatDueSales.calculated).toBeUndefined();
    });

    test("has correct types", () => {
      expect(VAT_BOX_CONFIG.vatDueSales.type).toBe("decimal");
      expect(VAT_BOX_CONFIG.totalValueSalesExVAT.type).toBe("integer");
    });
  });
});
