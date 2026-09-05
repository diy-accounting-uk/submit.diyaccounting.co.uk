// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/hmrcValidation.test.js

import { describe, test, expect } from "vitest";
import {
  isValidVrn,
  isValidNino,
  isValidPeriodKey,
  isValidIsoDate,
  isValidDateRange,
  isValidVatMonetaryAmount,
  isValidNetVatDue,
  isValidVatWholeAmount,
  isValidTotalVatDueCalculation,
  isValidNetVatDueCalculation,
  maskIpAddress,
  maskDeviceId,
  getHmrcErrorMessage,
  extractHmrcErrorCode,
} from "@app/lib/hmrcValidation.js";

describe("hmrcValidation", () => {
  describe("isValidVrn", () => {
    test("accepts valid 9-digit VAT registration number", () => {
      expect(isValidVrn("123456789")).toBe(true);
      expect(isValidVrn("111222333")).toBe(true);
      expect(isValidVrn(123456789)).toBe(true);
    });

    test("rejects VAT registration number with wrong length", () => {
      expect(isValidVrn("12345678")).toBe(false); // 8 digits
      expect(isValidVrn("1234567890")).toBe(false); // 10 digits
      expect(isValidVrn("")).toBe(false); // empty
    });

    test("rejects VAT registration number with non-numeric characters", () => {
      expect(isValidVrn("12345678A")).toBe(false);
      expect(isValidVrn("ABC123456")).toBe(false);
      expect(isValidVrn("123-456-789")).toBe(false);
    });
  });

  describe("isValidNino", () => {
    test("accepts a valid NINO", () => {
      expect(isValidNino("AB123456C")).toBe(true);
      expect(isValidNino("SN123456D")).toBe(true);
    });

    test("accepts a valid NINO with spaces, case-insensitively", () => {
      expect(isValidNino("ab 12 34 56 c")).toBe(true);
    });

    test("rejects a NINO with a reserved prefix", () => {
      expect(isValidNino("BG123456C")).toBe(false);
      expect(isValidNino("GB123456C")).toBe(false);
      expect(isValidNino("NK123456C")).toBe(false);
      expect(isValidNino("KN123456C")).toBe(false);
      expect(isValidNino("TN123456C")).toBe(false);
      expect(isValidNino("NT123456C")).toBe(false);
      expect(isValidNino("ZZ123456C")).toBe(false);
    });

    test("rejects a NINO with disallowed letters", () => {
      expect(isValidNino("DA123456C")).toBe(false); // D not allowed as first letter
      expect(isValidNino("AO123456C")).toBe(false); // O not allowed as second letter
    });

    test("rejects a NINO with an invalid suffix letter", () => {
      expect(isValidNino("AB123456E")).toBe(false);
    });

    test("rejects a NINO with the wrong number of digits", () => {
      expect(isValidNino("AB12345C")).toBe(false); // 5 digits
      expect(isValidNino("AB1234567C")).toBe(false); // 7 digits
    });

    test("rejects a NINO with no letters or all digits", () => {
      expect(isValidNino("123456789")).toBe(false);
      expect(isValidNino("")).toBe(false);
    });
  });

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
  describe("isValidPeriodKey", () => {
    // HMRC Alphanumeric format: YYXZ (quarterly periods with digit suffix)
    test("accepts HMRC quarterly format - YYXN (e.g., 18A1, 18A2)", () => {
      expect(isValidPeriodKey("18A1")).toBe(true);
      expect(isValidPeriodKey("18A2")).toBe(true);
      expect(isValidPeriodKey("18A3")).toBe(true);
      expect(isValidPeriodKey("18A4")).toBe(true);
      expect(isValidPeriodKey("24B1")).toBe(true);
      expect(isValidPeriodKey("25A1")).toBe(true);
    });

    // HMRC Alphanumeric format: YYXX (monthly periods with letter suffix)
    test("accepts HMRC monthly format - YYXX (e.g., 18AD, 18AE, 18AF)", () => {
      expect(isValidPeriodKey("18AD")).toBe(true);
      expect(isValidPeriodKey("18AE")).toBe(true);
      expect(isValidPeriodKey("18AF")).toBe(true);
      expect(isValidPeriodKey("17NB")).toBe(true);
      expect(isValidPeriodKey("24AB")).toBe(true);
    });

    // HMRC Numeric format: NNNN (4 digits)
    test("accepts HMRC numeric format - NNNN (e.g., 0418, 1218)", () => {
      expect(isValidPeriodKey("0418")).toBe(true);
      expect(isValidPeriodKey("1218")).toBe(true);
      expect(isValidPeriodKey("0124")).toBe(true);
      expect(isValidPeriodKey("1224")).toBe(true);
    });

    // HMRC Special numeric values
    test("accepts HMRC special period keys - 0000 and 9999", () => {
      // 0000 = transactions not belonging to a particular period
      expect(isValidPeriodKey("0000")).toBe(true);
      // 9999 = period key when a company ceases trading
      expect(isValidPeriodKey("9999")).toBe(true);
    });

    // Hash format for annual/non-standard periods
    test("accepts HMRC hash format - #NNN (e.g., #001, #012)", () => {
      expect(isValidPeriodKey("#001")).toBe(true);
      expect(isValidPeriodKey("#012")).toBe(true);
      expect(isValidPeriodKey("#999")).toBe(true);
      expect(isValidPeriodKey("#000")).toBe(true);
    });

    test("accepts lowercase and converts to uppercase", () => {
      expect(isValidPeriodKey("24a1")).toBe(true);
      expect(isValidPeriodKey("25b2")).toBe(true);
      expect(isValidPeriodKey("17nb")).toBe(true);
      expect(isValidPeriodKey("18ad")).toBe(true);
    });

    test("rejects invalid period key formats", () => {
      expect(isValidPeriodKey("123")).toBe(false); // too short (3 chars)
      expect(isValidPeriodKey("12345")).toBe(false); // too long (5 chars)
      expect(isValidPeriodKey("ABCD")).toBe(false); // all letters (not valid)
      expect(isValidPeriodKey("2A11")).toBe(false); // wrong alphanumeric format
      expect(isValidPeriodKey("24A12")).toBe(false); // too long
      expect(isValidPeriodKey("#AB1")).toBe(false); // letters after # (must be digits)
      expect(isValidPeriodKey("#01")).toBe(false); // too short after #
      expect(isValidPeriodKey("#0001")).toBe(false); // too long after #
      expect(isValidPeriodKey("")).toBe(false); // empty
      expect(isValidPeriodKey("A123")).toBe(false); // starts with letter, not valid pattern
    });
  });

  describe("isValidIsoDate", () => {
    test("accepts valid ISO date format", () => {
      expect(isValidIsoDate("2024-01-01")).toBe(true);
      expect(isValidIsoDate("2025-12-31")).toBe(true);
      expect(isValidIsoDate("2023-06-15")).toBe(true);
    });

    test("rejects invalid date formats", () => {
      expect(isValidIsoDate("2024/01/01")).toBe(false); // wrong separator
      expect(isValidIsoDate("01-01-2024")).toBe(false); // wrong order
      expect(isValidIsoDate("2024-1-1")).toBe(false); // missing zero padding
      expect(isValidIsoDate("2024-13-01")).toBe(false); // invalid month
      expect(isValidIsoDate("2024-01-32")).toBe(false); // invalid day
      expect(isValidIsoDate("")).toBe(false); // empty
      expect(isValidIsoDate("not-a-date")).toBe(false);
    });

    test("rejects invalid dates that match format", () => {
      expect(isValidIsoDate("2024-02-30")).toBe(false); // Feb 30th doesn't exist
      expect(isValidIsoDate("2023-02-29")).toBe(false); // Not a leap year
      expect(isValidIsoDate("2024-04-31")).toBe(false); // April only has 30 days
    });

    test("accepts leap year dates", () => {
      expect(isValidIsoDate("2024-02-29")).toBe(true); // 2024 is a leap year
      expect(isValidIsoDate("2000-02-29")).toBe(true); // 2000 is a leap year
    });
  });

  describe("isValidDateRange", () => {
    test("accepts valid date ranges", () => {
      expect(isValidDateRange("2024-01-01", "2024-12-31")).toBe(true);
      expect(isValidDateRange("2024-01-01", "2024-01-01")).toBe(true); // same date
      expect(isValidDateRange("2023-01-01", "2024-12-31")).toBe(true);
    });

    test("rejects invalid date ranges", () => {
      expect(isValidDateRange("2024-12-31", "2024-01-01")).toBe(false); // from > to
      expect(isValidDateRange("2025-01-01", "2024-01-01")).toBe(false);
    });
  });

  describe("maskIpAddress", () => {
    test("masks IPv4 addresses", () => {
      expect(maskIpAddress("192.168.1.100")).toBe("192.168.1.xxx");
      expect(maskIpAddress("10.0.0.1")).toBe("10.0.0.xxx");
      expect(maskIpAddress("172.16.254.1")).toBe("172.16.254.xxx");
    });

    test("masks IPv6 addresses", () => {
      expect(maskIpAddress("2001:db8::1")).toBe("2001:db8::xxx");
      expect(maskIpAddress("fe80::1")).toBe("fe80::xxx");
      expect(maskIpAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:xxx");
    });

    test("masks compressed IPv6 addresses", () => {
      expect(maskIpAddress("::1")).toBe("::xxx");
      expect(maskIpAddress("::ffff:192.0.2.1")).toBe("::xxx");
    });

    test("handles edge cases", () => {
      expect(maskIpAddress("")).toBe("unknown");
      expect(maskIpAddress(null)).toBe("unknown");
      expect(maskIpAddress(undefined)).toBe("unknown");
      expect(maskIpAddress("invalid-ip")).toBe("xxx.xxx.xxx.xxx");
    });
  });

  describe("maskDeviceId", () => {
    test("masks device IDs longer than 8 characters", () => {
      expect(maskDeviceId("abcdefgh1234567890")).toBe("abcdefgh...");
      expect(maskDeviceId("device-id-12345")).toBe("device-i...");
    });

    test("masks short device IDs completely", () => {
      expect(maskDeviceId("short")).toBe("***");
      expect(maskDeviceId("1234567")).toBe("***");
      expect(maskDeviceId("12345678")).toBe("***");
    });

    test("handles edge cases", () => {
      expect(maskDeviceId("")).toBe("unknown");
      expect(maskDeviceId(null)).toBe("unknown");
      expect(maskDeviceId(undefined)).toBe("unknown");
    });
  });

  describe("getHmrcErrorMessage", () => {
    test("returns appropriate message for known error codes", () => {
      const invalidVrn = getHmrcErrorMessage("INVALID_VRN");
      expect(invalidVrn.userMessage).toContain("VAT registration number");
      expect(invalidVrn.actionAdvice).toContain("check");

      const insolvent = getHmrcErrorMessage("INSOLVENT_TRADER");
      expect(insolvent.userMessage).toContain("insolvent");
      expect(insolvent.actionAdvice).toContain("contact HMRC");

      const duplicate = getHmrcErrorMessage("DUPLICATE_SUBMISSION");
      expect(duplicate.userMessage).toContain("already been submitted");
      expect(duplicate.actionAdvice).toBeTruthy();
    });

    test("returns default message for unknown error codes", () => {
      const unknown = getHmrcErrorMessage("UNKNOWN_ERROR_CODE");
      expect(unknown.userMessage).toContain("unexpected error");
      expect(unknown.actionAdvice).toBeTruthy();
    });

    test("handles various HMRC error codes", () => {
      const codes = [
        "VRN_NOT_FOUND",
        "INVALID_PERIODKEY",
        "DATE_RANGE_TOO_LARGE",
        "DUPLICATE_SUBMISSION",
        "TAX_PERIOD_NOT_ENDED",
        "INVALID_CREDENTIALS",
        "SERVER_ERROR",
      ];

      codes.forEach((code) => {
        const result = getHmrcErrorMessage(code);
        expect(result).toHaveProperty("userMessage");
        expect(result).toHaveProperty("actionAdvice");
        expect(result.userMessage).toBeTruthy();
        expect(result.actionAdvice).toBeTruthy();
      });
    });
  });

  describe("extractHmrcErrorCode", () => {
    test("extracts code from direct field", () => {
      const response = { code: "INVALID_VRN", message: "Invalid VRN" };
      expect(extractHmrcErrorCode(response)).toBe("INVALID_VRN");
    });

    test("extracts code from errors array", () => {
      const response = {
        errors: [{ code: "DUPLICATE_SUBMISSION", message: "Duplicate" }],
      };
      expect(extractHmrcErrorCode(response)).toBe("DUPLICATE_SUBMISSION");
    });

    test("returns null for responses without error code", () => {
      expect(extractHmrcErrorCode({})).toBeNull();
      expect(extractHmrcErrorCode({ message: "Error" })).toBeNull();
      expect(extractHmrcErrorCode(null)).toBeNull();
      expect(extractHmrcErrorCode(undefined)).toBeNull();
    });

    test("returns first error code from multiple errors", () => {
      const response = {
        errors: [{ code: "ERROR_1" }, { code: "ERROR_2" }],
      };
      expect(extractHmrcErrorCode(response)).toBe("ERROR_1");
    });
  });

  /**
   * VAT 9-Box Return Field Validation Tests
   * Based on HMRC MTD VAT API specification:
   * @see https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0
   *
   * Boxes 1-5: Monetary values with max 2 decimal places
   * - Range: -9999999999999.99 to 9999999999999.99 (except netVatDue: 0 to 99999999999.99)
   *
   * Boxes 6-9: Whole pound amounts (integers)
   * - Range: -9999999999999 to 9999999999999
   */
  describe("isValidVatMonetaryAmount (Boxes 1-4)", () => {
    test("accepts valid monetary amounts with 2 decimal places", () => {
      expect(isValidVatMonetaryAmount(1500.5)).toBe(true);
      expect(isValidVatMonetaryAmount(1500.55)).toBe(true);
      expect(isValidVatMonetaryAmount(0.01)).toBe(true);
      expect(isValidVatMonetaryAmount(0.99)).toBe(true);
      expect(isValidVatMonetaryAmount(100)).toBe(true);
      expect(isValidVatMonetaryAmount(0)).toBe(true);
    });

    test("accepts negative monetary amounts", () => {
      expect(isValidVatMonetaryAmount(-100.5)).toBe(true);
      expect(isValidVatMonetaryAmount(-0.01)).toBe(true);
      expect(isValidVatMonetaryAmount(-9999999999999.99)).toBe(true);
    });

    test("accepts amounts at HMRC range boundaries", () => {
      expect(isValidVatMonetaryAmount(-9999999999999.99)).toBe(true); // Min
      expect(isValidVatMonetaryAmount(9999999999999.99)).toBe(true); // Max
    });

    test("rejects amounts outside HMRC range", () => {
      expect(isValidVatMonetaryAmount(-10000000000000)).toBe(false); // Below min
      expect(isValidVatMonetaryAmount(10000000000000)).toBe(false); // Above max
    });

    test("rejects amounts with more than 2 decimal places", () => {
      expect(isValidVatMonetaryAmount(100.123)).toBe(false);
      expect(isValidVatMonetaryAmount(0.001)).toBe(false);
      expect(isValidVatMonetaryAmount(50.9999)).toBe(false);
    });

    test("rejects non-numeric values", () => {
      expect(isValidVatMonetaryAmount("100")).toBe(false);
      expect(isValidVatMonetaryAmount(null)).toBe(false);
      expect(isValidVatMonetaryAmount(undefined)).toBe(false);
      expect(isValidVatMonetaryAmount(NaN)).toBe(false);
      expect(isValidVatMonetaryAmount(Infinity)).toBe(false);
    });
  });

  describe("isValidNetVatDue (Box 5)", () => {
    test("accepts valid non-negative amounts with 2 decimal places", () => {
      expect(isValidNetVatDue(1500.5)).toBe(true);
      expect(isValidNetVatDue(0)).toBe(true);
      expect(isValidNetVatDue(0.01)).toBe(true);
      expect(isValidNetVatDue(99999999999.99)).toBe(true);
    });

    test("rejects negative amounts (netVatDue must be absolute value)", () => {
      expect(isValidNetVatDue(-0.01)).toBe(false);
      expect(isValidNetVatDue(-100)).toBe(false);
    });

    test("accepts amounts at HMRC range boundaries", () => {
      expect(isValidNetVatDue(0)).toBe(true); // Min
      expect(isValidNetVatDue(99999999999.99)).toBe(true); // Max
    });

    test("rejects amounts outside HMRC range", () => {
      expect(isValidNetVatDue(100000000000)).toBe(false); // Above max
    });

    test("rejects amounts with more than 2 decimal places", () => {
      expect(isValidNetVatDue(100.123)).toBe(false);
      expect(isValidNetVatDue(0.001)).toBe(false);
    });

    test("rejects non-numeric values", () => {
      expect(isValidNetVatDue("100")).toBe(false);
      expect(isValidNetVatDue(null)).toBe(false);
      expect(isValidNetVatDue(undefined)).toBe(false);
      expect(isValidNetVatDue(NaN)).toBe(false);
    });
  });

  describe("isValidVatWholeAmount (Boxes 6-9)", () => {
    test("accepts valid whole numbers", () => {
      expect(isValidVatWholeAmount(1500)).toBe(true);
      expect(isValidVatWholeAmount(0)).toBe(true);
      expect(isValidVatWholeAmount(9999999999999)).toBe(true);
    });

    test("accepts negative whole numbers", () => {
      expect(isValidVatWholeAmount(-100)).toBe(true);
      expect(isValidVatWholeAmount(-9999999999999)).toBe(true);
    });

    test("accepts amounts at HMRC range boundaries", () => {
      expect(isValidVatWholeAmount(-9999999999999)).toBe(true); // Min
      expect(isValidVatWholeAmount(9999999999999)).toBe(true); // Max
    });

    test("rejects amounts outside HMRC range", () => {
      expect(isValidVatWholeAmount(-10000000000000)).toBe(false); // Below min
      expect(isValidVatWholeAmount(10000000000000)).toBe(false); // Above max
    });

    test("rejects decimal amounts (boxes 6-9 require whole numbers)", () => {
      expect(isValidVatWholeAmount(100.5)).toBe(false);
      expect(isValidVatWholeAmount(100.01)).toBe(false);
      expect(isValidVatWholeAmount(0.99)).toBe(false);
    });

    test("rejects non-numeric values", () => {
      expect(isValidVatWholeAmount("100")).toBe(false);
      expect(isValidVatWholeAmount(null)).toBe(false);
      expect(isValidVatWholeAmount(undefined)).toBe(false);
      expect(isValidVatWholeAmount(NaN)).toBe(false);
    });
  });

  describe("isValidTotalVatDueCalculation (Box 3 = Box 1 + Box 2)", () => {
    test("validates correct total calculation", () => {
      expect(isValidTotalVatDueCalculation(1000, 500, 1500)).toBe(true);
      expect(isValidTotalVatDueCalculation(1000.5, 500.5, 1501)).toBe(true);
      expect(isValidTotalVatDueCalculation(0, 0, 0)).toBe(true);
      expect(isValidTotalVatDueCalculation(-100, 50, -50)).toBe(true);
    });

    test("rejects incorrect total calculation", () => {
      expect(isValidTotalVatDueCalculation(1000, 500, 1600)).toBe(false);
      expect(isValidTotalVatDueCalculation(1000, 500, 1499)).toBe(false);
    });

    test("handles floating point precision correctly", () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JavaScript
      expect(isValidTotalVatDueCalculation(0.1, 0.2, 0.3)).toBe(true);
      expect(isValidTotalVatDueCalculation(100.01, 200.02, 300.03)).toBe(true);
    });
  });

  describe("isValidNetVatDueCalculation (Box 5 = |Box 3 - Box 4|)", () => {
    test("validates correct net calculation when VAT is owed", () => {
      expect(isValidNetVatDueCalculation(1500, 500, 1000)).toBe(true);
      expect(isValidNetVatDueCalculation(1000.5, 500.5, 500)).toBe(true);
    });

    test("validates correct net calculation when VAT is reclaimable", () => {
      // When vatReclaimedCurrPeriod > totalVatDue, netVatDue should be the absolute difference
      expect(isValidNetVatDueCalculation(500, 1500, 1000)).toBe(true);
      expect(isValidNetVatDueCalculation(100, 600, 500)).toBe(true);
    });

    test("validates zero net VAT when amounts are equal", () => {
      expect(isValidNetVatDueCalculation(1000, 1000, 0)).toBe(true);
    });

    test("rejects incorrect net calculation", () => {
      expect(isValidNetVatDueCalculation(1500, 500, 1100)).toBe(false);
      expect(isValidNetVatDueCalculation(1500, 500, 900)).toBe(false);
    });

    test("handles floating point precision correctly", () => {
      expect(isValidNetVatDueCalculation(100.01, 50.02, 49.99)).toBe(true);
    });
  });
});
