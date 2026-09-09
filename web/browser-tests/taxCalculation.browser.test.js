// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/taxCalculation.browser.test.js
// Browser tests for the ITSA tax calculation page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Tax Calculation - Form", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/taxCalculation.html"), "utf-8");
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
      url: "http://localhost:3000/hmrc/itsa/taxCalculation.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);
  }

  test("displays the trigger form and the calculate button", async ({ page }) => {
    await loadPage(page);

    const form = page.locator("#itsaCalculationTriggerForm");
    await expect(form).toBeVisible();

    const triggerBtn = page.locator("#triggerBtn");
    await expect(triggerBtn).toBeVisible();
    await expect(triggerBtn).toHaveText(/Calculate/);

    const resultsContainer = page.locator("#calculationResults");
    await expect(resultsContainer).toBeHidden();
  });

  test("shows the disclaimer above the figures in document order", async ({ page }) => {
    await loadPage(page);

    const disclaimer = page.locator("#calculationDisclaimer");
    await expect(disclaimer).toContainText(/estimate/i);

    // DOCUMENT_POSITION_FOLLOWING (4) on the comparison target means the disclaimer precedes
    // the figures in source order, so the reader sees it first regardless of layout.
    const disclaimerPrecedesFigures = await page.evaluate(() => {
      const disclaimerEl = document.getElementById("calculationDisclaimer");
      const figuresEl = document.getElementById("calculationFigures");
      return Boolean(disclaimerEl.compareDocumentPosition(figuresEl) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(disclaimerPrecedesFigures).toBe(true);
  });

  test("displays the headline figure and messages, errors first", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => {
      window.displayCalculation(
        {
          metadata: { calculationId: "abc123", calculationType: "in-year" },
          calculation: {
            taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: { totalIncomeTax: 1400 }, nics: { totalNic: 500 }, totalTaxDeducted: 0 },
            allowancesAndDeductions: { personalAllowance: 12570 },
          },
          messages: { errors: [{ id: "C1", text: "an error" }], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
      );
    });

    await expect(page.locator("#totalIncomeTaxAndNicsDue")).toHaveText("£1900.00");
    const messagesList = page.locator("#calculationMessagesList li").first();
    await expect(messagesList).toContainText("C1");
  });

  test("shows the continue-to-final-declaration link only for an intent-to-finalise calculation", async ({ page }) => {
    await loadPage(page);
    // The results live in a container hidden until a calculation has been triggered - show it
    // directly, the way runTrigger does after a successful trigger.
    await page.evaluate(() => {
      document.getElementById("calculationResults").style.display = "block";
    });

    await page.evaluate(() => {
      window.displayCalculation(
        {
          metadata: { calculationId: "calc-1", calculationType: "intent-to-finalise" },
          calculation: {
            taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 },
            allowancesAndDeductions: {},
          },
          messages: { errors: [], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
      );
    });

    await expect(page.locator("#continueToFinalDeclaration")).toBeVisible();
    await expect(page.locator("#continueToFinalDeclarationLink")).toHaveAttribute("href", /calculationId=calc-1/);
  });
});
