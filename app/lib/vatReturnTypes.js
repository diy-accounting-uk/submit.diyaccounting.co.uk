// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/vatReturnTypes.js

/**
 * VAT Return 9-box data structure and validation
 * Per HMRC API spec: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0
 */

/**
 * VAT box configuration with validation rules
 */
export const VAT_BOX_CONFIG = {
  vatDueSales: { box: 1, type: "decimal", decimals: 2, min: -9999999999999.99, max: 9999999999999.99 },
  vatDueAcquisitions: { box: 2, type: "decimal", decimals: 2, min: -9999999999999.99, max: 9999999999999.99 },
  totalVatDue: { box: 3, type: "decimal", decimals: 2, calculated: true }, // Box1 + Box2
  vatReclaimedCurrPeriod: { box: 4, type: "decimal", decimals: 2, min: -9999999999999.99, max: 9999999999999.99 },
  netVatDue: { box: 5, type: "decimal", decimals: 2, min: 0, max: 99999999999.99, calculated: true }, // |Box3 - Box4|
  totalValueSalesExVAT: { box: 6, type: "integer", min: -9999999999999, max: 9999999999999 },
  totalValuePurchasesExVAT: { box: 7, type: "integer", min: -9999999999999, max: 9999999999999 },
  totalValueGoodsSuppliedExVAT: { box: 8, type: "integer", min: -9999999999999, max: 9999999999999 },
  totalAcquisitionsExVAT: { box: 9, type: "integer", min: -9999999999999, max: 9999999999999 },
};

/**
 * Round to specified decimal places
 * @param {number} value - Value to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded value
 */
export function roundToDecimals(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate Box 3: totalVatDue = vatDueSales + vatDueAcquisitions
 * @param {number} vatDueSales - Box 1 value
 * @param {number} vatDueAcquisitions - Box 2 value
 * @returns {number} Box 3 value (rounded to 2 decimals)
 */
export function calculateTotalVatDue(vatDueSales, vatDueAcquisitions) {
  return roundToDecimals(vatDueSales + vatDueAcquisitions, 2);
}

/**
 * Calculate Box 5: netVatDue = |totalVatDue - vatReclaimedCurrPeriod|
 * Must always be positive per HMRC spec
 * @param {number} totalVatDue - Box 3 value
 * @param {number} vatReclaimedCurrPeriod - Box 4 value
 * @returns {number} Box 5 value (absolute, rounded to 2 decimals)
 */
export function calculateNetVatDue(totalVatDue, vatReclaimedCurrPeriod) {
  return roundToDecimals(Math.abs(totalVatDue - vatReclaimedCurrPeriod), 2);
}

/**
 * Validate that a value is a valid monetary amount (max 2 decimal places)
 * @param {number} value - Value to validate
 * @returns {boolean} True if valid
 */
export function isValidMonetaryAmount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }
  // Check decimal places (multiply by 100, check if integer)
  const scaled = value * 100;
  if (Math.abs(scaled - Math.round(scaled)) > 0.0001) {
    return false;
  }
  // Check range
  if (value < -9999999999999.99 || value > 9999999999999.99) {
    return false;
  }
  return true;
}

/**
 * Validate that a value is a valid whole amount (no decimals)
 * @param {number} value - Value to validate
 * @returns {boolean} True if valid
 */
export function isValidWholeAmount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }
  if (!Number.isInteger(value)) {
    return false;
  }
  // Check range
  if (value < -9999999999999 || value > 9999999999999) {
    return false;
  }
  return true;
}

/**
 * Validate a complete VAT return body
 * @param {Object} body - Request body containing all 9 boxes
 * @returns {Object} { valid: boolean, code?: string, message?: string }
 */
