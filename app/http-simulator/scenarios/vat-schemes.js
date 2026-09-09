// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/vat-schemes.js
// Phase 5: VAT scheme simulator scenarios

/**
 * VAT scheme test scenarios
 * These scenarios test that the system correctly handles submissions
 * from businesses using different VAT schemes
 *
 * All supported VAT schemes use the same 9-box return format.
 * The differences are in how the businesses calculate their VAT,
 * but the submission format is identical.
 *
 * Supported schemes:
 * - Cash Accounting Scheme - VAT on cash received/paid basis
 * - Annual Accounting Scheme - Annual return with interim payments
 * - Flat Rate Scheme - Simplified percentage of turnover
 * - Retail Scheme - Various retail calculation methods
 * - Margin Scheme - VAT on profit margin (second-hand goods)
 *
 * Not supported:
 * - VAT Exemption - App is for VAT-registered businesses only
 */

export const vatSchemeScenarios = {
  // Cash Accounting - VAT calculated on cash basis
  CASH_ACCOUNTING: {
    description: "VAT return under Cash Accounting Scheme",
    govTestScenario: "CASH_ACCOUNTING",
    request: {
      periodKey: "24A1",
      vatDueSales: 1500.0, // VAT on cash received
      vatDueAcquisitions: 0,
      totalVatDue: 1500.0,
      vatReclaimedCurrPeriod: 300.0, // VAT on cash paid
      netVatDue: 1200.0,
      totalValueSalesExVAT: 7500,
      totalValuePurchasesExVAT: 1500,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    },
    expectedStatus: 201,
    response: {
      processingDate: new Date().toISOString(),
      formBundleNumber: "119400074083",
      chargeRefNumber: "aCxFaNx0FZsCvyWF",
    },
  },

  // Flat Rate Scheme - simplified VAT at fixed percentage
  FLAT_RATE: {
    description: "VAT return under Flat Rate Scheme",
    govTestScenario: "FLAT_RATE",
    request: {
      periodKey: "24A1",
      vatDueSales: 1250.0, // 12.5% flat rate on gross turnover
      vatDueAcquisitions: 0,
      totalVatDue: 1250.0,
      vatReclaimedCurrPeriod: 0, // No input VAT reclaim in FRS
      netVatDue: 1250.0,
      totalValueSalesExVAT: 10000,
      totalValuePurchasesExVAT: 0, // Not tracked in FRS
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    },
    expectedStatus: 201,
    response: {
      processingDate: new Date().toISOString(),
      formBundleNumber: "119400074084",
      chargeRefNumber: "bCxFaNx0FZsCvyWG",
    },
  },

  // Retail Scheme - various retail methods
  RETAIL: {
    description: "VAT return under Retail Scheme",
    govTestScenario: "RETAIL",
    request: {
      periodKey: "24A1",
      vatDueSales: 2000.0,
      vatDueAcquisitions: 0,
      totalVatDue: 2000.0,
      vatReclaimedCurrPeriod: 800.0,
      netVatDue: 1200.0,
      totalValueSalesExVAT: 10000,
      totalValuePurchasesExVAT: 4000,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    },
    expectedStatus: 201,
    response: {
      processingDate: new Date().toISOString(),
      formBundleNumber: "119400074085",
      chargeRefNumber: "cCxFaNx0FZsCvyWH",
    },
  },

  // Margin Scheme - second-hand goods
  MARGIN: {
    description: "VAT return under Margin Scheme",
    govTestScenario: "MARGIN",
    request: {
      periodKey: "24A1",
      vatDueSales: 166.67, // VAT only on profit margin
      vatDueAcquisitions: 0,
      totalVatDue: 166.67,
      vatReclaimedCurrPeriod: 0, // No input VAT on margin scheme purchases
      netVatDue: 166.67,
      totalValueSalesExVAT: 5000,
      totalValuePurchasesExVAT: 4000, // Purchase price of goods
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    },
    expectedStatus: 201,
    response: {
      processingDate: new Date().toISOString(),
      formBundleNumber: "119400074086",
      chargeRefNumber: "dCxFaNx0FZsCvyWI",
    },
  },

  // Annual Accounting - annual return
  ANNUAL_ACCOUNTING: {
    description: "VAT return under Annual Accounting Scheme",
    govTestScenario: "ANNUAL_ACCOUNTING",
    request: {
      periodKey: "24A1", // Annual period
      vatDueSales: 12000.0,
      vatDueAcquisitions: 0,
      totalVatDue: 12000.0,
      vatReclaimedCurrPeriod: 3000.0,
      netVatDue: 9000.0,
      totalValueSalesExVAT: 60000,
      totalValuePurchasesExVAT: 15000,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    },
    expectedStatus: 201,
    response: {
      processingDate: new Date().toISOString(),
      formBundleNumber: "119400074087",
      chargeRefNumber: "eCxFaNx0FZsCvyWJ",
    },
  },
};

