// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/postVatReturn.behaviour.test.js

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
import { ensureBundlePresent, ensureBundleViaPassApi, getTokensRemaining, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { completeVat, fillInVat, initSubmitVat, submitFormVat, verifyVatSubmission } from "./steps/behaviour-hmrc-vat-steps.js";
import { waitForSuccessOrError } from "./helpers/waitForSuccessOrError.js";
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

const screenshotPath = "target/behaviour-test-results/screenshots/submit-vat-post-behaviour-test";

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
// Use any available open obligation in sandbox mode, since the fixed 2017 period may already be fulfilled
const allowSandboxObligations = isSandboxMode();

const hmrcVatDueAmount = "1000.00";

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(1_200_000);
// 35 minutes for the timeout test
//test.setTimeout(10_800_000);

// Explicit, stable test ID for reporting
test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "postVatReturnBehaviour" });
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

/**
 * Re-grant the day-guest bundle via pass API if tokens are running low.
 * Each grant provides tokensGranted=3 fresh tokens; the server replaces the existing bundle.
 */
async function refreshBundleIfTokensLow(page, minTokens = 1) {
  const bundleId = "day-guest";
  const remaining = await getTokensRemaining(page, bundleId);
  if (remaining !== null && remaining > minTokens) return;
  console.log(`[token-refresh] Tokens remaining=${remaining} (min=${minTokens}), re-granting ${bundleId} via pass API...`);
  await ensureBundleViaPassApi(page, bundleId, screenshotPath, { testPass: true });
  const after = await getTokensRemaining(page, bundleId);
  console.log(`[token-refresh] Tokens after re-grant: ${after}`);
}

async function requestAndVerifySubmitReturn(page, { vatNumber, vatDue, testScenario, runFraudPreventionHeaderValidation, allowSandboxObligations }) {
  // Ensure sufficient tokens before each submission (day-guest has tokensGranted=3)
  await refreshBundleIfTokensLow(page);
  await initSubmitVat(page, screenshotPath);
  await fillInVat(page, vatNumber, undefined, vatDue, testScenario, runFraudPreventionHeaderValidation, screenshotPath, allowSandboxObligations);
  // Click submit. The HMRC access token may or may not be cached:
  // - Cached (first resubmission after success): client calls API directly
  // - Cleared (after a failed submission): client redirects to HMRC OAuth
  // Scope enforcement fetches the catalogue asynchronously before redirecting, and a
  // successful submission's own polling can run far longer than a short fixed wait,
  // so wait - with a long budget and fail-fast on a new error banner - for whichever
  // of the HMRC consent redirect or the VAT submission receipt appears first. A new
  // error banner is the expected terminal state for the sandbox failure scenarios
  // below, so catch it here rather than treat it as a test failure - completeVat()
  // and verifyVatSubmission() make the real assertions on the resulting page state.
  await page.locator("#submitBtn").click();
  await waitForSuccessOrError(page, {
    successSelector: "#appNameParagraph, #receiptDisplay",
    description: "HMRC consent page or VAT submission receipt",
    timeout: 1_000_000,
    screenshotPath,
  }).catch(() => {});
  const isHmrcAuthPage = await page
    .locator("#appNameParagraph")
    .isVisible()
    .catch(() => false);
  if (isHmrcAuthPage) {
    // Token was cleared by a previous failed submission - re-authenticate
    await acceptCookiesHmrc(page, screenshotPath);
    await goToHmrcAuth(page, screenshotPath);
    await initHmrcAuth(page, screenshotPath);
    await fillInHmrcAuth(page, currentTestUsername, currentTestPassword, screenshotPath);
    await submitHmrcAuth(page, screenshotPath);
    await grantPermissionHmrcAuth(page, screenshotPath);
  }
  await completeVat(page, baseUrl, testScenario, screenshotPath);
  await verifyVatSubmission(page, testScenario, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);
}

let currentTestUsername;
let currentTestPassword;

