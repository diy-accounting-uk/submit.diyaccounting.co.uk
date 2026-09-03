// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/submitVat.behaviour.test.js

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
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  saveHmrcTestUserToFiles,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import {
  ensureBundlePresent,
  getTokensRemaining,
  goToBundlesPage,
  goToUsagePage,
  verifyTokenSources,
  verifyTokenConsumption,
} from "./steps/behaviour-bundle-steps.js";
import { goToReceiptsPageUsingMainNav, verifyAtLeastOneClickableReceipt } from "./steps/behaviour-hmrc-receipts-steps.js";
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
  clickObligationSubmitReturn,
  clickObligationViewReturn,
  completeVat,
  fillInVat,
  fillInVatObligations,
  fillInViewVatReturn,
  initSubmitVat,
  initVatObligations,
  initViewVatReturn,
  submitFormVat,
  submitVatObligationsForm,
  submitViewVatReturnForm,
  verifyVatObligationsResults,
  verifyVatSubmission,
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
import {
  appendTraceparentTxt,
  appendUserSubTxt,
  appendHashedUserSubTxt,
  deleteTraceparentTxt,
  deleteUserSubTxt,
  deleteHashedUserSubTxt,
  extractUserSubFromLocalStorage,
} from "./helpers/fileHelper.js";
// if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
//   dotenvConfigIfNotBlank({ path: ".env.test" });
// } else {
//   console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
// }
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/submitVat-behaviour-test";

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
// Enable fraud prevention header validation in sandbox mode (required for HMRC API compliance testing)
const runFraudPreventionHeaderValidation = isSandboxMode();
// Enable sandbox obligation fallback - allows test to use any available open obligation if dates don't match
const allowSandboxObligations = isSandboxMode();

const hmrcVatDueAmount = "1000.00";
// Period keys are unpredictable per HMRC documentation - they cannot be calculated, only validated.
// Tests should capture the actual periodKey from the response and use that for subsequent calls.
// Format validation: /^[0-9]{2}[A-Z][0-9A-Z]$/ (e.g., 18A1, 24B3, 17AC)
const periodKeyFormatRegex = /^[0-9]{2}[A-Z][0-9A-Z]$/;

let mockOAuth2Process;
let s3Endpoint;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;
// Capture the actual resolved period key from the submission response
let resolvedPeriodKey = null;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "submitVatBehaviour" });
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

