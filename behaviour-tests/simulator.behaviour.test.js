// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/simulator.behaviour.test.js

import { execSync } from "child_process";
import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalHttpSimulator,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  timestamp,
} from "./helpers/behaviour-helpers.js";
import { ensureDirSync } from "fs-extra";
import { initializeSalt } from "@app/services/subHasher.js";
import { putBundle } from "@app/data/dynamoDbBundleRepository.js";

dotenvConfigIfNotBlank({ path: ".env" });

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const baseUrlRaw = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const testDynamoDb = getEnvVarAndLog("testDynamoDb", "TEST_DYNAMODB", null);
const dynamoDbPort = getEnvVarAndLog("dynamoDbPort", "TEST_DYNAMODB_PORT", 8000);
const runHttpSimulator = getEnvVarAndLog("runHttpSimulator", "TEST_HTTP_SIMULATOR", null);
const httpSimulatorPort = getEnvVarAndLog("httpSimulatorPort", "TEST_HTTP_SIMULATOR_PORT", 9000);

// Normalize baseUrl - remove trailing slash to prevent double slashes in URL construction
const baseUrl = baseUrlRaw ? baseUrlRaw.replace(/\/+$/, "") : "";

// Screenshot path for simulator page tests
const screenshotPath = "target/behaviour-test-results/screenshots/simulator-behaviour-test";

let httpServer, mockOAuth2Process, dynamoDbProcess, httpSimulatorProcess;

/**
 * Simulator Page Behaviour Tests
 *
 * These tests verify that the simulator.html page works correctly:
 * 1. Page loads with correct title
 * 2. Iframe is present and loads content
 * 3. Journey buttons are visible and functional
 * 4. Journey controls (pause/stop) appear during playback
 * 5. Stop button halts the journey and re-enables buttons
 * 6. All three journeys complete successfully to their results
 */

