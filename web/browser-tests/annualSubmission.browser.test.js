// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/annualSubmission.browser.test.js
// Browser tests for the ITSA annual submission page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Annual Submission - Form", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/annualSubmission.html"), "utf-8");
  });

  async function loadPage(page) {
    const url = "http://localhost:3000/hmrc/itsa/annualSubmission.html";

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

    // page.setContent never fires a real DOMContentLoaded for the page's own listener (it races
    // ahead of the script attaching one), which the allowance radios' change handler depends on.
    // Route the exact URL to the modified HTML and navigate to it instead, like a real page load.
    await page.route(url, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("displays the load form and the load button", async ({ page }) => {
    await loadPage(page);

    const form = page.locator("#itsaAnnualLoadForm");
    await expect(form).toBeVisible();

    const loadBtn = page.locator("#loadBtn");
    await expect(loadBtn).toBeVisible();
    await expect(loadBtn).toHaveText(/Load Annual Submission/);

    const editForm = page.locator("#annualEditForm");
    await expect(editForm).toBeHidden();
  });

  test("uppercases the NINO as the user types", async ({ page }) => {
    await loadPage(page);

    const ninoInput = page.locator("#nino");
    await ninoInput.fill("ab123456c");
    await expect(ninoInput).toHaveValue("AB123456C");
  });

  test("enables only the trading income allowance field when that radio is selected", async ({ page }) => {
    await loadPage(page);
    // The allowance radios live in the edit form, hidden until a submission has loaded - show
    // it directly, the way populateEditForm's caller does after a successful load.
    await page.evaluate(() => {
      document.getElementById("annualEditForm").style.display = "block";
    });

    await page.locator("#allowanceTypeTrading").check();
    await expect(page.locator("#tradingIncomeAllowance")).toBeEnabled();
    await expect(page.locator("#annualInvestmentAllowance")).toBeDisabled();
  });

  test("enables only the itemised allowance fields when that radio is selected", async ({ page }) => {
    await loadPage(page);
    await page.evaluate(() => {
      document.getElementById("annualEditForm").style.display = "block";
    });

    await page.locator("#allowanceTypeItemised").check();
    await expect(page.locator("#annualInvestmentAllowance")).toBeEnabled();
    await expect(page.locator("#tradingIncomeAllowance")).toBeDisabled();
  });

  test("populates the edit form from a loaded annual submission", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => {
      window.populateEditForm({
        adjustments: { basisAdjustment: 250 },
        allowances: { tradingIncomeAllowance: 1000 },
        nonFinancials: { class4NicsExemptionReason: "trustee" },
      });
    });

    await expect(page.locator("#basisAdjustment")).toHaveValue("250");
    await expect(page.locator("#allowanceTypeTrading")).toBeChecked();
    await expect(page.locator("#tradingIncomeAllowance")).toHaveValue("1000");
    await expect(page.locator("#class4NicsExemptionReason")).toHaveValue("trustee");
  });
});
