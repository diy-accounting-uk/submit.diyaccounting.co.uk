// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaDashboard.browser.test.js
// Browser tests for the ITSA Dashboard entry point

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Dashboard", () => {
  let dashboardHtmlContent;
  let businessDetailsHtmlContent;
  let obligationsHtmlContent;
  let selfEmploymentPeriodHtmlContent;

  test.beforeAll(async () => {
    const itsaDir = path.join(process.cwd(), "web/public/hmrc/itsa");
    dashboardHtmlContent = fs.readFileSync(path.join(itsaDir, "dashboard.html"), "utf-8");
    businessDetailsHtmlContent = fs.readFileSync(path.join(itsaDir, "businessDetails.html"), "utf-8");
    obligationsHtmlContent = fs.readFileSync(path.join(itsaDir, "obligations.html"), "utf-8");
    selfEmploymentPeriodHtmlContent = fs.readFileSync(path.join(itsaDir, "selfEmploymentPeriod.html"), "utf-8");
  });

  async function setupRoutes(page) {
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

    await page.route("**/dashboard.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: dashboardHtmlContent });
    });
    await page.route("**/businessDetails.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: businessDetailsHtmlContent });
    });
    await page.route("**/obligations.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: obligationsHtmlContent });
    });
    await page.route("**/selfEmploymentPeriod.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: selfEmploymentPeriodHtmlContent });
    });
    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
  }

  async function loadDashboard(page) {
    await page.goto("http://localhost:3000/hmrc/itsa/dashboard.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  // Twelve steps, not ten: T15 adds Losses and Claims and Tax Liability Adjustments as their
  // own numbered steps between the property/self-employment year-end pages and the tax
  // calculation, matching the year-end sequence the plan requires (annual submission,
  // adjustable summary, losses and claims, tax liability adjustments, calculation, final
  // declaration). Nothing merges into an existing step - a customer with a loss must see the
  // claim step, not guess that it lives inside Year-End Adjustments.
  test("links to the twelve ITSA pages in the order a user follows them", async ({ page }) => {
    page.on("pageerror", (err) => {
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });

    await setupRoutes(page);
    await loadDashboard(page);

    const links = page.locator(".dashboard-step a.btn");
    await expect(links).toHaveCount(12);
    await expect(links.nth(0)).toHaveAttribute("href", "businessDetails.html");
    await expect(links.nth(1)).toHaveAttribute("href", "obligations.html");
    await expect(links.nth(2)).toHaveAttribute("href", "selfEmploymentPeriod.html");
    await expect(links.nth(3)).toHaveAttribute("href", "selfEmploymentPeriods.html");
    await expect(links.nth(4)).toHaveAttribute("href", "selfEmploymentPeriodView.html");
    await expect(links.nth(5)).toHaveAttribute("href", "selfEmploymentPeriodAmend.html");
    await expect(links.nth(6)).toHaveAttribute("href", "annualSubmission.html");
    await expect(links.nth(7)).toHaveAttribute("href", "adjustments.html");
    await expect(links.nth(8)).toHaveAttribute("href", "lossesAndClaims.html");
    await expect(links.nth(9)).toHaveAttribute("href", "taxLiabilityAdjustments.html");
    await expect(links.nth(10)).toHaveAttribute("href", "taxCalculation.html");
    await expect(links.nth(11)).toHaveAttribute("href", "finalDeclaration.html");
  });

  // Losses and Claims and Tax Liability Adjustments stay on the page even when they do not
  // apply to every customer - only their wording says when they matter - so a customer with a
  // loss can never land on a dashboard that walked past the claim.
  test("shows the losses and claims and tax liability adjustments steps as applicable-or-not, never hidden", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const lossesStep = page.locator(".dashboard-step", { has: page.locator('a[href="lossesAndClaims.html"]') });
    const adjustmentsStep = page.locator(".dashboard-step", { has: page.locator('a[href="taxLiabilityAdjustments.html"]') });
    await expect(lossesStep).toBeVisible();
    await expect(adjustmentsStep).toBeVisible();
    await expect(lossesStep.locator(".applicability")).toContainText("Applies if");
    await expect(adjustmentsStep.locator(".applicability")).toContainText("Applies only if");
  });

  test("puts a divider between the in-year and year-end halves", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await expect(page.locator(".dashboard-divider")).toBeVisible();
  });

  test("marks the synthetic mode banner visible when the sandbox account is selected", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("hmrcAccount", "synthetic"));
    await setupRoutes(page);
    await loadDashboard(page);

    await expect(page.locator("#syntheticIndicator")).toHaveClass(/visible/);
  });

  test("leaves the synthetic mode banner unmarked for the live account", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await expect(page.locator("#syntheticIndicator")).not.toHaveClass(/visible/);
  });

  test("follows the Business Details link to the business details form", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await page.click('a[href="businessDetails.html"]');
    await delay(200);

    expect(page.url()).toContain("businessDetails.html");
    await expect(page.locator("#itsaBusinessDetailsForm")).toBeVisible();
  });

  test("follows the Obligations link to the obligations form", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await page.click('a[href="obligations.html"]');
    await delay(200);

    expect(page.url()).toContain("obligations.html");
    await expect(page.locator("#itsaObligationsForm")).toBeVisible();
  });

  test("follows the File a Quarterly Update link to the period summary form", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await page.click('a[href="selfEmploymentPeriod.html"]');
    await delay(200);

    expect(page.url()).toContain("selfEmploymentPeriod.html");
    await expect(page.locator("h1")).toHaveText("File a Quarterly Update");
  });

  // A sole trade and a rental is nine tokens for the year (D6): four quarterly updates each,
  // plus one final declaration for the whole return - never one declaration per business.
  test("names nine tokens for the year when the picker holds a sole trade and a rental", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await page.evaluate(() => {
      window.displayBusinessPicker([
        { businessId: "XAIS12345678901", typeOfBusiness: "self-employment", tradingName: "A Sole Trade" },
        { businessId: "XAIS12345678902", typeOfBusiness: "uk-property", tradingName: "A Rental" },
      ]);
    });

    await expect(page.locator("#businessPickerResults")).toBeVisible();
    await expect(page.locator("#businessPickerList input[type=radio]")).toHaveCount(2);
    await expect(page.locator("#yearTokenCost")).toContainText("9 tokens");
    await expect(page.locator("#yearTokenCost")).toContainText("2 businesses");
  });

  test("routes the quarterly-update-family step links to self-employment pages by default", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await page.evaluate(() => {
      window.displayBusinessPicker([{ businessId: "XAIS12345678901", typeOfBusiness: "self-employment", tradingName: "A Sole Trade" }]);
    });

    await expect(page.locator("#step3Link")).toHaveAttribute("href", "selfEmploymentPeriod.html");
    await expect(page.locator("#step4Link")).toHaveAttribute("href", "selfEmploymentPeriods.html");
    await expect(page.locator("#step5Link")).toHaveAttribute("href", "selfEmploymentPeriodView.html");
    await expect(page.locator("#step6Link")).toHaveAttribute("href", "selfEmploymentPeriodAmend.html");
    await expect(page.locator("#step7Link")).toHaveAttribute("href", "annualSubmission.html");
    await expect(page.locator("#step8Link")).toHaveAttribute("href", "adjustments.html");
  });

  test("routes the quarterly-update-family step links to property pages once a property business is picked", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await page.evaluate(() => {
      window.displayBusinessPicker([
        { businessId: "XAIS12345678901", typeOfBusiness: "self-employment", tradingName: "A Sole Trade" },
        { businessId: "XAIS12345678902", typeOfBusiness: "uk-property", tradingName: "A Rental" },
      ]);
    });

    await page.locator("#businessPickerList input[type=radio]").nth(1).check();

    await expect(page.locator("#step3Link")).toHaveAttribute("href", "ukPropertyPeriod.html");
    await expect(page.locator("#step4Link")).toHaveAttribute("href", "ukPropertyPeriods.html");
    await expect(page.locator("#step5Link")).toHaveAttribute("href", "ukPropertyPeriodView.html");
    await expect(page.locator("#step6Link")).toHaveAttribute("href", "ukPropertyPeriodAmend.html");
    await expect(page.locator("#step7Link")).toHaveAttribute("href", "ukPropertyAnnualSubmission.html");
    await expect(page.locator("#step8Link")).toHaveAttribute("href", "ukPropertyAdjustments.html");
  });

  test("shows no businesses found for an empty picker result", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await page.evaluate(() => {
      window.displayBusinessPicker([]);
    });

    await expect(page.locator("#businessPickerResults")).toBeVisible();
    await expect(page.locator("#businessPickerList")).toContainText("No businesses found");
  });
});
