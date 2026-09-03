// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/getVatReturn.behaviour.test.js

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
  completeVat,
  fillInVat,
  initSubmitVat,
  submitFormVat,
  verifyVatSubmission,
  fillInViewVatReturn,
  initViewVatReturn,
  submitViewVatReturnForm,
  verifyViewVatReturnResults,
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
  assertConsistentHashedSub,
  assertEssentialFraudPreventionHeadersPresent,
  assertFraudPreventionHeaders,
  assertHmrcApiRequestExists,
  assertHmrcApiRequestValues,
  intentionallyNotSuppliedHeaders,
  readDynamoDbExport,
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
dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/view-vat-return-get-behaviour-test";

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
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
// Enable fraud prevention header validation in sandbox mode (required for HMRC API compliance testing)
const runFraudPreventionHeaderValidation = isSandboxMode();

const hmrcVatDueAmount = "1000.00";

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;
let currentTestUsername;
let currentTestPassword;

test.setTimeout(1_200_000);
// 35 minutes for the timeout test
//test.setTimeout(10_800_000);

// Explicit, stable test ID for reporting
test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "getVatReturnBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  // Start services
  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  deleteUserSubTxt(outputDir);
  deleteHashedUserSubTxt(outputDir);
  deleteTraceparentTxt(outputDir);
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
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

async function requestAndVerifyViewReturn(page, { vrn, testScenario }) {
  await initViewVatReturn(page, screenshotPath);
  await fillInViewVatReturn(page, vrn, undefined, testScenario, runFraudPreventionHeaderValidation, screenshotPath);
  await submitViewVatReturnForm(page, screenshotPath);
  await verifyViewVatReturnResults(page, testScenario, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);
}

