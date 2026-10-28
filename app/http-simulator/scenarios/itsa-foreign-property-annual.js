// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-foreign-property-annual.js
// Gov-Test-Scenario handlers for the Property Business v6.0 "retrieve/create and amend foreign
// property annual submission" endpoints. An entry is keyed by countryCode up to 2025-26 and by
// propertyId from 2026-27; the foreignFhlEea section ends with 2024-25.

const EXAMPLE_PROPERTY_ID = "8e8b8450-dc1b-4360-8109-7067337b42cb";

function startYear(taxYear) {
  return Number(String(taxYear).slice(0, 4));
}

function entryKey(taxYear, propertyId) {
  return startYear(taxYear) >= 2026 ? { propertyId: propertyId || EXAMPLE_PROPERTY_ID } : { countryCode: "LBN" };
}

/** The FOREIGN_PROPERTY scenario: adjustments and itemised allowances in one entry. */
function foreignProperty(taxYear, propertyId) {
  return {
    submittedOn: "2020-06-17T10:59:47.544Z",
    foreignProperty: [
      {
        ...entryKey(taxYear, propertyId),
        adjustments: { privateUseAdjustment: 4553.34, balancingCharge: 3453.34 },
        allowances: { annualInvestmentAllowance: 500, otherCapitalAllowance: 100 },
      },
    ],
  };
}

/** The FOREIGN_ALL_OTHER_ALLOWANCES scenario: the full itemised set, with a structures and buildings row. */
function foreignAllOtherAllowances(taxYear, propertyId) {
  const isEarly = startYear(taxYear) < 2025;
  return {
    submittedOn: "2020-06-17T10:59:47.544Z",
    foreignProperty: [
      {
        ...entryKey(taxYear, propertyId),
        adjustments: { privateUseAdjustment: 4553.34, balancingCharge: 3453.34 },
        allowances: {
          annualInvestmentAllowance: 38330.95,
          costOfReplacingDomesticItems: 41985.17,
          otherCapitalAllowance: 1049.21,
          zeroEmissionsCarAllowance: 3456.34,
          ...(isEarly ? { zeroEmissionsGoodsVehicleAllowance: 100, electricChargePointAllowance: 200 } : {}),
          structuredBuildingAllowance: [
            {
              amount: 3545.12,
              firstYear: { qualifyingDate: "2020-03-29", qualifyingAmountExpenditure: 3453.34 },
              building: { name: "Blue Oaks", number: "12", postcode: "TF3 4GH" },
            },
          ],
        },
      },
    ],
  };
}

/** The FOREIGN_PROPERTY_ALLOWANCE scenario: propertyIncomeAllowance alone. */
function foreignPropertyAllowance(taxYear, propertyId) {
  return {
    submittedOn: "2020-06-17T10:59:47.544Z",
    foreignProperty: [{ ...entryKey(taxYear, propertyId), allowances: { propertyIncomeAllowance: 100.25 } }],
  };
}

/** The FOREIGN_FHL_* scenarios: the FHL in the EEA section, which ends with 2024-25. */
function withFhl(build, fhl) {
  return (taxYear, propertyId) => ({ ...build(taxYear, propertyId), foreignFhlEea: fhl });
}

const fhlAllOtherAllowances = {
  adjustments: { balancingCharge: 53543.23, periodOfGraceAdjustment: true },
  allowances: {
    annualInvestmentAllowance: 100,
    otherCapitalAllowance: 100,
    electricChargePointAllowance: 100,
    zeroEmissionsCarAllowance: 100,
  },
};
const fhlPropertyAllowance = {
  adjustments: { balancingCharge: 53543.23, periodOfGraceAdjustment: true },
  allowances: { propertyIncomeAllowance: 100.25 },
};

const getScenarios = {
  FOREIGN_PROPERTY: foreignProperty,
  STATEFUL: foreignProperty,
  FOREIGN_ALL_OTHER_ALLOWANCES: foreignAllOtherAllowances,
  FOREIGN_PROPERTY_ALLOWANCE: foreignPropertyAllowance,
  FOREIGN_FHL_ALL_OTHER_ALLOWANCES: withFhl(foreignAllOtherAllowances, fhlAllOtherAllowances),
  FOREIGN_FHL_PROPERTY_ALLOWANCE: withFhl(foreignPropertyAllowance, fhlPropertyAllowance),
};

const fhlScenarios = new Set(["FOREIGN_FHL_ALL_OTHER_ALLOWANCES", "FOREIGN_FHL_PROPERTY_ALLOWANCE"]);

const notFound = {
  status: 404,
  body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
};

const typeOfBusinessIncorrect = {
  status: 400,
  body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a foreign property business" },
};

const getErrorScenarios = {
  NOT_FOUND: notFound,
  UK_PROPERTY: typeOfBusinessIncorrect,
};

const putErrorScenarios = {
  NOT_FOUND: notFound,
  TYPE_OF_BUSINESS_INCORRECT: typeOfBusinessIncorrect,
  UK_PROPERTY: typeOfBusinessIncorrect,
  PROPERTY_INCOME_ALLOWANCE: {
    status: 400,
    body: {
      code: "RULE_PROPERTY_INCOME_ALLOWANCE",
      message: "Property income allowance must not be present alongside a private use adjustment",
    },
  },
  PROPERTY_ID_MISMATCH: {
    status: 400,
    body: { code: "RULE_PROPERTY_ID_MISMATCH", message: "The supplied property ID is not valid for this income source" },
  },
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "You are outside the amendment window" },
  },
};

/**
 * Get the retrieve-an-annual-submission response for a Gov-Test-Scenario header. HMRC's retrieve
 * default is not-found, so a caller must send a scenario. STATEFUL answers the FOREIGN_PROPERTY
 * submission: this simulator holds no annual submissions to reflect back.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} taxYear - the tax year of the request, which picks the entry key and the sections
 * @param {string|undefined} heldPropertyId - a propertyId the simulator holds, used as the 2026-27 entry key
 * @returns {{annualSubmission: object}|{status: number, body: object}}
 */
export function getForeignPropertyAnnualForScenario(scenario, taxYear, heldPropertyId) {
  if (!scenario) return notFound;

  const scenarioUpper = scenario.toUpperCase();
  if (fhlScenarios.has(scenarioUpper) && startYear(taxYear) >= 2025) return notFound;
  if (getScenarios[scenarioUpper]) return { annualSubmission: getScenarios[scenarioUpper](taxYear, heldPropertyId) };
  return getErrorScenarios[scenarioUpper] || notFound;
}

/**
 * Get the create-and-amend error response for a Gov-Test-Scenario header, or null when the
 * scenario (including the default and STATEFUL) should accept the submission with a 200.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getForeignPropertyAnnualAmendErrorForScenario(scenario) {
  if (!scenario) return null;
  return putErrorScenarios[scenario.toUpperCase()] || null;
}
