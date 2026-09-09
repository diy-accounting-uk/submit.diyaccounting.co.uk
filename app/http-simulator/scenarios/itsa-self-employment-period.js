// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-self-employment-period.js
// Gov-Test-Scenario handlers for the Self Employment Business "create period summary" endpoint

/**
 * Error scenarios named in the Self Employment Business v5.0 create-period-summary
 * documentation. STATEFUL performs a real create (handled by the route, not here).
 */
const errorScenarios = {
  OVERLAPPING_PERIOD: {
    status: 400,
    body: { code: "RULE_OVERLAPPING_PERIOD", message: "Period summary overlaps with any of the existing period summaries" },
  },
  MISALIGNED_PERIOD: {
    status: 400,
    body: { code: "RULE_MISALIGNED_PERIOD", message: "Period summary is not within the accounting period" },
  },
  NOT_CONTIGUOUS_PERIOD: {
    status: 400,
    body: { code: "RULE_NOT_CONTIGUOUS_PERIOD", message: "Period summaries are not contiguous" },
  },
  NOT_ALLOWED_CONSOLIDATED_EXPENSES: {
    status: 400,
    body: {
      code: "RULE_NOT_ALLOWED_CONSOLIDATED_EXPENSES",
      message: "Cumulative turnover amount exceeds the consolidated expenses threshold",
    },
  },
  DUPLICATE_SUBMISSION: {
    status: 400,
    body: { code: "RULE_DUPLICATE_SUBMISSION", message: "A summary has already been submitted for the specified period" },
  },
  TAX_YEAR_NOT_SUPPORTED: {
    status: 400,
    body: { code: "RULE_TAX_YEAR_NOT_SUPPORTED", message: "The tax year is not supported" },
  },
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
  BOTH_EXPENSES_SUPPLIED: {
    status: 400,
    body: { code: "RULE_BOTH_EXPENSES_SUPPLIED", message: "Both expenses and consolidatedExpenses are present at the same time" },
  },
  BUSINESS_INCOME_PERIOD_RESTRICTION: {
    status: 400,
    body: {
      code: "RULE_BUSINESS_INCOME_PERIOD_RESTRICTION",
      message: "The customer's ITSA status restricts submissions for this period",
    },
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

/**
 * Get the error response for a Gov-Test-Scenario header, or null when the scenario
 * (including the default, unset, and STATEFUL) should fall through to a real create.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{status: number, body: object}|null}
 */
export function getSelfEmploymentPeriodErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  return errorScenarios[scenarioUpper] || null;
}
