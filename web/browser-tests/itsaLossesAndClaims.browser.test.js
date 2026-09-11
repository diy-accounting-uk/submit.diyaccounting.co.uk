// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaLossesAndClaims.browser.test.js
// Browser tests for the ITSA losses-and-claims and tax-liability-adjustments pages

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function readPage(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

async function loadPage(page, html, url) {
  await page.route("**/*.js", async (route) => {
    const request = route.request();
    if (request.resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });

  const modifiedHtml = html
    .replace("<head>", `<head><base href="${new URL(".", url)}">`)
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

  await page.setContent(modifiedHtml, { url, waitUntil: "domcontentloaded" });
  await delay(200);
}

test.describe("ITSA Losses and Claims - Form", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/lossesAndClaims.html");
  });

  test("displays the load form and the load button", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await expect(page.locator("#itsaLossesLoadForm")).toBeVisible();
    await expect(page.locator("#nino")).toBeVisible();
    await expect(page.locator("#businessId")).toBeVisible();
    await expect(page.locator("#loadBtn")).toBeVisible();
    await expect(page.locator("#lossesEditForm")).toBeHidden();
  });

  // #typeOfBusiness lives on the load form, so it must be selected while that form is still
  // visible - hiding it first leaves the element with no visible ancestor, and Playwright's
  // selectOption() then waits out the full test timeout for an element that can never become
  // actionable again.
  async function showEditForm(page) {
    await page.evaluate(() => {
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("lossesEditForm").style.display = "block";
      // Mirrors what populateEditForm() does on a real load - a form shown any other way
      // (as this test harness does) starts in the same state a real load would leave it in.
      updateCarryBackVisibility();
    });
  }

  test("shows the carry-back section for a self-employment business", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await page.locator("#typeOfBusiness").selectOption("self-employment");
    await showEditForm(page);
    await expect(page.locator("#carryBackSection")).toBeVisible();
  });

  test("hides the carry-back section for a UK property business", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await page.locator("#typeOfBusiness").selectOption("uk-property");
    await showEditForm(page);
    await expect(page.locator("#carryBackSection")).toBeHidden();
  });

  test("hides the carry-back section for a foreign property business", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await page.locator("#typeOfBusiness").selectOption("foreign-property");
    await showEditForm(page);
    await expect(page.locator("#carryBackSection")).toBeHidden();
  });

  test("states which claim is about to be made before the customer saves", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");
    await showEditForm(page);

    await expect(page.locator("#claimSummary")).toHaveText("No claim is entered yet.");

    await page.locator("#currentYearLosses").fill("1000");
    await page.locator("#currentYearLosses").dispatchEvent("input");
    await expect(page.locator("#claimSummary")).toContainText("carry the loss forward");
  });

  test("shows the preference order only when both a sideways and a carry-back claim are entered", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");
    await showEditForm(page);

    await expect(page.locator("#preferenceOrderSection")).toBeHidden();

    await page.locator("#currentYearGeneralIncome").fill("500");
    await page.locator("#currentYearGeneralIncome").dispatchEvent("input");
    await expect(page.locator("#preferenceOrderSection")).toBeHidden();

    await page.locator("#previousYearGeneralIncome").fill("200");
    await page.locator("#previousYearGeneralIncome").dispatchEvent("input");
    await expect(page.locator("#preferenceOrderSection")).toBeVisible();
  });
});

test.describe("ITSA Tax Liability Adjustments - Form", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/taxLiabilityAdjustments.html");
  });

  test("displays the load form and the load button", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html");

    await expect(page.locator("#itsaAdjustmentsLoadForm")).toBeVisible();
    await expect(page.locator("#nino")).toBeVisible();
    await expect(page.locator("#taxYear")).toBeVisible();
    await expect(page.locator("#loadBtn")).toBeVisible();
    await expect(page.locator("#adjustmentsEditForm")).toBeHidden();
  });

  test("shows the earlier year figure as not yet retrieved before the button is used", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html");

    await expect(page.locator("#earlierYearFigure")).toHaveText("Not yet retrieved");
  });

  test("uppercases the NINO as the user types", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html");

    await page.locator("#nino").fill("ab123456c");
    await expect(page.locator("#nino")).toHaveValue("AB123456C");
  });
});
