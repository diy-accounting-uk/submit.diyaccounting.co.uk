// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-self-employment-cumulative.js
// Gov-Test-Scenario handlers for the Self Employment Business v5.0 cumulative period summary
// endpoint (2025-26 onwards) - one resource per tax year, GET to retrieve the running total,
// PUT to create or amend it in one call.

/**
 * The cumulative period summary the default and STATEFUL scenarios return - one running total
 * for the tax year, in the same field shape a caller submits.
 */
function defaultCumulativeSummary() {
  return {
    periodIncome: {
      turnover: 5000,
      other: 0,
    },
    periodExpenses: {
      costOfGoods: 1200,
      otherExpenses: 0,
    },
  };
}

const putErrorScenarios = {
  TAX_YEAR_NOT_SUPPORTED: {
    status: 400,
    body: { code: "RULE_TAX_YEAR_NOT_SUPPORTED", message: "The tax year specified does not lie within the supported range" },
  },
  START_DATE_NOT_ALIGNED_TO_COMMENCEMENT_DATE: {
    status: 400,
    body: { code: "RULE_START_DATE_NOT_ALIGNED_TO_COMMENCEMENT_DATE", message: "The submission start date is not aligned to the commencement date" },
  },
  START_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE: {
    status: 400,
    body: { code: "RULE_START_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE", message: "The submission start date does not match the reporting type" },
  },
  END_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE: {
    status: 400,
    body: { code: "RULE_END_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE", message: "The submission end date does not match the reporting type" },
  },
  MISSING_SUBMISSION_DATES: {
    status: 400,
    body: { code: "RULE_MISSING_SUBMISSION_DATES", message: "The submission dates are missing" },
  },
  START_AND_END_DATE_NOT_ALLOWED: {
    status: 400,
    body: { code: "RULE_START_AND_END_DATE_NOT_ALLOWED", message: "The submission dates are not allowed for this reporting type" },
  },
  EARLY_DATA_SUBMISSION_NOT_ACCEPTED: {
    status: 400,
    body: { code: "RULE_EARLY_DATA_SUBMISSION_NOT_ACCEPTED", message: "Data cannot be submitted before the period has started" },
  },
  ADVANCE_SUBMISSION_REQUIRES_PERIOD_END_DATE: {
    status: 400,
    body: { code: "RULE_ADVANCE_SUBMISSION_REQUIRES_PERIOD_END_DATE", message: "An advance submission requires a period end date" },
  },
  SUBMISSION_END_DATE_CANNOT_MOVE_BACKWARDS: {
    status: 400,
    body: { code: "RULE_SUBMISSION_END_DATE_CANNOT_MOVE_BACKWARDS", message: "The submission end date cannot move backwards" },
  },
  BOTH_EXPENSES_SUPPLIED: {
    status: 400,
    body: { code: "RULE_BOTH_EXPENSES_SUPPLIED", message: "Both expenses and consolidatedExpenses are present at the same time" },
  },
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "The request cannot be completed as the amendment window has closed" },
  },
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
  SUBMIT_API_HTTP_500: {
    status: 500,
    body: { code: "SERVER_ERROR", message: "Internal server error" },
  },
  SUBMIT_HMRC_API_HTTP_500: {
    status: 500,
    body: { code: "SERVER_ERROR", message: "Internal server error" },
  },
};

const getErrorScenarios = {
  NOT_FOUND: putErrorScenarios.NOT_FOUND,
  TAX_YEAR_NOT_SUPPORTED: putErrorScenarios.TAX_YEAR_NOT_SUPPORTED,
  SUBMIT_API_HTTP_500: putErrorScenarios.SUBMIT_API_HTTP_500,
  SUBMIT_HMRC_API_HTTP_500: putErrorScenarios.SUBMIT_HMRC_API_HTTP_500,
};

/**
 * Get the create-or-amend response for a Gov-Test-Scenario header. Default and STATEFUL both
 * accept the submission with no body - HMRC's cumulative PUT returns 204 either way, since this
 * simulator has no per-user mutable state to reflect a submission back into a later read.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getSelfEmploymentCumulativePutErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  return putErrorScenarios[scenarioUpper] || null;
}

/**
 * Get the retrieve response for a Gov-Test-Scenario header.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{periodSummary: object}|{status: number, body: object}}
 */
export function getSelfEmploymentCumulativeGetForScenario(scenario) {
  if (!scenario) return { periodSummary: defaultCumulativeSummary() };

  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "CONSOLIDATED_EXPENSES") {
    return { periodSummary: { periodIncome: { turnover: 5000, other: 0 }, periodExpenses: { consolidatedExpenses: 1200 } } };
  }
  if (getErrorScenarios[scenarioUpper]) return getErrorScenarios[scenarioUpper];

  return { periodSummary: defaultCumulativeSummary() };
}
