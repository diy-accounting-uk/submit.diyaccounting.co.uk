// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/liabilities.js
// Gov-Test-Scenario handlers for VAT liabilities endpoint

/**
 * Named Gov-Test-Scenario liability sets, matching HMRC's VAT (MTD) 1.0 sandbox scenarios.
 */
const scenarioLiabilities = {
  SINGLE_LIABILITY: [
    {
      taxPeriod: { from: "2017-01-02", to: "2017-02-02" },
      type: "VAT Return Debit Charge",
      originalAmount: 1000.0,
      outstandingAmount: 500.0,
      due: "2017-03-02",
    },
  ],
  MULTIPLE_LIABILITIES: [
    {
      taxPeriod: { from: "2017-04-05", to: "2017-07-05" },
      type: "VAT Return Debit Charge",
      originalAmount: 1000.0,
      outstandingAmount: 500.0,
      due: "2017-08-05",
    },
    {
      taxPeriod: { from: "2017-07-06", to: "2017-10-06" },
      type: "VAT Officer's Assessment",
      originalAmount: 2000.0,
      outstandingAmount: 2000.0,
      due: "2017-11-06",
    },
    {
      taxPeriod: { from: "2017-10-07", to: "2017-12-21" },
      type: "VAT Return Debit Charge",
      originalAmount: 500.0,
      outstandingAmount: 0.0,
      due: "2018-01-21",
    },
  ],
  SINGLE_LIABILITY_2018_19: [
    {
      taxPeriod: { from: "2018-01-02", to: "2018-02-02" },
      type: "VAT Return Debit Charge",
      originalAmount: 1500.0,
      outstandingAmount: 750.0,
      due: "2018-03-02",
    },
  ],
  MULTIPLE_LIABILITIES_2018_19: [
    {
      taxPeriod: { from: "2018-04-05", to: "2018-07-05" },
      type: "VAT Return Debit Charge",
      originalAmount: 1200.0,
      outstandingAmount: 600.0,
      due: "2018-08-05",
    },
    {
      taxPeriod: { from: "2018-07-06", to: "2018-10-06" },
      type: "VAT Central Assessment",
      originalAmount: 2200.0,
      outstandingAmount: 2200.0,
      due: "2018-11-06",
    },
    {
      taxPeriod: { from: "2018-10-07", to: "2018-12-21" },
      type: "VAT Return Debit Charge",
      originalAmount: 800.0,
      outstandingAmount: 0.0,
      due: "2019-01-21",
    },
  ],
};

/**
 * Error scenarios
 */
const errorScenarios = {
  INSOLVENT_TRADER: {
    status: 403,
    body: {
      code: "RULE_INSOLVENT_TRADER",
      message: "The remote endpoint has indicated that the client or agent is not authorised because the trader is insolvent",
    },
  },
  VRN_INVALID: {
    status: 400,
    body: {
      code: "VRN_INVALID",
      message: "The provided VAT registration number is invalid",
    },
  },
  DATE_FROM_INVALID: {
    status: 400,
    body: {
      code: "DATE_FROM_INVALID",
      message: "The provided from date is invalid",
    },
  },
  DATE_TO_INVALID: {
    status: 400,
    body: {
      code: "DATE_TO_INVALID",
      message: "The provided to date is invalid",
    },
  },
  DATE_RANGE_INVALID: {
    status: 400,
    body: {
      code: "DATE_RANGE_INVALID",
      message: "The date of the range must be between 1 and 365 days",
    },
  },
  // HTTP 500 error scenarios for testing error handling
  SUBMIT_API_HTTP_500: {
    status: 500,
    body: {
      code: "SERVER_ERROR",
      message: "Internal server error",
    },
  },
  SUBMIT_HMRC_API_HTTP_500: {
    status: 500,
    body: {
      code: "SERVER_ERROR",
      message: "Internal server error",
    },
  },
};

/**
 * Get liabilities based on Gov-Test-Scenario header.
 * HMRC's own default (no scenario header supplied) is "no associated data found" for this
 * endpoint, unlike obligations' friendlier default - match that here.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {Object} - {liabilities: [...]} or {status: number, body: {...}} for errors
 */
export function getLiabilitiesForScenario(scenario) {
  if (!scenario) {
    return { liabilities: [] };
  }

  const scenarioUpper = scenario.toUpperCase();

  if (errorScenarios[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying error scenario: ${scenario}`);
    return errorScenarios[scenarioUpper];
  }

  if (scenarioLiabilities[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying liability scenario: ${scenario}`);
    return { liabilities: scenarioLiabilities[scenarioUpper] };
  }

  return { liabilities: [] };
}
