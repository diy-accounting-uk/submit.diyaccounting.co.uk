// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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

  test("links to the six ITSA pages in the order a user follows them", async ({ page }) => {
    page.on("pageerror", (err) => {
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });

    await setupRoutes(page);
    await loadDashboard(page);

    const links = page.locator(".dashboard-step a.btn");
    await expect(links).toHaveCount(6);
    await expect(links.nth(0)).toHaveAttribute("href", "businessDetails.html");
    await expect(links.nth(1)).toHaveAttribute("href", "obligations.html");
    await expect(links.nth(2)).toHaveAttribute("href", "selfEmploymentPeriod.html");
    await expect(links.nth(3)).toHaveAttribute("href", "selfEmploymentPeriods.html");
    await expect(links.nth(4)).toHaveAttribute("href", "selfEmploymentPeriodView.html");
    await expect(links.nth(5)).toHaveAttribute("href", "selfEmploymentPeriodAmend.html");
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
});
