// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-uk-property-cumulative.js
// Gov-Test-Scenario handlers for the Property Business v6.0 cumulative period summary endpoint
// (2025-26 onwards) - one resource per tax year, GET to retrieve the running total, PUT to
// create or amend it in one call. Furnished holiday lettings ended 5 April 2025, so this model
// carries one flat `ukProperty` object rather than the dated model's FHL/non-FHL split.

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
  SUBMISSION_END_DATE_CANNOT_MOVE_BACKWARDS: {
    status: 400,
    body: { code: "RULE_SUBMISSION_END_DATE_CANNOT_MOVE_BACKWARDS", message: "The submission end date cannot move backwards" },
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

const getScenarios = {
  UK_PROPERTY_FULL_EXPENSES: {
    retrieve: () => ({
      periodSummary: {
        ukProperty: { income: { periodAmount: 5000 }, expenses: { repairsAndMaintenance: 1200 } },
      },
    }),
  },
  UK_PROPERTY_CONSOLIDATED: {
    retrieve: () => ({
      periodSummary: { ukProperty: { income: { periodAmount: 5000 }, expenses: { consolidatedExpenses: 800 } } },
    }),
  },
  FOREIGN_PROPERTY: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a UK property business" },
  },
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
export function getUkPropertyCumulativePutErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  return putErrorScenarios[scenarioUpper] || null;
}

/**
 * Get the retrieve response for a Gov-Test-Scenario header. HMRC's retrieve default is
 * not-found, the same trap the dated period detail and adjustable summary retrieves carry, so
 * every call must send a scenario.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{periodSummary: object}|{status: number, body: object}}
 */
export function getUkPropertyCumulativeGetForScenario(scenario) {
  if (!scenario) return putErrorScenarios.NOT_FOUND;

  const scenarioUpper = scenario.toUpperCase();
  const entry = getScenarios[scenarioUpper];
  if (!entry) return putErrorScenarios.NOT_FOUND;
  if (entry.retrieve) return entry.retrieve();
  return entry;
}
