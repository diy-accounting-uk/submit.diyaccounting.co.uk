// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/itsa-crystallisation-obligations.js
// Gov-Test-Scenario handlers for the ITSA final declaration (crystallisation) obligations endpoint

/**
 * The current UK tax year in HMRC's "YYYY-YY" form, computed from today's date rather than
 * hardcoded - a tax year runs 6 April to 5 April.
 */
function currentTaxYear() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const isBeforeApril6 = now.getUTCMonth() < 3 || (now.getUTCMonth() === 3 && now.getUTCDate() < 6);
  const startYear = isBeforeApril6 ? year - 1 : year;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Derive the final declaration obligation window from a "YYYY-YY" tax year: the period runs
 * the whole tax year and the return is due the following 31 January, HMRC's Self Assessment
 * filing deadline. Nothing here is a fixed date - it always tracks the requested tax year.
 */
function obligationForTaxYear(taxYear, status = "open") {
  const startYear = parseInt(String(taxYear).slice(0, 4), 10);
  const detail = {
    periodStartDate: `${startYear}-04-06`,
    periodEndDate: `${startYear + 1}-04-05`,
    dueDate: `${startYear + 2}-01-31`,
    status,
  };
  if (status === "fulfilled") {
    detail.receivedDate = `${startYear + 1}-12-15`;
  }
  return detail;
}

/**
 * Error scenarios
 */
const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: {
      code: "MATCHING_RESOURCE_NOT_FOUND",
      message: "Matching resource not found",
    },
  },
  INSOLVENT_TRADER: {
    status: 400,
    body: {
      code: "RULE_INSOLVENT_TRADER",
      message: "The remote endpoint has indicated that the Trader is insolvent",
    },
  },
  SUBMIT_API_HTTP_500: {
    status: 500,
    body: {
      code: "SERVER_ERROR",
      message: "Internal server error",
    },
  },
  SUBMIT_HMRC_API_HTTP_500: {
    status: 500,
    body: {
      code: "SERVER_ERROR",
      message: "Internal server error",
    },
  },
};

/**
 * Get the crystallisation obligations response for a Gov-Test-Scenario header.
 * The default and DYNAMIC scenarios both derive their dates from the requested tax year rather
 * than answering a fixed obligation - HMRC obligations are unpredictable and this simulator
 * must not encourage hardcoding one.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @param {string|undefined} taxYear - the requested taxYear query parameter
 * @returns {Object} - {obligations: [...]} or {status, body} for errors
 */
export function getItsaCrystallisationObligationsForScenario(scenario, taxYear) {
  const effectiveTaxYear = taxYear || currentTaxYear();

  if (!scenario) {
    return { obligations: [obligationForTaxYear(effectiveTaxYear, "open")] };
  }

  const scenarioUpper = scenario.toUpperCase();

  if (errorScenarios[scenarioUpper]) {
    return errorScenarios[scenarioUpper];
  }

  if (scenarioUpper === "MULTIPLE") {
    return {
      obligations: [obligationForTaxYear(effectiveTaxYear, "fulfilled"), obligationForTaxYear(String(parseInt(effectiveTaxYear.slice(0, 4), 10) + 1), "open")],
    };
  }

  if (scenarioUpper === "DYNAMIC") {
    return { obligations: [obligationForTaxYear(effectiveTaxYear, "open")] };
  }

  return { obligations: [obligationForTaxYear(effectiveTaxYear, "open")] };
}
