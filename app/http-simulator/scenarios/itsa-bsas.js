// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/itsa-bsas.js
// Gov-Test-Scenario handlers for the Business Source Adjustable Summary v7.0 trigger, retrieve
// and adjust endpoints

const triggerErrorScenarios = {
  NO_ACCOUNTING_PERIOD: {
    status: 400,
    body: { code: "RULE_NO_ACCOUNTING_PERIOD", message: "The supplied accounting period does not exist" },
  },
  OBLIGATIONS_NOT_MET: {
    status: 400,
    body: { code: "RULE_OBLIGATIONS_NOT_MET", message: "The obligations for the business have not been met" },
  },
  ACCOUNTING_PERIOD_NOT_ENDED: {
    status: 400,
    body: { code: "RULE_ACCOUNTING_PERIOD_NOT_ENDED", message: "The supplied accounting period has not ended" },
  },
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "You are outside the amendment window" },
  },
  NOT_FOUND: {
    status: 404,
    body: {
      code: "MATCHING_RESOURCE_NOT_FOUND",
      message: "A matching incomeSourceId record was not found, or the incomeSourceType provided does not relate to the incomeSourceId",
    },
  },
  TAX_YEAR_NOT_SUPPORTED: {
    status: 400,
    body: { code: "RULE_TAX_YEAR_NOT_SUPPORTED", message: "The tax year specified does not lie within the supported range" },
  },
  REQUEST_CANNOT_BE_FULFILLED: {
    status: 422,
    body: { code: "RULE_REQUEST_CANNOT_BE_FULFILLED", message: "Custom (will vary in production depending on the actual error)" },
  },
};

/**
 * Get the trigger-a-BSAS error response for a Gov-Test-Scenario header. STATEFUL falls through
 * to a successful trigger: this simulator has no per-user mutable state to track obligations.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getBsasTriggerErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL") return null;
  return triggerErrorScenarios[scenarioUpper] || null;
}

/**
 * Build the adjustable summary calculation the SELF_EMPLOYMENT_PROFIT scenario returns: all
 * fields populated, ending in a net profit.
 */
function profitSummary(nino, calculationId, taxYear) {
  return {
    metadata: {
      calculationId,
      requestedDateTime: "2024-04-10T09:30:00.000Z",
      nino,
      taxYear,
      summaryStatus: "valid",
    },
    inputs: {
      businessId: "XAIS12345678910",
      typeOfBusiness: "self-employment",
      accountingPeriodStartDate: "2023-04-06",
      accountingPeriodEndDate: "2024-04-05",
      source: "MTD-SA",
      submissionPeriods: [
        {
          periodId: "2023-04-06_2023-07-05",
          startDate: "2023-04-06",
          endDate: "2023-07-05",
          receivedDateTime: "2023-07-10T09:30:00.000Z",
        },
      ],
    },
    adjustableSummaryCalculation: {
      totalIncome: 10000,
      income: { turnover: 10000, other: 0 },
      totalExpenses: 4000,
      expenses: { costOfGoods: 2000, adminCosts: 2000 },
      totalAdditions: 0,
      additions: {},
      netProfit: 6000,
    },
  };
}

/** Build the LOSS scenario's summary: the same shape as profit, ending in a net loss. */
function lossSummary(nino, calculationId, taxYear) {
  const summary = profitSummary(nino, calculationId, taxYear);
  summary.adjustableSummaryCalculation = {
    totalIncome: 4000,
    income: { turnover: 4000, other: 0 },
    totalExpenses: 10000,
    expenses: { costOfGoods: 6000, adminCosts: 4000 },
    totalAdditions: 0,
    additions: {},
    netLoss: 6000,
  };
  return summary;
}

/** Build the CONSOLIDATED scenario's summary: consolidated expenses instead of itemised ones. */
function consolidatedSummary(nino, calculationId, taxYear) {
  const summary = profitSummary(nino, calculationId, taxYear);
  summary.adjustableSummaryCalculation = {
    totalIncome: 10000,
    income: { turnover: 10000, other: 0 },
    totalExpenses: 4000,
    expenses: { consolidatedExpenses: 4000 },
    totalAdditions: 0,
    additions: {},
    netProfit: 6000,
  };
  return summary;
}

