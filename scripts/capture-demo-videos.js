#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/capture-demo-videos.js
//
// Captures 3 demo journey videos from the simulator page using Playwright.
// Each video captures only the embedded simulator iframe content.
//
// Usage:
//   npx dotenv -e .env.simulator -- node scripts/capture-demo-videos.js
//
// Prerequisites:
//   - npm run build:simulator (generates web/public-simulator/)
//   - Playwright browsers installed (npx playwright install chromium)

import { chromium } from "playwright";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// Import test helpers for starting local servers
const { runLocalHttpServer, runLocalHttpSimulator, runLocalDynamoDb } = await import(
  path.join(projectRoot, "behaviour-tests/helpers/behaviour-helpers.js")
);
const { initializeSalt } = await import(path.join(projectRoot, "app/services/subHasher.js"));
const { putBundle } = await import(path.join(projectRoot, "app/data/dynamoDbBundleRepository.js"));

const outputDir = path.join(projectRoot, "target/demo-videos");
fs.mkdirSync(outputDir, { recursive: true });

const JOURNEYS = [
  {
    name: "view-obligations",
    buttonId: "#journeyViewObligations",
    completionText: "Obligations fetched",
    timeout: 45000,
  },
  {
    name: "view-return",
    buttonId: "#journeyViewReturn",
    completionText: "VAT return details retrieved",
    timeout: 45000,
  },
  {
    name: "submit-vat",
    buttonId: "#journeySubmitVat",
    completionText: "VAT return submitted",
    timeout: 60000,
  },
];

async function main() {
  console.log("=== Demo Video Capture ===\n");

  // Build simulator
  console.log("Building simulator...");
  execSync("npm run build:simulator", { cwd: projectRoot, stdio: "pipe" });
  console.log("Simulator built.\n");

  // Start local servers
  const httpServerPort = process.env.TEST_SERVER_HTTP_PORT || 3000;
  const httpSimulatorPort = process.env.TEST_HTTP_SIMULATOR_PORT || 9000;

  console.log("Starting local servers...");
  const dynamoDbProcess = await runLocalDynamoDb("run");

  // Seed demo user bundles
  await initializeSalt();
  const demoUserSub = "demo-user-12345";
  for (const bundleId of ["test", "day-guest"]) {
    await putBundle(demoUserSub, { bundleId, expiry: "2099-12-31", tokensGranted: 10, tokensConsumed: 0 });
  }
  console.log("  Seeded demo user bundles in DynamoDB");

  const httpSimulatorProcess = await runLocalHttpSimulator("run", httpSimulatorPort);
  process.env.HMRC_BASE_URI = `http://localhost:${httpSimulatorPort}`;
  process.env.HMRC_SANDBOX_BASE_URI = `http://localhost:${httpSimulatorPort}`;
  console.log(`  HMRC endpoints → http://localhost:${httpSimulatorPort}`);

  const httpServer = await runLocalHttpServer("run", httpServerPort);
  const baseUrl = `http://localhost:${httpServerPort}`;
  console.log(`  HTTP server → ${baseUrl}`);
  console.log("Servers ready.\n");

  const browser = await chromium.launch({ headless: true });

  try {
    for (const journey of JOURNEYS) {
      console.log(`\n--- Recording: ${journey.name} ---`);

      const journeyDir = path.join(outputDir, journey.name);
      fs.mkdirSync(journeyDir, { recursive: true });

      // Create context with video recording sized to simulator iframe
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        recordVideo: { dir: journeyDir, size: { width: 1280, height: 900 } },
      });

      // Block analytics
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (
          url.includes("google-analytics") ||
          url.includes("googletagmanager") ||
          url.includes("analytics.js") ||
          url.includes("gtag/js") ||
          url.startsWith("https://client.rum")
        ) {
          return route.fulfill({ status: 204, body: "" });
        }
        return route.continue();
      });

      const page = await context.newPage();

      // Navigate to demo page
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
      console.log("  Page and iframe loaded");

      // Inject CSS to make the iframe fill the viewport completely
      await page.addStyleTag({
        content: `
          body > *:not(script):not(#simulatorFrame) { display: none !important; }
          main > *:not(.simulator-container) { display: none !important; }
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
        `,
      });
      console.log("  Iframe maximized to viewport");

      // Click the journey button via JavaScript (it's hidden by CSS but still in DOM)
      await page.evaluate((btnId) => {
        document.querySelector(btnId).click();
      }, journey.buttonId);
      console.log(`  Started journey: ${journey.name}`);

      // Wait for step progress
      await page.waitForFunction(
        () => {
          const text = document.getElementById("journeyStatusText")?.textContent || "";
          return text.includes("Step") || text.includes("error");
        },
        { timeout: 15000 },
      );

      const runningStatus = await page.locator("#journeyStatusText").textContent();
      console.log(`  Running: "${runningStatus}"`);

      if (runningStatus.includes("error")) {
        console.error(`  ERROR: Journey failed to start - ${runningStatus}`);
        await context.close();
        continue;
      }

      // Wait for journey to complete
      const completionText = journey.completionText;
      await page.waitForFunction(
        (text) => {
          const status = document.getElementById("journeyStatusText")?.textContent || "";
          return status.includes(text) || status.includes("error");
        },
        completionText,
        { timeout: journey.timeout },
      );

      const finalStatus = await page.locator("#journeyStatusText").textContent();
      console.log(`  Completed: "${finalStatus}"`);

      // Hold for 3 seconds on the final frame
      await page.waitForTimeout(3000);

      // Close context to finalize video
      const videoPath = await page.video().path();
      await context.close();

      // Rename video to a meaningful name
      const destPath = path.join(outputDir, `${journey.name}.webm`);
      if (fs.existsSync(videoPath)) {
        fs.copyFileSync(videoPath, destPath);
        console.log(`  Video saved: ${destPath}`);
      }
    }
  } finally {
    await browser.close();
    if (httpServer) httpServer.kill();
    if (httpSimulatorProcess?.stop) await httpSimulatorProcess.stop();
    if (dynamoDbProcess?.stop) await dynamoDbProcess.stop();
  }

  console.log(`\n=== Done! Videos saved to ${outputDir} ===`);
  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".webm"));
  for (const f of files) {
    const stat = fs.statSync(path.join(outputDir, f));
    console.log(`  ${f} (${(stat.size / 1024).toFixed(0)} KB)`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
