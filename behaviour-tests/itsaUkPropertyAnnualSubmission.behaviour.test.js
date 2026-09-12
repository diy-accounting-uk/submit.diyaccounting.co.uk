// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/itsaUkPropertyAnnualSubmission.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  createHmrcTestBusiness,
  getEnvVarAndLog,
  isSyntheticMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  saveHmrcTestUserToFiles,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundleViaPassApi } from "./steps/behaviour-bundle-steps.js";
import {
  fillInItsaBusinessDetails,
  fillInItsaUkPropertyAnnualEdits,
  fillInItsaUkPropertyAnnualLoad,
  initItsaBusinessDetails,
  initItsaUkPropertyAnnualSubmission,
  submitItsaBusinessDetailsForm,
  submitItsaUkPropertyAnnualLoadForm,
  submitItsaUkPropertyAnnualSaveForm,
  verifyItsaBusinessDetailsResults,
  verifyItsaUkPropertyAnnualLoadResults,
  verifyItsaUkPropertyAnnualSaveResults,
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

const screenshotPath = "target/behaviour-test-results/screenshots/itsa-uk-property-annual-submission-behaviour-test";

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

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(1200_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "itsaUkPropertyAnnualSubmissionBehaviour" });
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

/**
 * Read the businessId of the first uk-property row from the Business Details results table
 * already displayed on the page. HMRC business ids are unpredictable and never guessed - the
 * type column lets this pick a property business specifically, rather than whatever the first
 * row happens to be.
 */
async function readFirstUkPropertyBusinessId(page) {
  const rowLocator = page.locator("#businessDetailsTable table tbody tr");
  const rowCount = await rowLocator.count();
  for (let i = 0; i < rowCount; i++) {
    const row = rowLocator.nth(i);
    const typeOfBusiness = (await row.locator("td").nth(0).innerText()).trim();
    if (typeOfBusiness === "uk-property") {
      return (await row.locator("td").nth(2).innerText()).trim();
    }
  }
  return null;
}

test("Click through: Load and save a UK Property Annual Submission with HMRC", async ({ page }, testInfo) => {
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

  // HMRC business ids are unpredictable - never hardcode them. The run's own test user, minted
  // with both mtd-vat and mtd-income-tax, supplies a NINO; the businessId comes from a real
  // Business Details read further down.
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

    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, {
      serviceNames: ["mtd-vat", "mtd-income-tax"],
    });

    testUsername = testUser.userId;
    testPassword = testUser.password;
    testNino = testUser.nino;

    if (!testNino) {
      throw new Error("HMRC test user creation did not return a nino for the mtd-income-tax service");
    }

    // A business this run owns. Gov-Test-Scenario returns a canned one every run shares, so its
    // annual submission carries whatever adjustments the last run left behind - which is why this
    // suite failed with "Property income allowance must not be present alongside a private use
    // adjustment" against data it never set. This one starts empty.
    await createHmrcTestBusiness(hmrcClientId, hmrcClientSecret, testNino, {
      typeOfBusiness: "uk-property",
      taxYear: "2023-24",
      // User-restricted endpoints: the token is obtained as this user, through HMRC's authorize
      // page, so the run needs the credentials it just minted.
      userId: testUsername,
      password: testPassword,
      // DIY_SUBMIT_BASE_URL carries a trailing slash, and HMRC rejects the double slash that
      // makes with "redirect_uri is invalid". The app and itsa-sandbox-year.js both strip it.
      redirectUri: `${baseUrl.replace(/\/$/, "")}/activities/submitVatCallback.html`,
      outDir: screenshotPath,
    });

    const repoRoot = path.resolve(process.cwd());
    saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);

    process.env.TEST_HMRC_USERNAME = testUsername;
    process.env.TEST_HMRC_PASSWORD = testPassword;
    process.env.TEST_HMRC_NINO = testNino;
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

  await ensureBundleViaPassApi(page, "resident-itsa", screenshotPath, { testPass: true });
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ***************************************** */
  /*  GET BUSINESS DETAILS - NEEDED FOR businessId  */
  /* ***************************************** */

  await initItsaBusinessDetails(page, screenshotPath);
  // The uk-property business created for this test user above is what this read returns, so the
  // businessId below belongs to this run and carries no submissions it did not make.
  const businessDetailsQuery = { hmrcNino: testNino, runFraudPreventionHeaderValidation };
  await fillInItsaBusinessDetails(page, businessDetailsQuery, screenshotPath);
  await submitItsaBusinessDetailsForm(page, screenshotPath);

  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  await verifyItsaBusinessDetailsResults(page, screenshotPath);
  const businessId = await readFirstUkPropertyBusinessId(page);
  if (!businessId) {
    throw new Error("Business Details returned no uk-property business - cannot load an annual submission without a businessId");
  }
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ******************************* */
  /*  LOAD AND SAVE ANNUAL SUBMISSION */
  /* ******************************* */

  const taxYear = "2023-24";

  await initItsaUkPropertyAnnualSubmission(page, screenshotPath);
  await fillInItsaUkPropertyAnnualLoad(page, { hmrcNino: testNino, businessId, taxYear, runFraudPreventionHeaderValidation }, screenshotPath);
  await submitItsaUkPropertyAnnualLoadForm(page, screenshotPath);
  await verifyItsaUkPropertyAnnualLoadResults(page, screenshotPath);

  await fillInItsaUkPropertyAnnualEdits(page, { balancingCharge: 250, allowanceType: "propertyIncome", propertyIncomeAllowance: 1000 }, screenshotPath);
  await submitItsaUkPropertyAnnualSaveForm(page, screenshotPath);
  await verifyItsaUkPropertyAnnualSaveResults(page, screenshotPath);

  await goToHomePageUsingMainNav(page, screenshotPath);

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
    testId: "itsaUkPropertyAnnualSubmissionBehaviour",
    name: testInfo.title,
    title: "Load and Save a UK Property Annual Submission (HMRC: Property Business GET/PUT)",
    description: "Loads the year's annual submission for a UK property business, enters adjustments and allowances, and saves them to HMRC.",
    hmrcApis: [
      { url: "/api/v1/hmrc/itsa/business/details", method: "GET" },
      { url: "/api/v1/hmrc/itsa/uk-property/annual", method: "GET" },
      { url: "/api/v1/hmrc/itsa/uk-property/annual", method: "PUT" },
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
      businessId,
      taxYear,
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

    const putRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "PUT",
      `/individuals/business/property/uk/${testNino}/${businessId}/annual/${taxYear}`,
      "ITSA UK property annual submission",
    );
    console.log(`[DynamoDB Assertions]: Found ${putRequests.length} ITSA UK property annual PUT request(s)`);

    expect(putRequests.length).toBeGreaterThan(0);
    putRequests.forEach((putRequest, index) => {
      assertEssentialFraudPreventionHeadersPresent(putRequest, `PUT UK property annual request ${index + 1}`);
    });

    await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);

    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "ITSA UK Property Annual Submission test", {
      filterByUserSub: userSub,
    });
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }
});
