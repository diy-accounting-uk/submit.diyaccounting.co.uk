// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/payments.js
// Gov-Test-Scenario handlers for VAT payments endpoint

/**
 * Named Gov-Test-Scenario payment sets, matching HMRC's VAT (MTD) 1.0 sandbox scenarios.
 */
const scenarioPayments = {
  SINGLE_PAYMENT: [{ amount: 1000.0, received: "2017-02-02" }],
  MULTIPLE_PAYMENTS: [
    { amount: 1000.0, received: "2017-03-02" },
    { amount: 2000.0, received: "2017-06-02" },
    { amount: 500.0 }, // not yet received
  ],
  SINGLE_PAYMENT_2018_19: [{ amount: 1500.0, received: "2018-02-02" }],
  MULTIPLE_PAYMENTS_2018_19: [
    { amount: 1200.0, received: "2018-03-02" },
    { amount: 2200.0, received: "2018-06-02" },
    { amount: 800.0 }, // not yet received
  ],
};

/**
 * Error scenarios
 */
const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: {
      code: "NOT_FOUND",
      message: "The requested resource could not be found",
    },
  },
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
 * Get payments based on Gov-Test-Scenario header.
 * HMRC's own default (no scenario header supplied) is "no associated data found" for this
 * endpoint, matching liabilities' default choice.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {Object} - {payments: [...]} or {status: number, body: {...}} for errors
 */
export function getPaymentsForScenario(scenario) {
  if (!scenario) {
    return { payments: [] };
  }

  const scenarioUpper = scenario.toUpperCase();

  if (errorScenarios[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying error scenario: ${scenario}`);
    return errorScenarios[scenarioUpper];
  }

  if (scenarioPayments[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying payment scenario: ${scenario}`);
    return { payments: scenarioPayments[scenarioUpper] };
  }

  return { payments: [] };
}
