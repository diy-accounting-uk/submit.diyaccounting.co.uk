// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/browser-tests/adjustments.browser.test.js
// Browser tests for the ITSA year-end adjustments (BSAS) page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Adjustments - Form", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/adjustments.html"), "utf-8");
  });

  async function loadPage(page) {
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    const modifiedHtml = htmlContent
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
</script>`,
      );

    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/adjustments.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);
  }

  test("displays the trigger form and the trigger button", async ({ page }) => {
    await loadPage(page);

    const form = page.locator("#itsaBsasTriggerForm");
    await expect(form).toBeVisible();

    const triggerBtn = page.locator("#triggerBtn");
    await expect(triggerBtn).toBeVisible();
    await expect(triggerBtn).toHaveText(/Trigger Year-End Summary/);

    const summaryContainer = page.locator("#summaryContainer");
    await expect(summaryContainer).toBeHidden();
  });

  test("uppercases the NINO as the user types", async ({ page }) => {
    await loadPage(page);

    const ninoInput = page.locator("#nino");
    await ninoInput.fill("ab123456c");
    await expect(ninoInput).toHaveValue("AB123456C");
  });

  test("displays the year-end summary figures when a summary renders", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => {
      window.displaySummary({
        adjustableSummaryCalculation: {
          totalIncome: 10000,
          income: { turnover: 10000 },
          totalExpenses: 4000,
          expenses: { costOfGoods: 2000 },
          totalAdditions: 0,
          netProfit: 6000,
        },
      });
    });

    const summaryDetails = page.locator("#summaryDetails");
    await expect(summaryDetails).toContainText("10000");
    await expect(summaryDetails).toContainText("6000");
  });
});