export function validateVatReturnBody(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, code: "INVALID_REQUEST", message: "Request body is required" };
  }

  const { periodKey, netVatDue } = body;

  // Check required fields are present
  if (!periodKey) {
    return { valid: false, code: "INVALID_REQUEST", message: "periodKey is required" };
  }

  const requiredFields = [
    "vatDueSales",
    "vatDueAcquisitions",
    "totalVatDue",
    "vatReclaimedCurrPeriod",
    "netVatDue",
    "totalValueSalesExVAT",
    "totalValuePurchasesExVAT",
    "totalValueGoodsSuppliedExVAT",
    "totalAcquisitionsExVAT",
  ];

  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      const config = VAT_BOX_CONFIG[field];
      return { valid: false, code: "INVALID_REQUEST", message: `${field} (Box ${config?.box || "?"}) is required` };
    }
  }

  // Validate decimal fields (Boxes 1-5)
  const decimalFields = ["vatDueSales", "vatDueAcquisitions", "totalVatDue", "vatReclaimedCurrPeriod", "netVatDue"];
  for (const field of decimalFields) {
    const value = body[field];
    if (!isValidMonetaryAmount(value)) {
      const config = VAT_BOX_CONFIG[field];
      return {
        valid: false,
        code: "INVALID_MONETARY_AMOUNT",
        message: `${field} (Box ${config.box}) must be a valid monetary amount with max 2 decimal places`,
      };
    }
  }

  // Validate integer fields (Boxes 6-9)
  const integerFields = ["totalValueSalesExVAT", "totalValuePurchasesExVAT", "totalValueGoodsSuppliedExVAT", "totalAcquisitionsExVAT"];
  for (const field of integerFields) {
    const value = body[field];
    if (!isValidWholeAmount(value)) {
      const config = VAT_BOX_CONFIG[field];
      return {
        valid: false,
        code: "INVALID_WHOLE_AMOUNT",
        message: `${field} (Box ${config.box}) must be a whole number (no decimals)`,
      };
    }
  }

  // Validate Box 5 is non-negative (HMRC requirement)
  if (netVatDue < 0) {
    return {
      valid: false,
      code: "INVALID_NET_VAT_DUE",
      message: "netVatDue (Box 5) cannot be negative",
    };
  }

  return { valid: true };
}

/**
 * Build the HMRC VAT return request body from user inputs
 * Calculates Box 3 and Box 5 automatically
 * @param {Object} params - User input parameters
 * @returns {Object} HMRC-formatted request body
 */
export function buildVatReturnBody(params) {
  const {
    periodKey,
    vatDueSales,
    vatDueAcquisitions,
    vatReclaimedCurrPeriod,
    totalValueSalesExVAT,
    totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT,
  } = params;

  // Calculate derived fields
  const totalVatDue = calculateTotalVatDue(vatDueSales, vatDueAcquisitions);
  const netVatDue = calculateNetVatDue(totalVatDue, vatReclaimedCurrPeriod);

  return {
    periodKey,
    vatDueSales: roundToDecimals(vatDueSales, 2),
    vatDueAcquisitions: roundToDecimals(vatDueAcquisitions, 2),
    totalVatDue,
    vatReclaimedCurrPeriod: roundToDecimals(vatReclaimedCurrPeriod, 2),
    netVatDue,
    totalValueSalesExVAT: Math.round(totalValueSalesExVAT),
    totalValuePurchasesExVAT: Math.round(totalValuePurchasesExVAT),
    totalValueGoodsSuppliedExVAT: Math.round(totalValueGoodsSuppliedExVAT),
    totalAcquisitionsExVAT: Math.round(totalAcquisitionsExVAT),
    finalised: true,
  };
}

/**
 * Build VAT return body from legacy single-field format (backward compatibility)
 * @param {Object} params - Legacy parameters with vatDue
 * @returns {Object} HMRC-formatted request body
 */
export function buildVatReturnBodyFromLegacy(params) {
  const { periodKey, vatDue } = params;
  const numVatDue = typeof vatDue === "number" ? vatDue : parseFloat(vatDue);

  return {
    periodKey,
    vatDueSales: numVatDue,
    vatDueAcquisitions: 0,
    totalVatDue: numVatDue,
    vatReclaimedCurrPeriod: 0,
    netVatDue: Math.abs(numVatDue),
    totalValueSalesExVAT: 0,
    totalValuePurchasesExVAT: 0,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
    finalised: true,
  };
}

/**
 * Detect if a request body is using the new 9-box format or legacy single-field format
 * @param {Object} body - Request body
 * @returns {string} 'nine-box' | 'legacy'
 */
export function detectRequestFormat(body) {
  if (!body) return "legacy";
  // If vatDueSales is present, it's the new 9-box format
  if (body.vatDueSales !== undefined) {
    return "nine-box";
  }
  // Otherwise it's the legacy format with just vatDue
  return "legacy";
}
