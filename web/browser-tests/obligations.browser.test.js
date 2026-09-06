// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/browser-tests/obligations.browser.test.js
// Browser tests for the ITSA Obligations page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Obligations - Form", () => {
  let obligationsHtmlContent;

  test.beforeAll(async () => {
    obligationsHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/obligations.html"), "utf-8");
  });

  test("displays the NINO field, filters and the retrieve button", async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`[PAGE_CONSOLE:${msg.type()}]`, msg.text());
      }
    });
    page.on("pageerror", (err) => {
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });

    // Stub globals used by inline scripts
    await page.addInitScript(() => {
      window.showStatus = window.showStatus || (() => {});
      window.hideStatus = window.hideStatus || (() => {});
      window.showLoading = window.showLoading || (() => {});
      window.hideLoading = window.hideLoading || (() => {});
      window.generateRandomState = window.generateRandomState || (() => "test-state");
      window.getGovClientHeaders = window.getGovClientHeaders || (() => Promise.resolve({}));
      window.authorizedFetch = window.authorizedFetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
      window.hmrcScopeCheck = window.hmrcScopeCheck || {
        isTokenSufficient: () => Promise.resolve(true),
        getOAuthScopeString: () => Promise.resolve("read:self-assessment"),
        clearHmrcToken: () => {},
      };
    });

    // Prevent external script files from executing
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      if (resourceType === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    const modifiedHtml = obligationsHtmlContent
      .replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">')
      .replace(
        "<body>",
        `<body><script>
window.showStatus = window.showStatus || function(){};
window.hideStatus = window.hideStatus || function(){};
window.showLoading = window.showLoading || function(){};
window.hideLoading = window.hideLoading || function(){};
window.generateRandomState = window.generateRandomState || function(){ return "test-state"; };
window.getGovClientHeaders = window.getGovClientHeaders || function(){ return Promise.resolve({}); };
window.authorizedFetch = window.authorizedFetch || function(){ return Promise.resolve({ ok: true, json: function(){ return Promise.resolve({}); }}); };
</script>`,
      );

    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/obligations.html",
      waitUntil: "domcontentloaded",
    });

    await delay(200);

    const form = page.locator("#itsaObligationsForm");
    await expect(form).toBeVisible();

    const ninoInput = page.locator("#nino");
    await expect(ninoInput).toBeVisible();

    const typeOfBusinessSelect = page.locator("#typeOfBusiness");
    await expect(typeOfBusinessSelect).toBeVisible();

    const statusSelect = page.locator("#status");
    await expect(statusSelect).toBeVisible();

    const retrieveBtn = page.locator("#retrieveBtn");
    await expect(retrieveBtn).toBeVisible();
    await expect(retrieveBtn).toHaveText(/Retrieve Obligations/);

    // Results container starts hidden until a search completes
    const resultsContainer = page.locator("#obligationsResults");
    await expect(resultsContainer).toBeHidden();
  });

  test("uppercases the NINO as the user types", async ({ page }) => {
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    const modifiedHtml = obligationsHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">');
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/obligations.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);

    const ninoInput = page.locator("#nino");
    await ninoInput.fill("ab123456c");
    await expect(ninoInput).toHaveValue("AB123456C");
  });

  test("displays a table row per obligation when results render", async ({ page }) => {
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    const modifiedHtml = obligationsHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">');
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/obligations.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);

    await page.evaluate(() => {
      window.displayObligations([
        {
          typeOfBusiness: "self-employment",
          businessId: "XAIS12345678910",
          obligationDetails: [
            { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05", dueDate: "2024-08-05", status: "fulfilled", receivedDate: "2024-08-01" },
            { periodStartDate: "2024-07-06", periodEndDate: "2024-10-05", dueDate: "2024-11-05", status: "open" },
          ],
        },
      ]);
    });

    const rows = page.locator("#obligationsTable table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("fulfilled");
    await expect(rows.nth(1)).toContainText("open");
  });
});
