// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/passRedemption.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
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
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { goToBundlesPage, clearBundles, verifyBundleApiResponse, ensureBundleViaPassApi } from "./steps/behaviour-bundle-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
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
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-01-clean-state.png` });
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
      const response = await fetch("/api/v1/pass/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-02-pass-created.png` });

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

  // --- Step 4: Enter pass code into the form and validate ---
  const passInput = page.locator("#passInput");
  await expect(passInput).toBeVisible({ timeout: 5000 });
  await passInput.fill(passCode);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-03-code-entered.png` });

  const redeemBtn = page.locator("#redeemPassBtn");
  await expect(redeemBtn).toBeVisible({ timeout: 5000 });
  await redeemBtn.click();
  console.log("[pass-test]: Clicked Redeem Pass button (validates first)");

  // --- Step 5: Wait for validation/auto-redeem and verify Test bundle is granted ---
  const passStatus = page.locator("#passStatus");
  await expect(passStatus).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-04-validation-status.png` });

  const statusText = await passStatus.textContent();
  console.log(`[pass-test]: Pass status message: ${statusText}`);

  // All bundles follow the same flow: validate → card appears → click Request → bundle granted
  expect(statusText).toMatch(/valid|Request/i);
  const enabledDayGuestBtn = page.locator('button.service-btn:has-text("Request Day pass"):not([disabled])');
  await expect(enabledDayGuestBtn).toBeVisible({ timeout: 10000 });
  console.log("[pass-test]: Day pass bundle button is now enabled after pass validation");
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-04b-bundle-enabled.png` });

  await enabledDayGuestBtn.click();
  console.log("[pass-test]: Clicked enabled Day pass bundle button to redeem pass");

  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-05-after-redemption.png` });

  // --- Step 6: Verify the Day pass bundle is now granted ---
  const removeDayGuestBtn = page.locator('button[data-remove-bundle-id="day-guest"]');
  await expect(removeDayGuestBtn).toBeVisible({ timeout: 15000 });
  console.log("[pass-test]: Day pass bundle shows in Current Bundles with Remove button");
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-06-bundle-granted.png` });

  // --- Step 7: Verify via API that the bundle is allocated ---
  const apiResponse = await verifyBundleApiResponse(page, screenshotPath);
  const allocatedBundles = apiResponse?.bundles?.filter((b) => b.allocated) ?? [];
  const testBundle = allocatedBundles.find((b) => b.bundleId === "day-guest");
  console.log(`[pass-test]: Allocated bundles: ${allocatedBundles.map((b) => b.bundleId).join(", ")}`);
  expect(testBundle).toBeTruthy();

  // --- Step 7b: Verify sandbox qualifier is set on the bundle ---
  const sandboxBundle = allocatedBundles.find((b) => b.qualifiers?.sandbox === true);
  console.log(`[pass-test]: Sandbox qualifier bundle: ${sandboxBundle?.bundleId || "none"}`);
  expect(sandboxBundle).toBeTruthy();

  // --- Step 7c: Verify developer tools wrench icon appears ---
  // The wrench icon is injected by developer-mode.js when a sandbox bundle is detected.
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
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-06c-developer-mode-enabled.png` });

  // Navigate back to bundles page for the remaining pass tests
  await page.goto(`${currentOrigin}/bundles.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // --- Step 8: Try to redeem the same pass again (should fail - exhausted) ---
  await passInput.fill(passCode);
  await redeemBtn.click();
  await expect(passStatus).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);
  const reusedStatusText = await passStatus.textContent();
  console.log(`[pass-test]: Re-use status message: ${reusedStatusText}`);
  // Pass should be exhausted after single use
  expect(reusedStatusText).toMatch(/exhausted|already|used/i);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-07-reuse-rejected.png` });

  // --- Step 9: Try an invalid pass code ---
  await passInput.fill("invalid-fake-pass-code");
  await redeemBtn.click();
  await expect(passStatus).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);
  const invalidStatusText = await passStatus.textContent();
  console.log(`[pass-test]: Invalid pass status message: ${invalidStatusText}`);
  expect(invalidStatusText).toMatch(/not found|invalid/i);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-08-invalid-rejected.png` });

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
});

test("Click through: Resident-pro pass shows Subscribe button (on-pass-on-subscription)", async ({ page }, testInfo) => {
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

  // --- Step 1: Verify clean state - resident-pro shows Pass required ---
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pro-pass-01-clean-state.png` });
  const passRequiredBtn = page.locator('button[data-disabled-reason="on-pass"]');
  const passRequiredVisible = await passRequiredBtn
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  console.log(`[pro-pass-test]: Pass required button visible: ${passRequiredVisible}`);

  // --- Step 2: Create a resident-pro pass via admin API ---
  const createResult = await page.evaluate(async () => {
    try {
      const response = await fetch("/api/v1/pass/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passTypeId: "resident-pro",
          bundleId: "resident-pro",
          validityPeriod: "P1D",
          maxUses: 1,
          createdBy: "pass-behaviour-test",
          testPass: true,
        }),
      });
      const body = await response.json();
      return { ok: response.ok, status: response.status, code: body?.code, body };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  console.log(`[pro-pass-test]: Pass creation result: ${JSON.stringify(createResult)}`);
  expect(createResult.ok).toBe(true);
  expect(createResult.code).toBeTruthy();

  const passCode = createResult.code;
  console.log(`[pro-pass-test]: Created resident-pro pass with code: ${passCode}`);

  // --- Step 3: Enter pass code and validate ---
  const passInput = page.locator("#passInput");
  await expect(passInput).toBeVisible({ timeout: 5000 });
  await passInput.fill(passCode);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pro-pass-02-code-entered.png` });

  const redeemBtn = page.locator("#redeemPassBtn");
  await expect(redeemBtn).toBeVisible({ timeout: 5000 });
  await redeemBtn.click();
  console.log("[pro-pass-test]: Clicked Redeem Pass button");

  // --- Step 4: Verify Subscribe button appears (not Request button) ---
  const passStatus = page.locator("#passStatus");
  await expect(passStatus).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pro-pass-03-validation-status.png` });

  const statusText = await passStatus.textContent();
  console.log(`[pro-pass-test]: Pass status message: ${statusText}`);

  // For on-pass-on-subscription bundles, the Subscribe button should appear for resident-pro specifically
  const subscribeBtn = page.locator('button[data-subscribe="true"][data-bundle-id="resident-pro"]');
  const subscribeBtnVisible = await subscribeBtn
    .first()
    .isVisible({ timeout: 10000 })
    .catch(() => false);
  console.log(`[pro-pass-test]: Subscribe button visible for resident-pro: ${subscribeBtnVisible}`);
  expect(subscribeBtnVisible).toBe(true);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pro-pass-04-subscribe-button.png` });

  // Verify the Subscribe button has pricing info and bundle name
  const subscribeBtnText = await subscribeBtn.first().textContent();
  console.log(`[pro-pass-test]: Subscribe button text: ${subscribeBtnText}`);
  expect(subscribeBtnText).toContain("9.99");
  expect(subscribeBtnText).toContain("Resident Pro");

  // Verify NO "Request Resident Pro" button (subscription flow, not direct grant)
  const requestBtn = page.locator('button.service-btn:has-text("Request Resident Pro")');
  const requestBtnVisible = await requestBtn
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  console.log(`[pro-pass-test]: Request button visible: ${requestBtnVisible} (expected: false)`);
  expect(requestBtnVisible).toBe(false);

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
    title: "Resident Pro Pass Redemption — Subscribe Button (App UI)",
    description: "Creates a resident-pro pass, validates it, verifies Subscribe button appears for on-pass-on-subscription bundle.",
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
      passCode,
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}
});
