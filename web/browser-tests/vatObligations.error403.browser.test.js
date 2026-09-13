// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/vatObligations.error403.browser.test.js
// The server now returns a real 403 for an HMRC-forbidden request, with HMRC's own
// explanation carried in the body's responseBody field (app/services/hmrcApi.js
// http403ForbiddenFromHmrcResponse). This proves the page renders that reason instead of
// falling through a generic error path - the app/http-simulator's INSOLVENT_TRADER
// scenario for VAT obligations is the source of the response shape mocked here.

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let serverProcess;
let baseUrl;

test.beforeAll(async () => {
  const port = await new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/static-server.mjs", "web/public"], {
      cwd: path.resolve(process.cwd()),
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess = child;
    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/LISTENING_ON:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.stderr.on("data", (chunk) => console.error(`[static-server] ${chunk}`));
    child.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  serverProcess?.kill();
});

test.describe("vatObligations - 403 from HMRC", () => {
  test("shows HMRC's own reason, not a generic error, for a 403 response", async ({ page }) => {
    await page.route("**/submit.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.authorizedFetch = (url, options) => fetch(url, options);
          window.getGovClientHeaders = async () => ({});
        `,
      });
    });

    await page.route("**/hmrc-scope-check.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.hmrcScopeCheck = {
            isTokenSufficient: async () => true,
            clearHmrcToken: () => {},
            getOAuthScopeString: async () => "read:vat",
          };
        `,
      });
    });

    // Body shape matches app/services/hmrcApi.js's http403ForbiddenFromHmrcResponse: the
    // curated userMessage sits in message/userMessage, but HMRC's own text from the
    // http-simulator's INSOLVENT_TRADER scenario (app/http-simulator/scenarios/obligations.js)
    // is preserved verbatim in responseBody.
    await page.route("**/api/v1/hmrc/vat/obligation*", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          message: "This VAT registration is for an insolvent trader",
          hmrcResponseCode: 403,
          responseBody: { code: "INSOLVENT_TRADER", message: "The trader is insolvent" },
          userMessage: "This VAT registration is for an insolvent trader",
          actionAdvice: "VAT returns cannot be submitted for insolvent traders. Please contact HMRC",
        }),
      });
    });

    await page.addInitScript(() => {
      sessionStorage.setItem("hmrcAccessToken", "test-access-token");
    });

    await page.goto(`${baseUrl}/hmrc/vat/vatObligations.html`, { waitUntil: "domcontentloaded" });

    await page.locator("#vrn").fill("193054661");
    await page.locator("#retrieveBtn").click();

    const errorBanner = page.locator("#statusMessagesContainer .status-message.status-error");
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText("The trader is insolvent");
    await expect(errorBanner).not.toContainText("An unexpected error occurred");
    await page.screenshot({ path: "target/browser-test-results/vatObligations-403-error.png" });
  });
});
