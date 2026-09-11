// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-uk-property-period-detail.js
// Gov-Test-Scenario handlers for the Property Business v6.0 "retrieve/amend a UK property
// period summary" endpoint

/**
 * The period summary the default and STATEFUL scenarios return - matching the shape a caller
 * submits to the create/amend endpoints, since HMRC returns what it holds for the period.
 */
function defaultPeriodSummary(submissionId) {
  const [fromDate, toDate] = String(submissionId).split("_");
  return {
    fromDate: fromDate || "2023-04-06",
    toDate: toDate || "2023-07-05",
    ukNonFhlProperty: {
      income: { periodAmount: 5000 },
      expenses: { repairsAndMaintenance: 1200 },
    },
  };
}

const errorScenarios = {
  UK_PROPERTY: { retrieve: () => ({ periodSummary: defaultPeriodSummary() }) },
  UK_NON_FHL_FULL_EXPENSES: { retrieve: () => ({ periodSummary: defaultPeriodSummary() }) },
  UK_NON_FHL_CONSOLIDATED: {
    retrieve: () => ({
      periodSummary: {
        fromDate: "2023-04-06",
        toDate: "2023-07-05",
        ukNonFhlProperty: { income: { periodAmount: 5000 }, expenses: { consolidatedExpenses: 800 } },
      },
    }),
  },
  UK_FHL_FULL_EXPENSES: {
    retrieve: () => ({
      periodSummary: {
        fromDate: "2023-04-06",
        toDate: "2023-07-05",
        ukFhlProperty: { income: { periodAmount: 5000 }, expenses: { repairsAndMaintenance: 1200 } },
      },
    }),
  },
  UK_FHL_CONSOLIDATED: {
    retrieve: () => ({
      periodSummary: {
        fromDate: "2023-04-06",
        toDate: "2023-07-05",
        ukFhlProperty: { income: { periodAmount: 5000 }, expenses: { consolidatedExpenses: 800 } },
      },
    }),
  },
  FOREIGN_PROPERTY: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a UK property business" },
  },
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
  TYPE_OF_BUSINESS_INCORRECT: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a UK property business" },
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
 * Get the retrieve-a-period-summary response for a Gov-Test-Scenario header. HMRC's retrieve
 * default is not-found, matching the adjustable summary's retrieve, so every call must send a
 * scenario. STATEFUL falls through to the same not-found default: this simulator has no
 * per-user mutable state to reflect an earlier create/amend back into a read.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} submissionId - the submissionId path parameter, used to echo back plausible dates
 * @returns {{periodSummary: object}|{status: number, body: object}}
 */
export function getUkPropertyPeriodDetailForScenario(scenario, submissionId) {
  if (!scenario) return errorScenarios.NOT_FOUND;

  const scenarioUpper = scenario.toUpperCase();
  const entry = errorScenarios[scenarioUpper];
  if (!entry) return errorScenarios.NOT_FOUND;
  if (entry.retrieve) return entry.retrieve(submissionId);
  return entry;
}

/**
 * Get the amend-a-period-summary response for a Gov-Test-Scenario header. The default and
 * STATEFUL scenarios accept the amendment with no body.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getUkPropertyPeriodAmendErrorForScenario(scenario) {
  if (!scenario) return null;

  const scenarioUpper = scenario.toUpperCase();
  const entry = errorScenarios[scenarioUpper];
  if (!entry || entry.retrieve) return null;
  return entry;
}
