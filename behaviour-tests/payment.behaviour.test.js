// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/payment.behaviour.test.js
//
// Payment funnel behaviour test — exercises the entire conversion journey:
// Free guest → token exhaustion → upgrade to pro via checkout → verified token usage.
// This is the core business conversion funnel (The Human Test Journey).
// Simulator: checkout auto-completes (fakes Stripe like it fakes OAuth login).
// Proxy/CI/Prod: real Stripe test checkout with test card 4242 4242 4242 4242.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  generatePeriodDates,
  getEnvVarAndLog,
  isSandboxMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalSslProxy,
  runStripeListen,
  saveHmrcTestUserToFiles,
  timestamp,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn, goToHomePage, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import {
  clearBundles,
  ensureBundlePresent,
  ensureBundleViaPassApi,
  ensureBundleViaCheckout,
  getTokensRemaining,
  goToBundlesPage,
  goToUsagePage,
  verifyBundleApiResponse,
  verifySubscriptionManagement,
  verifyTokenConsumption,
  verifyTokenSources,
  waitForBundleWebhookActivation,
  navigateToStripePortal,
  cancelSubscriptionViaPortal,
  waitForCancellationWebhook,
  verifySubscriptionDeletionWebhook,
} from "./steps/behaviour-bundle-steps.js";
import { fillInVat } from "./steps/behaviour-hmrc-vat-steps.js";
import {
  acceptCookiesHmrc,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";
import { initializeSalt } from "@app/services/subHasher.js";
import { consumeToken } from "@app/data/dynamoDbBundleRepository.js";
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

const screenshotPath = "target/behaviour-test-results/screenshots/payment-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runProxy = getEnvVarAndLog("runProxy", "TEST_PROXY", null);
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
const runFraudPreventionHeaderValidation = isSandboxMode();

let mockOAuth2Process;
let serverProcess;
let ngrokProcess;
let stripeListenProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(600_000); // 10 minutes

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "paymentBehaviour" });
});

test.beforeAll(async () => {
  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);

  // Must start, and have its signing secret in env, before runLocalHttpServer spawns the
  // server — resolveWebhookSecret() caches the first STRIPE_TEST_WEBHOOK_SECRET it reads.
  stripeListenProcess = await runStripeListen(new URL("api/v1/billing/webhook", baseUrl).href);
  if (stripeListenProcess) {
    process.env.STRIPE_TEST_WEBHOOK_SECRET = stripeListenProcess.secret;
  }

  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);
  ngrokProcess = await runLocalSslProxy(runProxy, httpServerPort, baseUrl);

  if (bundleTableName) {
    await initializeSalt();
  } else {
    console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping initializeSalt (direct DynamoDB steps will be skipped)");
  }
});

test.afterAll(async () => {
  if (ngrokProcess) ngrokProcess.kill();
  if (serverProcess) serverProcess.kill();
  if (stripeListenProcess) stripeListenProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const outputDir = testInfo.outputPath("");
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({ path: `${outputDir}/test-failed-${Date.now()}.png`, fullPage: true });
  }
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  appendUserSubTxt(outputDir, testInfo, userSub);
  await appendHashedUserSubTxt(outputDir, testInfo, userSub);
  appendTraceparentTxt(outputDir, testInfo, observedTraceparent);
});

/**
 * Helper to extract user sub from browser localStorage
 */
async function extractUserSub(page) {
  return page.evaluate(() => {
    const token = localStorage.getItem("cognitoIdToken");
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.sub;
    } catch {
      return null;
    }
  });
}

