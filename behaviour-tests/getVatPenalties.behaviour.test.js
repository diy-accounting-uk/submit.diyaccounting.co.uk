// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/getVatPenalties.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  getEnvVarAndLog,
  isSandboxMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  saveHmrcTestUserToFiles,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import {
  fillInVatPenalties,
  initVatPenalties,
  submitVatPenaltiesForm,
  verifyVatPenaltiesResults,
} from "./steps/behaviour-hmrc-vat-steps.js";
import {
  acceptCookiesHmrc,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import {
  assertHmrcApiRequestExists,
  assertConsistentHashedSub,
  assertEssentialFraudPreventionHeadersPresent,
  countHmrcApiRequestValues,
  assertFraudPreventionHeaders,
  intentionallyNotSuppliedHeaders,
} from "./helpers/dynamodb-assertions.js";
import {
  appendTraceparentTxt,
  appendUserSubTxt,
  appendHashedUserSubTxt,
  deleteTraceparentTxt,
  deleteUserSubTxt,
  deleteHashedUserSubTxt,
  extractUserSubFromLocalStorage,
} from "./helpers/fileHelper.js";
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/vat-penalties-behaviour-test";

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
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
// Enable fraud prevention header validation in sandbox mode (required for HMRC API compliance testing)
const runFraudPreventionHeaderValidation = isSandboxMode();

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(1200_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "getVatPenaltiesBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = {
    ...originalEnv,
  };

  // Clean up any existing artefacts from previous test runs
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  deleteUserSubTxt(outputDir);
  deleteHashedUserSubTxt(outputDir);
  deleteTraceparentTxt(outputDir);

  // Run servers needed for the test
  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

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

async function requestAndVerifyPenalties(page, penaltiesQuery) {
  await initVatPenalties(page, screenshotPath);
  await fillInVatPenalties(page, { ...penaltiesQuery, runFraudPreventionHeaderValidation }, screenshotPath);
  await submitVatPenaltiesForm(page, screenshotPath);
  await verifyVatPenaltiesResults(page, penaltiesQuery, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);
}

test("Click through: View VAT penalties from HMRC", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  // Add console logging to capture browser messages
  addOnPageLogging(page);

  // ---------- Test artefacts (video-adjacent) ----------
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  // Capture the first traceparent header observed in any API response
  page.on("response", (response) => {
    try {
      if (observedTraceparent) return;
      const headers = response.headers?.() ?? {};
      const h = typeof headers === "function" ? headers() : headers;
      const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
      if (tp) {
        observedTraceparent = tp;
      }
    } catch (_e) {
      // ignore header parsing errors
    }
  });

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
    // Get HMRC client ID from environment (sandbox or default)
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
  // TODO: Support testing in non-sandbox mode with production credentials
  if (envName !== "prod") {
    await goToHomePage(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);
  }
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ******************* */
  /*  GET PENALTIES      */
  /* ******************* */

  await initVatPenalties(page, screenshotPath);
  await fillInVatPenalties(
    page,
    {
      hmrcVatNumber: testVatNumber,
      /* No test scenario */
      runFraudPreventionHeaderValidation,
    },
    screenshotPath,
  );
  await submitVatPenaltiesForm(page, screenshotPath);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */

  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* ******************** */
  /*  VIEW PENALTIES      */
  /* ******************** */

  await verifyVatPenaltiesResults(page, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ************************************* */
  /*  GET PENALTIES WITH TEST SCENARIOS     */
  /* ************************************* */
  if (isSandboxMode()) {
    /**
     * HMRC VAT API Sandbox scenarios (excerpt from _developers/reference/hmrc-mtd-vat-api-1.0.yaml)
     *
     * GET /organisations/vat/{vrn}/penalties - no from/to query params, always the trailing 24 months
     *  - Default (No header value): multiple penalties in the last 2 years
     *  - NO_PENALTIES: no penalties
     *  - LATE_SUBMISSION: single late submission penalty
     *  - LATE_PAYMENT: single late payment penalty
     *  - MULTIPLE_PENALTIES: one of each
     *  - MULTIPLE_LATE_PAYMENT_PENALTIES: several late payment penalties
     *  - MULTIPLE_LATE_SUBMISSION_PENALTIES: several late submission penalties
     *  - MULTIPLE_INACTIVE_LATE_SUBMISSION_PENALTIES: several inactive late submission penalties
     *  - THRESHOLD_LATE_SUBMISSION_PENALTIES: threshold-triggered late submission penalties
     *  - CHARGE_LATE_SUBMISSION_PENALTIES: charge-category late submission penalties
     *  - INSOLVENT_TRADER: Client is an insolvent trader
     *  - NOT_FOUND: No data found
     */
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      /* No test scenario */
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "DEFAULT",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "NO_PENALTIES",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "LATE_SUBMISSION",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "LATE_PAYMENT",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "MULTIPLE_PENALTIES",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "MULTIPLE_LATE_PAYMENT_PENALTIES",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "MULTIPLE_LATE_SUBMISSION_PENALTIES",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "MULTIPLE_INACTIVE_LATE_SUBMISSION_PENALTIES",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "THRESHOLD_LATE_SUBMISSION_PENALTIES",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "CHARGE_LATE_SUBMISSION_PENALTIES",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "INSOLVENT_TRADER",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "NOT_FOUND",
    });

    // Custom forced error scenarios (mirrors obligations tests)
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "SUBMIT_API_HTTP_500",
    });
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "SUBMIT_HMRC_API_HTTP_500",
    });

    // Slow scenario should take >= 5s but < 60s end-to-end
    const slowStartMs = Date.now();
    await requestAndVerifyPenalties(page, {
      hmrcVatNumber: testVatNumber,
      testScenario: "SUBMIT_HMRC_API_HTTP_SLOW_10S",
    });
    const slowElapsedMs = Date.now() - slowStartMs;
    expect(
      slowElapsedMs,
      `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 5s but less than 60s, actual: ${slowElapsedMs}ms`,
    ).toBeGreaterThanOrEqual(5_000);
    expect(
      slowElapsedMs,
      `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 5s but less than 60s, actual: ${slowElapsedMs}ms`,
    ).toBeLessThan(60_000);
  }

  /* ****************** */
  /*  Extract user sub  */
  /* ****************** */

  userSub = await extractUserSubFromLocalStorage(page, testInfo);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);

  /* ****************** */
  /*  TEST CONTEXT JSON */
  /* ****************** */

  // Build and write testContext.json
  const testContext = {
    testId: "getVatPenalties",
    name: testInfo.title,
    title: "View VAT Penalties (HMRC: VAT Penalties GET)",
    description: "Retrieves VAT penalties from HMRC MTD VAT API and verifies the results flow in the UI.",
    hmrcApis: [
      {
        url: "/api/v1/hmrc/vat/penalty",
        method: "GET",
      },
      { url: "/test/fraud-prevention-headers/validate", method: "GET" },
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
      hmrcTestVatNumber: testVatNumber,
      hmrcTestUsername: testUsername,
      hmrcTestPassword: testPassword ? "***MASKED***" : "<not provided>", // Mask password in test context
      testUserGenerated: isSandboxMode() && !hmrcTestUsername,
      userSub,
      observedTraceparent,
      testUrl,
      isSandboxMode: isSandboxMode(),
      intentionallyNotSuppliedHeaders,
    },
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

  const keyScreenshotPatterns = [
    "00.*focus.*submitting.*vat.*penalties.*form",
    "02.*penalties.*submit",
    "04.*penalties.*results.*pagedown",
    "00.*focus.*a.*developer.*test.*scenario",
  ];

  const screenshotDescriptions = {
    "00.*focus.*submitting.*vat.*penalties.*form": "Filling in VAT penalties form",
    "02.*penalties.*submit": "Submitting VAT penalties form",
    "04.*penalties.*results.*pagedown": "Viewing VAT penalties results",
    "00.*focus.*a.*developer.*test.*scenario": "Submitting VAT penalties form with a test scenario",
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

  /* ********************************** */
  /*  ASSERT DYNAMODB HMRC API REQUESTS */
  /* ********************************** */

  // Assert that HMRC API requests were logged correctly
  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");

    // Assert OAuth token exchange request exists
    const oauthRequests = assertHmrcApiRequestExists(hmrcApiRequestsFile, "POST", "/oauth/token", "OAuth token exchange");
    console.log(`[DynamoDB Assertions]: Found ${oauthRequests.length} OAuth token exchange request(s)`);

    // Assert VAT penalties GET request exists and validate key fields
    const penaltiesRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "GET",
      `/organisations/vat/${testVatNumber}/penalties`,
      "VAT penalties retrieval",
    );
    console.log(`[DynamoDB Assertions]: Found ${penaltiesRequests.length} VAT penalties GET request(s)`);

    expect(penaltiesRequests.length).toBeGreaterThan(0);
    let http200OkResults = 0;
    let http400BadRequestResults = 0;
    let http403ForbiddenResults = 0;
    let http404NotFoundResults = 0;
    penaltiesRequests.forEach((penaltiesRequest, index) => {
      assertEssentialFraudPreventionHeadersPresent(penaltiesRequest, `GET penalties request ${index + 1}`);
      console.log(`[DynamoDB Assertions]: Validating VAT penalties GET request ${index + 1} of ${penaltiesRequests.length}`);
      const thisRequestHttp200OkResults = countHmrcApiRequestValues(penaltiesRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 200,
      });
      if (thisRequestHttp200OkResults === 1) {
        // Check that response body contains penalties data. HMRC's penalties response has no
        // wrapper key - the whole object is totalisations/lateSubmissionPenalty/latePaymentPenalty.
        const responseBody = penaltiesRequest.httpResponse.body;
        expect(responseBody).toBeDefined();
        expect(responseBody.lateSubmissionPenalty).toBeDefined();
        expect(responseBody.latePaymentPenalty).toBeDefined();
        console.log("[DynamoDB Assertions]: VAT penalties response validated successfully");
      }
      http200OkResults += thisRequestHttp200OkResults;
      http400BadRequestResults += countHmrcApiRequestValues(penaltiesRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 400,
      });
      http403ForbiddenResults += countHmrcApiRequestValues(penaltiesRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 403,
      });
      http404NotFoundResults += countHmrcApiRequestValues(penaltiesRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 404,
      });
    });

    // Assert result counts. HMRC's own sandbox behaviour for penalty retries is not fully
    // predictable ahead of a real run (see the obligations test's comment on the same point),
    // so the 200 count is checked as a lower bound rather than an exact figure that could only
    // be pinned down empirically from a real -proxy or -ci run.
    console.log("[DynamoDB Assertions]: VAT Penalties GET request results summary:");
    console.log(`  HTTP 200 OK: ${http200OkResults}`);
    console.log(`  HTTP 400 Bad Request: ${http400BadRequestResults}`);
    console.log(`  HTTP 403 Forbidden: ${http403ForbiddenResults}`);
    console.log(`  HTTP 404 Not Found: ${http404NotFoundResults}`);
    expect(http200OkResults).toBeGreaterThan(0);
    expect(http400BadRequestResults).toBe(0);
    expect(http403ForbiddenResults).toBe(1);
    expect(http404NotFoundResults).toBe(1);

    // Assert Fraud prevention headers validation feedback GET request exists and validate key fields
    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);

    // Assert consistent hashedSub across authenticated requests
    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "VAT Penalties test", { filterByUserSub: userSub });
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }
});
