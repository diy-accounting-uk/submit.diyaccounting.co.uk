// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-foreign-property-cumulative.js
// Gov-Test-Scenario handlers for the Property Business v6.0 foreign property cumulative period
// summary endpoint (2025-26 onwards) - one resource per tax year, GET to retrieve the running
// total, PUT to create or amend it in one call. An entry is keyed by countryCode in 2025-26 and
// by propertyId from 2026-27.

const EXAMPLE_PROPERTY_ID = "8e8b8450-dc1b-4360-8109-7067337b42cb";

const serverError = { status: 500, body: { code: "SERVER_ERROR", message: "Internal server error" } };

const putErrorScenarios = {
  TAX_YEAR_NOT_SUPPORTED: {
    status: 400,
    body: { code: "RULE_TAX_YEAR_NOT_SUPPORTED", message: "The tax year specified does not lie within the supported range" },
  },
  PROPERTY_ID_MISMATCH: {
    status: 400,
    body: { code: "RULE_PROPERTY_ID_MISMATCH", message: "The supplied property ID is not valid for this income source" },
  },
  UK_PROPERTY: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a foreign property business" },
  },
  START_DATE_NOT_ALIGNED_TO_COMMENCEMENT_DATE: {
    status: 400,
    body: {
      code: "RULE_START_DATE_NOT_ALIGNED_TO_COMMENCEMENT_DATE",
      message: "The submission start date is not aligned to the commencement date",
    },
  },
  START_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE: {
    status: 400,
    body: {
      code: "RULE_START_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE",
      message: "The submission start date does not match the reporting type",
    },
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
  ADVANCE_SUBMISSION_REQUIRES_PERIOD_END_DATE: {
    status: 400,
    body: {
      code: "RULE_ADVANCE_SUBMISSION_REQUIRES_PERIOD_END_DATE",
      message: "An advance submission must have the end date of the period",
    },
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
  SUBMIT_API_HTTP_500: serverError,
  SUBMIT_HMRC_API_HTTP_500: serverError,
};

const ENTRY_INCOME = {
  rentIncome: { rentAmount: 440.31 },
  foreignTaxCreditRelief: false,
  premiumsOfLeaseGrant: 950.48,
  otherPropertyIncome: 802.49,
  foreignTaxPaidOrDeducted: 734.18,
  specialWithholdingTaxOrUkTaxPaid: 85.47,
};

const FULL_EXPENSES = {
  premisesRunningCosts: -4929.5,
  repairsAndMaintenance: -54.3,
  financialCosts: 2090.35,
  professionalFees: -90.2,
  travelCosts: 560.99,
  costOfServices: -100.83,
  residentialFinancialCost: 857.78,
  broughtFwdResidentialFinancialCost: 600.1,
  other: 334.64,
};

function periodSummary(taxYear, propertyId, expenses) {
  const startYear = Number(String(taxYear).slice(0, 4));
  const key = startYear >= 2026 ? { propertyId: propertyId || EXAMPLE_PROPERTY_ID } : { countryCode: "AFG" };
  return {
    submittedOn: `${startYear}-07-07T10:59:47.544Z`,
    fromDate: `${startYear}-04-06`,
    toDate: `${startYear}-07-05`,
    foreignProperty: [{ ...key, income: ENTRY_INCOME, expenses }],
  };
}

const getScenarios = {
  FOREIGN_PROPERTY_FULL_EXPENSES: (taxYear, propertyId) => periodSummary(taxYear, propertyId, FULL_EXPENSES),
  FOREIGN_PROPERTY_CONSOLIDATED: (taxYear, propertyId) => periodSummary(taxYear, propertyId, { consolidatedExpenses: 800 }),
};

const getErrorScenarios = {
  NOT_FOUND: putErrorScenarios.NOT_FOUND,
  TAX_YEAR_NOT_SUPPORTED: putErrorScenarios.TAX_YEAR_NOT_SUPPORTED,
  UK_PROPERTY: putErrorScenarios.UK_PROPERTY,
  SUBMIT_API_HTTP_500: serverError,
  SUBMIT_HMRC_API_HTTP_500: serverError,
};

/**
 * Get the create-or-amend error response for a Gov-Test-Scenario header, or null when the
 * scenario (including the default and STATEFUL) should accept the submission. HMRC's cumulative
 * PUT returns 204 either way, since this simulator holds no running totals to reflect back.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getForeignPropertyCumulativePutErrorForScenario(scenario) {
  if (!scenario) return null;
  return putErrorScenarios[scenario.toUpperCase()] || null;
}

/**
 * Get the retrieve response for a Gov-Test-Scenario header. The default and STATEFUL answer the
 * full-expenses summary, as HMRC's sandbox does.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} taxYear - the tax year of the request, which picks the entry key
 * @param {string|undefined} heldPropertyId - a propertyId the simulator holds, used as the 2026-27 entry key
 * @returns {{periodSummary: object}|{status: number, body: object}}
 */
export function getForeignPropertyCumulativeGetForScenario(scenario, taxYear, heldPropertyId) {
  const scenarioUpper = scenario ? scenario.toUpperCase() : "FOREIGN_PROPERTY_FULL_EXPENSES";
  if (scenarioUpper === "STATEFUL") return { periodSummary: getScenarios.FOREIGN_PROPERTY_FULL_EXPENSES(taxYear, heldPropertyId) };
  if (getScenarios[scenarioUpper]) return { periodSummary: getScenarios[scenarioUpper](taxYear, heldPropertyId) };
  return getErrorScenarios[scenarioUpper] || putErrorScenarios.NOT_FOUND;
}
