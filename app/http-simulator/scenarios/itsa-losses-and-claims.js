// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-losses-and-claims.js
// Gov-Test-Scenario handlers for the Individual Losses v7.0 "loss claims" endpoints

/**
 * The losses and claims the default GET scenario returns: a carry-forward claim, the common
 * first-year-of-trading case.
 */
function defaultLossesAndClaims() {
  return {
    losses: { broughtForwardLosses: 0 },
    claims: {
      carryForward: { currentYearLosses: 1000 },
    },
  };
}

/** The losses and claims the TERMINAL_LOSS_CLAIM scenario returns. */
function terminalLossClaimLossesAndClaims() {
  return {
    losses: { broughtForwardLosses: 500 },
    claims: {
      carryBack: { terminalLosses: 500 },
    },
  };
}

const getErrorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
};

const putErrorScenarios = {
  CARRY_BACK_CLAIM: {
    status: 400,
    body: { code: "RULE_TYPE_OF_CLAIM_INVALID", message: "The claim type provided is not applicable to this income source" },
  },
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "You are outside the amendment window" },
  },
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
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
 * Get the retrieve-losses-and-claims response for a Gov-Test-Scenario header. STATEFUL falls
 * through to the default set: this simulator has no per-user mutable state to reflect an
 * earlier create/amend back into a read.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{lossesAndClaims: object}|{status: number, body: object}}
 */
export function getLossesAndClaimsForScenario(scenario) {
  if (!scenario) return { lossesAndClaims: defaultLossesAndClaims() };

  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "TERMINAL_LOSS_CLAIM") return { lossesAndClaims: terminalLossClaimLossesAndClaims() };
  if (getErrorScenarios[scenarioUpper]) return getErrorScenarios[scenarioUpper];

  return { lossesAndClaims: defaultLossesAndClaims() };
}

/**
 * Get the create-or-amend error response for a Gov-Test-Scenario header, or null when the
 * default or STATEFUL scenario accepts the submission with no body (HMRC's PUT answers 204).
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getLossesAndClaimsAmendErrorForScenario(scenario) {
  if (!scenario) return null;
  return putErrorScenarios[scenario.toUpperCase()] || null;
}

/**
 * Get the delete error response for a Gov-Test-Scenario header, or null when the default or
 * STATEFUL scenario accepts the deletion with no body (HMRC's DELETE answers 204).
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getLossesAndClaimsDeleteErrorForScenario(scenario) {
  if (!scenario) return null;
  return deleteErrorScenarios[scenario.toUpperCase()] || null;
}
