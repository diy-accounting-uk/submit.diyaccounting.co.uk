// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/dynamodb-assertions.js

import fs from "node:fs";
import { expect } from "@playwright/test";
import { createLogger } from "@app/lib/logger.js";
import { hashSub, initializeSalt, isSaltInitialized } from "@app/services/subHasher.js";

const logger = createLogger({ source: "behaviour-tests/helpers/dynamodb-assertions.js" });

/**
 * Read and parse a JSONL file exported from DynamoDB
 * @param {string} filePath - Path to the .jsonl file
 * @returns {Array<Object>} Array of parsed JSON objects
 */
export function readDynamoDbExport(filePath) {
  if (!fs.existsSync(filePath)) {
    logger.warn(`DynamoDB export file not found: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        logger.error(`Failed to parse line in ${filePath}: ${line}`, error);
        return null;
      }
    })
    .filter((item) => item !== null);
}

/**
 * Find HMRC API request records by URL pattern
 * @param {string} exportFilePath - Path to hmrc-api-requests.jsonl
 * @param {string|RegExp} urlPattern - URL pattern to match (string for contains, RegExp for pattern)
 * @returns {Array<Object>} Matching request records
 */
export function findHmrcApiRequestsByUrl(exportFilePath, urlPattern) {
  const records = readDynamoDbExport(exportFilePath);

  if (typeof urlPattern === "string") {
    return records.filter((record) => record.url && record.url.includes(urlPattern));
  } else if (urlPattern instanceof RegExp) {
    return records.filter((record) => record.url && urlPattern.test(record.url));
  }

  return [];
}

/**
 * Find HMRC API request records by method and URL pattern
 * @param {string} exportFilePath - Path to hmrc-api-requests.jsonl
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string|RegExp} urlPattern - URL pattern to match
 * @returns {Array<Object>} Matching request records
 */
export function findHmrcApiRequestsByMethodAndUrl(exportFilePath, method, urlPattern) {
  const allMatches = findHmrcApiRequestsByUrl(exportFilePath, urlPattern);
  return allMatches.filter((record) => record.method === method);
}

/**
 * Assert that at least one HMRC API request exists for the given URL pattern
 * @param {string} exportFilePath - Path to hmrc-api-requests.jsonl
 * @param {string} method - HTTP method
 * @param {string|RegExp} urlPattern - URL pattern to match
 * @param {string} description - Description for error messages
 */
export function assertHmrcApiRequestExists(exportFilePath, method, urlPattern, description = "") {
  console.log(`Asserting HMRC API request exists: ${method} ${urlPattern}`);
  const matches = findHmrcApiRequestsByMethodAndUrl(exportFilePath, method, urlPattern);
  const desc = description ? ` (${description})` : "";
  expect(matches.length, `Expected at least one ${method} request to ${urlPattern}${desc}`).toBeGreaterThan(0);
  return matches;
}

/**
 * Assert specific values in an HMRC API request record
 * @param {Object} record - The HMRC API request record
 * @param {Object} expectedValues - Object with expected field values
 */
export function assertHmrcApiRequestValues(record, expectedValues) {
  for (const [key, expectedValue] of Object.entries(expectedValues)) {
    const actualValue = getNestedValue(record, key);
    expect(actualValue, `Expected ${key} to be ${expectedValue}, but got ${actualValue}`).toBe(expectedValue);
  }
}

/**
 * Count specific values in an HMRC API request record
 * @param {Object} record - The HMRC API request record
 * @param {Object} expectedValues - Object with expected field values
 */
export function countHmrcApiRequestValues(record, expectedValues) {
  const entries = Object.entries(expectedValues);

  for (const [key, expectedValue] of entries) {
    const actualValue = getNestedValue(record, key);

    if (actualValue !== expectedValue) {
      return 0;
    }
  }

  console.log(`Matched all expected values in ${record.url}:`, expectedValues);

  return 1;
}

/**
 * Get a nested value from an object using dot notation
 * @param {Object} obj - The object to search
 * @param {string} path - Dot-notation path (e.g., "httpRequest.method")
 * @returns {*} The value at the path, or undefined if not found
 */
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Assert that all HMRC API requests have the same hashedSub
 * @param {string} exportFilePath - Path to hmrc-api-requests.jsonl
 * @param {string} description - Description for error messages
 * @param {Object} options - Options for validation
 * @param {number} options.maxHashedSubs - Maximum allowed unique hashedSub values (default: 2)
 * @param {boolean} options.allowOAuthDifference - Allow different hashedSub for OAuth requests (default: true)
 * @param {string} options.filterByUserSub - If provided, filter authenticated records to this user's hashedSub
 */
export async function assertConsistentHashedSub(exportFilePath, description = "", options = {}) {
  const { maxHashedSubs = 2, allowOAuthDifference = true, filterByUserSub = null } = options;

  const allRecords = readDynamoDbExport(exportFilePath);

  if (allRecords.length === 0) {
    logger.warn(`No HMRC API request records found in ${exportFilePath}`);
    return;
  }

  // When filterByUserSub is provided, filter to the current test user's records.
  // This prevents false failures in CI where the DynamoDB table contains historical records
  // from all previous test runs. OAuth requests use a pre-auth hashedSub (different from the
  // authenticated hashedSub), so we filter authenticated requests by the user's hashedSub
  // and skip the OAuth uniqueness check when filtering.
  let userHashedSub = null;
  if (filterByUserSub) {
    try {
      if (!isSaltInitialized()) {
        await initializeSalt();
      }
      userHashedSub = hashSub(filterByUserSub);
    } catch (e) {
      logger.warn(`Could not hash userSub for filtering (checking all records): ${e.message}`);
    }
  }

  const records = userHashedSub ? allRecords.filter((r) => r.hashedSub === userHashedSub) : allRecords;
  const oauthRequests = allRecords.filter((r) => r.url && r.url.includes("/oauth/token"));
  const authenticatedRequests = records.filter((r) => r.url && !r.url.includes("/oauth/token"));
  const authenticatedHashedSubs = [...new Set(authenticatedRequests.map((r) => r.hashedSub))];
  const desc = description ? ` (${description})` : "";

  if (userHashedSub) {
    // Filtered mode: only assert authenticated requests have a consistent hashedSub.
    // OAuth requests can't be filtered by user sub (pre-auth hashedSub differs).
    logger.info(
      `Filtering by hashedSub ${userHashedSub}: ${authenticatedRequests.length} authenticated requests ` +
        `(of ${allRecords.length} total, ${oauthRequests.length} OAuth)`,
    );

    expect(
      authenticatedHashedSubs.length,
      `Expected authenticated requests to have a single hashedSub${desc}, but found ${authenticatedHashedSubs.length}`,
    ).toBe(1);

    logger.info(`Found ${authenticatedRequests.length} authenticated HMRC API requests with hashedSub ${authenticatedHashedSubs[0]}`);
  } else if (allowOAuthDifference) {
    // Unfiltered mode with OAuth difference allowed: validate at most 2 hashedSubs
    const hashedSubs = [...new Set(allRecords.map((r) => r.hashedSub).filter((h) => h))];
    const oauthHashedSubs = [...new Set(oauthRequests.map((r) => r.hashedSub))];

    if (hashedSubs.length) {
      expect(oauthHashedSubs.length, `Expected OAuth requests to have a single hashedSub${desc}, but found ${oauthHashedSubs.length}`).toBe(
        1,
      );

      expect(
        authenticatedHashedSubs.length,
        `Expected authenticated requests to have a single hashedSub${desc}, but found ${authenticatedHashedSubs.length}`,
      ).toBe(1);

      logger.info(
        `Found ${allRecords.length} HMRC API requests: OAuth (${oauthRequests.length}) with hashedSub ${oauthHashedSubs[0]}, ` +
          `authenticated (${authenticatedRequests.length}) with hashedSub ${authenticatedHashedSubs[0]}`,
      );
    }
  } else {
    const hashedSubs = [...new Set(allRecords.map((r) => r.hashedSub).filter((h) => h))];
    expect(
      hashedSubs.length,
      `Expected all HMRC API requests to have the same hashedSub${desc}, but found ${hashedSubs.length} different values: ${hashedSubs.join(", ")}`,
    ).toBeLessThanOrEqual(maxHashedSubs);

    logger.info(`Found ${allRecords.length} HMRC API requests with ${hashedSubs.length} unique hashedSub value(s)`);
  }

  return authenticatedHashedSubs;
}

/**
 * HMRC Fraud Prevention headers that are intentionally NOT supplied.
 * These headers are documented to HMRC as not applicable for this application.
 *
 * - gov-vendor-license-ids: Open-source software with no license keys
 *
 * @see buildFraudHeaders.js for server-side header generation
 * @see submit.js buildGovClientHeaders() for client-side header generation
 */
export const intentionallyNotSuppliedHeaders = [];

/**
 * Essential HMRC Fraud Prevention headers that MUST be present in every HMRC API request.
 * These are generated client-side (browser) or server-side (buildFraudHeaders.js).
 * The Express server injects synthetic CloudFront headers in simulator mode so that
 * network-dependent headers (public IP, port, forwarded) are also available for testing.
 *
 * See HMRC spec: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/web-app-via-server/
 */
export const essentialFraudPreventionHeaders = [
  // Server-side (buildFraudHeaders.js)
  "gov-client-connection-method",
  "gov-client-user-ids",
  "gov-client-public-ip",
  "gov-client-public-port",
  "gov-vendor-product-name",
  "gov-vendor-version",
  "gov-vendor-public-ip",
  "gov-vendor-forwarded",
  // Client-side (hmrc-service.js, passed as request headers)
  "gov-client-multi-factor",
  "gov-client-device-id",
  "gov-client-browser-js-user-agent",
  "gov-client-screens",
  "gov-client-timezone",
  "gov-client-window-size",
];

/**
 * Assert that essential fraud prevention headers are present in an HMRC API request.
 * @param {object} hmrcApiRequest - The HMRC API request from DynamoDB
 * @param {string} context - Description of the request for error messages
 */
export function assertEssentialFraudPreventionHeadersPresent(hmrcApiRequest, context = "HMRC API request") {
  const requestHeaders = hmrcApiRequest.httpRequest?.headers || {};
  const headerKeysLower = Object.keys(requestHeaders).map((k) => k.toLowerCase());

  const missingHeaders = essentialFraudPreventionHeaders.filter((header) => !headerKeysLower.includes(header.toLowerCase()));

  if (missingHeaders.length > 0) {
    console.error(`[DynamoDB Assertions]: Missing essential fraud prevention headers in ${context}:`, missingHeaders);
    console.error(`[DynamoDB Assertions]: Present headers:`, Object.keys(requestHeaders));
    expect(missingHeaders, `Missing essential fraud prevention headers in ${context}`).toEqual([]);
  }
}

export async function assertFraudPreventionHeaders(
  hmrcApiRequestsFile,
  noErrors = false,
  noWarnings = false,
  allValidFeedbackHeaders = false,
  filterByUserSub = null,
) {
  // When filterByUserSub is provided, only check records belonging to the current test user.
  // This prevents false failures in CI where the DynamoDB table contains historical records
  // from old test runs (e.g. before MFA was implemented).
  let filterHashedSub = null;
  if (filterByUserSub) {
    try {
      if (!isSaltInitialized()) {
        await initializeSalt();
      }
      filterHashedSub = hashSub(filterByUserSub);
      console.log(`[DynamoDB Assertions]: Filtering fraud prevention header records by hashedSub for current test user`);
    } catch (e) {
      console.log(`[DynamoDB Assertions]: Could not hash userSub for filtering (checking all records): ${e.message}`);
    }
  }

  let fraudPreventionHeadersValidationFeedbackGetRequests;
  if (allValidFeedbackHeaders) {
    fraudPreventionHeadersValidationFeedbackGetRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "GET",
      `/test/fraud-prevention-headers/vat-mtd/validation-feedback`,
      "Fraud prevention headers validation feedback",
    );
  } else {
    fraudPreventionHeadersValidationFeedbackGetRequests = [];
  }
  if (filterHashedSub) {
    fraudPreventionHeadersValidationFeedbackGetRequests = fraudPreventionHeadersValidationFeedbackGetRequests.filter(
      (record) => record.hashedSub === filterHashedSub,
    );
  }
  console.log(
    `[DynamoDB Assertions]: Found ${fraudPreventionHeadersValidationFeedbackGetRequests.length} Fraud prevention headers validation feedback GET request(s)`,
  );
  // Separate successful responses from network failures (statusCode 0).
  // HMRC sandbox fraud prevention endpoints intermittently fail at the network level,
  // causing Lambda to record statusCode 0. These are transient issues, not test failures.
  const feedbackNetworkFailures = fraudPreventionHeadersValidationFeedbackGetRequests.filter((r) => r.httpResponse?.statusCode === 0);
  const feedbackSuccessfulRequests = fraudPreventionHeadersValidationFeedbackGetRequests.filter((r) => r.httpResponse?.statusCode !== 0);
  if (feedbackNetworkFailures.length > 0) {
    console.log(
      `[DynamoDB Assertions]: ${feedbackNetworkFailures.length} feedback request(s) had network failures (statusCode 0) — skipping (HMRC sandbox flakiness)`,
    );
  }
  if (fraudPreventionHeadersValidationFeedbackGetRequests.length > 0) {
    expect(
      feedbackSuccessfulRequests.length,
      `All ${fraudPreventionHeadersValidationFeedbackGetRequests.length} fraud prevention feedback request(s) had network failures (statusCode 0)`,
    ).toBeGreaterThan(0);
  }
  feedbackSuccessfulRequests.forEach((fraudPreventionHeadersValidationFeedbackGetRequest, index) => {
    assertHmrcApiRequestValues(fraudPreventionHeadersValidationFeedbackGetRequest, {
      "httpRequest.method": "GET",
      "httpResponse.statusCode": 200,
    });
    console.log(
      `[DynamoDB Assertions]: Fraud prevention headers validation feedback GET request #${index + 1} validated successfully with details:`,
    );
    const requests = fraudPreventionHeadersValidationFeedbackGetRequest.httpResponse.body.requests;
    requests.forEach((request) => {
      console.log(`[DynamoDB Assertions]: Request URL: ${request.url}, Code: ${request.code}`);
      const invalidHeaders = request.headers.filter((header) => header.code === "INVALID_HEADER");
      //.filter((header) => !intentionallyNotSuppliedHeaders.includes(header.header));
      const notValidHeaders = request.headers
        .filter((header) => header.code !== "VALID_HEADER")
        .filter((header) => !intentionallyNotSuppliedHeaders.includes(header.header));
      if (allValidFeedbackHeaders) {
        expect(invalidHeaders, `Expected no invalid headers, but got: ${JSON.stringify(invalidHeaders)}`).toEqual([]);
        expect(notValidHeaders, `Expected no not valid headers, but got: ${JSON.stringify(notValidHeaders)}`).toEqual([]);
        // Intentionally not checked at the top level because there are headers we ignore
        // expect(request.code).toBe("VALID_HEADERS");
      }
    });
  });

  // Assert Fraud prevention headers validation GET request exists and validate key fields
  // First assert without filter to confirm at least one record exists in the full export
  assertHmrcApiRequestExists(hmrcApiRequestsFile, "GET", `/test/fraud-prevention-headers/validate`, "Fraud prevention headers validation");
  // Then filter to current user's records for detailed assertions (errors/warnings)
  let fraudPreventionHeadersValidationGetRequests = findHmrcApiRequestsByMethodAndUrl(
    hmrcApiRequestsFile,
    "GET",
    `/test/fraud-prevention-headers/validate`,
  );
  if (filterHashedSub) {
    fraudPreventionHeadersValidationGetRequests = fraudPreventionHeadersValidationGetRequests.filter(
      (record) => record.hashedSub === filterHashedSub,
    );
    console.log(
      `[DynamoDB Assertions]: Filtered to ${fraudPreventionHeadersValidationGetRequests.length} validation request(s) for hashedSub ${filterHashedSub}`,
    );
  }
  console.log(
    `[DynamoDB Assertions]: Found ${fraudPreventionHeadersValidationGetRequests.length} Fraud prevention headers validation GET request(s)`,
  );
  // Separate successful responses from network failures (statusCode 0).
  // HMRC sandbox fraud prevention endpoints intermittently fail at the network level,
  // causing Lambda to record statusCode 0. These are transient issues, not test failures.
  const validationNetworkFailures = fraudPreventionHeadersValidationGetRequests.filter((r) => r.httpResponse?.statusCode === 0);
  const validationSuccessfulRequests = fraudPreventionHeadersValidationGetRequests.filter((r) => r.httpResponse?.statusCode !== 0);
  if (validationNetworkFailures.length > 0) {
    console.log(
      `[DynamoDB Assertions]: ${validationNetworkFailures.length} validation request(s) had network failures (statusCode 0) — skipping (HMRC sandbox flakiness)`,
    );
  }
  expect(
    validationSuccessfulRequests.length,
    `All ${fraudPreventionHeadersValidationGetRequests.length} fraud prevention validation request(s) had network failures (statusCode 0)`,
  ).toBeGreaterThan(0);
  validationSuccessfulRequests.forEach((fraudPreventionHeadersValidationGetRequest, index) => {
    assertHmrcApiRequestValues(fraudPreventionHeadersValidationGetRequest, {
      "httpRequest.method": "GET",
      "httpResponse.statusCode": 200,
    });
    console.log(
      `[DynamoDB Assertions]: Fraud prevention headers validation GET request #${index + 1} validated successfully with details:`,
    );

    const responseBody = fraudPreventionHeadersValidationGetRequest.httpResponse.body;
    console.log(`[DynamoDB Assertions]: Request code: ${responseBody.code}`);
    console.log(`[DynamoDB Assertions]: Errors: ${responseBody.errors?.length}`);
    console.log(`[DynamoDB Assertions]: Warnings: ${responseBody.warnings?.length}`);
    console.log(`[DynamoDB Assertions]: Ignored headers: ${intentionallyNotSuppliedHeaders}`);

    // CRITICAL: Fail if NO fraud prevention headers were submitted at all
    // This is different from "some headers invalid" - we specifically check for the "no headers" message
    const noHeadersSubmittedMessage = "No fraud prevention headers submitted";
    if (responseBody.code === "INVALID_HEADERS" && responseBody.message?.includes(noHeadersSubmittedMessage)) {
      console.error(`[DynamoDB Assertions]: CRITICAL - No fraud prevention headers submitted at all!`);
      console.error(`[DynamoDB Assertions]: Message: ${responseBody.message}`);
      expect.fail(
        `HMRC fraud prevention validation failed: No fraud prevention headers were submitted. This indicates a bug in buildFraudHeaders.`,
      );
    }

    const errors = responseBody.errors?.filter((error) => {
      const headers = error.headers.filter((header) => !intentionallyNotSuppliedHeaders.includes(header));
      return headers.length > 0;
    });
    console.log(`[DynamoDB Assertions]: Errors: ${errors?.length} (out of non-ignored ${responseBody.errors?.length} headers)`);
    if (noErrors) {
      if (errors) {
        expect(errors).toEqual([]);
        expect(errors?.length).toBe(0);
      }
    }

    const warnings = responseBody.warnings?.filter((warning) => {
      const headers = warning.headers.filter((header) => !intentionallyNotSuppliedHeaders.includes(header));
      return headers.length > 0;
    });
    console.log(`[DynamoDB Assertions]: Warnings: ${warnings?.length} (out of non-ignored ${responseBody.warnings?.length} headers)`);
    if (noWarnings) {
      if (warnings) {
        expect(warnings).toEqual([]);
        expect(warnings.length).toBe(0);
      }
    }

    console.log(`[DynamoDB Assertions]: Request code: ${responseBody.code}`);
    // Intentionally not checked at the top level because there are headers we ignore
    // expect(responseBody.code).toBe("VALID_HEADERS");

    console.log("[DynamoDB Assertions]: Fraud prevention headers validation GET body validated successfully");
  });
}
