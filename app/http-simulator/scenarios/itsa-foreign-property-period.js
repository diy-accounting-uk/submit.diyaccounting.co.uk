// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-foreign-property-period.js
// Gov-Test-Scenario handlers for the Property Business v6.0 "create a foreign property income
// and expenses period summary" endpoint (the dated model, tax years 2024-25 and before)

const notFound = {
  status: 404,
  body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
};

const typeOfBusinessIncorrect = {
  status: 400,
  body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a foreign property business" },
};

/** Error scenarios named in the create-period-summary documentation. STATEFUL creates, as the default does. */
const errorScenarios = {
  OVERLAPPING: {
    status: 400,
    body: { code: "RULE_OVERLAPPING_PERIOD", message: "Period summary overlaps with any of the existing period summaries" },
  },
  MISALIGNED: {
    status: 400,
    body: { code: "RULE_MISALIGNED_PERIOD", message: "Period summary is not within the accounting period" },
  },
  NOT_CONTIGUOUS: {
    status: 400,
    body: { code: "RULE_NOT_CONTIGUOUS_PERIOD", message: "Period summaries are not contiguous" },
  },
  DUPLICATE_SUBMISSION: {
    status: 400,
    body: { code: "RULE_DUPLICATE_SUBMISSION", message: "A summary has already been submitted for the specified period" },
  },
  TYPE_OF_BUSINESS_INCORRECT: typeOfBusinessIncorrect,
  UK_PROPERTY: typeOfBusinessIncorrect,
  NOT_FOUND: notFound,
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
 * Get the error response for a Gov-Test-Scenario header, or null when the scenario (including
 * the default, unset, and STATEFUL) should fall through to a create.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{status: number, body: object}|null}
 */
export function getForeignPropertyPeriodErrorForScenario(scenario) {
  if (!scenario) return null;
  return errorScenarios[scenario.toUpperCase()] || null;
}