test("Click through: View VAT Return (single API focus: GET)", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");

  page.on("response", (response) => {
    try {
      if (observedTraceparent) return;
      const headers = response.headers?.() ?? {};
      const h = typeof headers === "function" ? headers() : headers;
      const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
      if (tp) observedTraceparent = tp;
    } catch {}
  });

  // HMRC TEST USER CREATION
  currentTestUsername = hmrcTestUsername;
  currentTestPassword = hmrcTestPassword;
  let testVatNumber = hmrcTestVatNumber;
  if (!hmrcTestUsername) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    if (!hmrcClientId || !hmrcClientSecret) {
      throw new Error("HMRC_SANDBOX_CLIENT_ID/SECRET (or HMRC_CLIENT_ID/SECRET) required to create test users");
    }
    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
    currentTestUsername = testUser.userId;
    currentTestPassword = testUser.password;
    testVatNumber = testUser.vrn;
    const repoRoot = path.resolve(process.cwd());
    const outputDir = testInfo.outputPath("");
    saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);
    process.env.TEST_HMRC_USERNAME = currentTestUsername;
    process.env.TEST_HMRC_PASSWORD = currentTestPassword;
    process.env.TEST_HMRC_VAT_NUMBER = testVatNumber;
  }

  // HOME + LOGIN + BUNDLES
  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
  await goToBundlesPage(page, screenshotPath);
  await ensureBundlePresent(page, "Day pass", screenshotPath, { testPass: true });
  if (envName !== "prod") {
    await goToHomePage(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);
  }
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ********************************************** */
  /*  ENSURE A VAT RETURN EXISTS (single submission) */
  /* ********************************************** */

  await initSubmitVat(page, screenshotPath);
  // Pass allowSandboxObligations=true to use any available open obligation in sandbox/simulator mode
  await fillInVat(page, testVatNumber, undefined, hmrcVatDueAmount, null, runFraudPreventionHeaderValidation, screenshotPath, true);
  await submitFormVat(page, screenshotPath);
  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, currentTestUsername, currentTestPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);
  await completeVat(page, baseUrl, null, screenshotPath);
  await verifyVatSubmission(page, null, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* **************** */
  /*  VIEW VAT RETURN */
  /* **************** */

  await requestAndVerifyViewReturn(page, { vrn: testVatNumber });

  /* ************************************* */
  /*  VIEW VAT RETURN: TEST SCENARIOS      */
  /* ************************************* */

  if (isSandboxMode()) {
    /**
     * HMRC VAT API Sandbox scenarios (excerpt from _developers/reference/hmrc-mtd-vat-api-1.0.yaml)
     *
     * GET /organisations/vat/{vrn}/returns/{periodKey}
     *  - DATE_RANGE_TOO_LARGE: The date of the requested return cannot be further than four years from the current date.
     *  - INSOLVENT_TRADER: Client is an insolvent trader.
     */
    await requestAndVerifyViewReturn(page, { vrn: testVatNumber, testScenario: "DATE_RANGE_TOO_LARGE" });
    await requestAndVerifyViewReturn(page, { vrn: testVatNumber, testScenario: "INSOLVENT_TRADER" });

    // Custom forced error scenarios (mirrors POST tests)
    await requestAndVerifyViewReturn(page, {
      vrn: testVatNumber,
      testScenario: "SUBMIT_API_HTTP_500",
    });
    // TODO: Fix, fails like this:
    // Expected pattern: /failed|error|not found/
    // Received string:  "retrieving vat return...
    // ×
    // still processing...
    // ×"
    // await requestAndVerifyViewReturn(page, {
    //   vrn: testVatNumber,
    //   testScenario: "SUBMIT_HMRC_API_HTTP_500",
    // });
    // VERY EXPENSIVE: Triggers after 1 HTTP 503, this triggers 2 retries (visibility delay 140s), so 12+ minutes to dlq
    // with a client timeout 730_000 = 90s + 3 x 120s (Get VAT and Obligations) + 2 x 140s (visibility), minutes: 12+
    // Set test timeout at top level
    // 20 minutes for the timeout test
    //test.setTimeout(1_200_000);
    // await requestAndVerifyViewReturn(page, {
    //   vrn: testVatNumber,
    //   testScenario: "SUBMIT_HMRC_API_HTTP_503",
    // });
    //
    // TODO: Fix, fails like this:
    //     > 709 |       await page.waitForSelector("#returnResults", { state: "visible", timeout: 450_000 });
    // Slow scenario should take >= 10s but < 30s end-to-end
    //   const slowStartMs = Date.now();
    //   await requestAndVerifyViewReturn(page, {
    //     vrn: testVatNumber,
    //     testScenario: "SUBMIT_HMRC_API_HTTP_SLOW_10S",
    //   });
    //   const slowElapsedMs = Date.now() - slowStartMs;
    //   expect(
    //     slowElapsedMs,
    //     `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 5s but less than 60s, actual: ${slowElapsedMs}ms`,
    //   ).toBeGreaterThanOrEqual(5_000);
    //   expect(
    //     slowElapsedMs,
    //     `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 5s but less than 60s, actual: ${slowElapsedMs}ms`,
    //   ).toBeLessThan(60_000);
  }

  /* ****************** */
  /*  Extract user sub  */
  /* ****************** */

  userSub = await extractUserSubFromLocalStorage(page, testInfo);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);

  // Build testContext.json
  const testContext = {
    testId: "getVatReturnBehaviour",
    name: testInfo.title,
    title: "View VAT Return (Single API Focus: GET)",
    description: "Retrieves VAT return data from HMRC with default and sandbox Gov-Test-Scenario variations.",
    hmrcApis: [
      { url: "/api/v1/hmrc/vat/return", method: "POST" },
      { url: "/api/v1/hmrc/vat/return/:periodKey", method: "GET" },
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
      hmrcVatDueAmount,
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
  } catch {}

  /* ****************** */
  /*  FIGURES (SCREENSHOTS) */
  /* ****************** */

  // Select and copy key screenshots, then generate figures.json
  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = [
    "10.*fill.*in.*submission.*pagedown",
    "02.*complete.*vat.*receipt",
    "01.*submit.*hmrc.*auth",
    "06.*view.*vat.*fill.*in.*filled",
    "04.*view.*vat.*return.*results",
  ];

  const screenshotDescriptions = {
    "10.*fill.*in.*submission.*pagedown": "VAT return form filled out with test data including VAT number, period key, and amount due",
    "02.*complete.*vat.*receipt": "Successful VAT return submission confirmation showing receipt details from HMRC",
    "01.*submit.*hmrc.*auth": "HMRC authorization page where user authenticates with HMRC",
    "06.*view.*vat.*fill.*in.*filled": "VAT query form filled out with test data including VAT number and period key",
    "04.*view.*vat.*return.*results": "Retrieved VAT return data showing previously submitted values",
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
    // Use regex pattern since periodKey is resolved dynamically from sandbox obligations
    const vatReturnUrlPattern = new RegExp(`/organisations/vat/${testVatNumber}/returns/\\w+`);
    const vatGetRequests = assertHmrcApiRequestExists(hmrcApiRequestsFile, "GET", vatReturnUrlPattern, "VAT return retrieval");
    expect(vatGetRequests.length).toBeGreaterThan(0);
    vatGetRequests.forEach((vatGetRequest) => {
      assertEssentialFraudPreventionHeadersPresent(vatGetRequest, `GET ${vatGetRequest.url}`);
      assertHmrcApiRequestValues(vatGetRequest, { "httpRequest.method": "GET" });
      // TODO: Deeper inspection of expected responses based on getVatObligations.behaviour.test.js
    });

    // Assert Fraud prevention headers validation feedback GET request exists and validate key fields
    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);

    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "View VAT GET test", { filterByUserSub: userSub });
    expect(hashedSubs.length).toBeGreaterThan(0);
  }
});
