// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-tax-liability-adjustments.js
// Gov-Test-Scenario handlers for the Individuals Tax Liability Adjustments v1.0 endpoints

/** The tax liability adjustments the default GET scenario returns. */
function defaultTaxLiabilityAdjustments() {
  return {
    carryBackLossesDecrease: { incomeTax: 100 },
  };
}

const getErrorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
};

const putErrorScenarios = {
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "You are outside the amendment window" },
  },
};

const deleteErrorScenarios = {
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "You are outside the amendment window" },
  },
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
};

/**
 * Get the retrieve-tax-liability-adjustments response for a Gov-Test-Scenario header. STATEFUL
 * falls through to the default set: this simulator has no per-user mutable state to reflect an
 * earlier create/amend back into a read.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{taxLiabilityAdjustments: object}|{status: number, body: object}}
 */
export function getTaxLiabilityAdjustmentsForScenario(scenario) {
  if (!scenario) return { taxLiabilityAdjustments: defaultTaxLiabilityAdjustments() };

  const scenarioUpper = scenario.toUpperCase();
  if (getErrorScenarios[scenarioUpper]) return getErrorScenarios[scenarioUpper];

  return { taxLiabilityAdjustments: defaultTaxLiabilityAdjustments() };
}

/**
 * Get the create-or-amend error response for a Gov-Test-Scenario header, or null when the
 * default or STATEFUL scenario accepts the submission with no body (HMRC's PUT answers 204).
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getTaxLiabilityAdjustmentsAmendErrorForScenario(scenario) {
  if (!scenario) return null;
  return putErrorScenarios[scenario.toUpperCase()] || null;
}

/**
 * Get the delete error response for a Gov-Test-Scenario header, or null when the default or
 * STATEFUL scenario accepts the deletion with no body (HMRC's DELETE answers 204).
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getTaxLiabilityAdjustmentsDeleteErrorForScenario(scenario) {
  if (!scenario) return null;
  return deleteErrorScenarios[scenario.toUpperCase()] || null;
}
