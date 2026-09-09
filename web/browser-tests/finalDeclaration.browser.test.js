// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/finalDeclaration.browser.test.js
// Browser tests for the ITSA final declaration page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Final Declaration - Form", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/finalDeclaration.html"), "utf-8");
  });

  async function loadPage(page, url = "http://localhost:3000/hmrc/itsa/finalDeclaration.html") {
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

    // page.setContent's `url` option only resolves relative asset paths - it never becomes
    // window.location (the page stays "about:blank"), so a test reading the query string needs
    // a real navigation. Route the exact URL to the modified HTML and goto it instead.
    await page.route(url, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("displays the retrieve form and the retrieve button", async ({ page }) => {
    await loadPage(page);

    const form = page.locator("#itsaFinalDeclarationRetrieveForm");
    await expect(form).toBeVisible();

    const retrieveBtn = page.locator("#retrieveBtn");
    await expect(retrieveBtn).toBeVisible();
    await expect(retrieveBtn).toHaveText(/Retrieve Calculation/);

    const declarationContainer = page.locator("#declarationContainer");
    await expect(declarationContainer).toBeHidden();
  });

  test("prefills nino, taxYear and calculationId from the query string", async ({ page }) => {
    await loadPage(
      page,
      "http://localhost:3000/hmrc/itsa/finalDeclaration.html?nino=AB123456C&taxYear=2023-24&calculationId=f2fb30e5-4ab6-4a29-b3c1-c7efc90fc66a",
    );

    await expect(page.locator("#nino")).toHaveValue("AB123456C");
    await expect(page.locator("#taxYear")).toHaveValue("2023-24");
    await expect(page.locator("#calculationId")).toHaveValue("f2fb30e5-4ab6-4a29-b3c1-c7efc90fc66a");
  });

  test("keeps the submit button disabled until the declaration is ticked", async ({ page }) => {
    await loadPage(page);

    // The declaration lives in a container hidden until a calculation has been retrieved -
    // show it directly, the way handleRetrieveFormSubmission does after a successful retrieve.
    await page.evaluate(() => {
      document.getElementById("declarationContainer").style.display = "block";
    });

    await page.evaluate(() => {
      window.displayCalculation({
        metadata: { calculationId: "calc-1", calculationType: "intent-to-finalise" },
        calculation: { taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 }, allowancesAndDeductions: {} },
      });
    });

    const submitBtn = page.locator("#submitDeclarationBtn");
    await expect(submitBtn).toBeDisabled();

    await page.locator("#declarationTick").check();
    await expect(submitBtn).toBeEnabled();

    await page.locator("#declarationTick").uncheck();
    await expect(submitBtn).toBeDisabled();
  });

  test("refuses to enable the declaration for a calculation that is not intent-to-finalise", async ({ page }) => {
    await loadPage(page);

    // The declaration lives in a container hidden until a calculation has been retrieved -
    // show it directly, the way handleRetrieveFormSubmission does after a successful retrieve.
    await page.evaluate(() => {
      document.getElementById("declarationContainer").style.display = "block";
    });

    await page.evaluate(() => {
      window.displayCalculation({
        metadata: { calculationId: "calc-2", calculationType: "in-year" },
        calculation: { taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 }, allowancesAndDeductions: {} },
      });
    });

    await expect(page.locator("#notReadyForDeclaration")).toBeVisible();
    await expect(page.locator("#declarationSection")).toBeHidden();
  });

  test("shows the calculationId it is about to confirm", async ({ page }) => {
    await loadPage(page);

    // The declaration lives in a container hidden until a calculation has been retrieved -
    // show it directly, the way handleRetrieveFormSubmission does after a successful retrieve.
    await page.evaluate(() => {
      document.getElementById("declarationContainer").style.display = "block";
    });

    await page.evaluate(() => {
      window.displayCalculation({
        metadata: { calculationId: "shown-calc-id", calculationType: "intent-to-finalise" },
        calculation: { taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 }, allowancesAndDeductions: {} },
      });
    });

    await expect(page.locator("#calculationIdDisplay")).toContainText("shown-calc-id");
  });
});
