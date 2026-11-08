// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/passRedemption.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { cancelLaneTestSubscriptions } from "./helpers/stripeTestTeardown.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  timestamp,
  takeScreenshot,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import {
  goToBundlesPage,
  clearBundles,
  createPassCode,
  ensureBundleViaPassApi,
  verifyBundleApiResponse,
  ensureBundlePresent,
  ensureBundleViaCheckout,
  verifySubscriptionManagement,
} from "./steps/behaviour-bundle-steps.js";
import { generatePass, goToGenerateDigitalPassPage } from "./steps/behaviour-pass-generation-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import { getCatalogBundleById, isBundleListedInEnvironment, loadCatalogFromRoot } from "@app/services/productCatalog.js";
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

const screenshotPath = "target/behaviour-test-results/screenshots/pass-redemption-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3500);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "passRedemptionBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  // Run local servers
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
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
  await cancelLaneTestSubscriptions({ email: testAuthUsername });
});

test.afterEach(async ({ page }, testInfo) => {
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  appendUserSubTxt(outputDir, testInfo, userSub);
  await appendHashedUserSubTxt(outputDir, testInfo, userSub);
  appendTraceparentTxt(outputDir, testInfo, observedTraceparent);
});

test("Click through: Pass redemption grants bundle", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  // Capture traceparent
  page.on("response", (response) => {
    try {
      if (observedTraceparent) return;
      const headers = response.headers?.() ?? {};
      const h = typeof headers === "function" ? headers() : headers;
      const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
      if (tp) observedTraceparent = tp;
    } catch (_e) {}
  });

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
  await clearBundles(page, screenshotPath);
  await page.waitForTimeout(2_000);

  // --- Step 1: Verify clean state ---
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-01-clean-state.png`, readerView: true });
  // Day pass bundle — verify it appears in the catalogue
  const requestDayGuestBtn = page.locator('button[data-bundle-id="day-guest"]');
  const requestDayGuestVisible = await requestDayGuestBtn
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  console.log(`[pass-test]: Day pass bundle button visible: ${requestDayGuestVisible}`);

  // --- Step 2: Create a test pass via admin API ---
  // Use passTypeId "day-guest-test-pass" which has test=true in submit.passes.toml.
  // Do NOT pass testPass explicitly — the admin endpoint must auto-derive it from the pass type.
  const createResult = await page.evaluate(async () => {
    try {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return { ok: false, error: "No auth token" };
      const response = await fetch("/api/v1/pass/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
        body: JSON.stringify({
          passTypeId: "day-guest-test-pass",
          bundleId: "day-guest",
          validityPeriod: "P1D",
          maxUses: 1,
          createdBy: "pass-behaviour-test",
        }),
      });
      const body = await response.json();
      return { ok: response.ok, status: response.status, code: body?.code, body };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  console.log(`[pass-test]: Pass creation result: ${JSON.stringify(createResult)}`);
  expect(createResult.ok).toBe(true);
  expect(createResult.code).toBeTruthy();
  // Verify testPass was auto-derived from the pass type definition (test=true in submit.passes.toml)
  expect(createResult.body?.testPass).toBe(true);
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-02-pass-created.png`, readerView: true });

  const passCode = createResult.code;
  console.log(`[pass-test]: Created pass with code: ${passCode}`);

  // --- Step 3: Check pass validity via GET API ---
  const checkResult = await page.evaluate(async (code) => {
    try {
      const response = await fetch(`/api/v1/pass?code=${encodeURIComponent(code)}`);
      return await response.json();
    } catch (err) {
      return { error: err.message };
    }
  }, passCode);

  console.log(`[pass-test]: Pass check result: ${JSON.stringify(checkResult)}`);
  expect(checkResult.valid).toBe(true);

  // --- Step 4: Enter pass code into the form; the pass page opens ---
  const passInput = page.locator("#passInput");
  await expect(passInput).toBeVisible({ timeout: 5000 });
  await passInput.fill(passCode);
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-03-code-entered.png`, readerView: true });

  await page.getByRole("button", { name: "Redeem pass" }).click();
  console.log("[pass-test]: Submitted the code from the bundles page");

  // --- Step 5: The pass page names the bundle; one click on Redeem pass adds it ---
  await expect(page.locator("#passHeading")).toHaveText("You have a pass for Day pass", { timeout: 15000 });
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-04-pass-page.png`, readerView: true });

  await page.getByRole("button", { name: "Redeem pass" }).click();
  console.log("[pass-test]: Clicked Redeem pass on the pass page");

  await expect(page.locator("#passHeading")).toHaveText("Pass redeemed", { timeout: 15000 });
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-05-after-redemption.png`, readerView: true });

  await page.getByRole("link", { name: "See your bundles" }).click();

  // --- Step 6: Verify the Day pass bundle is now granted ---
  const removeDayGuestBtn = page.locator('button[data-remove-bundle-id="day-guest"]');
  await expect(removeDayGuestBtn).toBeVisible({ timeout: 15000 });
  console.log("[pass-test]: Day pass bundle shows in Current Bundles with Remove button");
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-06-bundle-granted.png`, readerView: true });

  // --- Step 7: Verify via API that the bundle is allocated ---
  const apiResponse = await verifyBundleApiResponse(page, screenshotPath);
  const allocatedBundles = apiResponse?.bundles?.filter((b) => b.allocated) ?? [];
  const testBundle = allocatedBundles.find((b) => b.bundleId === "day-guest");
  console.log(`[pass-test]: Allocated bundles: ${allocatedBundles.map((b) => b.bundleId).join(", ")}`);
  expect(testBundle).toBeTruthy();

  // --- Step 7b: Verify synthetic qualifier is set on the bundle ---
  const syntheticBundle = allocatedBundles.find((b) => b.qualifiers?.synthetic === true);
  console.log(`[pass-test]: Synthetic qualifier bundle: ${syntheticBundle?.bundleId || "none"}`);
  expect(syntheticBundle).toBeTruthy();

  // --- Step 7c: Verify developer tools wrench icon appears ---
  // The wrench icon is injected by developer-mode.js when a synthetic bundle is detected.
  // Navigate to home page where the header with the wrench is rendered.
  const currentOrigin = new URL(page.url()).origin;
  await page.goto(`${currentOrigin}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000); // Give developer-mode.js time to check bundles and inject toggle

  const wrenchIcon = page.locator(".developer-mode-toggle");
  const wrenchVisible = await wrenchIcon.isVisible({ timeout: 10000 }).catch(() => false);
  console.log(`[pass-test]: Developer tools wrench icon visible: ${wrenchVisible}`);
  expect(wrenchVisible).toBe(true);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-06b-developer-tools-wrench.png` });

  // Click the wrench to enable developer mode and verify dev elements appear
  await wrenchIcon.click();
  await page.waitForTimeout(1000);
  const devModeActive = await page.evaluate(() => document.body.classList.contains("developer-mode"));
  console.log(`[pass-test]: Developer mode active (body class): ${devModeActive}`);
  expect(devModeActive).toBe(true);
  // Verify dev float elements are created (datetime, deployment, etc.)
  const devDatetimeVisible = await page
    .locator("#dev-datetime")
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  console.log(`[pass-test]: Dev datetime float visible: ${devDatetimeVisible}`);
  expect(devDatetimeVisible).toBe(true);
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-06c-developer-mode-enabled.png`, readerView: true });

  // Navigate back to bundles page for the remaining pass tests
  await page.goto(`${currentOrigin}/bundles.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // --- Step 8: Open the same pass again in this session: the stored result shows, with no second redemption ---
  await passInput.fill(passCode);
  await page.getByRole("button", { name: "Redeem pass" }).click();
  await expect(page.locator("#passHeading")).toHaveText("Pass redeemed", { timeout: 15000 });
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-07-reopened.png`, readerView: true });

  // --- Step 9: Try an invalid pass code ---
  await page.goto(`${currentOrigin}/bundles.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#passInput").fill("invalid-fake-pass-code");
  await page.getByRole("button", { name: "Redeem pass" }).click();
  await expect(page.locator("#passHeading")).toHaveText("This pass did not work", { timeout: 15000 });
  await expect(page.getByRole("alert")).toContainText(/cannot find this pass/i);
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-08-invalid-rejected.png`, readerView: true });

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
    testId: "passRedemptionBehaviour",
    name: testInfo.title,
    title: "Pass Redemption (App UI)",
    description: "Creates a pass via admin API, redeems it in the UI, verifies bundle grant, and tests invalid/exhausted pass handling.",
    hmrcApi: null,
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
      userSub,
      observedTraceparent,
      testUrl,
      passCode,
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}

  /* ****************** */
  /*  FIGURES           */
  /* ****************** */

  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = [
    "pass-01.*clean.*state",
    "pass-03.*code.*entered",
    "pass-04.*redemption.*status",
    "pass-06.*bundle.*granted",
    "pass-07.*reuse.*rejected",
    "pass-08.*invalid.*rejected",
  ];

  const screenshotDescriptions = {
    "pass-01.*clean.*state": "Bundles page before pass redemption",
    "pass-03.*code.*entered": "Pass code entered into the form",
    "pass-04.*redemption.*status": "Pass redemption success message",
    "pass-06.*bundle.*granted": "Bundle granted after pass redemption",
    "pass-07.*reuse.*rejected": "Exhausted pass rejected on re-use",
    "pass-08.*invalid.*rejected": "Invalid pass code rejected",
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

  if (runDynamoDb === "run" && dynamoControl?.endpoint) {
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
});

test("Click through: Resident-pro subscribes directly, no pass required (on-subscription)", async ({ page }, testInfo) => {
  test.skip(
    !isBundleListedInEnvironment(getCatalogBundleById(loadCatalogFromRoot(), "resident-pro"), envName),
    `the catalogue does not list resident-pro in ${envName}`,
  );
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  // Capture traceparent
  page.on("response", (response) => {
    try {
      if (observedTraceparent) return;
      const headers = response.headers?.() ?? {};
      const h = typeof headers === "function" ? headers() : headers;
      const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
      if (tp) observedTraceparent = tp;
    } catch (_e) {}
  });

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
  await clearBundles(page, screenshotPath);
  await page.waitForTimeout(2_000);

  // --- Step 1: resident-pro shows a Subscribe button directly, no pass needed ---
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pro-sub-01-clean-state.png`, readerView: true });
  const passRequiredBtn = page.locator('button[data-disabled-reason="on-pass"][data-bundle-id="resident-pro"]');
  const passRequiredVisible = await passRequiredBtn
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  console.log(`[pro-sub-test]: Pass required button visible: ${passRequiredVisible} (expected: false)`);
  expect(passRequiredVisible).toBe(false);

  // --- Step 2: Verify the annual Subscribe button and the monthly text link ---
  const annualBtn = page.locator('button[data-subscribe="true"][data-bundle-id="resident-pro"][data-interval="annual"]');
  await expect(annualBtn.first()).toBeVisible({ timeout: 10000 });
  const annualBtnText = await annualBtn.first().textContent();
  console.log(`[pro-sub-test]: Annual subscribe button text: ${annualBtnText}`);
  expect(annualBtnText).toContain("39.99");
  expect(annualBtnText).toContain("Resident Pro");

  const monthlyLink = page.locator('button[data-subscribe="true"][data-bundle-id="resident-pro"][data-interval="monthly"]');
  await expect(monthlyLink.first()).toBeVisible({ timeout: 5000 });
  const monthlyLinkText = await monthlyLink.first().textContent();
  console.log(`[pro-sub-test]: Monthly subscribe link text: ${monthlyLinkText}`);
  expect(monthlyLinkText).toContain("3.99");
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pro-sub-02-subscribe-buttons.png`, readerView: true });

  // Verify NO "Request Resident Pro" button (subscription flow, not direct grant)
  const requestBtn = page.locator('button.service-btn:has-text("Request Resident Pro")');
  const requestBtnVisible = await requestBtn
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  console.log(`[pro-sub-test]: Request button visible: ${requestBtnVisible} (expected: false)`);
  expect(requestBtnVisible).toBe(false);

  // --- Step 3: Subscribe through checkout, no pass step first ---
  // Checkout picks Stripe test mode only when one of the user's bundles carries the synthetic
  // qualifier; a test-pass Day pass gives it one, so this probe never opens a live checkout on prod.
  await ensureBundlePresent(page, "Day pass", screenshotPath, { testPass: true });
  await ensureBundleViaCheckout(page, "resident-pro", screenshotPath, { skipPass: true });
  await verifySubscriptionManagement(page, "Resident Pro", screenshotPath);

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
    testId: "passRedemptionBehaviour",
    name: testInfo.title,
    title: "Resident Pro Direct Subscription (App UI)",
    description: "Verifies resident-pro's Subscribe button appears directly with no pass, then subscribes through checkout.",
    hmrcApi: null,
    env: {
      envName,
      baseUrl,
      serverPort: httpServerPort,
      runTestServer,
      runMockOAuth2,
      testAuthProvider,
      testAuthUsername,
      bundleTableName,
    },
    testData: {
      userSub,
      observedTraceparent,
      testUrl,
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}
});

test("Click through: A deleted generated pass is refused as expired on redemption", async ({ page, browser }, testInfo) => {
  const testUrl = baseUrl;

  // The redeeming account is a second identity: a mock sign-in under another username, or the
  // second Cognito test user's credentials when the lane signs in through Cognito.
  const isMockLane = testAuthProvider === "mock" || testAuthProvider === "simulator";
  const redeemerUsername = isMockLane ? `${testAuthUsername}-redeemer` : process.env.TEST_AUTH_SECOND_USERNAME || null;
  const redeemerPassword = isMockLane ? null : process.env.TEST_AUTH_SECOND_PASSWORD || null;
  const redeemerTotpSecret = isMockLane ? null : process.env.TEST_AUTH_SECOND_TOTP_SECRET || null;

  addOnPageLogging(page);

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  // --- Step 1: An account that holds tokens generates a pass through Generate Digital Pass ---
  await goToBundlesPage(page, screenshotPath);
  await ensureBundleViaPassApi(page, "resident-vat", screenshotPath, { testPass: true });
  await goToGenerateDigitalPassPage(page, testUrl, screenshotPath);
  const passCode = await generatePass(page, screenshotPath);
  expect(passCode).toBeTruthy();

  const generatedEntry = page.locator(`#generatedPassesList [data-pass-code="${passCode}"]`);
  await expect(generatedEntry).toBeVisible({ timeout: 10000 });

  // --- Step 2: Delete it with its trash button and confirm ---
  await page.locator(`button[data-delete-code="${passCode}"]`).click();
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-delete-01-confirm.png`, readerView: true });
  await page.locator(".pass-delete-confirm-yes").click();
  await expect(page.locator("#statusMessagesContainer")).toContainText("Deleted 1 pass", { timeout: 15000 });
  await expect(generatedEntry).toHaveCount(0, { timeout: 15000 });
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-delete-02-deleted.png`, readerView: true });

  // --- Step 3: The pass check reports it expired, whoever asks ---
  const checkResult = await page.evaluate(async (code) => {
    const response = await fetch(`/api/v1/pass?code=${encodeURIComponent(code)}`);
    return await response.json();
  }, passCode);
  console.log(`[pass-delete-test]: Pass check after delete: ${JSON.stringify(checkResult)}`);
  expect(checkResult.valid).toBe(false);
  expect(checkResult.reason).toBe("expired");

  userSub = await extractUserSubFromLocalStorage(page, testInfo);

  // --- Step 4: A second account's redemption is refused as expired ---
  if (!redeemerUsername) {
    console.log("[pass-delete-test]: No second account for this sign-in provider; the pass check above covers the refusal reason");
    await logOutAndExpectToBeLoggedOut(page, screenshotPath);
    return;
  }

  const redeemerContext = await browser.newContext();
  try {
    const redeemerPage = await redeemerContext.newPage();
    addOnPageLogging(redeemerPage);
    await goToHomePageExpectNotLoggedIn(redeemerPage, testUrl, screenshotPath);
    await clickLogIn(redeemerPage, screenshotPath);
    await loginWithCognitoOrMockAuth(
      redeemerPage,
      testAuthProvider,
      redeemerUsername,
      screenshotPath,
      redeemerPassword,
      redeemerTotpSecret,
    );
    await verifyLoggedInStatus(redeemerPage, screenshotPath);
    await consentToDataCollection(redeemerPage, screenshotPath);
    await goToBundlesPage(redeemerPage, screenshotPath);

    // The pass page checks the code first and shows the refusal itself.
    await redeemerPage.locator("#passInput").fill(passCode);
    await redeemerPage.getByRole("button", { name: "Redeem pass" }).click();
    await expect(redeemerPage.getByRole("alert")).toContainText(/has ended/i, { timeout: 15000 });

    // The redeem call itself answers the same reason; this is the call that records the refusal event.
    const redeemBody = await redeemerPage.evaluate(async (code) => {
      const idToken = localStorage.getItem("cognitoIdToken");
      const response = await fetch("/api/v1/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
        body: JSON.stringify({ code }),
      });
      return await response.json();
    }, passCode);
    console.log(`[pass-delete-test]: Second account redemption: ${JSON.stringify(redeemBody)}`);
    expect(redeemBody?.data?.redeemed ?? redeemBody?.redeemed).toBe(false);
    expect(redeemBody?.data?.reason ?? redeemBody?.reason).toBe("expired");

    await takeScreenshot(redeemerPage, { path: `${screenshotPath}/${timestamp()}-pass-delete-03-redeem-expired.png`, readerView: true });

    await logOutAndExpectToBeLoggedOut(redeemerPage, screenshotPath);
  } finally {
    await redeemerContext.close();
  }

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: A pass link opened signed out redeems once after sign-in, and an activity page link waits for a click", async ({
  page,
}, testInfo) => {
  const testUrl = baseUrl;
  const passPosts = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/pass") passPosts.push(request.url());
  });

  addOnPageLogging(page);

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  // Two test passes for two bundles, so that the first redemption leaves the second bundle free.
  await goToBundlesPage(page, screenshotPath);
  await clearBundles(page, screenshotPath);
  const signedOutPass = await createPassCode(page, "day-guest", { testPass: true });
  const activityPass = await createPassCode(page, "resident-vat", { testPass: true });
  expect(signedOutPass.ok && signedOutPass.code).toBeTruthy();
  expect(activityPass.ok && activityPass.code).toBeTruthy();
  userSub = await extractUserSubFromLocalStorage(page, testInfo);
  const origin = new URL(page.url()).origin;

  // --- Signed out: Redeem pass leads to sign-in, and the page posts once on return ---
  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
  passPosts.length = 0;
  await page.goto(`${origin}/pass.html?pass=${encodeURIComponent(signedOutPass.code)}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#passHeading")).toHaveText("You have a pass for Day pass", { timeout: 15000 });
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-link-01-signed-out.png`, readerView: true });
  await page.getByRole("button", { name: "Redeem pass" }).click();
  await expect(page).toHaveURL(/\/auth\/login\.html/, { timeout: 15000 });
  expect(passPosts).toHaveLength(0);

  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await expect(page.locator("#passHeading")).toHaveText("Pass redeemed", { timeout: 30000 });
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-link-02-redeemed-after-sign-in.png`, readerView: true });
  await page.waitForLoadState("networkidle");
  expect(passPosts).toHaveLength(1);

  // --- Signed in: an activity page link forwards to the pass page and posts nothing until the click ---
  passPosts.length = 0;
  await page.goto(`${origin}/hmrc/vat/vatObligations.html?pass=${encodeURIComponent(activityPass.code)}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(/\/pass\.html\?pass=/, { timeout: 15000 });
  await expect(page.locator("#passHeading")).toHaveText("You have a pass for Resident VAT", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  expect(passPosts).toHaveLength(0);
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-link-03-activity-link-waits.png`, readerView: true });

  await page.getByRole("button", { name: "Redeem pass" }).click();
  await expect(page.locator("#passHeading")).toHaveText("Pass redeemed", { timeout: 15000 });
  expect(passPosts).toHaveLength(1);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/hmrc\/vat\/vatObligations\.html$/, { timeout: 15000 });
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-pass-link-04-back-on-activity-page.png`, readerView: true });

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
