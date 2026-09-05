// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/itsaBusinessDetails.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  getEnvVarAndLog,
  isSyntheticMode,
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
import { ensureBundleViaPassApi, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import {
  fillInItsaBusinessDetails,
  initItsaBusinessDetails,
  submitItsaBusinessDetailsForm,
  verifyItsaBusinessDetailsResults,
} from "./steps/behaviour-hmrc-itsa-steps.js";
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

const screenshotPath = "target/behaviour-test-results/screenshots/itsa-business-details-behaviour-test";

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
const hmrcTestNino = getEnvVarAndLog("hmrcTestNino", "TEST_HMRC_NINO", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
// Enable fraud prevention header validation in synthetic mode (required for HMRC API compliance testing)
const runFraudPreventionHeaderValidation = isSyntheticMode();
// The two forced HTTP 500 scenarios below are implemented only by our own HTTP simulator
// (app/http-simulator/scenarios/business-details.js), not by the real HMRC sandbox. isSyntheticMode()
// can't tell the two apart, so use TEST_HTTP_SIMULATOR (only .env.simulator sets it to "run") to gate
// the simulator-only scenarios out of any lane that talks to the real sandbox.
const usingHttpSimulator = getEnvVarAndLog("usingHttpSimulator", "TEST_HTTP_SIMULATOR", null) === "run";

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(1200_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "itsaBusinessDetailsBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = {
    ...originalEnv,
  };

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  deleteUserSubTxt(outputDir);
  deleteHashedUserSubTxt(outputDir);
  deleteTraceparentTxt(outputDir);

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
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

async function requestAndVerifyBusinessDetails(page, businessDetailsQuery) {
  await initItsaBusinessDetails(page, screenshotPath);
  await fillInItsaBusinessDetails(page, { ...businessDetailsQuery, runFraudPreventionHeaderValidation }, screenshotPath);
  await submitItsaBusinessDetailsForm(page, screenshotPath);
  await verifyItsaBusinessDetailsResults(page, businessDetailsQuery, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);
}

test("Click through: View ITSA Business Details from HMRC", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

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

  let testUsername = hmrcTestUsername;
  let testPassword = hmrcTestPassword;
  let testNino = hmrcTestNino;

  // HMRC obligations and identifiers are unpredictable - never hardcode a NINO. The run's own
  // test user, minted with both mtd-vat and mtd-income-tax, supplies one.
  if (!hmrcTestUsername) {
    console.log("[HMRC Test User] Synthetic mode detected without full credentials - creating test user");
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;

    if (!hmrcClientId) {
      throw new Error("HMRC_SANDBOX_CLIENT_ID or HMRC_CLIENT_ID is required to create test users");
    }
    if (!hmrcClientSecret) {
      throw new Error("HMRC_SANDBOX_CLIENT_SECRET or HMRC_CLIENT_SECRET is required to create test users");
    }

    console.log("[HMRC Test User] Creating HMRC sandbox test user with VAT and Income Tax enrolment using client credentials");

    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, {
      serviceNames: ["mtd-vat", "mtd-income-tax"],
    });

    testUsername = testUser.userId;
    testPassword = testUser.password;
    testNino = testUser.nino;

    if (!testNino) {
      throw new Error("HMRC test user creation did not return a nino for the mtd-income-tax service");
    }

    console.log("[HMRC Test User] Successfully created test user:");
    console.log(`  User ID: ${testUser.userId}`);
    console.log(`  User Full Name: ${testUser.userFullName}`);

    const repoRoot = path.resolve(process.cwd());
    saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);

    process.env.TEST_HMRC_USERNAME = testUsername;
    process.env.TEST_HMRC_PASSWORD = testPassword;
    process.env.TEST_HMRC_NINO = testNino;

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

  // The self-employed activity requires the resident-itsa bundle, which is normally an
  // on-subscription (Stripe) bundle - grant it directly via the admin pass API, as
  // generatePassActivity.behaviour.test.js does for resident-vat.
  await ensureBundleViaPassApi(page, "resident-itsa", screenshotPath, { testPass: true });
  if (envName !== "prod") {
    await goToHomePage(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);
  }
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ************************* */
  /*  GET BUSINESS DETAILS     */
  /* ************************* */

  await initItsaBusinessDetails(page, screenshotPath);
  await fillInItsaBusinessDetails(
    page,
    {
      hmrcNino: testNino,
      /* No test scenario */
      runFraudPreventionHeaderValidation,
    },
    screenshotPath,
  );
  await submitItsaBusinessDetailsForm(page, screenshotPath);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */

  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* ************************ */
  /*  VIEW BUSINESS DETAILS   */
  /* ************************ */

  await verifyItsaBusinessDetailsResults(page, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ***************************************** */
  /*  GET BUSINESS DETAILS WITH TEST SCENARIOS  */
  /* ***************************************** */
  if (isSyntheticMode()) {
    /**
     * HMRC Business Details v2.0 sandbox scenarios (see _developers/hmrc/ITSA_SPIKE.md)
     *
     * GET /individuals/business/details/{nino}/list
     *  - Default (No header value): a self-employment business
     *  - PROPERTY: a UK property business only
     *  - FOREIGN_PROPERTY: a foreign property business only
     *  - BUSINESS_AND_PROPERTY: self-employment and property
     *  - UNSPECIFIED: unspecified business type
     *  - STATEFUL: reflects the test user's actual businesses
     *  - NOT_FOUND: no data found
     */
    await requestAndVerifyBusinessDetails(page, { hmrcNino: testNino, testScenario: "PROPERTY" });
    await requestAndVerifyBusinessDetails(page, { hmrcNino: testNino, testScenario: "FOREIGN_PROPERTY" });
    await requestAndVerifyBusinessDetails(page, { hmrcNino: testNino, testScenario: "BUSINESS_AND_PROPERTY" });
    await requestAndVerifyBusinessDetails(page, { hmrcNino: testNino, testScenario: "UNSPECIFIED" });
    await requestAndVerifyBusinessDetails(page, { hmrcNino: testNino, testScenario: "STATEFUL" });
    await requestAndVerifyBusinessDetails(page, { hmrcNino: testNino, testScenario: "NOT_FOUND" });

    // Custom forced error scenarios are simulator-only (see the usingHttpSimulator comment
    // above) - the real HMRC sandbox rejects these Gov-Test-Scenario values with a 400, so
    // only run them against our own simulator.
    if (usingHttpSimulator) {
      await requestAndVerifyBusinessDetails(page, { hmrcNino: testNino, testScenario: "SUBMIT_API_HTTP_500" });
      await requestAndVerifyBusinessDetails(page, { hmrcNino: testNino, testScenario: "SUBMIT_HMRC_API_HTTP_500" });
    }
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

  const testContext = {
    testId: "itsaBusinessDetails",
    name: testInfo.title,
    title: "View ITSA Business Details (HMRC: Business Details GET)",
    description: "Retrieves the ITSA Business Details list from HMRC and verifies the results flow in the UI.",
    hmrcApis: [
      {
        url: "/api/v1/hmrc/itsa/business/details",
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
      hmrcTestUsername: testUsername,
      hmrcTestPassword: testPassword ? "***MASKED***" : "<not provided>",
      testUserGenerated: isSyntheticMode() && !hmrcTestUsername,
      userSub,
      observedTraceparent,
      testUrl,
      isSyntheticMode: isSyntheticMode(),
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

  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = [
    "00.*focus.*submitting.*business.*details.*form",
    "01.*business-details-submit",
    "02.*business-details-results",
    "00.*focus.*a.*developer.*test.*scenario",
  ];

  const screenshotDescriptions = {
    "00.*focus.*submitting.*business.*details.*form": "Filling in Business Details form",
    "01.*business-details-submit": "Submitting Business Details form",
    "02.*business-details-results": "Viewing Business Details results",
    "00.*focus.*a.*developer.*test.*scenario": "Submitting Business Details form with a test scenario",
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

  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    console.log("[DynamoDB Export]: Starting export of all tables...");
    try {
      const exportResults = await exportAllTables(
        outputDir,
        dynamoControl.endpoint,
        {
          bundleTableName,
          hmrcApiRequestsTableName,
          receiptsTableName,
        },
        userSub,
      );
      console.log("[DynamoDB Export]: Export completed:", exportResults);
    } catch (error) {
      console.error("[DynamoDB Export]: Failed to export tables:", error);
    }
  }

  /* ********************************** */
  /*  ASSERT DYNAMODB HMRC API REQUESTS */
  /* ********************************** */

  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");

    const oauthRequests = assertHmrcApiRequestExists(hmrcApiRequestsFile, "POST", "/oauth/token", "OAuth token exchange");
    console.log(`[DynamoDB Assertions]: Found ${oauthRequests.length} OAuth token exchange request(s)`);

    const businessDetailsRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "GET",
      `/individuals/business/details/${testNino}/list`,
      "ITSA business details retrieval",
    );
    console.log(`[DynamoDB Assertions]: Found ${businessDetailsRequests.length} ITSA business details GET request(s)`);

    expect(businessDetailsRequests.length).toBeGreaterThan(0);
    let http200OkResults = 0;
    let http404NotFoundResults = 0;
    businessDetailsRequests.forEach((businessDetailsRequest, index) => {
      assertEssentialFraudPreventionHeadersPresent(businessDetailsRequest, `GET business details request ${index + 1}`);
      const thisRequestHttp200OkResults = countHmrcApiRequestValues(businessDetailsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 200,
      });
      if (thisRequestHttp200OkResults === 1) {
        const responseBody = businessDetailsRequest.httpResponse.body;
        expect(responseBody).toBeDefined();
        expect(responseBody.listOfBusinesses).toBeDefined();
      }
      http200OkResults += thisRequestHttp200OkResults;
      http404NotFoundResults += countHmrcApiRequestValues(businessDetailsRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 404,
      });
    });

    console.log("[DynamoDB Assertions]: ITSA Business Details GET request results summary:");
    console.log(`  HTTP 200 OK: ${http200OkResults}`);
    console.log(`  HTTP 404 Not Found: ${http404NotFoundResults}`);
    // 6 = the initial retrieval and the 5 named spec scenarios that return business data
    // (PROPERTY, FOREIGN_PROPERTY, BUSINESS_AND_PROPERTY, UNSPECIFIED, STATEFUL). NOT_FOUND
    // returns a 404 instead. The two forced-500 scenarios never reach hmrcHttpGet, so they
    // never appear in this table at all.
    expect(http200OkResults).toBe(6);
    expect(http404NotFoundResults).toBe(1);

    await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);

    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "ITSA Business Details test", { filterByUserSub: userSub });
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }
});