/** Build the TRADING_ALLOWANCE scenario's summary: a trading income allowance applied. */
function tradingAllowanceSummary(nino, calculationId, taxYear) {
  const summary = profitSummary(nino, calculationId, taxYear);
  summary.adjustableSummaryCalculation = {
    totalIncome: 10000,
    income: { turnover: 10000, other: 0 },
    totalExpenses: 0,
    expenses: {},
    totalAdditions: 0,
    additions: {},
    netProfit: 9000,
    tradingIncomeAllowance: 1000,
  };
  return summary;
}

/** Build the UNADJUSTED scenario's summary: figures as first calculated, before any adjustment. */
function unadjustedSummary(nino, calculationId, taxYear) {
  const summary = profitSummary(nino, calculationId, taxYear);
  summary.metadata.summaryStatus = "valid";
  delete summary.metadata.adjustedDateTime;
  return summary;
}

/** Build the STATUS_INVALID scenario's summary: the periodic data has since changed. */
function statusInvalidSummary(nino, calculationId, taxYear) {
  const summary = profitSummary(nino, calculationId, taxYear);
  summary.metadata.summaryStatus = "invalid";
  return summary;
}

/** Build the STATUS_SUPERSEDED scenario's summary: a newer calculation exists. */
function statusSupersededSummary(nino, calculationId, taxYear) {
  const summary = profitSummary(nino, calculationId, taxYear);
  summary.metadata.summaryStatus = "superseded";
  return summary;
}

const retrieveScenarioBuilders = {
  SELF_EMPLOYMENT_PROFIT: profitSummary,
  SELF_EMPLOYMENT_LOSS: lossSummary,
  SELF_EMPLOYMENT_CONSOLIDATED: consolidatedSummary,
  TRADING_ALLOWANCE: tradingAllowanceSummary,
  SELF_EMPLOYMENT_UNADJUSTED: unadjustedSummary,
  SELF_EMPLOYMENT_STATUS_INVALID: statusInvalidSummary,
  SELF_EMPLOYMENT_STATUS_SUPERSEDED: statusSupersededSummary,
};

const NOT_FOUND_RESPONSE = {
  status: 404,
  body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
};

/**
 * Get the retrieve-a-self-employment-BSAS response for a Gov-Test-Scenario header. Retrieve does
 * not read back what a trigger just created - unlike trigger and list, it is not stateful in
 * HMRC's own sandbox, and its documented default (no header) is "no data found".
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} nino
 * @param {string} calculationId
 * @param {string} taxYear
 * @returns {{bsas: object}|{status: number, body: object}}
 */
export function getBsasSelfEmploymentForScenario(scenario, nino, calculationId, taxYear) {
  if (!scenario) return NOT_FOUND_RESPONSE;

  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL") return { bsas: profitSummary(nino, calculationId, taxYear) };

  // A DYNAMIC_ twin reflects the calculationId, nino and taxYear from the request back into the
  // response, the way HMRC's own DYNAMIC_ scenarios do, instead of the fixed example dates its
  // non-DYNAMIC counterpart uses.
  const isDynamic = scenarioUpper.startsWith("DYNAMIC_");
  const baseScenario = isDynamic ? scenarioUpper.slice("DYNAMIC_".length) : scenarioUpper;

  const builder = retrieveScenarioBuilders[baseScenario];
  if (builder) return { bsas: builder(nino, calculationId, taxYear) };

  return NOT_FOUND_RESPONSE;
}

/**
 * Build the UK property adjustable summary the UK_PROPERTY_PROFIT scenario returns. The income
 * and deductions field names are the adjustable summary's own labels - totalRentsReceived and
 * otherPropertyIncome, not the period summary's periodAmount and otherIncome - because the two
 * endpoints name the same money differently.
 */
