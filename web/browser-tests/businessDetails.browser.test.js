// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/browser-tests/businessDetails.browser.test.js
// Browser tests for the ITSA Business Details page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Business Details - Form", () => {
  let businessDetailsHtmlContent;

  test.beforeAll(async () => {
    businessDetailsHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/businessDetails.html"), "utf-8");
  });

  test("displays the NINO field and the retrieve button", async ({ page }) => {
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

    const modifiedHtml = businessDetailsHtmlContent
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
      url: "http://localhost:3000/hmrc/itsa/businessDetails.html",
      waitUntil: "domcontentloaded",
    });

    await delay(200);

    const form = page.locator("#itsaBusinessDetailsForm");
    await expect(form).toBeVisible();

    const ninoInput = page.locator("#nino");
    await expect(ninoInput).toBeVisible();

    const retrieveBtn = page.locator("#retrieveBtn");
    await expect(retrieveBtn).toBeVisible();
    await expect(retrieveBtn).toHaveText(/Retrieve Business Details/);

    // Results container starts hidden until a search completes
    const resultsContainer = page.locator("#businessDetailsResults");
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

    const modifiedHtml = businessDetailsHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">');
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/businessDetails.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);

    const ninoInput = page.locator("#nino");
    await ninoInput.fill("ab123456c");
    await expect(ninoInput).toHaveValue("AB123456C");
  });

  test("displays a table row per business when results render", async ({ page }) => {
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    const modifiedHtml = businessDetailsHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">');
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/businessDetails.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);

    await page.evaluate(() => {
      window.displayBusinesses([
        { typeOfBusiness: "self-employment", businessId: "XBIS12345678901", tradingName: "Company X" },
        { typeOfBusiness: "uk-property", businessId: "XPRO00000000001" },
      ]);
    });

    const rows = page.locator("#businessDetailsTable table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Company X");
    await expect(rows.nth(1)).toContainText("uk-property");
  });
});
