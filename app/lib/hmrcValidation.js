// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/hmrcValidation.js

/**
 * Validation utilities for HMRC API input parameters.
 * Provides regex patterns and validation functions for VAT registration number, period keys, dates, etc.
 */

/**
 * Validates VAT registration number.
 * Must be exactly 9 digits.
 * @param {string|number} vrn - The VAT registration number to validate
 * @returns {boolean} True if valid
 */
export function isValidVrn(vrn) {
  return /^\d{9}$/.test(String(vrn));
}

/**
 * Validates a National Insurance number (NINO).
 * Two letters (excluding D, F, I, Q, U, V as either letter, and O as the second letter,
 * and excluding the reserved prefixes BG, GB, NK, KN, TN, NT, ZZ), six digits, then a
 * suffix letter A-D. Spaces are ignored.
 * @see https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim39110
 * @param {string} nino - The NINO to validate
 * @returns {boolean} True if valid
 */
export function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

/**
 * Validates HMRC period key format per HMRC MTD VAT API specification.
 * Period keys are 4 characters and can be in several formats:
 *
 * Accepted formats (per HMRC documentation):
 * - Alphanumeric (YYXZ): 2-digit year + letter + alphanumeric
 *   - Monthly: 18AD, 18AE, 18AF (letter suffix)
 *   - Quarterly: 18A1, 18A2, 18A3, 18A4 (digit suffix)
 * - Numeric (NNNN): 4 digits (e.g., 0418, 1218)
 * - Special numeric: 0000 (no period) or 9999 (ceased trading)
 * - Hash format (#NNN): # followed by 3 digits (e.g., #001, #012)
 *
 * @see https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html
 * @param {string} periodKey - The period key to validate
 * @returns {boolean} True if valid
 */
export function isValidPeriodKey(periodKey) {
  const normalized = String(periodKey).toUpperCase();
  // Alphanumeric format: 2-digit year + letter + alphanumeric (e.g., 18A1, 18AD, 17NB)
  // Numeric format: 4 digits (e.g., 0418, 1218, 0000, 9999)
  // Hash format: # followed by 3 digits (e.g., #001, #012)
  return /^(\d{2}[A-Z][A-Z0-9]|\d{4}|#\d{3})$/.test(normalized);
}

/**
 * Validates ISO date format (YYYY-MM-DD) and ensures it's a real date.
 * @param {string} date - The date to validate
 * @returns {boolean} True if valid
 */
export function isValidIsoDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  // Parse the date components
  const [year, month, day] = date.split("-").map(Number);

  // Check month is valid
  if (month < 1 || month > 12) {
    return false;
  }

  // Check day is valid for the given month
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return false;
  }

  // Additional check: ensure it's a valid date
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

/**
 * Validates that fromDate is not after toDate.
 * Both dates must be valid ISO dates.
 * @param {string} fromDate - ISO date string
 * @param {string} toDate - ISO date string
 * @returns {boolean} True if both are valid dates and fromDate <= toDate
 */
export function isValidDateRange(fromDate, toDate) {
  // Validate both dates first
  if (!isValidIsoDate(fromDate) || !isValidIsoDate(toDate)) {
    return false;
  }

  // Compare dates
  return new Date(fromDate) <= new Date(toDate);
}

/**
 * HMRC VAT 9-Box Return Field Validation Constants
 * @see https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0
 *
 * Boxes 1-5: Monetary values with exactly 2 decimal places
 * - vatDueSales (Box 1): VAT due on sales and other outputs
 * - vatDueAcquisitions (Box 2): VAT due on acquisitions from other EC Member States
 * - totalVatDue (Box 3): Total VAT due (sum of boxes 1 and 2)
 * - vatReclaimedCurrPeriod (Box 4): VAT reclaimed on purchases and other inputs
 * - netVatDue (Box 5): Net VAT to be paid to HMRC or reclaimed (|Box 3 - Box 4|)
 *
 * Boxes 6-9: Whole pound amounts (no pence)
 * - totalValueSalesExVAT (Box 6): Total value of sales excluding VAT
 * - totalValuePurchasesExVAT (Box 7): Total value of purchases excluding VAT
 * - totalValueGoodsSuppliedExVAT (Box 8): Total value of goods supplied to EC Member States
 * - totalAcquisitionsExVAT (Box 9): Total value of acquisitions from EC Member States
 */

// Box 1-4 range: -9999999999999.99 to 9999999999999.99
const VAT_MONETARY_MIN = -9999999999999.99;
const VAT_MONETARY_MAX = 9999999999999.99;

// Box 5 (netVatDue) range: 0 to 99999999999.99 (always positive, absolute difference)
const NET_VAT_DUE_MIN = 0;
const NET_VAT_DUE_MAX = 99999999999.99;