function ukPropertyProfitSummary(nino, calculationId, taxYear) {
  return {
    metadata: {
      calculationId,
      requestedDateTime: "2024-04-10T09:30:00.000Z",
      nino,
      taxYear,
      summaryStatus: "valid",
    },
    inputs: {
      businessId: "XAIS12345678910",
      typeOfBusiness: "uk-property",
      accountingPeriodStartDate: "2023-04-06",
      accountingPeriodEndDate: "2024-04-05",
      source: "MTD-SA",
      submissionPeriods: [
        {
          submissionId: "2023-04-06_2023-07-05",
          startDate: "2023-04-06",
          endDate: "2023-07-05",
          receivedDateTime: "2023-07-10T09:30:00.000Z",
        },
      ],
    },
    adjustableSummaryCalculation: {
      totalIncome: 10000,
      income: { totalRentsReceived: 9000, premiumsOfLeaseGrant: 0, reversePremiums: 0, otherPropertyIncome: 1000 },
      totalDeductions: 4000,
      deductions: { propertyAllowance: 0, costOfReplacingDomesticItems: 1000, otherCapitalAllowance: 3000 },
      netProfit: 6000,
    },
  };
}

/** Build the UK_PROPERTY_LOSS scenario's summary: the same shape as profit, ending in a net loss. */
function ukPropertyLossSummary(nino, calculationId, taxYear) {
  const summary = ukPropertyProfitSummary(nino, calculationId, taxYear);
  summary.adjustableSummaryCalculation = {
    totalIncome: 4000,
    income: { totalRentsReceived: 4000, premiumsOfLeaseGrant: 0, reversePremiums: 0, otherPropertyIncome: 0 },
    totalDeductions: 10000,
    deductions: { propertyAllowance: 0, costOfReplacingDomesticItems: 4000, otherCapitalAllowance: 6000 },
    netLoss: 6000,
  };
  return summary;
}

/** Build the UK_PROPERTY_CONSOLIDATED scenario's summary: consolidated deductions. */
function ukPropertyConsolidatedSummary(nino, calculationId, taxYear) {
  const summary = ukPropertyProfitSummary(nino, calculationId, taxYear);
  summary.adjustableSummaryCalculation.deductions = { consolidatedExpenses: 4000 };
  return summary;
}

/** Build the UK_PROPERTY_ALLOWANCE scenario's summary: the property income allowance applied. */
function ukPropertyAllowanceSummary(nino, calculationId, taxYear) {
  const summary = ukPropertyProfitSummary(nino, calculationId, taxYear);
  summary.adjustableSummaryCalculation = {
    totalIncome: 10000,
    income: { totalRentsReceived: 10000, premiumsOfLeaseGrant: 0, reversePremiums: 0, otherPropertyIncome: 0 },
    totalDeductions: 0,
    deductions: { propertyAllowance: 1000 },
    netProfit: 9000,
  };
  return summary;
}

/** Build the UK_PROPERTY_ZERO_ADJUSTMENTS scenario's summary: unchanged from the first calculation. */
function ukPropertyZeroAdjustmentsSummary(nino, calculationId, taxYear) {
  const summary = ukPropertyProfitSummary(nino, calculationId, taxYear);
  summary.metadata.summaryStatus = "valid";
  return summary;
}

/** Build the UK_PROPERTY_STATUS_INVALID scenario's summary: the periodic data has since changed. */
function ukPropertyStatusInvalidSummary(nino, calculationId, taxYear) {
  const summary = ukPropertyProfitSummary(nino, calculationId, taxYear);
  summary.metadata.summaryStatus = "invalid";
  return summary;
}

/** Build the UK_PROPERTY_STATUS_SUPERSEDED scenario's summary: a newer calculation exists. */
function ukPropertyStatusSupersededSummary(nino, calculationId, taxYear) {
  const summary = ukPropertyProfitSummary(nino, calculationId, taxYear);
  summary.metadata.summaryStatus = "superseded";
  return summary;
}

const ukPropertyRetrieveScenarioBuilders = {
  UK_PROPERTY_PROFIT: ukPropertyProfitSummary,
  UK_PROPERTY_LOSS: ukPropertyLossSummary,
  UK_PROPERTY_CONSOLIDATED: ukPropertyConsolidatedSummary,
  UK_PROPERTY_ALLOWANCE: ukPropertyAllowanceSummary,
  UK_PROPERTY_ZERO_ADJUSTMENTS: ukPropertyZeroAdjustmentsSummary,
  UK_PROPERTY_STATUS_INVALID: ukPropertyStatusInvalidSummary,
  UK_PROPERTY_STATUS_SUPERSEDED: ukPropertyStatusSupersededSummary,
};

