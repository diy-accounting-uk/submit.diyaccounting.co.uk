// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-foreign-property-period-detail.js
// Gov-Test-Scenario handlers for the Property Business v6.0 "retrieve/amend a foreign property
// period summary" endpoint (the dated model, tax years 2024-25 and before)

const FHL_EXPENSES = {
  premisesRunningCosts: 100.25,
  repairsAndMaintenance: 100.25,
  financialCosts: 100.25,
  professionalFees: 100.25,
  costOfServices: 100.25,
  travelCosts: 100.25,
  other: 100.25,
};

const NON_FHL_EXPENSES = { ...FHL_EXPENSES, residentialFinancialCost: 100.25, broughtFwdResidentialFinancialCost: 100.25 };

const NON_FHL_INCOME = {
  rentIncome: { rentAmount: 200.22 },
  foreignTaxCreditRelief: true,
  premiumsOfLeaseGrant: 100.25,
  otherPropertyIncome: 100.25,
  foreignTaxPaidOrDeducted: 44.21,
  specialWithholdingTaxOrUkTaxPaid: 23.78,
};

function periodSummary(sections) {
  return { submittedOn: "2021-06-17T10:59:47.544Z", fromDate: "2020-01-01", toDate: "2020-01-31", ...sections };
}

const fhl = (expenses) => ({ foreignFhlEea: { income: { rentAmount: 200.22 }, expenses } });
const nonFhl = (expenses) => ({ foreignNonFhlProperty: [{ countryCode: "FRA", income: NON_FHL_INCOME, expenses }] });

const notFound = {
  status: 404,
  body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
};

const typeOfBusinessIncorrect = {
  status: 400,
  body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The businessId is not a foreign property business" },
};

const retrieveScenarios = {
  FOREIGN_PROPERTY: () => periodSummary({ ...fhl(FHL_EXPENSES), ...nonFhl(NON_FHL_EXPENSES) }),
  STATEFUL: () => periodSummary({ ...fhl(FHL_EXPENSES), ...nonFhl(NON_FHL_EXPENSES) }),
  FOREIGN_FHL_FULL_EXPENSES: () => periodSummary(fhl(FHL_EXPENSES)),
  FOREIGN_FHL_CONSOLIDATED: () => periodSummary(fhl({ consolidatedExpenses: 800 })),
  FOREIGN_NON_FHL_FULL_EXPENSES: () => periodSummary(nonFhl(NON_FHL_EXPENSES)),
  FOREIGN_NON_FHL_CONSOLIDATED: () => periodSummary(nonFhl({ consolidatedExpenses: 800 })),
};

const retrieveErrorScenarios = {
  UK_PROPERTY: typeOfBusinessIncorrect,
  TYPE_OF_BUSINESS_INCORRECT: typeOfBusinessIncorrect,
  NOT_FOUND: notFound,
  SUBMIT_API_HTTP_500: { status: 500, body: { code: "SERVER_ERROR", message: "Internal server error" } },
  SUBMIT_HMRC_API_HTTP_500: { status: 500, body: { code: "SERVER_ERROR", message: "Internal server error" } },
};

const amendErrorScenarios = {
  NOT_FOUND: notFound,
  TYPE_OF_BUSINESS_INCORRECT: typeOfBusinessIncorrect,
  UK_PROPERTY: typeOfBusinessIncorrect,
};

/**
 * Get the retrieve-a-period-summary response for a Gov-Test-Scenario header. HMRC's retrieve
 * default is not-found, so every call must send a scenario. STATEFUL answers the same summary
 * FOREIGN_PROPERTY does: this simulator holds no period summaries to reflect back.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {{periodSummary: object}|{status: number, body: object}}
 */
export function getForeignPropertyPeriodDetailForScenario(scenario) {
  if (!scenario) return notFound;
  const scenarioUpper = scenario.toUpperCase();
  if (retrieveScenarios[scenarioUpper]) return { periodSummary: retrieveScenarios[scenarioUpper]() };
  return retrieveErrorScenarios[scenarioUpper] || notFound;
}

/**
 * Get the amend-a-period-summary error response for a Gov-Test-Scenario header, or null when the
 * scenario (including the default and STATEFUL) should accept the amendment.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getForeignPropertyPeriodAmendErrorForScenario(scenario) {
  if (!scenario) return null;
  return amendErrorScenarios[scenario.toUpperCase()] || null;
}
