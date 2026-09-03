// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/getVatObligations.behaviour.test.js

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
  fillInVatObligations,
  initVatObligations,
  submitVatObligationsForm,
  verifyVatObligationsResults,
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
  assertHmrcApiRequestValues,
  assertConsistentHashedSub,
  assertEssentialFraudPreventionHeadersPresent,
  readDynamoDbExport,
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
//if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
//  dotenvConfigIfNotBlank({ path: ".env.test" });
//} else {
//  console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
//}
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/vat-obligations-behaviour-test";

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
const hmrcVatPeriodFromDate = "2025-02-01";
const hmrcVatPeriodToDate = "2026-01-10";
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
// 35 minutes for the timeout test
//test.setTimeout(10_800_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "getVatObligationsBehaviour" });
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

async function requestAndVerifyObligations(page, obligationsQuery) {
  await initVatObligations(page, screenshotPath);
  await fillInVatObligations(page, { ...obligationsQuery, runFraudPreventionHeaderValidation }, screenshotPath);
  await submitVatObligationsForm(page, screenshotPath);
  await verifyVatObligationsResults(page, obligationsQuery, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);
}

test("Click through: View VAT obligations from HMRC", async ({ page }, testInfo) => {
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
  await ensureBundlePresent(page, "Day pass", screenshotPath, { testPass: true });
  // TODO: Support testing in non-sandbox mode with production credentials
  if (envName !== "prod") {
    await goToHomePage(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);
  }
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ******************* */
  /*  GET OBLIGATIONS    */
  /* ******************* */

  await initVatObligations(page, screenshotPath);
  await fillInVatObligations(
    page,
    {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      /* No test scenario */
      runFraudPreventionHeaderValidation,
    },
    screenshotPath,
  );
  await submitVatObligationsForm(page, screenshotPath);

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
  /*  VIEW OBLIGATIONS    */
  /* ******************** */

  await verifyVatObligationsResults(page, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ************************************* */
  /*  GET OBLIGATIONS WITH TEST SCENARIOS  */
  /* ************************************* */
  if (isSandboxMode()) {
    /**
     * HMRC VAT API Sandbox scenarios (excerpt from _developers/reference/hmrc-mtd-vat-api-1.0.yaml)
     *
     * GET /organisations/vat/{vrn}/obligations
     *  - Default (No header value): Quarterly obligations and one is fulfilled
     *  - QUARTERLY_NONE_MET: Quarterly obligations and none are fulfilled
     *  - QUARTERLY_ONE_MET: Quarterly obligations and one is fulfilled
     *  - QUARTERLY_TWO_MET: Quarterly obligations and two are fulfilled
     *  - QUARTERLY_FOUR_MET: Quarterly obligations and four are fulfilled
     *  - MONTHLY_NONE_MET: Monthly obligations and none are fulfilled
     *  - MONTHLY_ONE_MET: Monthly obligations and one month is fulfilled
     *  - MONTHLY_TWO_MET: Monthly obligations and two months are fulfilled
     *  - MONTHLY_THREE_MET: Monthly obligations and three months are fulfilled
     *  - MONTHLY_OBS_01_OPEN: 2018 monthly obligations, month 01 is open
     *  - MONTHLY_OBS_06_OPEN: 2018 monthly obligations, month 06 is open; previous months fulfilled
     *  - MONTHLY_OBS_12_FULFILLED: 2018 monthly obligations; all fulfilled
     *  - QUARTERLY_OBS_01_OPEN: 2018 quarterly obligations, quarter 01 is open
     *  - QUARTERLY_OBS_02_OPEN: 2018 quarterly obligations, quarter 02 is open; previous quarters fulfilled
     *  - QUARTERLY_OBS_04_FULFILLED: 2018 quarterly obligations; all fulfilled
     *  - MULTIPLE_OPEN_MONTHLY: 2018 monthly obligations; two are open
     *  - MULTIPLE_OPEN_QUARTERLY: 2018 quarterly obligations; two are open
     *  - OBS_SPANS_MULTIPLE_YEARS: One obligation spans 2018-2019
     *  - INSOLVENT_TRADER: Client is an insolvent trader
     *  - NOT_FOUND: No data found
     */
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      /* No test scenario */
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_NONE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_ONE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_TWO_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_FOUR_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_NONE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_ONE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_TWO_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_THREE_MET",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_OBS_01_OPEN",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_OBS_06_OPEN",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MONTHLY_OBS_12_FULFILLED",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_OBS_01_OPEN",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_OBS_02_OPEN",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "QUARTERLY_OBS_04_FULFILLED",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MULTIPLE_OPEN_MONTHLY",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "MULTIPLE_OPEN_QUARTERLY",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "OBS_SPANS_MULTIPLE_YEARS",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "INSOLVENT_TRADER",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "NOT_FOUND",
    });

    // Custom forced error scenarios (mirrors POST tests)
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "SUBMIT_API_HTTP_500",
    });
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "SUBMIT_HMRC_API_HTTP_500",
    });
    // VERY EXPENSIVE: Triggers after 1 HTTP 503, this triggers 2 retries (visibility delay 140s), so 12+ minutes to dlq
    // with a client timeout 730_000 = 90s + 3 x 120s (Get VAT and Obligations) + 2 x 140s (visibility), minutes: 12+
    // Set test timeout at top level
    // 20 minutes for the timeout test
    //test.setTimeout(1_200_000);
    // await requestAndVerifyObligations(page, {
    //   hmrcVatNumber: testVatNumber,
    //   hmrcVatPeriodFromDate,
    //   hmrcVatPeriodToDate,
    //   /* All status values */
    //   testScenario: "SUBMIT_HMRC_API_HTTP_503",
    // });

    // Slow scenario should take >= 10s but < 30s end-to-end
    const slowStartMs = Date.now();
    await requestAndVerifyObligations(page, {
      hmrcVatNumber: testVatNumber,
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
      /* All status values */
      testScenario: "SUBMIT_HMRC_API_HTTP_SLOW_10S",
    });
    const slowElapsedMs = Date.now() - slowStartMs;
    expect(
      slowElapsedMs,
      `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 4.5s (10% tolerance below the 5s nominal delay) but less than 60s, actual: ${slowElapsedMs}ms`,
    ).toBeGreaterThanOrEqual(4_500);
    expect(
      slowElapsedMs,
      `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 4.5s (10% tolerance below the 5s nominal delay) but less than 60s, actual: ${slowElapsedMs}ms`,
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
    testId: "getVatObligations",
    name: testInfo.title,
    title: "View VAT Obligations (HMRC: VAT Obligations GET)",
    description: "Retrieves VAT obligations from HMRC MTD VAT API and verifies the results flow in the UI.",
    hmrcApis: [
      {
        url: "/api/v1/hmrc/vat/obligation",
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
      hmrcVatPeriodFromDate,
      hmrcVatPeriodToDate,
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
    "00.*focus.*submitting.*vat.*obligations.*form",
    "03.*obligations.*submit",
    "04.*obligations.*results.*pagedown",
    "00.*focus.*a.*developer.*test.*scenario",
  ];

  const screenshotDescriptions = {
    "00.*focus.*submitting.*vat.*obligations.*form": "Filling in VAT obligations form",
    "03.*obligations.*submit": "Submitting VAT obligations form",
    "04.*obligations.*results.*pagedown": "Viewing VAT obligations results",
    "00.*focus.*a.*developer.*test.*scenario": "Submitting VAT obligations form with a test scenario",
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

    // Assert VAT obligations GET request exists and validate key fields
    const obligationsRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "GET",
      `/organisations/vat/${testVatNumber}/obligations`,
      "VAT obligations retrieval",
    );
    console.log(`[DynamoDB Assertions]: Found ${obligationsRequests.length} VAT obligations GET request(s)`);

    expect(obligationsRequests.length).toBeGreaterThan(0);
    let http200OkResults = 0;
    let http400BadRequestResults = 0;
    let http403ForbiddenResults = 0;
    let http404NotFoundResults = 0;
    let http500ServerErrorResults = 0;
    let http503ServiceUnavailableResults = 0;
    obligationsRequests.forEach((obligationsRequest, index) => {
      assertEssentialFraudPreventionHeadersPresent(obligationsRequest, `GET obligations request ${index + 1}`);
      console.log(`[DynamoDB Assertions]: Validating VAT obligations GET request ${index + 1} of ${obligationsRequests.length}`);
      const thisRequestHttp200OkResults = countHmrcApiRequestValues(obligationsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 200,
      });
      if (thisRequestHttp200OkResults === 1) {
        //;console.log(
        //  `[DynamoDB Assertions]: Validating VAT obligations response body for HTTP 200: ${JSON.stringify(obligationsRequest.httpResponse)}`,
        //);
        // Check that response body contains obligations data
        const responseBody = obligationsRequest.httpResponse.body;
        expect(responseBody).toBeDefined();
        expect(responseBody.obligations).toBeDefined();
        console.log("[DynamoDB Assertions]: VAT obligations response validated successfully");
      }
      http200OkResults += thisRequestHttp200OkResults;
      http400BadRequestResults += countHmrcApiRequestValues(obligationsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 400,
      });
      http403ForbiddenResults += countHmrcApiRequestValues(obligationsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 403,
      });
      http404NotFoundResults += countHmrcApiRequestValues(obligationsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 404,
      });
      http500ServerErrorResults += countHmrcApiRequestValues(obligationsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 500,
      });
      http503ServiceUnavailableResults += countHmrcApiRequestValues(obligationsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 503,
      });
    });

    // Assert result counts
    console.log("[DynamoDB Assertions]: VAT Obligations GET request results summary:");
    console.log(`  HTTP 200 OK: ${http200OkResults}`);
    console.log(`  HTTP 400 Bad Request: ${http400BadRequestResults}`);
    console.log(`  HTTP 403 Forbidden: ${http403ForbiddenResults}`);
    console.log(`  HTTP 404 Not Found: ${http404NotFoundResults}`);
    console.log(`  HTTP 500 Server Error: ${http500ServerErrorResults}`);
    console.log(`  HTTP 503 Service Unavailable: ${http503ServiceUnavailableResults}`);
    expect(http200OkResults).toBe(19);
    expect(http400BadRequestResults).toBe(0);
    expect(http403ForbiddenResults).toBe(1);
    expect(http404NotFoundResults).toBe(1);
    // TODO: capture exception failures in dynamo: expect(http500ServerErrorResults).toBe(1);
    // TODO: capture exception failures in dynamo: expect(http503ServiceUnavailableResults).toBe(1);

    // Assert Fraud prevention headers validation feedback GET request exists and validate key fields
    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);

    // Assert consistent hashedSub across authenticated requests
    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "VAT Obligations test", { filterByUserSub: userSub });
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }
});