const ukPropertyRetrieveErrorScenarios = {
  NOT_UK_PROPERTY: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The calculation ID supplied relates to a different type of business" },
  },
  TAX_YEAR_NOT_SUPPORTED: {
    status: 400,
    body: { code: "RULE_TAX_YEAR_NOT_SUPPORTED", message: "The tax year specified does not lie within the supported range" },
  },
  REQUEST_CANNOT_BE_FULFILLED: {
    status: 422,
    body: { code: "RULE_REQUEST_CANNOT_BE_FULFILLED", message: "Custom (will vary in production depending on the actual error)" },
  },
};

/**
 * Get the retrieve-a-UK-property-BSAS response for a Gov-Test-Scenario header. No header answers
 * "no data found", exactly as the self-employment retrieve's default does.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} nino
 * @param {string} calculationId
 * @param {string} taxYear
 * @returns {{bsas: object}|{status: number, body: object}}
 */
export function getBsasUkPropertyForScenario(scenario, nino, calculationId, taxYear) {
  if (!scenario) return NOT_FOUND_RESPONSE;

  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL") return { bsas: ukPropertyProfitSummary(nino, calculationId, taxYear) };

  const isDynamic = scenarioUpper.startsWith("DYNAMIC_");
  const baseScenario = isDynamic ? scenarioUpper.slice("DYNAMIC_".length) : scenarioUpper;

  const builder = ukPropertyRetrieveScenarioBuilders[baseScenario];
  if (builder) return { bsas: builder(nino, calculationId, taxYear) };

  if (ukPropertyRetrieveErrorScenarios[scenarioUpper]) return ukPropertyRetrieveErrorScenarios[scenarioUpper];

  return NOT_FOUND_RESPONSE;
}

const ukPropertyAdjustExtraErrorScenarios = {
  UK_PROPERTY_OVER_CONSOLIDATED_EXPENSES_THRESHOLD: {
    status: 400,
    body: {
      code: "RULE_OVER_CONSOLIDATED_EXPENSES_THRESHOLD",
      message: "Cumulative turnover amount exceeds the consolidated expenses threshold",
    },
  },
  UK_PROPERTY_INCOME_ALLOWANCE_CLAIMED: {
    status: 400,
    body: {
      code: "RULE_PROPERTY_INCOME_ALLOWANCE_CLAIMED",
      message: "A property income allowance has already been claimed for this business",
    },
  },
};

/**
 * Get the submit-UK-property-adjustments error response for a Gov-Test-Scenario header. Adds
 * the two property-only scenarios to the self-employment adjust error set.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getBsasUkPropertyAdjustErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL") return null;
  return ukPropertyAdjustExtraErrorScenarios[scenarioUpper] || adjustErrorScenarios[scenarioUpper] || null;
}

const EXAMPLE_FOREIGN_PROPERTY_ID = "8e8b8450-dc1b-4360-8109-7067337b42cb";

/** Multiply every number in a figures object, nested objects included, by the number of countries. */
function scaleFigures(figures, factor) {
  return Object.fromEntries(
    Object.entries(figures).map(([key, value]) => [key, typeof value === "object" ? scaleFigures(value, factor) : value * factor]),
  );
}

/**
 * Build the foreign property adjustable summary the FOREIGN_PROPERTY_PROFIT scenario returns. The
 * country level carries every figure and, from 2026-27, a property level inside it, as HMRC's
 * examples do. The field names are the adjustable summary's own labels, the same as the UK ones.
 */