test("Payment funnel: guest → exhaustion → upgrade → submission → usage", async ({ page }, testInfo) => {
  const testUrl =
    (runTestServer === "run" || runTestServer === "useExisting") && runProxy !== "run" && runProxy !== "useExisting"
      ? `http://127.0.0.1:${httpServerPort}/`
      : baseUrl;

  addOnPageLogging(page);

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

  // Use HMRC test credentials
  let currentTestUsername = hmrcTestUsername;
  let currentTestPassword = hmrcTestPassword;
  let testVatNumber = hmrcTestVatNumber;
  if (!hmrcTestUsername) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    if (hmrcClientId && hmrcClientSecret) {
      const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
      currentTestUsername = testUser.userId;
      currentTestPassword = testUser.password;
      testVatNumber = testUser.vrn;
      const outputDir = testInfo.outputPath("");
      const repoRoot = path.resolve(process.cwd());
      saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);
    }
  }

  const hmrcVatNumber = testVatNumber || "123456789";
  const hmrcVatDueAmount = "500.00";
  const { periodStart, periodEnd } = generatePeriodDates();

  // ============================================================
  // STEP 1: Login and clear bundles
  // ============================================================
  await test.step("Login and clear existing bundles", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Login and clear bundles");
    console.log("=".repeat(60));

    await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
    await clickLogIn(page, screenshotPath);
    await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
    await verifyLoggedInStatus(page, screenshotPath);
    await consentToDataCollection(page, screenshotPath);

    await goToBundlesPage(page, screenshotPath);
    await clearBundles(page, screenshotPath);
  });

  // ============================================================
  // STEP 2: Get day-guest via generated pass (3 tokens)
  // ============================================================
  await test.step("Get day-guest bundle via pass (3 tokens)", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Get day-guest via pass");
    console.log("=".repeat(60));

    await ensureBundleViaPassApi(page, "day-guest", screenshotPath, { testPass: true });

    const tokens = await getTokensRemaining(page, "day-guest");
    console.log(`Day-guest tokens remaining: ${tokens}`);
    expect(tokens).toBe(3);

    // Extract userSub for direct DynamoDB access later
    userSub = await extractUserSub(page);
    console.log(`User sub: ${userSub}`);
    expect(userSub).toBeTruthy();

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-day-guest-granted.png` });
  });

  // ============================================================
  // STEP 3: Drain the 3 tokens
  // ============================================================
  await test.step("Drain all 3 day-guest tokens", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Drain 3 tokens");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping direct token exhaustion");
      return;
    }

    // Consume all 3 tokens directly via repository (faster than UI submissions)
    let remaining = 3;
    let consumed = 0;
    while (remaining > 0) {
      const result = await consumeToken(userSub, "day-guest");
      consumed++;
      remaining = result.tokensRemaining;
      console.log(`Consumed token ${consumed}: remaining=${remaining}`);
      expect(result.consumed).toBe(true);
    }
    console.log(`Exhausted all day-guest tokens (consumed ${consumed})`);

    // Verify 0 tokens remaining via API
    const tokensAfterExhaust = await getTokensRemaining(page, "day-guest");
    console.log(`Tokens remaining after exhaustion: ${tokensAfterExhaust}`);
    expect(tokensAfterExhaust).toBe(0);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-tokens-exhausted.png` });
  });

  // ============================================================
  // STEP 4: Verify activities are disabled on home page
  // ============================================================
  await test.step("Verify activities disabled when tokens exhausted", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Verify activities disabled");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping exhaustion verification");
      return;
    }

    await goToHomePageUsingMainNav(page, screenshotPath);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-home-exhausted.png` });

    // The Submit VAT button should be disabled with "Insufficient tokens"
    // day-guest bundle maps to "Submit VAT (HMRC)" activity, not the sandbox variant
    const activityButtonText = "Submit VAT (HMRC)";
    const submitButton = page.locator(`button:has-text('${activityButtonText}')`);
    await expect(submitButton).toBeVisible({ timeout: 10_000 });
    await expect(submitButton).toBeDisabled({ timeout: 10_000 });

    const buttonText = await submitButton.textContent();
    console.log(`Submit VAT button text: "${buttonText.trim()}"`);
    expect(buttonText).toContain("Insufficient tokens");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-activities-disabled.png` });
  });

  // ============================================================
  // STEP 5: Verify upsell link to bundles page
  // ============================================================
  await test.step("Verify upsell link to bundles page", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 5: Check upsell link to bundles");
    console.log("=".repeat(60));

    if (!bundleTableName) {
      console.log("BUNDLE_DYNAMODB_TABLE_NAME not set; skipping upsell verification");
      return;
    }

    // Look for a "View Bundles" or bundles link near the disabled activity
    const bundlesLink = page.locator('a[href*="bundles.html"]');
    const bundlesLinkCount = await bundlesLink.count();
    console.log(`Found ${bundlesLinkCount} bundles link(s) on the page`);

    // Navigate to bundles page (either via upsell link or main nav)
    await goToBundlesPage(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-bundles-page-after-exhaustion.png` });

    // Verify day-guest shows 0 tokens
    const dayGuestTokens = await getTokensRemaining(page, "day-guest");
    console.log(`Day-guest tokens on bundles page: ${dayGuestTokens}`);
    expect(dayGuestTokens).toBe(0);

    // Verify resident-vat is visible in catalogue
    const residentVatVisible = await page
      .locator('button[data-bundle-id="resident-vat"], .service-item:has-text("Resident VAT")')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log(`Resident VAT visible in catalogue: ${residentVatVisible}`);
    expect(residentVatVisible).toBe(true);
  });

  // ============================================================
  // STEP 6: Subscribe to resident-vat via direct checkout (100 tokens)
  // resident-vat is publicly visible (enable=always, allocation=on-subscription) — no pass needed.
  // Simulator: checkout auto-completes (fakes Stripe like OAuth)
  // Proxy/CI/Prod: real Stripe test checkout with test card
  // ============================================================
  await test.step("Subscribe to resident-vat via direct checkout (100 tokens)", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6: Subscribe to resident-vat via direct checkout");
    console.log("=".repeat(60));

    await goToBundlesPage(page, screenshotPath);
    const checkoutResult = await ensureBundleViaCheckout(page, "resident-vat", screenshotPath, { skipPass: true });

    // If real Stripe checkout was used, wait for the webhook to activate the bundle.
    // This is the key verification that would catch webhook signature failures.
    if (checkoutResult?.isStripeCheckout) {
      console.log("Real Stripe checkout detected — waiting for webhook to activate bundle...");
      await waitForBundleWebhookActivation(page, "resident-vat", screenshotPath, { timeoutMs: 45_000 });
      console.log("Webhook activation confirmed — bundle has stripeSubscriptionId");
    } else {
      console.log("Simulator checkout — skipping webhook activation wait");
    }

    const tokens = await getTokensRemaining(page, "resident-vat");
    console.log(`Resident-vat tokens remaining: ${tokens}`);
    expect(tokens).toBe(100);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-resident-vat-granted.png` });
  });

  // ============================================================
  // STEP 6b: Verify subscription management is visible
  // After checkout, the "Manage Subscription" button should appear
  // and the billing portal API should return a valid portal URL.
  // ============================================================
  await test.step("Verify subscription management is visible", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6b: Verify subscription management");
    console.log("=".repeat(60));

    await goToBundlesPage(page, screenshotPath);
    const result = await verifySubscriptionManagement(page, "resident-vat", screenshotPath);
    console.log(`Subscription management verified: button visible, portal URL obtained`);
    expect(result.manageButtonVisible).toBe(true);
    expect(result.portalUrl).toBeTruthy();

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06b-manage-subscription.png` });
  });

  // ============================================================
  // STEP 7: Use a token for a VAT submission
  // ============================================================
  await test.step("Submit VAT return (consumes 1 token from resident-vat)", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 7: Submit VAT return");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    // Navigate to Submit VAT — sandbox mode is set in sessionStorage by index.html
    // because the user's bundle has qualifiers.sandbox = true (from test pass)
    const submitVatButton = page.locator(`button:has-text('Submit VAT (HMRC)')`);
    await expect(submitVatButton).toBeVisible({ timeout: 10_000 });
    await submitVatButton.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#vatSubmissionForm")).toBeVisible();

    await fillInVat(
      page,
      hmrcVatNumber,
      { periodStart, periodEnd },
      hmrcVatDueAmount,
      undefined,
      runFraudPreventionHeaderValidation,
      screenshotPath,
    );

    // Submit the form — scope enforcement fetches the catalogue asynchronously
    // before redirecting to HMRC OAuth, so wait for the HMRC auth page or receipt
    await page.locator("#submitBtn").click();
    const hmrcAuthOrResult = page.locator("#appNameParagraph, #receiptDisplay, #statusMessagesContainer:has-text('failed')");
    await hmrcAuthOrResult.first().waitFor({ state: "visible", timeout: 30_000 });

    // Handle HMRC OAuth if redirected
    const isHmrcAuthPage = await page
      .locator("#appNameParagraph")
      .isVisible()
      .catch(() => false);
    if (isHmrcAuthPage) {
      await acceptCookiesHmrc(page, screenshotPath);
      await goToHmrcAuth(page, screenshotPath);
      await initHmrcAuth(page, screenshotPath);
      await fillInHmrcAuth(page, currentTestUsername, currentTestPassword, screenshotPath);
      await submitHmrcAuth(page, screenshotPath);
      await grantPermissionHmrcAuth(page, screenshotPath);
    }

    // Wait for receipt (success) or error
    const receiptOrError = page.locator("#receiptDisplay, #statusMessagesContainer:has-text('failed')");
    await receiptOrError.first().waitFor({ state: "visible", timeout: 120_000 });

    const receiptVisible = await page
      .locator("#receiptDisplay")
      .isVisible()
      .catch(() => false);
    expect(receiptVisible).toBeTruthy();
    console.log("VAT return submitted successfully");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-vat-submitted.png` });
  });

  // ============================================================
  // STEP 8: Verify token consumed (99 remaining)
  // ============================================================
  await test.step("Verify token consumed - 99 remaining", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 8: Verify tokens = 99");
    console.log("=".repeat(60));

    await goToHomePageUsingMainNav(page, screenshotPath);
    await goToBundlesPage(page, screenshotPath);

    const tokensAfterSubmission = await getTokensRemaining(page, "resident-vat");
    console.log(`Resident-vat tokens remaining after submission: ${tokensAfterSubmission}`);
    expect(tokensAfterSubmission).toBe(99);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-tokens-after-submission.png` });
  });

  // ============================================================
  // STEP 9: Check the token usage page
  // ============================================================
  await test.step("Check token usage page shows correct transactions", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("[payment-test]: STEP 9: Verify token usage page");
    console.log("=".repeat(60));

    await goToUsagePage(page, screenshotPath);

    // Verify Token Sources table: resident-vat bundle should be present with 100 granted, 99 remaining
    // (day-guest may or may not appear depending on whether exhausted bundles are shown)
    await verifyTokenSources(
      page,
      [
        {
          bundleId: "resident-vat",
          tokensGranted: 100,
          tokensRemainingAtLeast: 98,
          tokensRemainingAtMost: 100,
        },
      ],
      screenshotPath,
    );

    // Verify Token Consumption table: at least 1 submit-vat entry from the VAT submission in Step 7
    // The resident-vat bundle should have at least 1 consumption event
    await verifyTokenConsumption(
      page,
      [
        {
          activity: "submit-vat",
          minCount: 1,
          tokensUsed: 1,
        },
      ],
      screenshotPath,
    );

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-usage-page-full.png`, fullPage: true });
    console.log("[payment-test]: Usage page verification complete.");
  });

  // ============================================================
  // STEP 10: Navigate to Stripe portal, cancel subscription
  // After all business activities are complete, exercise the
  // Stripe billing portal and cancel the subscription.
  // Simulator: skips portal (mock redirects straight back).
  // Proxy/CI/Prod: real Stripe portal, real cancellation.
  // ============================================================
  await test.step("Navigate to Stripe portal and cancel subscription", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 10: Navigate to Stripe portal and cancel subscription");
    console.log("=".repeat(60));

    await goToBundlesPage(page, screenshotPath);

    const portalResult = await navigateToStripePortal(page, "resident-vat", screenshotPath);

    if (portalResult.isSimulator) {
      console.log("Simulator detected — skipping portal cancellation");
    } else {
      // Real Stripe portal: verify subscription visible, then cancel
      console.log("In Stripe billing portal — cancelling subscription...");
      const bundlesUrl = new URL("bundles.html", testUrl).href;
      const cancelResult = await cancelSubscriptionViaPortal(page, bundlesUrl, screenshotPath);
      console.log(`Cancellation result: ${JSON.stringify(cancelResult)}`);

      // Verify we landed back on bundles.html
      const currentUrl = page.url();
      console.log(`Post-cancellation URL: ${currentUrl}`);
      expect(currentUrl).toContain("bundles.html");

      // Wait for cancellation webhook (soft fail — don't break the test if webhook is slow)
      const webhookResult = await waitForCancellationWebhook(page, "resident-vat", screenshotPath, { timeoutMs: 30_000 });
      if (webhookResult.timedOut) {
        console.warn("WARNING: Cancellation webhook did not fire within 30s — subscription may still show as active");
      } else {
        console.log(
          `Cancellation webhook confirmed: cancelAtPeriodEnd=${webhookResult.cancelAtPeriodEnd}, status=${webhookResult.subscriptionStatus}`,
        );
      }
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-10-portal-complete.png` });
  });

  // ============================================================
  // STEP 10b: Verify subscription.deleted webhook (immediate cancel via API)
  // After the portal cancellation (which sets cancelAtPeriodEnd=true),
  // do an immediate API cancellation to trigger customer.subscription.deleted.
  // This verifies the deletion webhook handler in the pipeline.
  // Simulator: skipped (no real Stripe).
  // Proxy/CI/Prod: real Stripe API call → real webhook → real DynamoDB update.
  // ============================================================
  await test.step("Verify subscription deletion webhook via immediate API cancel", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 10b: Verify subscription.deleted webhook (immediate cancel via Stripe API)");
    console.log("=".repeat(60));

    // Only run when real Stripe is available (Stripe secret key configured)
    const stripeKeyAvailable = !!(
      process.env.STRIPE_SECRET_KEY ||
      process.env.STRIPE_TEST_SECRET_KEY ||
      process.env.STRIPE_SECRET_KEY_ARN ||
      process.env.STRIPE_TEST_SECRET_KEY_ARN
    );
    if (!stripeKeyAvailable) {
      console.log("No Stripe secret key available — skipping deletion webhook verification (simulator mode)");
      return;
    }

    await goToBundlesPage(page, screenshotPath);
    const deletionResult = await verifySubscriptionDeletionWebhook(page, "resident-vat", screenshotPath, { timeoutMs: 45_000 });

    if (deletionResult.skipped) {
      console.log("Subscription already gone — skipping deletion webhook verification");
    } else if (deletionResult.timedOut) {
      console.warn("WARNING: Subscription deletion webhook did not fire within 45s");
    } else if (deletionResult.deleted) {
      console.log(`Subscription deletion webhook confirmed: status=${deletionResult.subscriptionStatus}`);
      expect(deletionResult.subscriptionStatus).toBe("canceled");
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-10b-deletion-webhook-complete.png` });
  });

  // ============================================================
  // STEP 11: Logout
  // ============================================================
  await test.step("Logout", async () => {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 11: Logout");
    console.log("=".repeat(60));

    await logOutAndExpectToBeLoggedOut(page, screenshotPath);
  });

  // ============================================================
  // Test Context JSON
  // ============================================================
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  const testContext = {
    testId: "paymentBehaviour",
    name: testInfo.title,
    title: "Payment Funnel (App UI)",
    description:
      "Exercises the full conversion funnel (The Human Test Journey): day-guest pass → token exhaustion → upgrade to resident-vat via checkout → VAT submission → token usage verification.",
    hmrcApi: isSandboxMode() ? "sandbox" : "live",
    env: {
      envName,
      baseUrl,
      serverPort: httpServerPort,
      runTestServer,
      runProxy,
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
      bundlesTested: ["day-guest", "resident-vat"],
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}

  userSub = await extractUserSubFromLocalStorage(page, testInfo);
});
