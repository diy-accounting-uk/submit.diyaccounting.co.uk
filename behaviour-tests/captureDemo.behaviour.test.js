// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/captureDemo.behaviour.test.js
//
// Captures 3 demo journey videos from the simulator page.
// Each video captures just the embedded simulator iframe content.
//
// Usage:
//   npx dotenv -e .env.simulator -- npx playwright test --project=captureDemo

import { execSync } from "child_process";
import { test } from "./helpers/playwrightTestForCapture.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalHttpSimulator,
  runLocalDynamoDb,
} from "./helpers/behaviour-helpers.js";
import { ensureDirSync } from "fs-extra";
import { initializeSalt } from "@app/services/subHasher.js";
import { putBundle } from "@app/data/dynamoDbBundleRepository.js";
import fs from "fs";
import path from "path";

dotenvConfigIfNotBlank({ path: ".env" });

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const testDynamoDb = getEnvVarAndLog("testDynamoDb", "TEST_DYNAMODB", null);
const runHttpSimulator = getEnvVarAndLog("runHttpSimulator", "TEST_HTTP_SIMULATOR", null);
const httpSimulatorPort = getEnvVarAndLog("httpSimulatorPort", "TEST_HTTP_SIMULATOR_PORT", 9000);
const baseUrlRaw = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const baseUrl = baseUrlRaw ? baseUrlRaw.replace(/\/+$/, "") : "";

const outputDir = "target/demo-videos";

let httpServer, dynamoDbProcess, httpSimulatorProcess;

// Playwright only finalizes a video once its page/context closes, which happens
// in the test fixture's teardown after the test function returns - so a video
// can't be saved to its final name from inside the test itself (that would
// deadlock waiting for a close that hasn't happened yet). Instead, record the
// in-progress path per journey and copy the finished file in afterAll, once
// every test (and its context) has completed.
const capturedVideos = [];

const IFRAME_FULLSCREEN_CSS = `
  body > *:not(script) { display: none !important; }
  main { display: block !important; }
  main > *:not(.simulator-container) { display: none !important; }
  .simulator-container { display: block !important; }
  .simulator-notice, .journey-buttons, .journey-status, .simulator-cta,
  header, footer, nav, .simulator-overlay-label, .simulator-open-link,
  #journeyControls { display: none !important; }
  .simulator-container {
    position: fixed !important; top: 0 !important; left: 0 !important;
    width: 100vw !important; height: 100vh !important;
    margin: 0 !important; padding: 0 !important; z-index: 99999 !important;
  }
  #simulatorFrame {
    width: 100% !important; height: 100% !important;
    border: none !important; margin: 0 !important;
  }
`;

test.describe("Capture Demo Videos", () => {
  test.beforeAll(async () => {
    ensureDirSync(outputDir);

    if (runTestServer === "run") {
      console.log("Building simulator...");
      execSync("npm run build:simulator", { stdio: "pipe" });
    }

    if (testDynamoDb === "run") {
      dynamoDbProcess = await runLocalDynamoDb(testDynamoDb);
      await initializeSalt();
      const demoUserSub = "demo-user-12345";
      for (const bundleId of ["day-guest"]) {
        await putBundle(demoUserSub, { bundleId, expiry: "2099-12-31", tokensGranted: 10, tokensConsumed: 0 });
      }
      console.log("  Seeded demo user bundles");
    }

    if (runTestServer === "run" || runHttpSimulator === "run") {
      const simPort = httpSimulatorPort || 9000;
      httpSimulatorProcess = await runLocalHttpSimulator("run", simPort);
      process.env.HMRC_BASE_URI = `http://localhost:${simPort}`;
      process.env.HMRC_SANDBOX_BASE_URI = `http://localhost:${simPort}`;
    }

    if (runTestServer === "run") {
      httpServer = await runLocalHttpServer(runTestServer, httpServerPort);
    }

    console.log("Servers ready for video capture");
  });

  test.afterAll(async () => {
    if (httpServer) httpServer.kill();
    if (httpSimulatorProcess?.stop) await httpSimulatorProcess.stop();
    if (dynamoDbProcess?.stop) await dynamoDbProcess.stop();

    // Every test's context has closed by now, so each video is fully encoded.
    for (const { name, videoPath } of capturedVideos) {
      const destPath = path.join(outputDir, `${name}.webm`);
      fs.copyFileSync(videoPath, destPath);
      console.log(`  [${name}] Video saved to: ${destPath}`);
    }
  });

  for (const journey of [
    { name: "view-obligations", buttonId: "#journeyViewObligations", completionText: "Obligations fetched", timeout: 45000 },
    { name: "view-return", buttonId: "#journeyViewReturn", completionText: "VAT return details retrieved", timeout: 45000 },
    { name: "submit-vat", buttonId: "#journeySubmitVat", completionText: "VAT return submitted", timeout: 60000 },
  ]) {
    test(`Capture ${journey.name} video`, async ({ page }) => {
      addOnPageLogging(page);

      await page.goto(`${baseUrl}/simulator.html`, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for iframe to load
      await page.waitForFunction(
        () => {
          const frame = document.getElementById("simulatorFrame");
          return frame && frame.src && frame.src !== "" && frame.src !== window.location.href;
        },
        { timeout: 10000 },
      );
      await page.waitForTimeout(3000);
      console.log(`  [${journey.name}] Page and iframe loaded`);

      // Make iframe fill viewport
      await page.addStyleTag({ content: IFRAME_FULLSCREEN_CSS });
      console.log(`  [${journey.name}] Iframe maximized`);

      // Brief hold on the clean opening frame before automation starts
      await page.waitForTimeout(1000);

      // Start journey via JS (button hidden by CSS but still in DOM)
      await page.evaluate((btnId) => document.querySelector(btnId).click(), journey.buttonId);
      console.log(`  [${journey.name}] Journey started`);

      // Wait for step progress
      await page.waitForFunction(
        () => {
          const text = document.getElementById("journeyStatusText")?.textContent || "";
          return text.includes("Step") || text.includes("error");
        },
        { timeout: 15000 },
      );

      const runningStatus = await page.locator("#journeyStatusText").textContent();
      console.log(`  [${journey.name}] Running: "${runningStatus}"`);

      if (runningStatus.includes("error")) {
        throw new Error(`[${journey.name}] Journey failed to start: ${runningStatus}`);
      }

      // Wait for journey completion
      await page.waitForFunction(
        (text) => {
          const status = document.getElementById("journeyStatusText")?.textContent || "";
          return status.includes(text) || status.includes("error");
        },
        journey.completionText,
        { timeout: journey.timeout },
      );

      const finalStatus = await page.locator("#journeyStatusText").textContent();
      if (finalStatus.includes("error") && !finalStatus.includes(journey.completionText)) {
        throw new Error(`[${journey.name}] Journey ended with an error: ${finalStatus}`);
      }
      console.log(`  [${journey.name}] Completed: "${finalStatus}"`);

      // Hold on final frame for 3 seconds so the ending isn't an abrupt cut
      await page.waitForTimeout(3000);

      // Record where the video will land; it's copied to its final name in
      // afterAll once the context (and therefore the video encoding) has closed.
      const videoPath = await page.video().path();
      capturedVideos.push({ name: journey.name, videoPath });
    });
  }
});
