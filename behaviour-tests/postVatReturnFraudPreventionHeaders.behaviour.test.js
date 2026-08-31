// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/postVatReturnFraudPreventionHeaders.behaviour.test.js
// Simplified test to verify HMRC fraud prevention headers compliance

import { test } from "./helpers/playwrightTestWithout.js";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  getEnvVarAndLog,
  isSandboxMode,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  saveHmrcTestUserToFiles,
  checkFraudPreventionHeadersFeedback,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { completeVat, fillInVat, initSubmitVat, submitFormVat, verifyVatSubmission } from "./steps/behaviour-hmrc-vat-steps.js";
import { fillInHmrcAuth, goToHmrcAuth, grantPermissionHmrcAuth, initHmrcAuth, submitHmrcAuth } from "./steps/behaviour-hmrc-steps.js";
import {
  deleteTraceparentTxt,
  deleteUserSubTxt,
  deleteHashedUserSubTxt,
  extractUserSubFromLocalStorage,
  appendUserSubTxt,
  appendHashedUserSubTxt,
  appendTraceparentTxt,
} from "./helpers/fileHelper.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import {
  assertConsistentHashedSub,
  assertEssentialFraudPreventionHeadersPresent,
  assertFraudPreventionHeaders,
  assertHmrcApiRequestExists,
  assertHmrcApiRequestValues,
  intentionallyNotSuppliedHeaders,
  readDynamoDbExport,
} from "./helpers/dynamodb-assertions.js";
import { expect } from "@playwright/test";

dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/fraudPreventionHeadersVat-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);
const hmrcVatPeriodFromDate = "2025-01-01";
const hmrcVatPeriodToDate = "2025-12-01";
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
const runFraudPreventionHeaderValidation = true;
// Enable sandbox obligation fallback - allows test to use any available open obligation if dates don't match
const allowSandboxObligations = isSandboxMode();

const hmrcVatDueAmount = "1000.00";
// Period keys are unpredictable per HMRC documentation - they cannot be calculated, only validated.
// Tests should capture the actual periodKey from the response and use that for subsequent calls.
// Format validation: /^[0-9]{2}[A-Z][0-9A-Z]$/ (e.g., 18A1, 24B3, 17AC)
const periodKeyFormatRegex = /^[0-9]{2}[A-Z][0-9A-Z]$/;

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;
// Capture the actual resolved period key from the submission response
let resolvedPeriodKey = null;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "postVatReturnFraudPreventionHeadersBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = {
    ...originalEnv,
  };

  // Run servers needed for the test
  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

  // Clean up any existing artefacts from previous test runs
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  deleteUserSubTxt(outputDir);
  deleteHashedUserSubTxt(outputDir);
  deleteTraceparentTxt(outputDir);

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
  // Shutdown local servers at end of test
  if (serverProcess) {
    serverProcess.kill();
  }
  if (mockOAuth2Process) {
    mockOAuth2Process.kill();
  }
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

test.afterEach(async ({ page }, testInfo) => {
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  appendUserSubTxt(outputDir, testInfo, userSub);
  await appendHashedUserSubTxt(outputDir, testInfo, userSub);
  appendTraceparentTxt(outputDir, testInfo, observedTraceparent);
});

