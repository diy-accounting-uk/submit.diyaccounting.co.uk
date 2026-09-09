// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/obligations.js
// Gov-Test-Scenario handlers for VAT obligations endpoint

/**
 * Generate a random period key in HMRC format.
 * HMRC states that period keys cannot be calculated, only validated.
 * Format: 2-digit year + letter (A-Z) + alphanumeric (0-9, A-Z)
 * Examples: 18A1, 24B3, 17AC, 25Z9
 * @returns {string} Random period key
 */
function generateRandomPeriodKey() {
  // Math.random is intentional for test data generation - not used for security
  const year = String(17 + Math.floor(Math.random() * 10)).padStart(2, "0"); // 17-26
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  const suffix =
    Math.random() < 0.5
      ? String(Math.floor(Math.random() * 10)) // 0-9
      : String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  return `${year}${letter}${suffix}`;
}

/**
 * Validate period key format per HMRC MTD VAT API specification.
 * @see https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html
 *
 * Accepted formats:
 * - Alphanumeric (YYXZ): 2-digit year + letter + alphanumeric (e.g., 18A1, 18AD, 17NB)
 * - Numeric (NNNN): 4 digits (e.g., 0418, 1218)
 * - Special numeric: 0000 (no period) or 9999 (ceased trading)
 * - Hash format (#NNN): # followed by 3 digits (e.g., #001, #012)
 *
 * @param {string} periodKey - Period key to validate
 * @returns {boolean} True if valid format
 */
