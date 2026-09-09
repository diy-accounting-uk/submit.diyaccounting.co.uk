// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/itsa-self-employment-annual.js
// Gov-Test-Scenario handlers for the Self Employment Business v5.0 "retrieve/create and amend
// annual submission" endpoints

/**
 * The annual submission the default GET scenario returns: adjustments and the itemised
 * allowances, matching the shape a caller submits to the create/amend endpoint.
 */
function defaultAnnualSubmission() {
  return {
    adjustments: {
      includedNonTaxableProfits: 200,
      basisAdjustment: 100,
    },
    allowances: {
      annualInvestmentAllowance: 500,
      capitalAllowanceMainPool: 100,
    },
  };
}

/**
 * The annual submission the TRADING_ALLOWANCE scenario returns: the trading allowance form
 * instead of the itemised allowances.
 */
function tradingAllowanceAnnualSubmission() {
  return {
    adjustments: {
      includedNonTaxableProfits: 200,
    },
    allowances: {
      tradingIncomeAllowance: 200,
    },
  };
}

const getErrorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
};

const putErrorScenarios = {
  ALLOWANCE_NOT_SUPPORTED: {
    status: 400,
    body: {
      code: "RULE_ALLOWANCE_NOT_SUPPORTED",
      message:
        "One or more of supplied allowances (electricChargePointAllowance, zeroEmissionsCarAllowance, structuredBuildingAllowance, enhancedStructuredBuildingAllowance) is not supported for the supplied tax year",
    },
  },
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
  WRONG_TPA_AMOUNT_SUBMITTED: {
    status: 400,
    body: {
      code: "RULE_WRONG_TPA_AMOUNT_SUBMITTED",
      message: "Transition profit acceleration value cannot be submitted without a transition profit value",
    },
  },
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "You are outside the amendment window" },
  },
};

/**
 * Get the retrieve-an-annual-submission response for a Gov-Test-Scenario header. STATEFUL
 * falls through to the default set: this simulator has no per-user mutable state to reflect
 * an earlier create/amend back into a read.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{annualSubmission: object}|{status: number, body: object}}
 */
export function getAnnualSubmissionForScenario(scenario) {
  if (!scenario) return { annualSubmission: defaultAnnualSubmission() };

  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "TRADING_ALLOWANCE") return { annualSubmission: tradingAllowanceAnnualSubmission() };
  if (getErrorScenarios[scenarioUpper]) return getErrorScenarios[scenarioUpper];

  return { annualSubmission: defaultAnnualSubmission() };
}

/**
 * Get the create-and-amend-annual-submission response for a Gov-Test-Scenario header. The
 * default and STATEFUL scenarios accept the submission with no body - HMRC's create/amend
 * endpoint returns 204.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getAnnualSubmissionAmendErrorForScenario(scenario) {
  if (!scenario) return null;

  const scenarioUpper = scenario.toUpperCase();
  return putErrorScenarios[scenarioUpper] || null;
}
