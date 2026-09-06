// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/browser-tests/selfEmploymentPeriod.browser.test.js
// Browser tests for the ITSA self-employment quarterly update page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Self-Employment Period - Form", () => {
  let periodHtmlContent;

  test.beforeAll(async () => {
    periodHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/selfEmploymentPeriod.html"), "utf-8");
  });

  test("displays the filing form and the file button", async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`[PAGE_CONSOLE:${msg.type()}]`, msg.text());
      }
    });
    page.on("pageerror", (err) => {
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });

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
        getOAuthScopeString: () => Promise.resolve("write:self-assessment"),
        clearHmrcToken: () => {},
      };
    });

    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    const modifiedHtml = periodHtmlContent
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
      url: "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html",
      waitUntil: "domcontentloaded",
    });

    await delay(200);

    const form = page.locator("#itsaSelfEmploymentPeriodForm");
    await expect(form).toBeVisible();

    const ninoInput = page.locator("#nino");
    await expect(ninoInput).toBeVisible();

    const businessIdInput = page.locator("#businessId");
    await expect(businessIdInput).toBeVisible();

    const submitBtn = page.locator("#submitBtn");
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveText(/File Quarterly Update/);

    const resultsContainer = page.locator("#selfEmploymentPeriodResults");
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

    const modifiedHtml = periodHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">');
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);

    const ninoInput = page.locator("#nino");
    await ninoInput.fill("ab123456c");
    await expect(ninoInput).toHaveValue("AB123456C");
  });

  test("displays the periodId when a result renders", async ({ page }) => {
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    const modifiedHtml = periodHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">');
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);

    await page.evaluate(() => {
      window.displayResult({ periodId: "2024-04-06_2024-07-05" });
    });

    const periodIdResult = page.locator("#periodIdResult");
    await expect(periodIdResult).toHaveText("2024-04-06_2024-07-05");
  });
});
