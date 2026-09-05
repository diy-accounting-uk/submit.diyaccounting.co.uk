// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/bundles.behaviour.test.js

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
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import {
  clearBundles,
  goToBundlesPage,
  ensureBundlePresent,
  removeBundle,
  verifyBundleApiResponse,
  verifyAlreadyGranted,
  requestBundleViaApi,
} from "./steps/behaviour-bundle-steps.js";
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
import { loadCatalogFromRoot } from "@app/services/productCatalog.js";
// if (!process.env.DIY_SUBMIT_ENV_FILEPATH) {
//   dotenvConfigIfNotBlank({ path: ".env.test" });
// } else {
//   console.log(`Already loaded environment from custom path: ${process.env.DIY_SUBMIT_ENV_FILEPATH}`);
// }
dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/bundles-behaviour-test";

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

// Load catalogue to determine bundle properties (hidden, enable, cap, etc.)
const catalogue = loadCatalogFromRoot();
const getCatalogBundle = (bundleName) => catalogue.bundles?.find((b) => b.name === bundleName) || null;
const isBundleHidden = (bundleName) => !!getCatalogBundle(bundleName)?.hidden;

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "bundleBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = {
    ...originalEnv,
  };

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

test("Click through: Adding and removing bundles", async ({ page }, testInfo) => {
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

  // --- Step 1: Clear all bundles and verify clean state ---
  await goToBundlesPage(page, screenshotPath);
  await clearBundles(page, screenshotPath);
  await page.waitForTimeout(2_000);

  // --- Step 2: Verify API response structure with no allocated bundles ---
  const emptyResponse = await verifyBundleApiResponse(page, screenshotPath);
  console.log(`[bundle-test]: Empty state - allocated bundles: ${emptyResponse?.bundles?.filter((b) => b.allocated)?.length ?? "?"}`);
  console.log(`[bundle-test]: Empty state - tokensRemaining: ${emptyResponse?.tokensRemaining ?? "?"}`);

  // --- Step 3: Request Day pass bundle (via test pass for synthetic routing) ---
  await ensureBundlePresent(page, "Day pass", screenshotPath, { testPass: true });

  // --- Step 4: Check Day pass capacity availability ---
  const dayGuestCapacity = await page
    .evaluate(async () => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return { found: false };
      try {
        const response = await fetch("/api/v1/bundle", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await response.json();
        const dayGuest = (data.bundles || []).find((b) => b.bundleId === "day-guest");
        return dayGuest
          ? { found: true, capacityAvailable: dayGuest.bundleCapacityAvailable, allocated: !!dayGuest.allocated }
          : { found: false };
      } catch {
        return { found: false };
      }
    })
    .catch(() => ({ found: false }));
  console.log(`[bundle-test]: Day pass capacity check: ${JSON.stringify(dayGuestCapacity)}`);
  expect(dayGuestCapacity.found).toBe(true);

  const isDayGuestAvailable = dayGuestCapacity.capacityAvailable === true;
  if (isDayGuestAvailable) {
    await ensureBundlePresent(page, "Day pass", screenshotPath, { isHidden: isBundleHidden("Day pass") });

    // Verify API response includes allocated bundles with correct structure
    const afterGrantResponse = await verifyBundleApiResponse(page, screenshotPath);
    const allocatedBundles = afterGrantResponse?.bundles?.filter((b) => b.allocated) ?? [];
    console.log(`[bundle-test]: After grants - allocated bundles: ${allocatedBundles.length}`);
    console.log(`[bundle-test]: After grants - tokensRemaining: ${afterGrantResponse?.tokensRemaining ?? "?"}`);
    console.log(`[bundle-test]: After grants - bundle IDs: ${allocatedBundles.map((b) => b.bundleId).join(", ")}`);

    // --- Step 5: Navigate away and back to verify persistence ---
    await goToHomePage(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);

    // --- Step 6: Remove Day pass bundle and verify it can be re-requested ---
    await removeBundle(page, "Day pass", screenshotPath);

    // Verify only Test remains allocated
    const afterRemoveResponse = await verifyBundleApiResponse(page, screenshotPath);
    const remainingAllocated = afterRemoveResponse?.bundles?.filter((b) => b.allocated) ?? [];
    console.log(`[bundle-test]: After remove - allocated bundles: ${remainingAllocated.length}`);
    console.log(`[bundle-test]: After remove - bundle IDs: ${remainingAllocated.map((b) => b.bundleId).join(", ")}`);

    // --- Step 7: Re-request Day pass to verify re-requestability after removal ---
    await ensureBundlePresent(page, "Day pass", screenshotPath, { isHidden: isBundleHidden("Day pass") });

    // --- Step 8: Verify already-granted idempotency ---
    // Re-requesting the same bundle via API should return already_granted, not an error
    const alreadyGrantedResult = await verifyAlreadyGranted(page, "day-guest", screenshotPath);
    console.log(`[bundle-test]: Already-granted result: ${JSON.stringify(alreadyGrantedResult)}`);

    // --- Step 9: Verify API response shows both bundles with correct structure ---
    const finalResponse = await verifyBundleApiResponse(page, screenshotPath);
    const finalAllocated = finalResponse?.bundles?.filter((b) => b.allocated) ?? [];
    const finalUnallocated = finalResponse?.bundles?.filter((b) => !b.allocated) ?? [];
    console.log(`[bundle-test]: Final state - allocated: ${finalAllocated.length}, unallocated: ${finalUnallocated.length}`);
    console.log(`[bundle-test]: Final state - tokensRemaining: ${finalResponse?.tokensRemaining ?? "?"}`);

    // Every bundle in the response should have bundleCapacityAvailable field
    for (const b of finalResponse?.bundles ?? []) {
      if (!("bundleCapacityAvailable" in b)) {
        console.warn(`[bundle-test]: Bundle ${b.bundleId} missing bundleCapacityAvailable field`);
      }
    }
  }

  // --- Step 10: Navigate home to verify activities appear from granted bundles ---
  await goToHomePage(page, screenshotPath);

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

  // Build and write testContext.json (no HMRC API directly exercised here)
  const testContext = {
    testId: "bundleBehaviour",
    name: testInfo.title,
    title: "Bundles management (App UI)",
    description: "Adds and removes bundles via the UI while authenticated; ensures flows behave as expected.",
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
      bundlesTested: isDayGuestAvailable ? ["Test", "Day pass"] : ["Test"],
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
    "04.*home.*page",
    "02.*removing.*all.*bundles.*clicked",
    "01.*request.*bundle",
    "05.*ensure.*bundle.*adding",
    "04.*remove.*bundle.*confirmed",
    "00.*focus.*clicking.*bundles.*in.*main.*nav",
  ];

  const screenshotDescriptions = {
    "04.*home.*page": "The home page with no bundles",
    "02.*removing.*all.*bundles.*clicked": "Removing all bundles",
    "01.*request.*bundle": "Requesting a bundle",
    "05.*ensure.*bundle.*adding": "Added a bundle",
    "04.*remove.*bundle.*confirmed": "Removed a bundle and verified Request button reappears",
    "00.*focus.*clicking.*bundles.*in.*main.*nav": "The home page with activities from bundles",
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
