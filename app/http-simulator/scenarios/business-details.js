// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/business-details.js
// Gov-Test-Scenario handlers for the ITSA Business Details endpoint

import { randomUUID } from "crypto";

/**
 * Generate a business ID in HMRC's documented format: X, one letter or digit, the
 * literal "IS", then 11 digits (e.g. XAIS12345678910). Every downstream ITSA endpoint
 * that takes a businessId (Obligations, Self Employment Business) validates against this
 * shape, so a business list the simulator hands out must match it.
 */
function generateBusinessId() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const middleChar = letters[Math.floor(Math.random() * letters.length)];
  const digits = randomUUID().replace(/-/g, "").replace(/[a-f]/g, "").padEnd(11, "0").slice(0, 11);
  return `X${middleChar}IS${digits}`;
}

/**
 * Default response: one self-employment business, shaped like the sandbox response the
 * ITSA spike recorded (see _developers/hmrc/ITSA_SPIKE.md).
 */
function defaultBusinesses() {
  return [
    {
      typeOfBusiness: "self-employment",
      businessId: generateBusinessId(),
      tradingType: "Simulated Trading Activity",
      tradingName: "Simulated Trading Co",
    },
  ];
}

/**
 * Scenario-specific business lists, per the Business Details v2.0 sandbox documentation.
 */
const scenarioBusinesses = {
  PROPERTY: [{ typeOfBusiness: "uk-property", businessId: "XPIS00000000001" }],
  FOREIGN_PROPERTY: [{ typeOfBusiness: "foreign-property", businessId: "XFIS00000000001" }],
  BUSINESS_AND_PROPERTY: [
    {
      typeOfBusiness: "self-employment",
      businessId: "XBIS00000000001",
      tradingType: "Simulated Trading Activity",
      tradingName: "Simulated Trading Co",
    },
    { typeOfBusiness: "uk-property", businessId: "XPIS00000000002" },
    { typeOfBusiness: "foreign-property", businessId: "XFIS00000000002" },
  ],
  UNSPECIFIED: [{ typeOfBusiness: "property-unspecified", businessId: "XAIS00000000001" }],
};

/**
 * Error scenarios
 */
const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: {
      code: "NOT_FOUND",
      message: "The remote endpoint has indicated that no data can be found",
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
 * Get the Business Details list for a Gov-Test-Scenario header.
 * STATEFUL falls through to the same default list: this simulator has no per-user
 * mutable state to track across a submission and retrieval cycle.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {Object} - {listOfBusinesses: [...]} or {status, body} for errors
 */
export function getBusinessDetailsForScenario(scenario) {
  if (!scenario) {
    return { listOfBusinesses: defaultBusinesses() };
  }

  const scenarioUpper = scenario.toUpperCase();

  if (errorScenarios[scenarioUpper]) {
    return errorScenarios[scenarioUpper];
  }

  if (scenarioBusinesses[scenarioUpper]) {
    return { listOfBusinesses: scenarioBusinesses[scenarioUpper] };
  }

  // STATEFUL and any other unrecognised value: default list.
  return { listOfBusinesses: defaultBusinesses() };
}