export function isValidPeriodKeyFormat(periodKey) {
  const normalized = String(periodKey).toUpperCase();
  // Alphanumeric format: 2-digit year + letter + alphanumeric (e.g., 18A1, 18AD, 17NB)
  // Numeric format: 4 digits (e.g., 0418, 1218, 0000, 9999)
  // Hash format: # followed by 3 digits (e.g., #001, #012)
  return /^(\d{2}[A-Z][A-Z0-9]|\d{4}|#\d{3})$/.test(normalized);
}

/**
 * Default obligations array - returns a realistic mix of fulfilled and open obligations.
 *
 * IMPORTANT: Tests must be FLEXIBLE and query for what they need:
 * - Submission: Query for status="O" (open), use first available
 * - Viewing: Query for status="F" (fulfilled), use first available
 *
 * Do NOT hardcode specific dates or period keys in tests.
 * See OBLIGATION_FLEXIBILITY_FIX.md for guidance.
 *
 * Period keys are randomized to simulate HMRC's unpredictable behavior.
 */
function generateDefaultObligations() {
  return [
    {
      periodKey: generateRandomPeriodKey(),
      start: "2017-01-01",
      end: "2017-03-31",
      due: "2017-05-07",
      status: "F",
      received: "2017-05-06",
    },
    {
      periodKey: generateRandomPeriodKey(),
      start: "2017-04-01",
      end: "2017-06-30",
      due: "2017-08-07",
      status: "O",
    },
  ];
}

/**
 * Scenario-specific obligation sets
 */
const scenarioObligations = {
  // Quarterly obligations with none fulfilled
  QUARTERLY_NONE_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "O" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "O" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "O" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "O" },
  ],

  // Quarterly obligations with one fulfilled
  QUARTERLY_ONE_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "O" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "O" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "O" },
  ],

  // Quarterly obligations with two fulfilled
  QUARTERLY_TWO_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "F", received: "2017-08-05" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "O" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "O" },
  ],

  // Quarterly obligations with three fulfilled
  QUARTERLY_THREE_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "F", received: "2017-08-05" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "F", received: "2017-11-05" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "O" },
  ],

  // Quarterly obligations with all fulfilled
  QUARTERLY_FOUR_MET: [
    { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" },
    { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "F", received: "2017-08-05" },
    { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "F", received: "2017-11-05" },
    { periodKey: "18A4", start: "2017-10-01", end: "2017-12-31", due: "2018-02-07", status: "F", received: "2018-02-05" },
  ],

  // Monthly obligations
  MONTHLY_ONE_MET: [
    { periodKey: "18AA", start: "2017-01-01", end: "2017-01-31", due: "2017-03-07", status: "F", received: "2017-03-05" },
    { periodKey: "18AB", start: "2017-02-01", end: "2017-02-28", due: "2017-04-07", status: "O" },
    { periodKey: "18AC", start: "2017-03-01", end: "2017-03-31", due: "2017-05-07", status: "O" },
  ],

  MONTHLY_TWO_MET: [
    { periodKey: "18AA", start: "2017-01-01", end: "2017-01-31", due: "2017-03-07", status: "F", received: "2017-03-05" },
    { periodKey: "18AB", start: "2017-02-01", end: "2017-02-28", due: "2017-04-07", status: "F", received: "2017-04-05" },
    { periodKey: "18AC", start: "2017-03-01", end: "2017-03-31", due: "2017-05-07", status: "O" },
  ],

  MONTHLY_THREE_MET: [
    { periodKey: "18AA", start: "2017-01-01", end: "2017-01-31", due: "2017-03-07", status: "F", received: "2017-03-05" },
    { periodKey: "18AB", start: "2017-02-01", end: "2017-02-28", due: "2017-04-07", status: "F", received: "2017-04-05" },
    { periodKey: "18AC", start: "2017-03-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-05" },
  ],

  // Monthly obligations with none fulfilled
  MONTHLY_NONE_MET: [
    { periodKey: "18AA", start: "2017-01-01", end: "2017-01-31", due: "2017-03-07", status: "O" },
    { periodKey: "18AB", start: "2017-02-01", end: "2017-02-28", due: "2017-04-07", status: "O" },
    { periodKey: "18AC", start: "2017-03-01", end: "2017-03-31", due: "2017-05-07", status: "O" },
  ],

  // 2018 monthly obligations, month 01 is open
  MONTHLY_OBS_01_OPEN: [
    { periodKey: "18AA", start: "2018-01-01", end: "2018-01-31", due: "2018-03-07", status: "O" },
    { periodKey: "18AB", start: "2018-02-01", end: "2018-02-28", due: "2018-04-07", status: "O" },
  ],

  // 2018 monthly obligations, month 06 is open; previous months fulfilled
  MONTHLY_OBS_06_OPEN: [
    { periodKey: "18AA", start: "2018-01-01", end: "2018-01-31", due: "2018-03-07", status: "F", received: "2018-03-01" },
    { periodKey: "18AB", start: "2018-02-01", end: "2018-02-28", due: "2018-04-07", status: "F", received: "2018-04-01" },
    { periodKey: "18AC", start: "2018-03-01", end: "2018-03-31", due: "2018-05-07", status: "F", received: "2018-05-01" },
    { periodKey: "18AD", start: "2018-04-01", end: "2018-04-30", due: "2018-06-07", status: "F", received: "2018-06-01" },
    { periodKey: "18AE", start: "2018-05-01", end: "2018-05-31", due: "2018-07-07", status: "F", received: "2018-07-01" },
    { periodKey: "18AF", start: "2018-06-01", end: "2018-06-30", due: "2018-08-07", status: "O" },
  ],

  // 2018 monthly obligations; all fulfilled
  MONTHLY_OBS_12_FULFILLED: [
    { periodKey: "18AA", start: "2018-01-01", end: "2018-01-31", due: "2018-03-07", status: "F", received: "2018-03-01" },
    { periodKey: "18AB", start: "2018-02-01", end: "2018-02-28", due: "2018-04-07", status: "F", received: "2018-04-01" },
    { periodKey: "18AC", start: "2018-03-01", end: "2018-03-31", due: "2018-05-07", status: "F", received: "2018-05-01" },
    { periodKey: "18AD", start: "2018-04-01", end: "2018-04-30", due: "2018-06-07", status: "F", received: "2018-06-01" },
    { periodKey: "18AE", start: "2018-05-01", end: "2018-05-31", due: "2018-07-07", status: "F", received: "2018-07-01" },
    { periodKey: "18AF", start: "2018-06-01", end: "2018-06-30", due: "2018-08-07", status: "F", received: "2018-08-01" },
    { periodKey: "18AG", start: "2018-07-01", end: "2018-07-31", due: "2018-09-07", status: "F", received: "2018-09-01" },
    { periodKey: "18AH", start: "2018-08-01", end: "2018-08-31", due: "2018-10-07", status: "F", received: "2018-10-01" },
    { periodKey: "18AI", start: "2018-09-01", end: "2018-09-30", due: "2018-11-07", status: "F", received: "2018-11-01" },
    { periodKey: "18AJ", start: "2018-10-01", end: "2018-10-31", due: "2018-12-07", status: "F", received: "2018-12-01" },
    { periodKey: "18AK", start: "2018-11-01", end: "2018-11-30", due: "2019-01-07", status: "F", received: "2019-01-01" },
    { periodKey: "18AL", start: "2018-12-01", end: "2018-12-31", due: "2019-02-07", status: "F", received: "2019-02-01" },
  ],

  // 2018 quarterly obligations, quarter 01 is open
  QUARTERLY_OBS_01_OPEN: [
    { periodKey: "18A1", start: "2018-01-01", end: "2018-03-31", due: "2018-05-07", status: "O" },
    { periodKey: "18A2", start: "2018-04-01", end: "2018-06-30", due: "2018-08-07", status: "O" },
  ],

  // 2018 quarterly obligations, quarter 02 is open; previous quarters fulfilled
  QUARTERLY_OBS_02_OPEN: [
    { periodKey: "18A1", start: "2018-01-01", end: "2018-03-31", due: "2018-05-07", status: "F", received: "2018-05-01" },
    { periodKey: "18A2", start: "2018-04-01", end: "2018-06-30", due: "2018-08-07", status: "O" },
    { periodKey: "18A3", start: "2018-07-01", end: "2018-09-30", due: "2018-11-07", status: "O" },
  ],

  // 2018 quarterly obligations; all fulfilled
  QUARTERLY_OBS_04_FULFILLED: [
    { periodKey: "18A1", start: "2018-01-01", end: "2018-03-31", due: "2018-05-07", status: "F", received: "2018-05-01" },
    { periodKey: "18A2", start: "2018-04-01", end: "2018-06-30", due: "2018-08-07", status: "F", received: "2018-08-01" },
    { periodKey: "18A3", start: "2018-07-01", end: "2018-09-30", due: "2018-11-07", status: "F", received: "2018-11-01" },
    { periodKey: "18A4", start: "2018-10-01", end: "2018-12-31", due: "2019-02-07", status: "F", received: "2019-02-01" },
  ],

  // 2018 monthly obligations; two are open
  MULTIPLE_OPEN_MONTHLY: [
    { periodKey: "18AA", start: "2018-01-01", end: "2018-01-31", due: "2018-03-07", status: "F", received: "2018-03-01" },
    { periodKey: "18AB", start: "2018-02-01", end: "2018-02-28", due: "2018-04-07", status: "O" },
    { periodKey: "18AC", start: "2018-03-01", end: "2018-03-31", due: "2018-05-07", status: "O" },
  ],

  // 2018 quarterly obligations; two are open
  MULTIPLE_OPEN_QUARTERLY: [
    { periodKey: "18A1", start: "2018-01-01", end: "2018-03-31", due: "2018-05-07", status: "F", received: "2018-05-01" },
    { periodKey: "18A2", start: "2018-04-01", end: "2018-06-30", due: "2018-08-07", status: "O" },
    { periodKey: "18A3", start: "2018-07-01", end: "2018-09-30", due: "2018-11-07", status: "O" },
  ],

  // One obligation spans 2018-2019
  OBS_SPANS_MULTIPLE_YEARS: [
    { periodKey: "18A4", start: "2018-10-01", end: "2018-12-31", due: "2019-02-07", status: "F", received: "2019-02-01" },
    { periodKey: "19A1", start: "2019-01-01", end: "2019-03-31", due: "2019-05-07", status: "O" },
  ],
};

