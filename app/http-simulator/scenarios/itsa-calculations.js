// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/itsa-calculations.js
// Gov-Test-Scenario handlers for the Individual Calculations v8.0 trigger, retrieve and final
// declaration endpoints

const triggerErrorScenarios = {
  NO_INCOME_SUBMISSIONS_EXIST: {
    status: 400,
    body: { code: "RULE_NO_INCOME_SUBMISSIONS_EXIST", message: "No income submissions exist for the tax year" },
  },
  FINAL_DECLARATION_RECEIVED: {
    status: 400,
    body: { code: "RULE_FINAL_DECLARATION_RECEIVED", message: "Final declaration has already been received" },
  },
  INCOME_SOURCES_CHANGED: {
    status: 400,
    body: { code: "RULE_INCOME_SOURCES_CHANGED", message: "Income sources data has changed. Trigger a new calculation" },
  },
  RECENT_SUBMISSIONS_EXIST: {
    status: 400,
    body: { code: "RULE_RECENT_SUBMISSIONS_EXIST", message: "More recent submissions exist. Trigger a new calculation" },
  },
  RESIDENCY_CHANGED: {
    status: 400,
    body: { code: "RULE_RESIDENCY_CHANGED", message: "Residency has changed. Trigger a new calculation" },
  },
  CALCULATION_IN_PROGRESS: {
    status: 400,
    body: { code: "RULE_CALCULATION_IN_PROGRESS", message: "A calculation is in progress. Please wait before triggering a new calculation" },
  },
  BUSINESS_VALIDATION_FAILURE: {
    status: 400,
    body: { code: "RULE_BUSINESS_VALIDATION_FAILURE", message: "Business validation rule failures" },
  },
  TAX_YEAR_NOT_ENDED: {
    status: 400,
    body: { code: "RULE_TAX_YEAR_NOT_ENDED", message: "The specified tax year has not yet ended" },
  },
};

/**
 * Get the trigger-a-calculation error response for a Gov-Test-Scenario header. STATEFUL falls
 * through to a successful trigger: this simulator has no per-user mutable state to track prior
 * submissions.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getCalculationTriggerErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL") return null;
  return triggerErrorScenarios[scenarioUpper] || null;
}

function emptyMessages() {
  return { info: [], warnings: [], errors: [] };
}

/**
 * Build the UK_SE_SAVINGS_EXAMPLE calculation: self-employment income with savings.
 * calculationType echoes whatever the trigger call asked for (in-year, intent-to-finalise or
 * intent-to-amend) - HMRC's real retrieve response carries the type the calculation was
 * triggered with, and a customer confirming a final declaration needs to see that reflected.
 */
function ukSeSavingsExample(nino, taxYear, calculationId, calculationType = "in-year") {
  return {
    metadata: {
      calculationId,
      taxYear,
      requestedBy: "customer",
      calculationReason: "customer-request",
      calculationTimestamp: "2024-06-15T09:30:00.000Z",
      calculationType,
      intentToSubmitFinalDeclaration: calculationType === "intent-to-finalise",
      finalDeclaration: false,
      periodFrom: "2023-04-06",
      periodTo: "2024-04-05",
    },
    inputs: {
      personalInformation: { identifier: nino, taxRegime: "uk" },
      incomeSources: [{ incomeSourceType: "self-employment", incomeSourceId: "XAIS12345678910" }],
    },
    calculation: {
      allowancesAndDeductions: { personalAllowance: 12570 },
      taxCalculation: { incomeTax: { totalIncomeTax: 1400 }, nics: { totalNic: 500 }, totalTaxDeducted: 0, totalIncomeTaxAndNicsDue: 1900 },
      endOfYearEstimate: { totalTaxableIncome: 15000 },
    },
    messages: emptyMessages(),
  };
}

/** Build the UK_SE_GIFTAID_EXAMPLE calculation: self-employment income with Gift Aid relief. */
function ukSeGiftaidExample(nino, taxYear, calculationId, calculationType = "in-year") {
  const example = ukSeSavingsExample(nino, taxYear, calculationId, calculationType);
  example.calculation.allowancesAndDeductions = { personalAllowance: 12570, giftAidRelief: 400 };
  example.calculation.taxCalculation = {
    incomeTax: { totalIncomeTax: 1200 },
    nics: { totalNic: 500 },
    totalTaxDeducted: 0,
    totalIncomeTaxAndNicsDue: 1700,
  };
  return example;
}

/** Build the SCOT_SE_DIVIDENDS_EXAMPLE calculation: Scottish self-employment with dividends. */
function scotSeDividendsExample(nino, taxYear, calculationId, calculationType = "in-year") {
  const example = ukSeSavingsExample(nino, taxYear, calculationId, calculationType);
  example.inputs.personalInformation.taxRegime = "scotland";
  example.calculation.allowancesAndDeductions = { personalAllowance: 12570, dividendAllowance: 500 };
  example.calculation.taxCalculation = {
    incomeTax: { totalIncomeTax: 1600 },
    nics: { totalNic: 500 },
    totalTaxDeducted: 0,
    totalIncomeTaxAndNicsDue: 2100,
  };
  return example;
}