/**
 * 9-box validation error scenarios
 * These test the API's validation of the 9-box VAT return format
 */
export const validationErrorScenarios = {
  // Invalid monetary amount - more than 2 decimal places
  INVALID_BOX_1_DECIMALS: {
    status: 400,
    body: {
      code: "INVALID_MONETARY_AMOUNT",
      message: "vatDueSales must be a valid monetary amount with max 2 decimal places",
    },
  },

  // Invalid whole amount - decimal in integer-only field
  INVALID_BOX_6_DECIMAL: {
    status: 400,
    body: {
      code: "INVALID_WHOLE_AMOUNT",
      message: "totalValueSalesExVAT must be a whole number (integer)",
    },
  },

  // Box 3 calculation mismatch
  INVALID_BOX_3_CALCULATION: {
    status: 400,
    body: {
      code: "INVALID_TOTAL_VAT_DUE",
      message: "totalVatDue must equal vatDueSales + vatDueAcquisitions",
    },
  },

  // Box 5 calculation mismatch
  INVALID_BOX_5_CALCULATION: {
    status: 400,
    body: {
      code: "INVALID_NET_VAT_DUE",
      message: "netVatDue must equal absolute value of totalVatDue - vatReclaimedCurrPeriod",
    },
  },

  // Box 5 negative (not allowed per HMRC spec)
  INVALID_BOX_5_NEGATIVE: {
    status: 400,
    body: {
      code: "INVALID_NET_VAT_DUE",
      message: "netVatDue cannot be negative",
    },
  },

  // Missing required field
  MISSING_PERIOD_KEY: {
    status: 400,
    body: {
      code: "INVALID_REQUEST",
      message: "periodKey is required",
    },
  },

  // Missing required 9-box field
  MISSING_VAT_DUE_SALES: {
    status: 400,
    body: {
      code: "INVALID_REQUEST",
      message: "vatDueSales is required",
    },
  },

  // Value out of range
  INVALID_BOX_1_RANGE: {
    status: 400,
    body: {
      code: "INVALID_MONETARY_AMOUNT",
      message: "vatDueSales must be between -9999999999999.99 and 9999999999999.99",
    },
  },
};

/**
 * Get VAT scheme scenario response if Gov-Test-Scenario header matches
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {Object|null} - Scenario response or null
 */
export function getVatSchemeScenarioResponse(scenario) {
  if (!scenario) {
    return null;
  }

  const scenarioUpper = scenario.toUpperCase().replace(/-/g, "_");

  // Check VAT scheme scenarios
  const schemeScenario = vatSchemeScenarios[scenarioUpper];
  if (schemeScenario) {
    console.log(`[http-simulator:vat-schemes] Applying VAT scheme scenario: ${scenario}`);
    return {
      status: schemeScenario.expectedStatus,
      body: schemeScenario.response,
    };
  }

  // Check validation error scenarios
  const validationScenario = validationErrorScenarios[scenarioUpper];
  if (validationScenario) {
    console.log(`[http-simulator:vat-schemes] Applying validation error scenario: ${scenario}`);
    return validationScenario;
  }

  return null;
}

export default {
  vatSchemeScenarios,
  validationErrorScenarios,
  getVatSchemeScenarioResponse,
};
