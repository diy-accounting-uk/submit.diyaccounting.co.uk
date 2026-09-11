// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-uk-property-periods.js
// Gov-Test-Scenario handlers for the Property Business v6.0 "list period summaries" endpoint
// (untyped - serves UK and foreign property alike, the way HMRC's own path does)

/**
 * One quarterly period summary. submissionId is a concatenation of the start and end dates,
 * the way the create endpoint's simulated submissionId is built - nothing here is opaque or
 * randomizable.
 */
function defaultPeriods() {
  return [
    {
      submissionId: "2023-04-06_2023-07-05",
      fromDate: "2023-04-06",
      toDate: "2023-07-05",
    },
  ];
}

const errorScenarios = {
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

/**
 * Get the list-period-summaries response for a Gov-Test-Scenario header. STATEFUL falls
 * through to the default set: this simulator has no per-user mutable state to reflect
 * submitted periods back into a list.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{periods: object[]}|{status: number, body: object}}
 */
export function getUkPropertyPeriodsForScenario(scenario) {
  if (!scenario) return { periods: defaultPeriods() };

  const scenarioUpper = scenario.toUpperCase();
  if (errorScenarios[scenarioUpper]) return errorScenarios[scenarioUpper];

  return { periods: defaultPeriods() };
}
