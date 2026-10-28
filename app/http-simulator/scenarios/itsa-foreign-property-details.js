// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-foreign-property-details.js
// Gov-Test-Scenario handlers for the Property Business v6.0 foreign property details endpoints
// (2026-27 onwards): retrieve, create and update. The default and STATEFUL scenarios work on the
// properties the simulator holds, so a created property is listed and taken by later calls.

const notFound = {
  status: 404,
  body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
};

const writeErrorScenarios = {
  NOT_FOUND: notFound,
  DUPLICATE_PROPERTY_NAME: {
    status: 400,
    body: { code: "RULE_DUPLICATE_PROPERTY_NAME", message: "Foreign property name already exists for the same country" },
  },
  TAX_YEAR_BEFORE_BUSINESS_START: {
    status: 400,
    body: {
      code: "RULE_TAX_YEAR_BEFORE_BUSINESS_START",
      message: "Foreign property cannot be reported for a tax year before the first tax year of the business",
    },
  },
  PROPERTY_BUSINESS_CEASED: {
    status: 400,
    body: { code: "RULE_PROPERTY_BUSINESS_CEASED", message: "The foreign property business income source has ceased" },
  },
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "The request cannot be completed as the amendment window has closed" },
  },
};

/**
 * Get the error response of the retrieve endpoint for a Gov-Test-Scenario header, or null when
 * the scenario (including the default and STATEFUL) should list the properties the simulator holds.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getForeignPropertyDetailsGetErrorForScenario(scenario) {
  if (!scenario) return null;
  return scenario.toUpperCase() === "NOT_FOUND" ? notFound : null;
}

/**
 * Get the error response of the create and update endpoints for a Gov-Test-Scenario header, or
 * null when the scenario (including the default and STATEFUL) should write to the properties the
 * simulator holds.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getForeignPropertyDetailsWriteErrorForScenario(scenario) {
  if (!scenario) return null;
  return writeErrorScenarios[scenario.toUpperCase()] || null;
}
