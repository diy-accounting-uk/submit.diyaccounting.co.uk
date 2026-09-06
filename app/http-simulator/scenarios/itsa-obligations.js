// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/itsa-obligations.js
// Gov-Test-Scenario handlers for the ITSA Obligations (income-and-expenditure) endpoint

/**
 * One self-employment business with one open and one fulfilled quarterly obligation.
 * Unlike a VAT periodKey, an ITSA obligation period is a plain calendar quarter, not an
 * opaque HMRC-assigned value, so there is nothing here to randomize.
 */
function defaultObligations() {
  return [
    {
      typeOfBusiness: "self-employment",
      businessId: "XAIS12345678910",
      obligationDetails: [
        {
          periodStartDate: "2024-04-06",
          periodEndDate: "2024-07-05",
          dueDate: "2024-08-05",
          status: "fulfilled",
          receivedDate: "2024-08-01",
        },
        {
          periodStartDate: "2024-07-06",
          periodEndDate: "2024-10-05",
          dueDate: "2024-11-05",
          status: "open",
        },
      ],
    },
  ];
}

const scenarioObligations = {
  OPEN: [
    {
      typeOfBusiness: "self-employment",
      businessId: "XBIS12345678903",
      obligationDetails: [
        { periodStartDate: "2024-07-06", periodEndDate: "2024-10-05", dueDate: "2024-11-05", status: "open" },
      ],
    },
  ],
  FULFILLED: [
    {
      typeOfBusiness: "self-employment",
      businessId: "XBIS12345678902",
      obligationDetails: [
        {
          periodStartDate: "2024-04-06",
          periodEndDate: "2024-07-05",
          dueDate: "2024-08-05",
          status: "fulfilled",
          receivedDate: "2024-08-01",
        },
      ],
    },
  ],
  CUMULATIVE: [
    {
      typeOfBusiness: "self-employment",
      businessId: "XAIS12345678910",
      obligationDetails: [
        { periodStartDate: "2025-04-06", periodEndDate: "2025-07-05", dueDate: "2025-08-05", status: "open" },
      ],
    },
  ],
};

/**
 * Error scenarios
 */
const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: {
      code: "MATCHING_RESOURCE_NOT_FOUND",
      message: "The supplied income source could not be found",
    },
  },
  NO_OBLIGATIONS_FOUND: {
    status: 404,
    body: {
      code: "NO_OBLIGATIONS_FOUND",
      message: "No obligations found using this filter",
    },
  },
  INSOLVENT_TRADER: {
    status: 400,
    body: {
      code: "RULE_INSOLVENT_TRADER",
      message: "The remote endpoint has indicated that the Trader is insolvent",
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
 * Get the Obligations response for a Gov-Test-Scenario header.
 * DYNAMIC and STATEFUL fall through to the default set: this simulator has no per-user
 * mutable state to reflect submitted values back into a read.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {Object} - {obligations: [...]} or {status, body} for errors
 */
export function getItsaObligationsForScenario(scenario) {
  if (!scenario) {
    return { obligations: defaultObligations() };
  }

  const scenarioUpper = scenario.toUpperCase();

  if (errorScenarios[scenarioUpper]) {
    return errorScenarios[scenarioUpper];
  }

  if (scenarioObligations[scenarioUpper]) {
    return { obligations: scenarioObligations[scenarioUpper] };
  }

  return { obligations: defaultObligations() };
}
