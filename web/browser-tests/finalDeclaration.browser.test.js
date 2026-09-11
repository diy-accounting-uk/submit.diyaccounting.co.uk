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

  // The gap this page exists to catch is a business the customer has that HMRC did not count,
  // so the business list must come from HMRC's own inputs.incomeSources.businessIncomeSources -
  // never from a page the customer visited earlier - and a business showing a loss with no
  // claim recorded must say so above the tick, not after.
  const twoBusinessCalculation = {
    metadata: { calculationId: "calc-3", calculationType: "intent-to-finalise" },
    calculation: {
      taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 },
      allowancesAndDeductions: {},
      businessProfitAndLoss: [
        { incomeSourceId: "XAIS12345678901", incomeSourceType: "self-employment", netLoss: 500 },
        { incomeSourceId: "XAIS12345678902", incomeSourceType: "uk-property", netProfit: 1000 },
      ],
    },
    inputs: {
      incomeSources: {
        businessIncomeSources: [
          { incomeSourceId: "XAIS12345678901", incomeSourceType: "self-employment", latestPeriodEndDate: "2024-04-05" },
          { incomeSourceId: "XAIS12345678902", incomeSourceType: "uk-property", latestPeriodEndDate: "2024-04-05" },
        ],
      },
    },
  };

  async function showBusinessesAndLossPositions(page, calculation, lossesByBusiness = {}, taxLiabilityAdjustments = null) {
    await page.evaluate(
      ({ calculation, lossesByBusiness, taxLiabilityAdjustments }) => {
        window.getLossesAndClaims = (nino, businessId) => {
          const claims = lossesByBusiness[businessId];
          return claims ? Promise.resolve({ claims }) : Promise.reject(new Error("Not found"));
        };
        window.getTaxLiabilityAdjustments = () => Promise.resolve(taxLiabilityAdjustments || {});
        document.getElementById("declarationContainer").style.display = "block";
        return window.displayBusinessesAndLossPositions(calculation, "AB123456C", "2023-24", "test-token");
      },
      { calculation, lossesByBusiness, taxLiabilityAdjustments },
    );
    await delay(100);
  }

  test("lists every business HMRC counted, with its latest period end date", async ({ page }) => {
    await loadPage(page);

    await showBusinessesAndLossPositions(page, twoBusinessCalculation, {
      XAIS12345678901: { carryForward: { currentYearLosses: 500 } },
    });

    const businessesList = page.locator("#businessesList");
    await expect(businessesList).toContainText("self-employment");
    await expect(businessesList).toContainText("XAIS12345678901");
    await expect(businessesList).toContainText("uk-property");
    await expect(businessesList).toContainText("XAIS12345678902");
    await expect(businessesList).toContainText("2024-04-05");
  });

  test("shows a loss with no claim recorded, and warns above the tick", async ({ page }) => {
    await loadPage(page);

    // Neither business has a claim recorded - the self-employment business shows a loss.
    await showBusinessesAndLossPositions(page, twoBusinessCalculation, {});

    await expect(page.locator("#businessesList")).toContainText("Loss shown, no claim recorded");
    await expect(page.locator("#unclaimedLossWarning")).toBeVisible();
  });

  test("does not warn when the business showing a loss has a claim recorded", async ({ page }) => {
    await loadPage(page);

    await showBusinessesAndLossPositions(page, twoBusinessCalculation, {
      XAIS12345678901: { carryForward: { currentYearLosses: 500 } },
    });

    await expect(page.locator("#businessesList")).toContainText("Claimed: carry forward");
    await expect(page.locator("#unclaimedLossWarning")).toBeHidden();
  });

  test("says when no tax liability adjustment is recorded for the year", async ({ page }) => {
    await loadPage(page);

    await showBusinessesAndLossPositions(page, twoBusinessCalculation, {
      XAIS12345678901: { carryForward: { currentYearLosses: 500 } },
    });

    await expect(page.locator("#taxLiabilityAdjustmentLine")).toContainText("No tax liability adjustment is recorded");
  });
});
