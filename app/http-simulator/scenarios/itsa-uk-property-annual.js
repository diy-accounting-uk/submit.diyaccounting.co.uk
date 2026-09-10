// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-uk-property-annual.js
// Gov-Test-Scenario handlers for the Property Business v6.0 "retrieve/create and amend UK
// property annual submission" endpoints

/** The annual submission the UK_PROPERTY scenario returns: adjustments and itemised allowances. */
function ukPropertyAnnualSubmission() {
  return {
    ukProperty: {
      adjustments: { balancingCharge: 100, privateUseAdjustment: 50 },
      allowances: { annualInvestmentAllowance: 500, otherCapitalAllowance: 100 },
    },
  };
}

/** The annual submission the UK_ALL_OTHER_ALLOWANCES scenario returns: the full itemised set. */
function ukAllOtherAllowancesAnnualSubmission() {
  return {
    ukProperty: {
      allowances: {
        annualInvestmentAllowance: 500,
        businessPremisesRenovationAllowance: 100,
        otherCapitalAllowance: 100,
        costOfReplacingDomesticItems: 50,
        zeroEmissionsCarAllowance: 200,
      },
    },
  };
}

/** The annual submission the UK_PROPERTY_ALLOWANCE scenario returns: propertyIncomeAllowance alone. */
function ukPropertyAllowanceAnnualSubmission() {
  return { ukProperty: { allowances: { propertyIncomeAllowance: 1000 } } };
}

const getScenarios = {
  UK_PROPERTY: ukPropertyAnnualSubmission,
  UK_ALL_OTHER_ALLOWANCES: ukAllOtherAllowancesAnnualSubmission,
  UK_PROPERTY_ALLOWANCE: ukPropertyAllowanceAnnualSubmission,
  UK_FHL_ALL_OTHER_ALLOWANCES: ukAllOtherAllowancesAnnualSubmission,
  UK_FHL_PROPERTY_ALLOWANCE: ukPropertyAllowanceAnnualSubmission,
};

const notFound = {
  status: 404,
  body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
};

const getErrorScenarios = {
  NOT_FOUND: notFound,
  FOREIGN_PROPERTY: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a UK property business" },
  },
};

const putErrorScenarios = {
  NOT_FOUND: notFound,
  TYPE_OF_BUSINESS_INCORRECT: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a UK property business" },
  },
  PROPERTY_INCOME_ALLOWANCE: {
    status: 400,
    body: {
      code: "RULE_PROPERTY_INCOME_ALLOWANCE",
      message: "Property income allowance must not be present alongside a private use adjustment",
    },
  },
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "You are outside the amendment window" },
  },
};

/**
 * Get the retrieve-an-annual-submission response for a Gov-Test-Scenario header. Unlike the
 * self-employment annual GET, the default here is not-found - a caller must send a scenario,
 * the same trap the adjustable summary's retrieve has. STATEFUL falls through to that same
 * not-found default: this simulator has no per-user mutable state to reflect an earlier
 * create/amend back into a read.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{annualSubmission: object}|{status: number, body: object}}
 */
export function getUkPropertyAnnualForScenario(scenario) {
  if (!scenario) return notFound;

  const scenarioUpper = scenario.toUpperCase();
  if (getScenarios[scenarioUpper]) return { annualSubmission: getScenarios[scenarioUpper]() };
  if (getErrorScenarios[scenarioUpper]) return getErrorScenarios[scenarioUpper];

  return notFound;
}

/**
 * Get the create-and-amend-annual-submission response for a Gov-Test-Scenario header. The
 * default and STATEFUL scenarios accept the submission with a 200 and no body - HMRC's UK
 * property annual submission answers 200 where the self-employment one answers 204.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getUkPropertyAnnualAmendErrorForScenario(scenario) {
  if (!scenario) return null;

  const scenarioUpper = scenario.toUpperCase();
  return putErrorScenarios[scenarioUpper] || null;
}