function foreignPropertyProfitSummary(nino, calculationId, taxYear, propertyId, submittedCountries = []) {
  const countryCodes = submittedCountries.length > 0 ? submittedCountries : ["FRA"];
  const startYear = Number(String(taxYear).slice(0, 4));
  const income = { totalRentsReceived: 9000, premiumsOfLeaseGrant: 0, otherPropertyIncome: 1000 };
  const expenses = { premisesRunningCosts: 500, repairsAndMaintenance: 500 };
  const deductions = { costOfReplacingDomesticItems: 1000, otherCapitalAllowance: 3000 };
  const figures = {
    totalIncome: 10000,
    income,
    totalExpenses: 1000,
    expenses,
    netProfit: 9000,
    totalDeductions: 4000,
    deductions,
    taxableProfit: 5000,
  };
  const countryLevelDetail = countryCodes.map((countryCode) => {
    const countryLevel = { countryCode, ...figures };
    if (startYear >= 2026) {
      countryLevel.propertyLevelDetail = [{ propertyId: propertyId || EXAMPLE_FOREIGN_PROPERTY_ID, ...figures }];
    }
    return countryLevel;
  });
  const totals = scaleFigures(figures, countryCodes.length);
  return {
    metadata: {
      calculationId,
      requestedDateTime: "2024-04-10T09:30:00.000Z",
      nino,
      taxYear,
      summaryStatus: "valid",
    },
    inputs: {
      businessId: "XAIS12345678910",
      businessName: "My foreign property business",
      accountingPeriodStartDate: `${startYear}-04-06`,
      accountingPeriodEndDate: `${startYear + 1}-04-05`,
      source: "MTD-SA",
      submissionPeriod: {
        submissionId: "617f3a7a-db8e-11e9-8a34-2a2ae2dbeed4",
        startDate: `${startYear}-04-06`,
        endDate: `${startYear + 1}-04-05`,
        receivedDateTime: "2024-02-15T09:35:04.843Z",
      },
    },
    adjustableSummaryCalculation: { ...totals, countryLevelDetail },
  };
}

/** Build the FOREIGN_PROPERTY_LOSS scenario's summary: the same shape as profit, ending in a net loss. */
function foreignPropertyLossSummary(...args) {
  const summary = foreignPropertyProfitSummary(...args);
  const calculation = summary.adjustableSummaryCalculation;
  delete calculation.netProfit;
  delete calculation.taxableProfit;
  calculation.netLoss = 6000;
  return summary;
}

/** Build the FOREIGN_PROPERTY_CONSOLIDATED scenario's summary: consolidated expenses. */
function foreignPropertyConsolidatedSummary(...args) {
  const summary = foreignPropertyProfitSummary(...args);
  summary.adjustableSummaryCalculation.expenses = { consolidatedExpenses: 1000 };
  return summary;
}

/** Build the FOREIGN_PROPERTY_ALLOWANCE scenario's summary: the property income allowance applied. */
function foreignPropertyAllowanceSummary(...args) {
  const summary = foreignPropertyProfitSummary(...args);
  summary.adjustableSummaryCalculation.deductions = { propertyAllowance: 1000 };
  summary.adjustableSummaryCalculation.totalDeductions = 1000;
  return summary;
}

function withSummaryStatus(summaryStatus) {
  return (...args) => {
    const summary = foreignPropertyProfitSummary(...args);
    summary.metadata.summaryStatus = summaryStatus;
    return summary;
  };
}

const foreignPropertyRetrieveScenarioBuilders = {
  FOREIGN_PROPERTY_PROFIT: foreignPropertyProfitSummary,
  FOREIGN_PROPERTY_LOSS: foreignPropertyLossSummary,
  FOREIGN_PROPERTY_CONSOLIDATED: foreignPropertyConsolidatedSummary,
  FOREIGN_PROPERTY_ALLOWANCE: foreignPropertyAllowanceSummary,
  FOREIGN_PROPERTY_ZERO_ADJUSTMENTS: withSummaryStatus("valid"),
  FOREIGN_PROPERTY_STATUS_INVALID: withSummaryStatus("invalid"),
  FOREIGN_PROPERTY_STATUS_SUPERSEDED: withSummaryStatus("superseded"),
};

const foreignPropertyRetrieveErrorScenarios = {
  NOT_FOREIGN_PROPERTY: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The calculation ID supplied relates to a different type of business" },
  },
  TAX_YEAR_NOT_SUPPORTED: ukPropertyRetrieveErrorScenarios.TAX_YEAR_NOT_SUPPORTED,
  REQUEST_CANNOT_BE_FULFILLED: ukPropertyRetrieveErrorScenarios.REQUEST_CANNOT_BE_FULFILLED,
};

/**
 * Get the retrieve-a-foreign-property-BSAS response for a Gov-Test-Scenario header. No header
 * answers "no data found", exactly as the UK property retrieve's default does.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} nino
 * @param {string} calculationId
 * @param {string} taxYear
 * @param {string|undefined} propertyId - a propertyId the simulator holds, used in the 2026-27 property level
 * @param {string[]} [submittedCountries] - country codes of the annual submission saved for the year; one country level entry each, the totals are their sum
 * @returns {{bsas: object}|{status: number, body: object}}
 */
