// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/itsa-status.js
// Gov-Test-Scenario handlers for the ITSA status (Self Assessment Individual Details) endpoint

/**
 * One status entry for the requested tax year. The taxYear always echoes what was asked for -
 * nothing here is a fixed tax year.
 */
function statusDetailsFor(taxYear) {
  return {
    taxYear,
    itsaStatusDetails: [
      {
        submittedOn: "2024-04-06T12:00:00.000Z",
        status: "MTD Mandated",
        statusReason: "Sign up - return available",
        businessIncome2YearsPrior: 15000.0,
      },
    ],
  };
}

function nextTaxYear(taxYear) {
  const startYear = parseInt(String(taxYear).slice(0, 4), 10);
  return `${startYear + 1}-${String((startYear + 2) % 100).padStart(2, "0")}`;
}

/**
 * Error scenarios
 */
const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: {
      code: "MATCHING_RESOURCE_NOT_FOUND",
      message: "Matching resource not found",
    },
  },
  NOT_ENROLLED: {
    status: 403,
    body: {
      code: "CLIENT_NOT_MTD_ENROLLED",
      message: "The client does not have an active MTD enrolment.",
    },
  },
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
 * Get the ITSA status response for a Gov-Test-Scenario header.
 * STATEFUL falls through to the default set: this simulator has no per-user mutable state to
 * reflect submitted values back into a read, the same rule the phase 1 obligations scenarios use.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} taxYear - the requested taxYear path parameter
 * @param {boolean} futureYears - whether to include the following tax year too
 * @returns {Object} - {itsaStatuses: [...]} or {status, body} for errors
 */
export function getItsaStatusForScenario(scenario, taxYear, futureYears) {
  if (scenario) {
    const scenarioUpper = scenario.toUpperCase();
    if (errorScenarios[scenarioUpper]) {
      return errorScenarios[scenarioUpper];
    }
  }

  const itsaStatuses = [statusDetailsFor(taxYear)];
  if (futureYears) {
    itsaStatuses.push(statusDetailsFor(nextTaxYear(taxYear)));
  }
  return { itsaStatuses };
}
