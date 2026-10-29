// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/itsaForeignPropertyAnnualSubmission.behaviour.test.js

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
  fillInItsaForeignPropertyAdjustment,
  fillInItsaForeignPropertyAnnualEdits,
  fillInItsaForeignPropertyAnnualLoad,
  initItsaBusinessDetails,
  initItsaForeignPropertyAdjustments,
  initItsaForeignPropertyAnnualSubmission,
  requestItsaForeignPropertyYearEndSummary,
  submitItsaBusinessDetailsForm,
  submitItsaForeignPropertyAdjustment,
  submitItsaForeignPropertyAnnualLoadForm,
  submitItsaForeignPropertyAnnualSaveForm,
  verifyItsaBusinessDetailsResults,
  verifyItsaForeignPropertyAdjustmentResults,
  verifyItsaForeignPropertyAnnualLoadResults,
  verifyItsaForeignPropertyAnnualSaveResults,
  verifyItsaForeignPropertyYearEndSummary,
} from "./steps/behaviour-hmrc-itsa-steps.js";
import {
  acceptCookiesHmrc,
  completeHmrcReauthIfPresented,
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
  countHmrcApiRequestValues,
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

const screenshotPath = "target/behaviour-test-results/screenshots/itsa-foreign-property-annual-submission-behaviour-test";

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
  testInfo.annotations.push({ type: "test-id", description: "itsaForeignPropertyAnnualSubmissionBehaviour" });
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

test("Click through: Load and save a Foreign Property Annual Submission with HMRC", async ({ page }, testInfo) => {
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

  let createdBusinessId = null;
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
    // annual submission carries whatever adjustments the last run left behind. This one starts empty.
    createdBusinessId = await createHmrcTestBusiness(hmrcClientId, hmrcClientSecret, testNino, {
      typeOfBusiness: "foreign-property",
      taxYear: "2025-26",
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

  await ensureBundleViaPassApi(page, "resident", screenshotPath, { testPass: true });
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ***************************************** */
  /*  GET BUSINESS DETAILS - NEEDED FOR businessId  */
  /* ***************************************** */

  await initItsaBusinessDetails(page, screenshotPath);
  // The foreign-property business created for this test user above is what this read returns, so the
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
  // HMRC's sandbox Business Details API serves canned data: it returns XBIS12345678901 whatever
  // the nino, and never the business the Test Support API just created. So the page read below is
  // journey coverage, and the businessId this run files against is the one it was given at
  // creation - the only id that names a business this run actually owns.
  const businessId = createdBusinessId;
  if (!businessId) {
    throw new Error("No business was created for this run - cannot load an annual submission without a businessId");
  }
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ******************************* */
  /*  LOAD AND SAVE ANNUAL SUBMISSION */
  /* ******************************* */

  const taxYear = "2025-26";
  let firstCountry;
  let secondCountry;

  await initItsaForeignPropertyAnnualSubmission(page, screenshotPath);
  await fillInItsaForeignPropertyAnnualLoad(
    page,
    { hmrcNino: testNino, businessId, taxYear, runFraudPreventionHeaderValidation },
    screenshotPath,
  );
  await submitItsaForeignPropertyAnnualLoadForm(page, screenshotPath);
  // The annual submission needs write:self-assessment; Business Details above only granted
  // read:self-assessment, so the Load click just cleared that token and asked HMRC for a wider one.
  await completeHmrcReauthIfPresented(page, testUsername, testPassword, screenshotPath);
  await verifyItsaForeignPropertyAnnualLoadResults(page, screenshotPath);

  // The sandbox may return a canned submission that already holds a country, and HMRC refuses a
  // repeated country, so the two countries added here are the first two the load did not fill in.
  const heldCountries = await page.locator("#annualEntries select").evaluateAll((selects) => selects.map((select) => select.value));
  [firstCountry, secondCountry] = ["FRA", "ESP", "DEU", "ITA"].filter((code) => !heldCountries.includes(code));

  await fillInItsaForeignPropertyAnnualEdits(
    page,
    {
      countryCode: firstCountry,
      balancingCharge: 250,
      allowanceType: "itemised",
      annualInvestmentAllowance: 500,
      sbaClaim: {
        amount: 3545.12,
        qualifyingDate: "2020-03-29",
        qualifyingAmountExpenditure: 3453.34,
        buildingName: "Blue Oaks",
        buildingNumber: "12",
        postcode: "TF3 4GH",
      },
    },
    screenshotPath,
  );
  await fillInItsaForeignPropertyAnnualEdits(
    page,
    { countryCode: secondCountry, allowanceType: "propertyIncome", propertyIncomeAllowance: 1000 },
    screenshotPath,
  );
  await submitItsaForeignPropertyAnnualSaveForm(page, screenshotPath);
  await verifyItsaForeignPropertyAnnualSaveResults(page, screenshotPath);

  /* ********************************************************* */
  /*  YEAR-END SUMMARY: TRIGGER, VIEW AND SEND AN ADJUSTMENT   */
  /* ********************************************************* */

  // The summary of the year just saved is requested for the foreign property business, read back
  // as one table for each country, and adjusted in the first country.
  const adjustedRent = 1500;
  const adjustedRunningCosts = 120;
  await initItsaForeignPropertyAdjustments(page, screenshotPath);
  await requestItsaForeignPropertyYearEndSummary(
    page,
    {
      hmrcNino: testNino,
      businessId,
      taxYear,
      accountingPeriodStartDate: "2025-04-06",
      accountingPeriodEndDate: "2026-04-05",
      runFraudPreventionHeaderValidation,
    },
    screenshotPath,
  );
  await verifyItsaForeignPropertyYearEndSummary(page, screenshotPath);
  await fillInItsaForeignPropertyAdjustment(
    page,
    0,
    { totalRentsReceived: adjustedRent, premisesRunningCosts: adjustedRunningCosts },
    screenshotPath,
  );
  await submitItsaForeignPropertyAdjustment(page, screenshotPath);
  await verifyItsaForeignPropertyAdjustmentResults(page, screenshotPath);

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
    testId: "itsaForeignPropertyAnnualSubmissionBehaviour",
    name: testInfo.title,
    title: "Load and Save a Foreign Property Annual Submission (HMRC: Property Business GET/PUT)",
    description:
      "Loads the year's annual submission for a foreign property business, enters adjustments and allowances for two countries, and saves them to HMRC.",
    hmrcApis: [
      { url: "/api/v1/hmrc/itsa/business/details", method: "GET" },
      { url: "/api/v1/hmrc/itsa/foreign-property/annual", method: "GET" },
      { url: "/api/v1/hmrc/itsa/foreign-property/annual", method: "PUT" },
      { url: "/api/v1/hmrc/itsa/bsas/trigger", method: "POST" },
      { url: "/api/v1/hmrc/itsa/bsas/foreign-property", method: "GET" },
      { url: "/api/v1/hmrc/itsa/bsas/foreign-property/adjust", method: "POST" },
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
      `/individuals/business/property/foreign/${testNino}/${businessId}/annual/${taxYear}`,
      "ITSA foreign property annual submission",
    );
    console.log(`[DynamoDB Assertions]: Found ${putRequests.length} ITSA foreign property annual PUT request(s)`);

    expect(putRequests.length).toBeGreaterThan(0);
    putRequests.forEach((putRequest, index) => {
      assertEssentialFraudPreventionHeadersPresent(putRequest, `PUT foreign property annual request ${index + 1}`);
    });

    // The body carries the two countries the form added, each with its own adjustments and allowances.
    const sentEntries = Object.fromEntries(
      JSON.parse(putRequests[0].httpRequest.body).foreignProperty.map((entry) => [entry.countryCode, entry]),
    );
    expect(sentEntries[firstCountry].adjustments.balancingCharge).toBe(250);
    expect(sentEntries[firstCountry].allowances.annualInvestmentAllowance).toBe(500);
    expect(sentEntries[firstCountry].allowances.structuredBuildingAllowance).toHaveLength(1);
    expect(sentEntries[firstCountry].allowances.structuredBuildingAllowance[0].building.postcode).toBe("TF3 4GH");
    expect(sentEntries[secondCountry].allowances).toEqual({ propertyIncomeAllowance: 1000 });

    const bsasPath = `/individuals/self-assessment/adjustable-summary/${testNino}`;
    const triggerRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "POST",
      `${bsasPath}/trigger`,
      "ITSA foreign property BSAS trigger",
    );
    assertEssentialFraudPreventionHeadersPresent(triggerRequests[0], "POST BSAS trigger request");
    const triggerBody = JSON.parse(triggerRequests[0].httpRequest.body);
    expect(triggerBody.typeOfBusiness).toBe("foreign-property");
    expect(triggerBody.businessId).toBe(businessId);
    const calculationId = triggerRequests[0].httpResponse.body.calculationId;
    expect(calculationId).toBeTruthy();

    const summaryRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "GET",
      `${bsasPath}/foreign-property/${calculationId}/${taxYear}`,
      "ITSA foreign property BSAS retrieve",
    );
    assertEssentialFraudPreventionHeadersPresent(summaryRequests[0], "GET foreign property BSAS request");

    const adjustRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "POST",
      `${bsasPath}/foreign-property/${calculationId}/adjust/${taxYear}`,
      "ITSA foreign property BSAS adjustment",
    );
    expect(adjustRequests).toHaveLength(1);
    assertEssentialFraudPreventionHeadersPresent(adjustRequests[0], "POST foreign property BSAS adjustment request");
    const adjustBody = JSON.parse(adjustRequests[0].httpRequest.body);
    const adjustedCountry = adjustBody.foreignProperty.countryLevelDetail[0];
    expect(adjustedCountry.countryCode).toBeTruthy();
    expect(adjustedCountry.income.totalRentsReceived).toBe(adjustedRent);
    expect(adjustedCountry.expenses.premisesRunningCosts).toBe(adjustedRunningCosts);
    expect(adjustBody.foreignProperty.zeroAdjustments).toBeUndefined();
    expect(countHmrcApiRequestValues(adjustRequests[0], { "httpResponse.statusCode": 200 })).toBe(1);

    if (runFraudPreventionHeaderValidation) {
      await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);
    }

    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "ITSA Foreign Property Annual Submission test", {
      filterByUserSub: userSub,
    });
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }
});
