// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "A matching incomeSourceId record was not found, or the incomeSourceType provided does not relate to the incomeSourceId" },
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
 * Get the retrieve-a-self-employment-BSAS response for a Gov-Test-Scenario header. HMRC's own
 * sandbox answers not-found when no scenario header is sent at all - the default here matches
 * that exactly, unlike every other ITSA retrieve endpoint's simulator, which defaults to a
 * success body.
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