export function getBsasForeignPropertyForScenario(scenario, nino, calculationId, taxYear, propertyId, submittedCountries = []) {
  if (!scenario) return NOT_FOUND_RESPONSE;

  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL")
    return { bsas: foreignPropertyProfitSummary(nino, calculationId, taxYear, propertyId, submittedCountries) };

  const isDynamic = scenarioUpper.startsWith("DYNAMIC_");
  const baseScenario = isDynamic ? scenarioUpper.slice("DYNAMIC_".length) : scenarioUpper;

  const builder = foreignPropertyRetrieveScenarioBuilders[baseScenario];
  if (builder) return { bsas: builder(nino, calculationId, taxYear, propertyId, submittedCountries) };

  if (foreignPropertyRetrieveErrorScenarios[scenarioUpper]) return foreignPropertyRetrieveErrorScenarios[scenarioUpper];

  return NOT_FOUND_RESPONSE;
}

const foreignPropertyAdjustExtraErrorScenarios = {
  FOREIGN_PROPERTY_OVER_CONSOLIDATED_EXPENSES_THRESHOLD: {
    status: 400,
    body: {
      code: "RULE_OVER_CONSOLIDATED_EXPENSES_THRESHOLD",
      message: "Cumulative turnover amount exceeds the consolidated expenses threshold",
    },
  },
  FOREIGN_PROPERTY_INCOME_ALLOWANCE_CLAIMED: {
    status: 400,
    body: {
      code: "RULE_PROPERTY_INCOME_ALLOWANCE_CLAIMED",
      message: "A property income allowance has already been claimed for this business",
    },
  },
  PROPERTY_ID_MISMATCH: {
    status: 400,
    body: { code: "RULE_PROPERTY_ID_MISMATCH", message: "The supplied property ID is not valid for this income source" },
  },
  TAX_YEAR_NOT_SUPPORTED: ukPropertyRetrieveErrorScenarios.TAX_YEAR_NOT_SUPPORTED,
  REQUEST_CANNOT_BE_FULFILLED: ukPropertyRetrieveErrorScenarios.REQUEST_CANNOT_BE_FULFILLED,
};

/**
 * Get the submit-foreign-property-adjustments error response for a Gov-Test-Scenario header.
 * Adds the foreign-property-only scenarios to the self-employment adjust error set.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getBsasForeignPropertyAdjustErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL") return null;
  return foreignPropertyAdjustExtraErrorScenarios[scenarioUpper] || adjustErrorScenarios[scenarioUpper] || null;
}

const adjustErrorScenarios = {
  TYPE_OF_BUSINESS_INCORRECT: {
    status: 400,
    body: { code: "RULE_TYPE_OF_BUSINESS_INCORRECT", message: "The calculation ID supplied relates to a different type of business" },
  },
  SUMMARY_STATUS_INVALID: {
    status: 400,
    body: { code: "RULE_SUMMARY_STATUS_INVALID", message: "Periodic data has changed. Request a new summary" },
  },
  SUMMARY_STATUS_SUPERSEDED: {
    status: 400,
    body: { code: "RULE_SUMMARY_STATUS_SUPERSEDED", message: "A newer summary calculation exists for this accounting period" },
  },
  ALREADY_ADJUSTED: {
    status: 400,
    body: { code: "RULE_ALREADY_ADJUSTED", message: "A summary may only be adjusted once. Request a new summary" },
  },
  RESULTING_VALUE_NOT_PERMITTED: {
    status: 400,
    body: {
      code: "RULE_RESULTING_VALUE_NOT_PERMITTED",
      message: "The adjustments provided would produce an unacceptable negative or positive value",
    },
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

/**
 * Get the submit-self-employment-adjustments error response for a Gov-Test-Scenario header.
 * STATEFUL falls through to a successful adjustment: this simulator has no per-user mutable
 * state to track whether a summary was already adjusted.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getBsasAdjustErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL") return null;
  return adjustErrorScenarios[scenarioUpper] || null;
}
