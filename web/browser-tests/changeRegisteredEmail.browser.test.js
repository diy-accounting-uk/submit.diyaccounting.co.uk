// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changeRegisteredEmail.browser.test.js

import { test, expect } from "@playwright/test";
import { servePageScripts, serveFilingResultRecord, serveRegisteredChange } from "./hmrcFieldTableAssets.js";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { readSubmitCss } from "./submitCss.js";
import { TEST_EMAIL_DOMAIN } from "@app/http-simulator/fixtures/register.js";

const NEW_EMAIL = `accounts@${TEST_EMAIL_DOMAIN}`;

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
        window.narrateStage = (message) => window.showStatus(message, "info");
        window.endStage = () => {};
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
    await serveRegisteredChange(page);
  }

  // Answers each read of the transaction with the next entry, the last repeating: "throw" fails the
  // read, any other entry is the status of the transaction's one filing.
  async function answerTransactionReads(page, answers) {
    await page.addInitScript((statuses) => {
      let reads = 0;
      window.getCompaniesHouseTransaction = async () => {
        const status = statuses[Math.min(reads++, statuses.length - 1)];
        if (status === "throw") throw new Error("Companies House did not answer");
        return {
          transactionId: "test-transaction-id",
          status: "closed",
          filings: [{ id: "f1", type: "registered-email-address", status }],
        };
      };
    }, answers);
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
    await page.fill("#registeredEmailAddress", NEW_EMAIL);
    await page.check("#acceptEmailStatement");
    await page.click("#continueBtn");
    await delay(200);
    await page.click("#submitFilingBtn");
    await delay(500);

    const record = page.locator("#filingRecord .customer-copy");
    await expect(record).toBeVisible();
    await expect(record.locator(".customer-copy-submission")).toContainText("test-transaction-id");
    await expect(record.locator(".customer-copy-status")).toHaveText("Accepted by Companies House");
    await expect(record).toContainText(NEW_EMAIL);
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
  test("a change still processing after the reads offers Check again, not Start a new filing", async ({ page }) => {
    await setupRoutes(page);
    await answerTransactionReads(page, ["processing"]);
    await loadPage(page);

    await page.fill("#companyNumber", "1");
    await page.click("#companyLookupBtn");
    await delay(300);
    await page.fill("#registeredEmailAddress", NEW_EMAIL);
    await page.check("#acceptEmailStatement");
    await page.click("#continueBtn");
    await delay(200);
    await page.click("#submitFilingBtn");

    await expect(page.locator("#filingResult")).toContainText("The change is still with Companies House.", { timeout: 20000 });
    await expect(page.locator("#checkAgainBtn")).toBeVisible();
    await expect(page.locator("#startAgainBtn")).toBeHidden();
  });

  test("the new address and the statement name their section of the Companies Act, each with a note and its link", async ({ page }) => {
    await setupRoutes(page);
    await loadPage(page);
    await page.fill("#companyNumber", "1");
    await page.click("#companyLookupBtn");
    await expect(page.locator("#formView")).toBeVisible();

    await expect(page.locator('label[for="registeredEmailAddress"]')).toHaveText("Companies Act section 88B: New registered email address");
    const addressNote = page.locator("#registeredEmailAddress-hint");
    await expect(addressNote).toContainText("The change takes effect when Companies House registers it.");
    await expect(addressNote.locator("a")).toHaveAttribute("href", "https://www.legislation.gov.uk/ukpga/2006/46/section/88B");
    await expect(page.locator("#registeredEmailAddress")).toHaveAttribute("aria-describedby", "registeredEmailAddress-hint");
    const statementNote = page.locator("#acceptEmailStatement-hint");
    await expect(statementNote).toContainText("Emails Companies House sends to the address must reach someone acting for the company.");
    await expect(statementNote.locator("a")).toHaveAttribute("href", "https://www.legislation.gov.uk/ukpga/2006/46/section/88A");
  });

  test("no answer when opening the transaction shows the panel: nothing reached Companies House and the answers stay", async ({ page }) => {
    await setupRoutes(page);
    await page.addInitScript(() => {
      window.openCompaniesHouseTransaction = () => {
        const error = new Error("Request failed with status 503");
        error.status = 503;
        error.body = {};
        error.service = "companiesHouse";
        return Promise.reject(error);
      };
    });
    await loadPage(page);
    await page.fill("#companyNumber", "1");
    await page.click("#companyLookupBtn");
    await page.fill("#registeredEmailAddress", NEW_EMAIL);
    await page.check("#acceptEmailStatement");
    await page.click("#continueBtn");
    await page.click("#submitFilingBtn");

    const panel = page.locator("#failureDetail");
    await expect(panel).toHaveAttribute("data-kind", "submit-fault");
    await expect(panel.locator('[data-part="sent"]')).toHaveText("Nothing reached Companies House.");
    await expect(panel.locator('[data-part="answers"]')).toHaveText(
      "Your answers are still on this page. Sending again carries on from where the filing stopped.",
    );
    await expect(page.locator("#reviewView")).toBeVisible();
  });

  test("Companies House refusing the email address lists it by the page's label, never by the API's field key", async ({ page }) => {
    await setupRoutes(page);
    await page.addInitScript(() => {
      window.closeCompaniesHouseTransaction = () => {
        const error = new Error("Request failed with status 422");
        error.status = 422;
        error.body = {
          errors: [
            { error: "Email address is not valid", location: "$.registered_email_address", type: "ch:validation" },
            { error: "Statement must be accepted", location: "$.accept_appropriate_email_address_statement", type: "ch:validation" },
          ],
        };
        error.service = "companiesHouse";
        return Promise.reject(error);
      };
    });
    await loadPage(page);
    await page.fill("#companyNumber", "1");
    await page.click("#companyLookupBtn");
    await page.fill("#registeredEmailAddress", NEW_EMAIL);
    await page.check("#acceptEmailStatement");
    await page.click("#continueBtn");
    await page.click("#submitFilingBtn");

    const list = page.locator("#validationErrors p");
    await expect(list).toHaveText([
      "New registered email address: Email address is not valid",
      "The appropriate email address statement: Statement must be accepted",
    ]);
    await expect(page.locator("#validationErrors")).not.toContainText("registered_email_address");
  });
});