// Box 6-9 range: -9999999999999 to 9999999999999 (whole numbers)
const VAT_WHOLE_MIN = -9999999999999;
const VAT_WHOLE_MAX = 9999999999999;

/**
 * Validates a VAT monetary amount (boxes 1-4).
 * Must be a number with at most 2 decimal places within HMRC range.
 * @see https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0
 * @param {number} amount - The monetary amount to validate
 * @returns {boolean} True if valid
 */
export function isValidVatMonetaryAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return false;
  }

  // Check range
  if (amount < VAT_MONETARY_MIN || amount > VAT_MONETARY_MAX) {
    return false;
  }

  // Check decimal places (max 2)
  const decimalPlaces = (amount.toString().split(".")[1] || "").length;
  return decimalPlaces <= 2;
}

/**
 * Validates the netVatDue amount (box 5).
 * Must be a non-negative number with at most 2 decimal places.
 * Represents the absolute difference between totalVatDue and vatReclaimedCurrPeriod.
 * @see https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0
 * @param {number} amount - The net VAT due amount to validate
 * @returns {boolean} True if valid
 */
export function isValidNetVatDue(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return false;
  }

  // Check range (must be non-negative)
  if (amount < NET_VAT_DUE_MIN || amount > NET_VAT_DUE_MAX) {
    return false;
  }

  // Check decimal places (max 2)
  const decimalPlaces = (amount.toString().split(".")[1] || "").length;
  return decimalPlaces <= 2;
}

/**
 * Validates a VAT whole pound amount (boxes 6-9).
 * Must be a whole number (no pence) within HMRC range.
 * HMRC specifies these values should have "2 zeroed decimals" meaning the pence should be .00
 * @see https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0
 * @param {number} amount - The whole pound amount to validate
 * @returns {boolean} True if valid
 */
export function isValidVatWholeAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return false;
  }

  // Check range
  if (amount < VAT_WHOLE_MIN || amount > VAT_WHOLE_MAX) {
    return false;
  }

  // Must be a whole number (integer)
  return Number.isInteger(amount);
}

/**
 * Validates that totalVatDue equals the sum of vatDueSales and vatDueAcquisitions.
 * HMRC validates this calculation server-side and returns HTTP 400 if incorrect.
 * @see https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html
 * @param {number} vatDueSales - Box 1 value
 * @param {number} vatDueAcquisitions - Box 2 value
 * @param {number} totalVatDue - Box 3 value
 * @returns {boolean} True if totalVatDue = vatDueSales + vatDueAcquisitions
 */
export function isValidTotalVatDueCalculation(vatDueSales, vatDueAcquisitions, totalVatDue) {
  // Handle floating point precision by rounding to 2 decimal places
  const expectedTotal = Math.round((vatDueSales + vatDueAcquisitions) * 100) / 100;
  const actualTotal = Math.round(totalVatDue * 100) / 100;
  return expectedTotal === actualTotal;
}

/**
 * Validates that netVatDue equals the absolute difference between totalVatDue and vatReclaimedCurrPeriod.
 * HMRC validates this calculation server-side and returns HTTP 400 if incorrect.
 * @see https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html
 * @param {number} totalVatDue - Box 3 value
 * @param {number} vatReclaimedCurrPeriod - Box 4 value
 * @param {number} netVatDue - Box 5 value
 * @returns {boolean} True if netVatDue = |totalVatDue - vatReclaimedCurrPeriod|
 */
export function isValidNetVatDueCalculation(totalVatDue, vatReclaimedCurrPeriod, netVatDue) {
  // Handle floating point precision by rounding to 2 decimal places
  const expectedNet = Math.round(Math.abs(totalVatDue - vatReclaimedCurrPeriod) * 100) / 100;
  const actualNet = Math.round(netVatDue * 100) / 100;
  return expectedNet === actualNet;
}

/**
 * Masks an IP address for GDPR compliance.
 * Replaces the last octet/segment with 'xxx'.
 * Examples:
 * - 192.168.1.100 -> 192.168.1.xxx
 * - 2001:db8::1 -> 2001:db8::xxx
 * - ::1 -> ::xxx
 *
 * @param {string} ip - The IP address to mask
 * @returns {string} Masked IP address
 */