test("Click through: Submit VAT Return (single API focus: POST)", async ({ page }, testInfo) => {
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

  /* *************************** */
  /*  VAT RETURN SUBMIT (SIMPLE) */
  /* *************************** */
  // First submission: perform HMRC AUTH only this first time
  await initSubmitVat(page, screenshotPath);
  await fillInVat(page, testVatNumber, undefined, hmrcVatDueAmount, null, runFraudPreventionHeaderValidation, screenshotPath, allowSandboxObligations);
  await submitFormVat(page, screenshotPath);

  /* ************ */
  /* `HMRC AUTH   */
  /* ************ */
  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, currentTestUsername, currentTestPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* **************************** */
  /*  SUBMIT VAT RETURN: VERIFY   */
  /* **************************** */
  await completeVat(page, baseUrl, null, screenshotPath);
  await verifyVatSubmission(page, null, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ************************************* */
  /*  VAT RETURN SUBMIT: TEST SCENARIOS    */
  /* ************************************* */
  if (isSandboxMode()) {
    /**
     * HMRC VAT API Sandbox scenarios (excerpt from _developers/reference/hmrc-mtd-vat-api-1.0.yaml)
     *
     * POST /organisations/vat/{vrn}/returns
     *  - INVALID_VRN: Submission has not passed validation. Invalid parameter VAT registration number.
     *  - INVALID_PERIODKEY: Submission has not passed validation. Invalid parameter PERIODKEY.
     *  - INVALID_PAYLOAD: Submission has not passed validation. Invalid parameter Payload.
     *  - DUPLICATE_SUBMISSION: VAT has already been submitted for that period.
     *  - TAX_PERIOD_NOT_ENDED: Submission is for a tax period that has not ended.
     *  - INSOLVENT_TRADER: Client is an insolvent trader.
     */
    await requestAndVerifySubmitReturn(page, {
      vatNumber: testVatNumber,
      vatDue: hmrcVatDueAmount,
      testScenario: "INVALID_VRN",
      runFraudPreventionHeaderValidation,
      allowSandboxObligations,
    });
    await requestAndVerifySubmitReturn(page, {
      vatNumber: testVatNumber,
      vatDue: hmrcVatDueAmount,
      testScenario: "INVALID_PERIODKEY",
      runFraudPreventionHeaderValidation,
      allowSandboxObligations,
    });
    await requestAndVerifySubmitReturn(page, {
      vatNumber: testVatNumber,
      vatDue: hmrcVatDueAmount,
      testScenario: "INVALID_PAYLOAD",
      runFraudPreventionHeaderValidation,
      allowSandboxObligations,
    });
    await requestAndVerifySubmitReturn(page, {
      vatNumber: testVatNumber,
      vatDue: hmrcVatDueAmount,
      testScenario: "DUPLICATE_SUBMISSION",
      runFraudPreventionHeaderValidation,
      allowSandboxObligations,
    });
    await requestAndVerifySubmitReturn(page, {
      vatNumber: testVatNumber,
      vatDue: hmrcVatDueAmount,
      testScenario: "TAX_PERIOD_NOT_ENDED",
      runFraudPreventionHeaderValidation,
      allowSandboxObligations,
    });
    await requestAndVerifySubmitReturn(page, {
      vatNumber: testVatNumber,
      vatDue: hmrcVatDueAmount,
      testScenario: "INSOLVENT_TRADER",
      runFraudPreventionHeaderValidation,
      allowSandboxObligations,
    });

    // Custom forced error scenarios
    await requestAndVerifySubmitReturn(page, {
      vatNumber: testVatNumber,
      vatDue: hmrcVatDueAmount,
      testScenario: "SUBMIT_API_HTTP_500",
      runFraudPreventionHeaderValidation,
      allowSandboxObligations,
    });
    await requestAndVerifySubmitReturn(page, {
      vatNumber: testVatNumber,
      vatDue: hmrcVatDueAmount,
      testScenario: "SUBMIT_HMRC_API_HTTP_500",
      runFraudPreventionHeaderValidation,
      allowSandboxObligations,
    });
    // VERY EXPENSIVE: Triggers after 1 HTTP 503, this triggers 2 retries (visibility delay 320s), so 27+ minutes to dlq
    // with a client timeout  = 1_630_000; // 90s + 3 x 300s (Submit VAT) + 2 x 320s (visibility)
    // Set test timeout at top level
    // 35 minutes for the timeout test
    //test.setTimeout(10_800_000);
    // await requestAndVerifySubmitReturn(page, {
    //   vatNumber: testVatNumber,
    //   vatDue: hmrcVatDueAmount,
    //   testScenario: "SUBMIT_HMRC_API_HTTP_503",
    //   runFraudPreventionHeaderValidation,
    // });
    //
    // Slow scenario should take >= 10s but < 30s end-to-end
    // const slowStartMs = Date.now();
    // await requestAndVerifySubmitReturn(page, {
    //   vatNumber: testVatNumber,
    //   vatDue: hmrcVatDueAmount,
    //   testScenario: "SUBMIT_HMRC_API_HTTP_SLOW_10S",
    //   runFraudPreventionHeaderValidation,
    // });
    // const slowElapsedMs = Date.now() - slowStartMs;
    // expect(
    //   slowElapsedMs,
    //   `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 5s but less than 60s, actual: ${slowElapsedMs}ms`,
    // ).toBeGreaterThanOrEqual(5_000);
    // expect(
    //   slowElapsedMs,
    //   `Expected SUBMIT_HMRC_API_HTTP_SLOW_10S to take at least 5s but less than 60s, actual: ${slowElapsedMs}ms`,
    // ).toBeLessThan(60_000);
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
    testId: "postVatReturnBehaviour",
    name: testInfo.title,
    title: "Submit VAT Return (Single API Focus: POST)",
    description: "Submits VAT returns to HMRC with default and sandbox Gov-Test-Scenario variations.",
    hmrcApis: [
      { url: "/api/v1/hmrc/vat/return", method: "POST" },
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
    const postRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "POST",
      `/organisations/vat/${testVatNumber}/returns`,
      "VAT return submission",
    );
    expect(postRequests.length).toBeGreaterThan(0);
    postRequests.forEach((postRequest) => {
      assertEssentialFraudPreventionHeadersPresent(postRequest, `POST ${postRequest.url}`);
      assertHmrcApiRequestValues(postRequest, { "httpRequest.method": "POST" });
      // TODO: Deeper inspection of expected responses based on getVatObligations.behaviour.test.js
    });

    // Assert Fraud prevention headers validation feedback GET request exists and validate key fields
    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);

    // Pass userSub to filter to current test user's records (CI DynamoDB contains historical data)
    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "Submit VAT POST test", { filterByUserSub: userSub });
    expect(hashedSubs.length).toBeGreaterThan(0);
  }
});