/** Build the ERROR_MESSAGES_EXIST body: errors exist and no calculation has been generated. */
function errorMessagesExist(nino, taxYear, calculationId, calculationType = "in-year") {
  return {
    metadata: {
      calculationId,
      taxYear,
      requestedBy: "customer",
      calculationReason: "customer-request",
      calculationTimestamp: "2024-06-15T09:30:00.000Z",
      calculationType,
      intentToSubmitFinalDeclaration: calculationType === "intent-to-finalise",
      finalDeclaration: false,
      periodFrom: "2023-04-06",
      periodTo: "2024-04-05",
    },
    messages: {
      info: [],
      warnings: [],
      errors: [{ id: "C15507", text: "Trading income allowance cannot be greater than turnover" }],
    },
  };
}

/** Build a DYNAMIC calculation: the date fields reflect the requested taxYear. */
function dynamicExample(nino, taxYear, calculationId, calculationType = "in-year") {
  const example = ukSeSavingsExample(nino, taxYear, calculationId, calculationType);
  const [startYear] = taxYear.split("-");
  example.metadata.periodFrom = `${startYear}-04-06`;
  example.metadata.periodTo = `${Number(startYear) + 1}-04-05`;
  example.metadata.calculationTimestamp = `${startYear}-06-15T09:30:00.000Z`;
  return example;
}

const retrieveScenarioBuilders = {
  UK_SE_SAVINGS_EXAMPLE: ukSeSavingsExample,
  UK_SE_GIFTAID_EXAMPLE: ukSeGiftaidExample,
  SCOT_SE_DIVIDENDS_EXAMPLE: scotSeDividendsExample,
  ERROR_MESSAGES_EXIST: errorMessagesExist,
  DYNAMIC: dynamicExample,
};

const NOT_FOUND_RESPONSE = {
  status: 404,
  body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
};

/**
 * Get the retrieve-a-calculation response for a Gov-Test-Scenario header. HMRC's own sandbox
 * answers with a success example when no scenario header is sent, matching every other ITSA
 * retrieve endpoint's simulator default. calculationType is the type the matching trigger call
 * was made with, if the caller has it - it lands in the response's metadata.calculationType the
 * way HMRC's own retrieve response does.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string} nino
 * @param {string} taxYear
 * @param {string} calculationId
 * @param {string} [calculationType] - in-year, intent-to-finalise or intent-to-amend
 * @returns {{calculation: object}|{status: number, body: object}}
 */
export function getCalculationForScenario(scenario, nino, taxYear, calculationId, calculationType = "in-year") {
  if (!scenario) return { calculation: ukSeSavingsExample(nino, taxYear, calculationId, calculationType) };

  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "NOT_FOUND") return NOT_FOUND_RESPONSE;
  if (scenarioUpper === "STATEFUL") return { calculation: ukSeSavingsExample(nino, taxYear, calculationId, calculationType) };

  const builder = retrieveScenarioBuilders[scenarioUpper];
  if (builder) return { calculation: builder(nino, taxYear, calculationId, calculationType) };

  return NOT_FOUND_RESPONSE;
}

const finalDeclarationErrorScenarios = {
  OUTSIDE_AMENDMENT_WINDOW: {
    status: 400,
    body: { code: "RULE_OUTSIDE_AMENDMENT_WINDOW", message: "You are outside the amendment window" },
  },
  FINAL_DECLARATION_IN_PROGRESS: {
    status: 400,
    body: { code: "RULE_FINAL_DECLARATION_IN_PROGRESS", message: "There is a calculation in progress for the tax year" },
  },
  FINAL_DECLARATION_RECEIVED: {
    status: 400,
    body: { code: "RULE_FINAL_DECLARATION_RECEIVED", message: "Final declaration has already been received" },
  },
  FINAL_DECLARATION_TAX_YEAR: {
    status: 400,
    body: {
      code: "RULE_FINAL_DECLARATION_TAX_YEAR",
      message: "The final declaration cannot be submitted until after the end of the tax year",
    },
  },
  INCOME_SOURCES_CHANGED: {
    status: 400,
    body: { code: "RULE_INCOME_SOURCES_CHANGED", message: "Income sources data has changed. Trigger a new calculation" },
  },
  INCOME_SOURCES_INVALID: {
    status: 400,
    body: { code: "RULE_INCOME_SOURCES_INVALID", message: "No valid income sources could be found" },
  },
  NO_INCOME_SUBMISSIONS_EXIST: {
    status: 400,
    body: { code: "RULE_NO_INCOME_SUBMISSIONS_EXIST", message: "No income submissions exist for the tax year" },
  },
  RECENT_SUBMISSIONS_EXIST: {
    status: 400,
    body: { code: "RULE_RECENT_SUBMISSIONS_EXIST", message: "More recent submissions exist. Trigger a new calculation" },
  },
  RESIDENCY_CHANGED: {
    status: 400,
    body: { code: "RULE_RESIDENCY_CHANGED", message: "Residency has changed. Trigger a new calculation" },
  },
  SUBMISSION_FAILED: {
    status: 400,
    body: { code: "RULE_SUBMISSION_FAILED", message: "The submission cannot be completed due to validation failures" },
  },
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" },
  },
};

/**
 * Get the submit-final-declaration error response for a Gov-Test-Scenario header. STATEFUL
 * falls through to a successful declaration: this simulator has no per-user mutable state to
 * track a prior declaration.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getFinalDeclarationErrorForScenario(scenario) {
  if (!scenario) return null;
  const scenarioUpper = scenario.toUpperCase();
  if (scenarioUpper === "STATEFUL") return null;
  return finalDeclarationErrorScenarios[scenarioUpper] || null;
}