export function maskIpAddress(ip) {
  if (!ip || typeof ip !== "string") {
    return "unknown";
  }

  // IPv4
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }

  // IPv6 - Handle both expanded and compressed formats
  if (ip.includes(":")) {
    // Handle compressed IPv6 (e.g., ::1, ::ffff:192.0.2.1)
    if (ip.startsWith("::")) {
      return "::xxx";
    }
    if (ip.endsWith("::")) {
      const parts = ip.split(":");
      return `${parts.slice(0, -2).join(":")}::xxx`;
    }

    // For regular IPv6, mask the last segment
    const parts = ip.split(":");
    if (parts.length >= 2) {
      return `${parts.slice(0, -1).join(":")}:xxx`;
    }
  }

  // Fallback for unknown format
  return "xxx.xxx.xxx.xxx";
}

/**
 * Masks a device ID for GDPR compliance.
 * Shows first 8 characters followed by '...'.
 * @param {string} deviceId - The device ID to mask
 * @returns {string} Masked device ID
 */
export function maskDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== "string") {
    return "unknown";
  }

  if (deviceId.length <= 8) {
    return "***";
  }

  return `${deviceId.substring(0, 8)}...`;
}

/**
 * Maps HMRC error codes to user-friendly messages.
 * @param {string} code - HMRC error code
 * @returns {Object} Object with userMessage and actionAdvice
 */
export function getHmrcErrorMessage(code) {
  const errorMap = {
    INVALID_VRN: {
      userMessage: "The VAT registration number is not valid",
      actionAdvice: "Please check the VAT registration number and try again",
    },
    VRN_NOT_FOUND: {
      userMessage: "The VAT registration number was not found",
      actionAdvice: "Please verify the VAT registration number is correct and registered with HMRC",
    },
    INVALID_PERIODKEY: {
      userMessage: "The period key is not valid",
      actionAdvice: "Please check the period key format and try again",
    },
    PERIOD_KEY_INVALID: {
      userMessage: "The period key is not valid",
      actionAdvice: "Please check the period key format and try again",
    },
    NOT_FOUND: {
      userMessage: "The requested resource was not found",
      actionAdvice: "Please check the VAT registration number and period key are correct",
    },
    DATE_RANGE_TOO_LARGE: {
      userMessage: "The date range is too large",
      actionAdvice: "Please reduce the date range to less than 365 days",
    },
    INSOLVENT_TRADER: {
      userMessage: "This VAT registration is for an insolvent trader",
      actionAdvice: "VAT returns cannot be submitted for insolvent traders. Please contact HMRC",
    },
    DUPLICATE_SUBMISSION: {
      userMessage: "This VAT return has already been submitted",
      actionAdvice: "You cannot submit the same return twice. If you need to make changes, please contact HMRC",
    },
    INVALID_SUBMISSION: {
      userMessage: "The VAT return submission is not valid",
      actionAdvice: "Please check all values are correct and try again",
    },
    TAX_PERIOD_NOT_ENDED: {
      userMessage: "The tax period has not ended yet",
      actionAdvice: "You can only submit a return after the tax period has ended",
    },
    INVALID_ORIGINATOR_ID: {
      userMessage: "The software vendor ID is not valid",
      actionAdvice: "Please contact the software vendor for support",
    },
    INVALID_CREDENTIALS: {
      userMessage: "The authentication credentials are not valid",
      actionAdvice: "Please sign in again to refresh your credentials",
    },
    INVALID_SCOPE: {
      userMessage: "Your HMRC authorization does not include the required permissions for this action",
      actionAdvice: "Please re-authorize with HMRC to grant the necessary permissions",
      reason: "hmrc_scope_insufficient",
    },
    CLIENT_OR_AGENT_NOT_AUTHORISED: {
      userMessage: "You are not authorized to access this VAT registration",
      actionAdvice: "Please ensure you have the correct permissions and try again",
    },
    BUSINESS_ERROR: {
      userMessage: "A business rule validation failed",
      actionAdvice: "Please check all values are correct and try again",
    },
    SERVER_ERROR: {
      userMessage: "HMRC service is experiencing technical difficulties",
      actionAdvice: "Please try again later",
    },
    SERVICE_UNAVAILABLE: {
      userMessage: "HMRC service is temporarily unavailable",
      actionAdvice: "Please try again later",
    },
  };

  return (
    errorMap[code] || {
      userMessage: "An unexpected error occurred",
      actionAdvice: "Please try again or contact support if the problem persists",
    }
  );
}

/**
 * Extracts HMRC error code from response body.
 * @param {Object} responseBody - HMRC API response body
 * @returns {string|null} Error code or null if not found
 */
export function extractHmrcErrorCode(responseBody) {
  if (!responseBody) {
    return null;
  }

  // Direct code field
  if (responseBody.code) {
    return responseBody.code;
  }

  // Nested in errors array
  if (Array.isArray(responseBody.errors) && responseBody.errors.length > 0) {
    return responseBody.errors[0].code;
  }

  return null;
}