test.describe("Simulator Page - Iframe and Journey Controls", () => {
  test.beforeAll(async () => {
    console.log("\n Setting up test environment for simulator tests...\n");
    console.log(` Base URL (raw): ${baseUrlRaw}`);
    console.log(` Base URL (normalized): ${baseUrl}`);
    console.log(` Environment: ${envName}`);
    console.log(` Screenshot path: ${screenshotPath}`);

    // Ensure screenshot directory exists
    ensureDirSync(screenshotPath);

    // Build simulator for local testing (creates web/public-simulator/ and simulator-local.js)
    if (runTestServer === "run") {
      console.log("  Building simulator for local testing...");
      execSync("npm run build:simulator", { stdio: "pipe" });
      console.log("  Simulator built");
    }

    if (testAuthProvider === "mock" && runMockOAuth2 === "run") {
      mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
    }

    if (testDynamoDb === "run") {
      dynamoDbProcess = await runLocalDynamoDb(testDynamoDb);

      // Seed demo user bundles so simulator activities are accessible
      // The demo user (sub: "demo-user-12345") needs the "day-guest" bundle
      // to access VAT form activities which require these entitlements
      await initializeSalt();
      const demoUserSub = "demo-user-12345";
      for (const bundleId of ["day-guest"]) {
        await putBundle(demoUserSub, { bundleId, expiry: "2099-12-31", tokensGranted: 10, tokensConsumed: 0 });
      }
      console.log("  Seeded demo user bundles in DynamoDB");
    }

    // Always start HTTP simulator when running a local server — simulator behaviour tests
    // should never call real HMRC. The simulator page embeds a self-contained demo site.
    if (runTestServer === "run" || runHttpSimulator === "run") {
      const simPort = httpSimulatorPort || 9000;
      // Simulator journeys don't handle multi-step OAuth flow; auto-grant HMRC OAuth
      // so journeys complete without user interaction on the HMRC grant pages.
      process.env.HMRC_AUTO_GRANT = "true";
      httpSimulatorProcess = await runLocalHttpSimulator("run", simPort);
      // Override HMRC endpoints to point to the local simulator
      process.env.HMRC_BASE_URI = `http://localhost:${simPort}`;
      process.env.HMRC_SANDBOX_BASE_URI = `http://localhost:${simPort}`;
      console.log(`  HMRC endpoints overridden to http://localhost:${simPort} (simulator)`);
    }

    if (runTestServer === "run") {
      httpServer = await runLocalHttpServer(runTestServer, httpServerPort);
    }

    console.log("\n Test environment ready\n");
  });

  test.afterAll(async () => {
    console.log("\n Cleaning up test environment...\n");

    if (httpServer) {
      httpServer.kill();
    }
    if (mockOAuth2Process) {
      mockOAuth2Process.kill();
    }
    if (dynamoDbProcess && dynamoDbProcess.stop) {
      await dynamoDbProcess.stop();
    }
    if (httpSimulatorProcess && httpSimulatorProcess.stop) {
      await httpSimulatorProcess.stop();
    }

    Object.assign(process.env, originalEnv);
    console.log(" Cleanup complete\n");
  });

  test("Simulator page loads, iframe renders, and journey controls work", async ({ page }) => {
    // Add comprehensive page logging
    addOnPageLogging(page);

    // ============================================================
    // STEP 1: Navigate to simulator page
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Navigate to simulator page");
    console.log("=".repeat(60));

    const simUrl = `${baseUrl}/simulator.html`;
    console.log(` Navigating to: ${simUrl}`);
    await page.goto(simUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-simulator-page.png` });

    // Verify page loaded
    const title = await page.title();
    console.log(` Page title: "${title}"`);
    expect(title).toMatch(/Simulator/i);
    console.log(" Simulator page loaded successfully");

    // ============================================================
    // STEP 2: Verify iframe is present and has a source
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Verify iframe is present");
    console.log("=".repeat(60));

    const iframe = page.locator("#simulatorFrame");
    await expect(iframe).toBeVisible({ timeout: 10000 });
    console.log(" Simulator iframe is visible");

    // Wait for the src to be set by the inline scripts
    await page.waitForFunction(
      () => {
        const frame = document.getElementById("simulatorFrame");
        return frame && frame.src && frame.src !== "" && frame.src !== window.location.href;
      },
      { timeout: 10000 },
    );

    const iframeSrc = await iframe.getAttribute("src");
    console.log(` Iframe src: ${iframeSrc}`);
    expect(iframeSrc).toBeTruthy();

    // Wait for iframe content to start loading
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-iframe-loaded.png` });

    // ============================================================
    // STEP 3: Verify journey buttons are present
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Verify journey buttons are present");
    console.log("=".repeat(60));

    const submitVatBtn = page.locator("#journeySubmitVat");
    const viewObligationsBtn = page.locator("#journeyViewObligations");
    const viewReturnBtn = page.locator("#journeyViewReturn");

    await expect(submitVatBtn).toBeVisible({ timeout: 5000 });
    await expect(viewObligationsBtn).toBeVisible({ timeout: 5000 });
    await expect(viewReturnBtn).toBeVisible({ timeout: 5000 });
    console.log(" All three journey buttons are visible");

    // ============================================================
    // STEP 4: Verify initial status text
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Verify initial status text");
    console.log("=".repeat(60));

    const statusText = page.locator("#journeyStatusText");
    const initialStatus = await statusText.textContent();
    console.log(` Initial status: "${initialStatus}"`);
    expect(initialStatus).toContain("Select a demo journey");
    console.log(" Initial status text is correct");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-initial-state.png` });

    // ============================================================
    // STEP 5: Start Submit VAT journey and verify controls appear
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 5: Start Submit VAT journey");
    console.log("=".repeat(60));

    await submitVatBtn.click();
    console.log(" Clicked Submit VAT journey button");

    // Wait for status to show step progress (confirms journey is executing, not erroring)
    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("Step") || text.includes("error");
      },
      { timeout: 15000 },
    );

    const runningStatus = await statusText.textContent();
    console.log(` Running status: "${runningStatus}"`);
    expect(runningStatus).toContain("Step");
    expect(runningStatus).not.toContain("error");
    console.log(" Journey is making step progress (not erroring)");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-journey-started.png` });

    // Verify journey controls are visible
    const journeyControls = page.locator("#journeyControls");
    await expect(journeyControls).toBeVisible({ timeout: 5000 });
    console.log(" Journey controls (pause/stop) are visible");

    // ============================================================
    // STEP 6: Click stop button
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6: Stop the journey");
    console.log("=".repeat(60));

    const stopBtn = page.locator("#stopBtn");
    await expect(stopBtn).toBeVisible();
    await stopBtn.click();
    console.log(" Clicked stop button");

    // Wait for journey to stop and buttons to re-enable
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-journey-stopped.png` });

    const stoppedStatus = await statusText.textContent();
    console.log(` Stopped status: "${stoppedStatus}"`);
    expect(stoppedStatus).toMatch(/stopped|error|Select a demo/i);
    console.log(" Journey stopped");

    // ============================================================
    // STEP 7: Verify buttons re-enable after journey stops
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 7: Verify buttons re-enabled");
    console.log("=".repeat(60));

    await expect(submitVatBtn).toBeEnabled({ timeout: 10000 });
    await expect(viewObligationsBtn).toBeEnabled({ timeout: 5000 });
    await expect(viewReturnBtn).toBeEnabled({ timeout: 5000 });
    console.log(" All journey buttons are re-enabled");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-buttons-reenabled.png` });

    // ============================================================
    // STEP 8: Start and stop View Obligations journey
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 8: Start and stop View Obligations journey");
    console.log("=".repeat(60));

    await viewObligationsBtn.click();
    console.log(" Clicked View Obligations journey button");

    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("Step") || text.includes("error");
      },
      { timeout: 15000 },
    );
    console.log(" Obligations journey started");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-obligations-started.png` });

    await stopBtn.click();
    await page.waitForTimeout(2000);
    console.log(" Obligations journey stopped");

    await expect(submitVatBtn).toBeEnabled({ timeout: 10000 });
    console.log(" Buttons re-enabled after obligations journey");

    // ============================================================
    // STEP 9: Start and stop View Return journey
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 9: Start and stop View Return journey");
    console.log("=".repeat(60));

    await viewReturnBtn.click();
    console.log(" Clicked View Return journey button");

    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("Step") || text.includes("error");
      },
      { timeout: 15000 },
    );
    console.log(" View Return journey started");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-return-started.png` });

    await stopBtn.click();
    await page.waitForTimeout(2000);
    console.log(" View Return journey stopped");

    await expect(submitVatBtn).toBeEnabled({ timeout: 10000 });
    console.log(" Buttons re-enabled after view return journey");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-final-state.png` });

    // ============================================================
    // STEP 10: Final summary
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("TEST COMPLETE - All simulator page functionality verified");
    console.log("=".repeat(60));

    console.log("\n Summary:");
    console.log("   Simulator page loads with correct title");
    console.log("   Iframe is present and has source URL");
    console.log("   All three journey buttons are visible");
    console.log("   Submit VAT journey shows step progress and can be stopped");
    console.log("   View Obligations journey starts and can be stopped");
    console.log("   View Return journey starts and can be stopped");
    console.log("   Buttons re-enable after each journey stops\n");
  });

  test("View Obligations journey completes end-to-end", async ({ page }) => {
    addOnPageLogging(page);

    const simUrl = `${baseUrl}/simulator.html`;
    console.log(` Navigating to: ${simUrl}`);
    await page.goto(simUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for iframe to load
    await page.waitForFunction(
      () => {
        const frame = document.getElementById("simulatorFrame");
        return frame && frame.src && frame.src !== "" && frame.src !== window.location.href;
      },
      { timeout: 10000 },
    );
    await page.waitForTimeout(3000);

    const statusText = page.locator("#journeyStatusText");
    const viewObligationsBtn = page.locator("#journeyViewObligations");
    await expect(viewObligationsBtn).toBeVisible({ timeout: 5000 });

    // Start the journey
    console.log(" Starting View Obligations journey...");
    await viewObligationsBtn.click();

    // Wait for step progress
    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("Step") || text.includes("error");
      },
      { timeout: 15000 },
    );

    const runningStatus = await statusText.textContent();
    console.log(` Running: "${runningStatus}"`);
    expect(runningStatus).toContain("Step");
    expect(runningStatus).not.toContain("error");

    // Wait for the journey to complete (4 steps, ~15s)
    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("Obligations fetched") || text.includes("error");
      },
      { timeout: 45000 },
    );

    const completedStatus = await statusText.textContent();
    console.log(` Completed: "${completedStatus}"`);
    expect(completedStatus).not.toContain("error");
    expect(completedStatus).toContain("Obligations fetched");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-obligations-completed.png` });

    // Verify iframe navigated to obligations page (proves journey actually interacted with iframe)
    if (runTestServer === "run") {
      const frame = page.frameLocator("#simulatorFrame");
      const vrnField = frame.locator("#vrn");
      await expect(vrnField).toBeVisible({ timeout: 5000 });
      console.log(" Verified: iframe navigated to obligations page (VRN field visible)");
    }

    // Verify buttons re-enable after completion
    await expect(viewObligationsBtn).toBeEnabled({ timeout: 10000 });
    console.log(" View Obligations journey completed successfully");
  });

  test("View VAT Return journey completes end-to-end", async ({ page }) => {
    addOnPageLogging(page);

    const simUrl = `${baseUrl}/simulator.html`;
    console.log(` Navigating to: ${simUrl}`);
    await page.goto(simUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for iframe to load
    await page.waitForFunction(
      () => {
        const frame = document.getElementById("simulatorFrame");
        return frame && frame.src && frame.src !== "" && frame.src !== window.location.href;
      },
      { timeout: 10000 },
    );
    await page.waitForTimeout(3000);

    const statusText = page.locator("#journeyStatusText");
    const viewReturnBtn = page.locator("#journeyViewReturn");
    await expect(viewReturnBtn).toBeVisible({ timeout: 5000 });

    // Start the journey
    console.log(" Starting View VAT Return journey...");
    await viewReturnBtn.click();

    // Wait for step progress
    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("Step") || text.includes("error");
      },
      { timeout: 15000 },
    );

    const runningStatus = await statusText.textContent();
    console.log(` Running: "${runningStatus}"`);
    expect(runningStatus).toContain("Step");
    expect(runningStatus).not.toContain("error");

    // Wait for the journey to complete (5 steps, ~20s)
    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("VAT return details retrieved") || text.includes("error");
      },
      { timeout: 45000 },
    );

    const completedStatus = await statusText.textContent();
    console.log(` Completed: "${completedStatus}"`);
    expect(completedStatus).not.toContain("error");
    expect(completedStatus).toContain("VAT return details retrieved");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-return-completed.png` });

    // Verify iframe shows return results (form is hidden after successful retrieval)
    if (runTestServer === "run") {
      const frame = page.frameLocator("#simulatorFrame");
      const returnResults = frame.locator("#returnResults");
      await expect(returnResults).toBeVisible({ timeout: 5000 });
      console.log(" Verified: iframe shows VAT return results");
    }

    // Verify buttons re-enable after completion
    await expect(viewReturnBtn).toBeEnabled({ timeout: 10000 });
    console.log(" View VAT Return journey completed successfully");
  });

  test("Submit VAT Return journey completes end-to-end", async ({ page }) => {
    addOnPageLogging(page);

    const simUrl = `${baseUrl}/simulator.html`;
    console.log(` Navigating to: ${simUrl}`);
    await page.goto(simUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for iframe to load
    await page.waitForFunction(
      () => {
        const frame = document.getElementById("simulatorFrame");
        return frame && frame.src && frame.src !== "" && frame.src !== window.location.href;
      },
      { timeout: 10000 },
    );
    await page.waitForTimeout(3000);

    const statusText = page.locator("#journeyStatusText");
    const submitVatBtn = page.locator("#journeySubmitVat");
    await expect(submitVatBtn).toBeVisible({ timeout: 5000 });

    // Start the journey
    console.log(" Starting Submit VAT Return journey...");
    await submitVatBtn.click();

    // Wait for step progress
    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("Step") || text.includes("error");
      },
      { timeout: 15000 },
    );

    const runningStatus = await statusText.textContent();
    console.log(` Running: "${runningStatus}"`);
    expect(runningStatus).toContain("Step");
    expect(runningStatus).not.toContain("error");

    // Wait for the journey to complete (10 steps, ~30s)
    await page.waitForFunction(
      () => {
        const text = document.getElementById("journeyStatusText").textContent;
        return text.includes("VAT return submitted") || text.includes("error");
      },
      { timeout: 60000 },
    );

    const completedStatus = await statusText.textContent();
    console.log(` Completed: "${completedStatus}"`);
    expect(completedStatus).not.toContain("error");
    expect(completedStatus).toContain("VAT return submitted");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-submitvat-completed.png` });

    // Verify iframe navigated to submit VAT page and shows receipt
    if (runTestServer === "run") {
      const frame = page.frameLocator("#simulatorFrame");
      const receipt = frame.locator("#receiptDisplay");
      await expect(receipt).toBeVisible({ timeout: 10000 });
      console.log(" Verified: iframe shows submission receipt");
    }

    // Verify buttons re-enable after completion
    await expect(submitVatBtn).toBeEnabled({ timeout: 10000 });
    console.log(" Submit VAT Return journey completed successfully");
  });
});