test("Click through: Submit a VAT return to HMRC", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  // Add console logging to capture browser messages
  addOnPageLogging(page);

  // ---------- Test artefacts (video-adjacent) ----------
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

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

      // Capture periodKey from VAT return submission response (201) or retrieval (200)
      // The backend returns the resolved periodKey at data.periodKey level
      if (!resolvedPeriodKey && url.includes("/api/v1/hmrc/vat/return") && (response.status() === 200 || response.status() === 201)) {
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

  /* ************************ */
  /*  PRIVACY & TERMS CHECKS  */
  /* ************************ */

  // Verify privacy and terms links are present on home page
  const privacyLink = page.locator('footer a[href="privacy.html"]');
  await expect(privacyLink).toBeVisible();
  console.log("✅ [Compliance] Privacy link visible on home page");

  const termsLink = page.locator('footer a[href="terms.html"]');
  await expect(termsLink).toBeVisible();
  console.log("✅ [Compliance] Terms link visible on home page");

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
  if (isSandboxMode()) {
    await ensureBundlePresent(page, "Day pass", screenshotPath, { testPass: true });
  }
  // TODO: Support testing in non-sandbox mode with production credentials
  // if (envName !== "prod") {
  //   await ensureBundlePresent(page, "Guest", screenshotPath);
  //   await goToHomePage(page, screenshotPath);
  //   await goToBundlesPage(page, screenshotPath);
  // }
  await goToHomePage(page, screenshotPath);

  /* ************************ */
  /*  TOKEN BALANCE (BEFORE)  */
  /* ************************ */

  const tokensBefore = isSandboxMode() ? await getTokensRemaining(page, "day-guest") : null;
  if (tokensBefore !== null) {
    console.log(`[Token check] Tokens before submission: ${tokensBefore}`);
    expect(tokensBefore).toBeGreaterThan(0);
  }

  /* ******************************** */
  /*  OBLIGATIONS (1st — read:vat)    */
  /* ******************************** */

  // Query obligations first — triggers HMRC auth for read:vat scope
  await initVatObligations(page, screenshotPath);
  await fillInVatObligations(page, { hmrcVatNumber: testVatNumber, hmrcVatPeriodFromDate, hmrcVatPeriodToDate }, screenshotPath);
  await submitVatObligationsForm(page, screenshotPath);

  /* ******************************************** */
  /*  HMRC AUTH (1st — read:vat for obligations)  */
  /* ******************************************** */

  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* ************************** */
  /*  VIEW OBLIGATIONS RESULTS  */
  /* ************************** */

  // After HMRC auth callback, obligations page auto-retrieves via continueObligationsRetrieval()
  await verifyVatObligationsResults(page, screenshotPath);

  /* ********************************** */
  /*  CLICK OPEN OBLIGATION → SUBMIT    */
  /* ********************************** */

  const obligationResult = await clickObligationSubmitReturn(page, screenshotPath);
  let submitPeriodDates;
  if (obligationResult.navigated) {
    submitPeriodDates = { periodStart: obligationResult.periodStart, periodEnd: obligationResult.periodEnd };
    console.log(`[Obligation→Submit] Using obligation period: ${submitPeriodDates.periodStart} to ${submitPeriodDates.periodEnd}`);
  } else {
    // Fallback: navigate via home page activity button
    console.log("[Obligation→Submit] No open obligation found, falling back to home page navigation");
    await goToHomePageUsingMainNav(page, screenshotPath);
    await initSubmitVat(page, screenshotPath);
    submitPeriodDates = undefined; // use defaults
  }

  /* *********** */
  /*  SUBMIT VAT */
  /* *********** */

  await fillInVat(
    page,
    testVatNumber,
    submitPeriodDates,
    hmrcVatDueAmount,
    null,
    runFraudPreventionHeaderValidation,
    screenshotPath,
    allowSandboxObligations,
  );
  await submitFormVat(page, screenshotPath);

  /* ******************************************************** */
  /*  HMRC AUTH (2nd — scope upgrade to write:vat read:vat)   */
  /* ******************************************************** */

  // The submit page detects read:vat-only token is insufficient for write:vat read:vat,
  // clears the token and redirects to HMRC OAuth for the broader scope
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  /* ******************* */
  /*  SUBMIT VAT RESULTS */
  /* ******************* */

  await completeVat(page, baseUrl, null, screenshotPath);
  await verifyVatSubmission(page, null, screenshotPath);

  /* *********************** */
  /*  TOKEN BALANCE (AFTER)  */
  /* *********************** */

  if (tokensBefore !== null) {
    const tokensAfter = await getTokensRemaining(page, "day-guest");
    console.log(`[Token check] Tokens after submission: ${tokensAfter}`);
    expect(tokensAfter).toBe(tokensBefore - 1);
  }

  /* ********** */
  /*  RECEIPTS  */
  /* ********** */

  await goToReceiptsPageUsingMainNav(page, screenshotPath);
  await verifyAtLeastOneClickableReceipt(page, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ************************************************ */
  /*  OBLIGATIONS (2nd — token reuse, no HMRC auth)   */
  /* ************************************************ */

  // Token now has write:vat read:vat scope — covers read:vat requirement
  await initVatObligations(page, screenshotPath);
  await fillInVatObligations(page, { hmrcVatNumber: testVatNumber, hmrcVatPeriodFromDate, hmrcVatPeriodToDate }, screenshotPath);
  await submitVatObligationsForm(page, screenshotPath);

  // No HMRC auth needed — existing token scope is sufficient
  await verifyVatObligationsResults(page, screenshotPath);

  /* *********************************** */
  /*  CLICK FULFILLED OBLIGATION → VIEW  */
  /* *********************************** */

  const viewResult = await clickObligationViewReturn(page, screenshotPath);
  if (viewResult.autoSubmitted) {
    // Page auto-submitted because an HMRC token with sufficient scope already existed.
    // Results are already displayed — skip form filling and submission.
    console.log(`[Obligation→View] Auto-submitted with period: ${viewResult.periodStart} to ${viewResult.periodEnd}`);
  } else if (viewResult.navigated) {
    // Check if the fulfilled obligation period matches the period we submitted to
    const periodMatches =
      submitPeriodDates && viewResult.periodStart === submitPeriodDates.periodStart && viewResult.periodEnd === submitPeriodDates.periodEnd;
    if (periodMatches) {
      console.log(`[Obligation→View] Fulfilled obligation matches submitted period: ${viewResult.periodStart} to ${viewResult.periodEnd}`);
    } else if (submitPeriodDates) {
      // Overwrite form with the submitted period to ensure we view a return that exists
      console.log(
        `[Obligation→View] Period mismatch: obligation=${viewResult.periodStart}..${viewResult.periodEnd}, submitted=${submitPeriodDates.periodStart}..${submitPeriodDates.periodEnd} — overwriting form`,
      );
      await fillInViewVatReturn(page, testVatNumber, submitPeriodDates, null, runFraudPreventionHeaderValidation, screenshotPath);
    } else {
      console.log(`[Obligation→View] Using obligation period: ${viewResult.periodStart} to ${viewResult.periodEnd}`);
    }

    // Inject resolvedPeriodKey into the page URL so the viewVatReturn form includes it
    // This ensures the GET uses the same period key that was POSTed to the sandbox
    if (resolvedPeriodKey) {
      console.log(`[Obligation→View] Injecting resolvedPeriodKey=${resolvedPeriodKey} into URL`);
      const currentUrl = new URL(page.url());
      currentUrl.searchParams.set("periodKey", resolvedPeriodKey);
      await page.evaluate((newUrl) => {
        window.history.replaceState({}, "", newUrl);
      }, currentUrl.toString());
    }

    await submitViewVatReturnForm(page, screenshotPath);
  } else {
    // Fallback: navigate via home page activity button
    console.log("[Obligation→View] No fulfilled obligation found, falling back to home page navigation");
    await goToHomePageUsingMainNav(page, screenshotPath);
    await initViewVatReturn(page, screenshotPath);
    await fillInViewVatReturn(page, testVatNumber, submitPeriodDates, null, runFraudPreventionHeaderValidation, screenshotPath);

    // Inject resolvedPeriodKey into the page URL so the viewVatReturn form includes it
    if (resolvedPeriodKey) {
      console.log(`[Obligation→View] Injecting resolvedPeriodKey=${resolvedPeriodKey} into URL`);
      const currentUrl = new URL(page.url());
      currentUrl.searchParams.set("periodKey", resolvedPeriodKey);
      await page.evaluate((newUrl) => {
        window.history.replaceState({}, "", newUrl);
      }, currentUrl.toString());
    }

    await submitViewVatReturnForm(page, screenshotPath);
  }

  /* ******************* */
  /*  VIEW VAT RESULTS   */
  /* ******************* */

  await verifyViewVatReturnResults(page, null, screenshotPath);
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ******************* */
  /*  TOKEN USAGE        */
  /* ******************* */

  if (isSandboxMode()) {
    await goToUsagePage(page, screenshotPath);
    await verifyTokenSources(page, [{ bundleId: "day-guest" }], screenshotPath);
    await verifyTokenConsumption(page, [{ activity: "submit-vat", minCount: 1, tokensUsed: 1 }], screenshotPath);
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

  // Build test context metadata and write testContext.json next to the video
  const testContext = {
    testId: "submitVatBehaviour",
    name: testInfo.title,
    title: "Submit VAT Return (HMRC: VAT Return POST)",
    description:
      "Obligations-first flow: queries obligations (triggers read:vat auth), clicks open obligation to submit VAT (triggers scope upgrade to write:vat read:vat), verifies receipts, queries obligations again (token reuse, no re-auth), clicks fulfilled obligation to view return, checks token usage.",
    hmrcApis: [
      { url: "/api/v1/hmrc/vat/return", method: "POST" },
      { url: "/api/v1/hmrc/vat/return/:periodKey", method: "GET" },
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
      hmrcTestUsername: testUsername,
      hmrcTestPassword: testPassword ? "***MASKED***" : "<not provided>", // Mask password in test context
      hmrcTestVatNumber: testVatNumber,
      resolvedPeriodKey, // Actual periodKey resolved from HMRC obligations
      hmrcVatDueAmount,
      s3Endpoint,
      testUserGenerated: isSandboxMode() && (!hmrcTestUsername || !hmrcTestPassword || !hmrcTestVatNumber),
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
  console.log(`[Figures]: Generated figures.json in ${outputDir}`);

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

    // Assert VAT return POST request exists and validate key fields
    const vatPostRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "POST",
      `/organisations/vat/${testVatNumber}/returns`,
      "VAT return submission",
    );
    console.log(`[DynamoDB Assertions]: Found ${vatPostRequests.length} VAT return POST request(s)`);
    //let http201CreatedResults = 0;
    expect(vatPostRequests.length).toBeGreaterThan(0);
    vatPostRequests.forEach((vatPostRequest) => {
      assertEssentialFraudPreventionHeadersPresent(vatPostRequest, `POST ${vatPostRequest.url}`);
      const thisRequestHttp201CreatedResults = countHmrcApiRequestValues(vatPostRequest, {
        "httpRequest.method": "POST",
        "httpResponse.statusCode": 201,
      });
      if (thisRequestHttp201CreatedResults === 1) {
        // Check that request body contains a valid period key format and VAT due amount
        // periodKey is unpredictable per HMRC - only validate format, not specific value
        const requestBody = JSON.parse(vatPostRequest.httpRequest.body);
        expect(requestBody.periodKey, "periodKey should match HMRC format").toMatch(periodKeyFormatRegex);
        expect(requestBody.vatDueSales).toBe(parseFloat(hmrcVatDueAmount));
        console.log(`[DynamoDB Assertions]: VAT POST request body validated - periodKey format: ${requestBody.periodKey}`);
      }
      // Assert that the request body contains the submitted data
      // assertHmrcApiRequestValues(vatPostRequest, {
      //   "httpRequest.method": "POST",
      //   "httpResponse.statusCode": 201,
      // });
      // TODO: Response code counts based on getVatObligations.behaviour.test.js
    });

    // Assert VAT return GET request exists and validate key fields
    // BE FLEXIBLE: periodKey may differ between submission and viewing due to sandbox obligation fallback
    // Always use regex pattern to match any valid periodKey format
    const vatGetUrlPattern = new RegExp(`/organisations/vat/${testVatNumber}/returns/\\w+`);

    const vatGetRequests = assertHmrcApiRequestExists(hmrcApiRequestsFile, "GET", vatGetUrlPattern, "VAT return retrieval");
    console.log(`[DynamoDB Assertions]: Found ${vatGetRequests.length} VAT return GET request(s)`);

    expect(vatGetRequests.length).toBeGreaterThan(0);
    vatGetRequests.forEach((vatGetRequest) => {
      assertEssentialFraudPreventionHeadersPresent(vatGetRequest, `GET ${vatGetRequest.url}`);
      const thisRequestHttp200OkResults = countHmrcApiRequestValues(vatGetRequest, {
        "httpRequest.method": "GET",
        "httpResponse.statusCode": 200,
      });
      if (thisRequestHttp200OkResults === 1) {
        // Check that response body contains valid data with correct periodKey format
        const responseBody = vatGetRequest.httpResponse.body;
        expect(responseBody.periodKey, "periodKey should match HMRC format").toMatch(periodKeyFormatRegex);
        expect(responseBody.vatDueSales).toBe(parseFloat(hmrcVatDueAmount));
        console.log(`[DynamoDB Assertions]: VAT GET response body validated - periodKey format: ${responseBody.periodKey}`);
      }
      // Assert that the response contains the submitted data
      // assertHmrcApiRequestValues(vatGetRequest, {
      //   "httpRequest.method": "GET",
      //   "httpResponse.statusCode": 200,
      // });
      // TODO: Response code counts based on getVatObligations.behaviour.test.js
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