test("Verify fraud prevention headers for VAT return submission", async ({ page }, testInfo) => {
  // Only run in sandbox mode
  if (!isSandboxMode()) {
    console.log("[SKIP] Fraud prevention headers test is only run in sandbox mode");
    test.skip();
    return;
  }

  const testUrl = baseUrl;

  // Add console logging to capture browser messages
  addOnPageLogging(page);

  // Capture the first traceparent header observed in any API response
  // Also capture the resolved periodKey from the VAT return submission response
  page.on("response", async (response) => {
    try {
      const url = response.url();

      // Capture traceparent header
      if (!observedTraceparent) {
        const headers = response.headers?.() ?? {};
        const h = typeof headers === "function" ? headers() : headers;
        const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
        if (tp) {
          observedTraceparent = tp;
        }
      }

      // Capture periodKey from VAT return submission response
      // The backend returns the resolved periodKey at data.periodKey level
      if (!resolvedPeriodKey && url.includes("/api/v1/hmrc/vat/return") && response.status() === 200) {
        try {
          const body = await response.json();
          // The periodKey is returned at data.periodKey (resolved from obligations by the backend)
          const pk = body?.data?.periodKey || body?.periodKey;
          if (pk && periodKeyFormatRegex.test(pk)) {
            resolvedPeriodKey = pk;
            console.log(`[Test] Captured resolved periodKey from response: ${resolvedPeriodKey}`);
          }
        } catch (_jsonErr) {
          // Response may not be JSON or may have been consumed
        }
      }
    } catch (_e) {
      // ignore header/body parsing errors
    }
  });

  // ---------- Test artefacts (video-adjacent) ----------
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  /* ************************* */
  /* HMRC TEST USER CREATION   */
  /* ************************* */

  // Variables to hold test credentials (either from env or generated)
  let testUsername = hmrcTestUsername;
  let testPassword = hmrcTestPassword;
  let testVatNumber = hmrcTestVatNumber;

  // If in sandbox mode and credentials are not provided, create a test user
  if (!hmrcTestUsername) {
    console.log("[HMRC Test User] Sandbox mode detected without full credentials - creating test user");

    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;

    if (!hmrcClientId) {
      console.error("[HMRC Test User] No HMRC client ID found in environment. Cannot create test user.");
      throw new Error("HMRC_SANDBOX_CLIENT_ID or HMRC_CLIENT_ID is required to create test users");
    }

    if (!hmrcClientSecret) {
      console.error("[HMRC Test User] No HMRC client secret found in environment. Cannot create test user.");
      throw new Error("HMRC_SANDBOX_CLIENT_SECRET or HMRC_CLIENT_SECRET is required to create test users");
    }

    console.log("[HMRC Test User] Creating HMRC sandbox test user with VAT enrolment using client credentials");

    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, {
      serviceNames: ["mtd-vat"],
    });

    // Extract credentials from the created test user
    testUsername = testUser.userId;
    testPassword = testUser.password;
    testVatNumber = testUser.vrn;

    console.log("[HMRC Test User] Successfully created test user:");
    console.log(`  User ID: ${testUser.userId}`);
    console.log(`  User Full Name: ${testUser.userFullName}`);
    console.log(`  VAT registration number: ${testUser.vrn}`);
    console.log(`  Organisation: ${testUser.organisationDetails?.name || "N/A"}`);

    // Save test user details to files
    const repoRoot = path.resolve(process.cwd());

    saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);

    // Update environment variables for this test run
    process.env.TEST_HMRC_USERNAME = testUsername;
    process.env.TEST_HMRC_PASSWORD = testPassword;
    process.env.TEST_HMRC_VAT_NUMBER = testVatNumber;

    console.log("[HMRC Test User] Updated environment variables with generated credentials");
  }

  /* ****** */
  /*  HOME  */
  /* ****** */

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  /* ******* */
  /*  LOGIN  */
  /* ******* */

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);

  await consentToDataCollection(page, screenshotPath);

  /* ********* */
  /*  BUNDLES  */
  /* ********* */

  await goToBundlesPage(page, screenshotPath);
  await ensureBundlePresent(page, "Day Guest", screenshotPath, { testPass: true });
  await goToHomePage(page, screenshotPath);
  await goToBundlesPage(page, screenshotPath);
  await goToHomePage(page, screenshotPath);

  /* *********** */
  /* `SUBMIT VAT */
  /* *********** */

  await initSubmitVat(page, screenshotPath);
  await fillInVat(
    page,
    testVatNumber,
    undefined,
    hmrcVatDueAmount,
    null,
    runFraudPreventionHeaderValidation,
    screenshotPath,
    allowSandboxObligations,
  );
  await submitFormVat(page, screenshotPath);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */

  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* ******************* */
  /* `SUBMIT VAT RESULTS */
  /* ******************* */

  await completeVat(page, baseUrl, null, screenshotPath);
  await verifyVatSubmission(page, null, screenshotPath);

  /* ****************** */
  /*  Extract user sub  */
  /* ****************** */

  userSub = await extractUserSubFromLocalStorage(page, testInfo);

  /* ********************************** */
  /*  FRAUD PREVENTION HEADERS FEEDBACK */
  /* ********************************** */

  // For sandbox tests, fetch fraud prevention headers validation feedback
  // Note: This request is made directly from test executor to HMRC, not through Lambda
  // We capture the result to include in the test report even without DynamoDB access
  const requestId = "request-123";
  const traceparent = observedTraceparent;
  const correlationId = "correlation-123";
  const validationFeedbackResult = await checkFraudPreventionHeadersFeedback(
    page,
    testInfo,
    screenshotPath,
    userSub,
    requestId,
    traceparent,
    correlationId,
  );
  //await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);

  /* ****************** */
  /*  TEST CONTEXT JSON */
  /* ****************** */

  // Build test context metadata and write testContext.json next to the video
  const testContext = {
    testId: "postVatReturnFraudPreventionHeadersBehaviour",
    name: testInfo.title,
    title: "Fraud Prevention Headers Validation (HMRC: VAT Return POST)",
    description: "Submits a VAT return to HMRC MTD VAT API and validates fraud prevention headers compliance.",
    hmrcApis: [
      { url: "/api/v1/hmrc/vat/return", method: "POST" },
      { url: "/test/fraud-prevention-headers/validate", method: "GET" },
      { url: "/test/fraud-prevention-headers/vat-mtd/validation-feedback", method: "GET" },
    ],
    env: {
      envName,
      baseUrl,
      serverPort: httpServerPort,
      runTestServer,
      runMockOAuth2,
      testAuthProvider,
      testAuthUsername,
      bundleTableName,
      hmrcApiRequestsTableName,
      receiptsTableName,
      runDynamoDb,
    },
    testData: {
      hmrcTestUsername: testUsername,
      hmrcTestPassword: testPassword ? "***MASKED***" : "<not provided>", // Mask password in test context
      hmrcTestVatNumber: testVatNumber,
      hmrcVatDueAmount,
      testUserGenerated: isSandboxMode() && (!hmrcTestUsername || !hmrcTestPassword || !hmrcTestVatNumber),
      userSub,
      observedTraceparent,
      testUrl,
      isSandboxMode: isSandboxMode(),
      intentionallyNotSuppliedHeaders,
    },
    // Validation feedback from HMRC (captured directly from test executor, not via Lambda/DynamoDB)
    validationFeedback: validationFeedbackResult
      ? {
          ok: validationFeedbackResult.ok,
          status: validationFeedbackResult.status,
          feedback: validationFeedbackResult.feedback,
        }
      : null,
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}

  /* ****************** */
  /*  FIGURES (SCREENSHOTS) */
  /* ****************** */

  // Select and copy key screenshots, then generate figures.json
  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = ["10.*fill.*in.*submission.*pagedown", "02.*complete.*vat.*receipt"];

  const screenshotDescriptions = {
    "10.*fill.*in.*submission.*pagedown": "VAT return form filled out with test data including VAT number, period key, and amount due",
    "02.*complete.*vat.*receipt": "Successful VAT return submission confirmation showing receipt details from HMRC",
  };

  const selectedScreenshots = selectKeyScreenshots(screenshotPath, keyScreenshotPatterns, 5);
  console.log(`[Figures]: Selected ${selectedScreenshots.length} key screenshots from ${screenshotPath}`);

  const copiedScreenshots = copyScreenshots(screenshotPath, outputDir, selectedScreenshots);
  console.log(`[Figures]: Copied ${copiedScreenshots.length} screenshots to ${outputDir}`);

  const figures = generateFiguresMetadata(copiedScreenshots, screenshotDescriptions);
  writeFiguresJson(outputDir, figures);

  /* **************** */
  /*  EXPORT DYNAMODB */
  /* **************** */

  // Export DynamoDB tables if dynalite was used
  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    console.log("[DynamoDB Export]: Starting export of all tables...");
    try {
      const exportResults = await exportAllTables(outputDir, dynamoControl.endpoint, {
        bundleTableName,
        hmrcApiRequestsTableName,
        receiptsTableName,
      });
      console.log("[DynamoDB Export]: Export completed:", exportResults);
    } catch (error) {
      console.error("[DynamoDB Export]: Failed to export tables:", error);
    }
  }

  /* ********************************************* */
  /*  APPEND VALIDATION FEEDBACK TO HMRC REQUESTS  */
  /* ********************************************* */

  // Write validation feedback to hmrc-api-requests.jsonl even without DynamoDB
  // This ensures the test report can display the feedback in CI environments
  if (validationFeedbackResult) {
    const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");
    const hmrcBase = process.env.HMRC_SANDBOX_BASE_URI || "https://test-api.service.hmrc.gov.uk";

    // Hash the userSub to match DynamoDB record format (hashedSub field)
    let hashedSubForRecord = "unknown";
    if (userSub) {
      try {
        const { hashSub } = await import("@app/services/subHasher.js");
        hashedSubForRecord = hashSub(userSub);
      } catch (e) {
        console.log(`[Validation Feedback]: Could not hash userSub for record: ${e.message}`);
        hashedSubForRecord = userSub; // Fall back to raw sub if hashing fails
      }
    }

    const validationFeedbackRecord = {
      hashedSub: hashedSubForRecord, // Use hashedSub to match DynamoDB record format
      id: `validation-feedback-${Date.now()}`,
      requestId: correlationId,
      url: `${hmrcBase}/test/fraud-prevention-headers/vat-mtd/validation-feedback`,
      httpRequest: {
        method: "GET",
        headers: {
          "Accept": "application/vnd.hmrc.1.0+json",
          "x-request-id": requestId,
          "traceparent": traceparent,
          "x-correlationid": correlationId,
        },
      },
      httpResponse: {
        statusCode: validationFeedbackResult.status,
        body: validationFeedbackResult.feedback,
      },
      timestamp: new Date().toISOString(),
      source: "test-executor-direct", // Indicates this was captured directly, not via Lambda
    };
    try {
      fs.appendFileSync(hmrcApiRequestsFile, JSON.stringify(validationFeedbackRecord) + "\n", "utf-8");
      console.log("[Validation Feedback]: Appended validation feedback to hmrc-api-requests.jsonl");
    } catch (error) {
      console.error("[Validation Feedback]: Failed to append validation feedback:", error);
    }
  }

  /* ********************************** */
  /*  ASSERT DYNAMODB HMRC API REQUESTS */
  /* ********************************** */

  // Assert that HMRC API requests were logged correctly
  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");

    // Assert OAuth token exchange request exists
    const oauthRequests = assertHmrcApiRequestExists(hmrcApiRequestsFile, "POST", "/oauth/token", "OAuth token exchange");
    console.log(`[DynamoDB Assertions]: Found ${oauthRequests.length} OAuth token exchange request(s)`);

    // Assert VAT return POST request exists and validate key fields
    const vatPostRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "POST",
      `/organisations/vat/${testVatNumber}/returns`,
      "VAT return submission",
    );
    console.log(`[DynamoDB Assertions]: Found ${vatPostRequests.length} VAT return POST request(s)`);
    expect(vatPostRequests.length).toBeGreaterThan(0);
    vatPostRequests.forEach((vatPostRequest) => {
      assertEssentialFraudPreventionHeadersPresent(vatPostRequest, `POST ${vatPostRequest.url}`);
      // Assert that the request body contains the submitted data
      assertHmrcApiRequestValues(vatPostRequest, {
        "httpRequest.method": "POST",
        "httpResponse.statusCode": 201,
      });

      // Check that request body contains a valid period key format and VAT due amount
      // periodKey is unpredictable per HMRC - only validate format, not specific value
      const requestBody = JSON.parse(vatPostRequest.httpRequest.body);
      expect(requestBody.periodKey, "periodKey should match HMRC format").toMatch(periodKeyFormatRegex);
      expect(requestBody.vatDueSales).toBe(parseFloat(hmrcVatDueAmount));
      console.log(`[DynamoDB Assertions]: VAT POST request body validated - periodKey format: ${requestBody.periodKey}`);
    });

    // Assert Fraud prevention headers validation feedback GET request exists and validate key fields
    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);

    // Assert consistent hashedSub across authenticated requests
    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "Submit VAT test", { filterByUserSub: userSub });
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }
});
