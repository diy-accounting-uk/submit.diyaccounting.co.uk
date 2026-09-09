// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/itsa-self-employment-period-detail.js
// Gov-Test-Scenario handlers for the Self Employment Business v5.0 "retrieve/amend a period
// summary" endpoint

/**
 * The period summary the default and STATEFUL scenarios return - matching the shape a caller
 * submits to the create/amend endpoints, since HMRC returns what it holds for the period.
 */
function defaultPeriodSummary(periodId) {
  const [periodStartDate, periodEndDate] = String(periodId).split("_");
  return {
    periodDates: {
      periodStartDate: periodStartDate || "2023-04-06",
      periodEndDate: periodEndDate || "2023-07-05",
    },
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

const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
  TAX_YEAR_NOT_SUPPORTED: {
    status: 400,
    body: { code: "RULE_TAX_YEAR_NOT_SUPPORTED", message: "The tax year specified does not lie within the supported range" },
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
 * Get the retrieve-a-period-summary response for a Gov-Test-Scenario header. STATEFUL falls
 * through to the default set: this simulator has no per-user mutable state to reflect an
 * earlier create/amend back into a read.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} periodId - the periodId path parameter, used to echo back plausible dates
 * @returns {{periodSummary: object}|{status: number, body: object}}
 */
export function getSelfEmploymentPeriodDetailForScenario(scenario, periodId) {
  if (!scenario) return { periodSummary: defaultPeriodSummary(periodId) };

  const scenarioUpper = scenario.toUpperCase();
  if (errorScenarios[scenarioUpper]) return errorScenarios[scenarioUpper];

  return { periodSummary: defaultPeriodSummary(periodId) };
}

/**
 * Get the amend-a-period-summary response for a Gov-Test-Scenario header. The default and
 * STATEFUL scenarios accept the amendment with no body - HMRC's amend endpoint returns 204.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getSelfEmploymentPeriodAmendErrorForScenario(scenario) {
  if (!scenario) return null;

  const scenarioUpper = scenario.toUpperCase();
  return errorScenarios[scenarioUpper] || null;
}
