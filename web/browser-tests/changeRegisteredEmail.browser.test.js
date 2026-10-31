// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changeRegisteredEmail.browser.test.js

import { test, expect } from "@playwright/test";
import { servePageScripts, serveFilingResultRecord } from "./hmrcFieldTableAssets.js";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { readSubmitCss } from "./submitCss.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Change Registered Email Address page", () => {
  let pageHtmlContent;

  test.beforeAll(async () => {
    pageHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/companies-house/changeRegisteredEmail.html"), "utf-8");
  });

  async function setupRoutes(page, { filingBaseUri = "https://api-sandbox.company-information.service.gov.uk" } = {}) {
    await page.addInitScript(
      ({ filingBaseUriArg }) => {
        window.envReady = Promise.resolve({ COMPANIES_HOUSE_FILING_BASE_URI: filingBaseUriArg });
        window.showStatus = () => {};
        window.hideStatus = () => {};
        window.showLoading = () => {};
        window.hideLoading = () => {};
        window.__submitReady__ = true;
        window.normaliseCompanyNumber = (value) => String(value).trim().toUpperCase().padStart(8, "0");
        window.generateRandomState = () => "test-state";
        window.companiesHouseScope = (companyNumber, resource) => `scope:${companyNumber}:${resource}`;
        window.hasUsableCompaniesHouseToken = () => true;
        window.clearCompaniesHouseToken = () => {};
        window.getRegisteredEmailEligibility = () => Promise.resolve({ eligibilityStatusCode: "COMPANY_VALID_FOR_SERVICE" });
        window.openCompaniesHouseTransaction = () => Promise.resolve({ transactionId: "test-transaction-id", status: "open" });
        window.putRegisteredEmailAddress = () => Promise.resolve({});
        window.closeCompaniesHouseTransaction = () => Promise.resolve({ transactionId: "test-transaction-id", status: "closed" });
        window.getCompaniesHouseTransaction = () =>
          Promise.resolve({
            transactionId: "test-transaction-id",
            status: "closed",
            filings: [{ id: "f1", type: "registered-email-address", status: "accepted" }],
          });
      },
      { filingBaseUriArg: filingBaseUri },
    );

    const modifiedHtml = pageHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');
    await page.route("**/changeRegisteredEmail.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });
    await page.route("**/submit.css", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/css",
        body: readSubmitCss(),
      });
    });
    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await servePageScripts(page);
    await serveFilingResultRecord(page);
  }

  async function loadPage(page) {
    await page.goto("http://localhost:3000/companies-house/changeRegisteredEmail.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("shows the filing result as a submission record with the new email address", async ({ page }) => {
    await setupRoutes(page);
    await loadPage(page);

    await page.fill("#companyNumber", "1");
    await page.click("#companyLookupBtn");
    await delay(300);
    await page.fill("#registeredEmailAddress", "accounts@example.com");
    await page.check("#acceptEmailStatement");
    await page.click("#continueBtn");
    await delay(200);
    await page.click("#submitFilingBtn");
    await delay(500);

    const record = page.locator("#filingRecord .customer-copy");
    await expect(record).toBeVisible();
    await expect(record.locator(".customer-copy-submission")).toContainText("test-transaction-id");
    await expect(record.locator(".customer-copy-status")).toHaveText("Accepted by Companies House");
    await expect(record).toContainText("accounts@example.com");
    await expect(record).toContainText("00000001");
  });

  test("the banner reads sandbox when the filing service is the Companies House test service", async ({ page }) => {
    await setupRoutes(page);
    await loadPage(page);

    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(banner).toContainText("Status: sandbox.");
  });

  test("the banner reads production when the filing service is the live register", async ({ page }) => {
    await setupRoutes(page, { filingBaseUri: "https://api.company-information.service.gov.uk" });
    await loadPage(page);

    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "production");
  });
});