/**
 * Error scenarios
 */
const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: {
      code: "NOT_FOUND",
      message: "The requested resource could not be found",
    },
  },
  INSOLVENT_TRADER: {
    status: 403,
    body: {
      code: "INSOLVENT_TRADER",
      message: "The trader is insolvent",
    },
  },
  VRN_INVALID: {
    status: 400,
    body: {
      code: "VRN_INVALID",
      message: "The provided VAT registration number is invalid",
    },
  },
  INVALID_DATE_FROM: {
    status: 400,
    body: {
      code: "INVALID_DATE_FROM",
      message: "Invalid date from",
    },
  },
  INVALID_DATE_TO: {
    status: 400,
    body: {
      code: "INVALID_DATE_TO",
      message: "Invalid date to",
    },
  },
  DATE_RANGE_TOO_LARGE: {
    status: 400,
    body: {
      code: "DATE_RANGE_TOO_LARGE",
      message: "The date range is too large",
    },
  },
  // HTTP 500 error scenarios for testing error handling
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
 * Slow scenarios that need special handling
 */
const slowScenarios = {
  SUBMIT_HMRC_API_HTTP_SLOW_10S: {
    delayMs: 10000,
    obligations: [{ periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F", received: "2017-05-06" }],
  },
};

/**
 * Randomize period keys in an obligations array while preserving the structure.
 * This simulates HMRC's unpredictable period key generation.
 * @param {Array} obligations - Array of obligation objects
 * @returns {Array} Obligations with randomized period keys
 */
function randomizePeriodKeys(obligations) {
  return obligations.map((ob) => ({
    ...ob,
    periodKey: generateRandomPeriodKey(),
  }));
}

/**
 * Get obligations based on Gov-Test-Scenario header
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {Object} - {obligations: [...]} or {status: number, body: {...}} for errors or {delayMs: number, obligations: [...]} for slow
 */
export function getObligationsForScenario(scenario) {
  if (!scenario) {
    // Default: generate obligations with random period keys
    const obligations = generateDefaultObligations();
    console.log(`[http-simulator:scenarios] Using default obligations with random periodKey: ${obligations[0]?.periodKey}`);
    return { obligations };
  }

  const scenarioUpper = scenario.toUpperCase();

  // Check for error scenarios
  if (errorScenarios[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying error scenario: ${scenario}`);
    return errorScenarios[scenarioUpper];
  }

  // Check for slow scenarios
  if (slowScenarios[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying slow scenario: ${scenario}`);
    // Randomize period keys for slow scenarios too
    return {
      ...slowScenarios[scenarioUpper],
      obligations: randomizePeriodKeys(slowScenarios[scenarioUpper].obligations),
    };
  }

  // Check for obligation-specific scenarios
  if (scenarioObligations[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying obligation scenario: ${scenario}`);
    // Randomize period keys to simulate HMRC's unpredictable behavior
    return { obligations: randomizePeriodKeys(scenarioObligations[scenarioUpper]) };
  }

  // Default: generate obligations with random period keys
  const obligations = generateDefaultObligations();
  console.log(
    `[http-simulator:scenarios] Using default obligations (unknown scenario) with random periodKey: ${obligations[0]?.periodKey}`,
  );
  return { obligations };
}
