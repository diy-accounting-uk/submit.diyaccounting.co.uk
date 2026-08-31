// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/generatePassActivity.behaviour.test.js
//
// Behaviour tests for the generate-pass-digital and generate-pass-physical activities.
// These activities allow entitled users to create shareable passes with QR codes.
//
// NOTE: These tests serve as a specification. They will fail until the backend
// endpoints (POST /api/v1/pass/generate, GET /api/v1/pass/my-passes) and
// frontend pages (passes/generate-digital.html, passes/generate-physical.html)
// are implemented. See PLAN_GENERATE_PASS_ACTIVITY.md for the full plan.

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
import { goToBundlesPage, ensureBundlePresent, ensureBundleViaPassApi, getTokensRemaining } from "./steps/behaviour-bundle-steps.js";
import {
  goToGenerateDigitalPassPage,
  goToGeneratePhysicalPassPage,
  generatePass,
  verifyPassGenerated,
  verifyMyGeneratedPasses,
  getTokenBalance,
  selectPhysicalProductType,
  verifyPhysicalDesignDownloads,
  verifyFulfillmentLink,
} from "./steps/behaviour-pass-generation-steps.js";
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

const screenshotPath = "target/behaviour-test-results/screenshots/generate-pass-activity-behaviour-test";

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
  testInfo.annotations.push({ type: "test-id", description: "generatePassActivityBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

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

test("Click through: Generate digital pass and verify in My Generated Passes", async ({ page }, testInfo) => {
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

  // Ensure the user has resident-vat bundle (required for generate-pass activity entitlement)
  // Generate-pass activities require resident-vat, resident-pro-comp, or resident-pro per catalogue
  await goToBundlesPage(page, screenshotPath);
  await ensureBundleViaPassApi(page, "resident-vat", screenshotPath, { testPass: true });

  // --- Step 1: Check initial token balance ---
  const initialTokens = await getTokenBalance(page);
  console.log(`[generate-pass-test]: Initial token balance: ${initialTokens} (expected: 100 for resident-vat)`);
  await page.screenshot({ path: `${screenshotPath}/${timestamp()}-digital-01-initial-tokens.png` });

  /* ************************ */
  /*  GENERATE DIGITAL PASS   */
  /* ************************ */

  // --- Step 2: Navigate to generate digital pass page ---
  await goToGenerateDigitalPassPage(page, testUrl, screenshotPath);

  // --- Step 3: Generate a pass ---
  const passCode = await generatePass(page, screenshotPath);
  expect(passCode).toBeTruthy();
  console.log(`[generate-pass-test]: Generated digital pass: ${passCode}`);

  // --- Step 4: Verify the result display ---
  await verifyPassGenerated(page, screenshotPath);

  /* ********************************* */
  /*  VERIFY IN MY GENERATED PASSES    */
  /* ********************************* */

  // --- Step 5: Navigate back to bundles page ---
  await goToBundlesPage(page, screenshotPath);

  // --- Step 6: Verify the pass appears in My Generated Passes ---
  await verifyMyGeneratedPasses(page, passCode, screenshotPath);

  // --- Step 7: Verify token balance decreased ---
  const finalTokens = await getTokenBalance(page);
  console.log(`[generate-pass-test]: Final token balance: ${finalTokens}`);
  if (initialTokens !== null && finalTokens !== null) {
    expect(finalTokens).toBe(initialTokens - 10);
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
    testId: "generatePassActivityBehaviour",
    name: testInfo.title,
    title: "Generate Digital Pass (App UI)",
    description: "Generates a digital pass, verifies QR code display and token consumption, checks My Generated Passes list.",
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
      initialTokens,
      finalTokens,
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
    "digital-01.*page.*loaded",
    "generate-pass-02.*result",
    "generate-pass-03.*verified",
    "my-passes-01.*section",
    "my-passes-02.*verified",
  ];

  const screenshotDescriptions = {
    "digital-01.*page.*loaded": "Generate Digital Pass page",
    "generate-pass-02.*result": "Digital pass generated with QR code",
    "generate-pass-03.*verified": "Pass generation result verified",
    "my-passes-01.*section": "My Generated Passes section on bundles page",
    "my-passes-02.*verified": "Generated pass visible in list",
  };

  const selectedScreenshots = selectKeyScreenshots(screenshotPath, keyScreenshotPatterns, 5);
  const copiedScreenshots = copyScreenshots(screenshotPath, outputDir, selectedScreenshots);
  const figures = generateFiguresMetadata(copiedScreenshots, screenshotDescriptions);
  writeFiguresJson(outputDir, figures);
});

test("Click through: Generate physical pass and verify design downloads", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

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

  // Ensure the user has resident-vat bundle (required for generate-pass activity entitlement)
  await goToBundlesPage(page, screenshotPath);
  await ensureBundleViaPassApi(page, "resident-vat", screenshotPath, { testPass: true });

  /* ************************* */
  /*  GENERATE PHYSICAL PASS   */
  /* ************************* */

  // --- Step 1: Navigate to generate physical pass page ---
  await goToGeneratePhysicalPassPage(page, testUrl, screenshotPath);

  // --- Step 2: Select T-shirt product type ---
  await selectPhysicalProductType(page, "tshirt", screenshotPath);

  // --- Step 3: Generate a pass ---
  const passCode = await generatePass(page, screenshotPath);
  expect(passCode).toBeTruthy();
  console.log(`[generate-pass-test]: Generated physical pass: ${passCode}`);

  // --- Step 4: Verify pass result ---
  await verifyPassGenerated(page, screenshotPath);

  // --- Step 5: Verify front/back SVG downloads are available ---
  await verifyPhysicalDesignDownloads(page, screenshotPath);

  // --- Step 6: Verify fulfillment link ---
  await verifyFulfillmentLink(page, screenshotPath);

  // --- Step 7: Verify pass appears in My Generated Passes on bundles page ---
  await goToBundlesPage(page, screenshotPath);
  await verifyMyGeneratedPasses(page, passCode, screenshotPath);

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
    testId: "generatePassActivityBehaviour",
    name: testInfo.title,
    title: "Generate Physical Pass (App UI)",
    description: "Generates a physical pass, verifies design SVG downloads and fulfillment links.",
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

  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = [
    "physical-01.*page.*loaded",
    "physical-product.*tshirt",
    "generate-pass-02.*result",
    "physical-downloads",
    "physical-fulfillment",
  ];

  const screenshotDescriptions = {
    "physical-01.*page.*loaded": "Generate Physical Pass page",
    "physical-product.*tshirt": "T-shirt product type selected",
    "generate-pass-02.*result": "Physical pass generated with QR code",
    "physical-downloads": "Front and back SVG download buttons",
    "physical-fulfillment": "Print-on-demand fulfillment link",
  };

  const selectedScreenshots = selectKeyScreenshots(screenshotPath, keyScreenshotPatterns, 5);
  const copiedScreenshots = copyScreenshots(screenshotPath, outputDir, selectedScreenshots);
  const figures = generateFiguresMetadata(copiedScreenshots, screenshotDescriptions);
  writeFiguresJson(outputDir, figures);
});
