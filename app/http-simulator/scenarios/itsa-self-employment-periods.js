// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/itsa-self-employment-periods.js
// Gov-Test-Scenario handlers for the Self Employment Business v5.0 "list period summaries" endpoint

/**
 * One quarterly period summary. periodId is a concatenation of the start and end dates, the
 * way HMRC's own examples build it - nothing here is opaque or randomizable.
 */
function defaultPeriods() {
  return [
    {
      periodId: "2023-04-06_2023-07-05",
      periodStartDate: "2023-04-06",
      periodEndDate: "2023-07-05",
    },
  ];
}

const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "The supplied income source could not be found" },
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
 * Get the list-period-summaries response for a Gov-Test-Scenario header. STATEFUL falls
 * through to the default set: this simulator has no per-user mutable state to reflect
 * submitted periods back into a list.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{periods: object[]}|{status: number, body: object}}
 */
export function getSelfEmploymentPeriodsForScenario(scenario) {
  if (!scenario) return { periods: defaultPeriods() };

  const scenarioUpper = scenario.toUpperCase();
  if (errorScenarios[scenarioUpper]) return errorScenarios[scenarioUpper];

  return { periods: defaultPeriods() };
}
