// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changeRegisteredOffice.browser.test.js

import { test, expect } from "@playwright/test";
import { servePageScripts, serveFilingResultRecord } from "./hmrcFieldTableAssets.js";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const CURRENT_ADDRESS = {
  etag: "test-etag-1",
  premises: "1",
  addressLine1: "1 Example Street",
  addressLine2: "",
  locality: "Cardiff",
  region: "",
  postalCode: "CF14 3UZ",
  country: "United Kingdom",
};

const NEW_ADDRESS = {
  premises: "13",
  addressLine1: "Bedford Road",
  addressLine2: "",
  locality: "Leeds",
  region: "West Yorkshire",
  postalCode: "LS12 3AB",
  country: "England",
};

test.describe("Change Registered Office Address page", () => {
  let pageHtmlContent;

  test.beforeAll(async () => {
    pageHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/companies-house/changeRegisteredOffice.html"), "utf-8");
  });

  function setupPage(page) {
    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });
  }

  async function setupRoutes(
    page,
    { address = CURRENT_ADDRESS, lookupError = null, filingBaseUri = "https://api-sandbox.company-information.service.gov.uk" } = {},
  ) {
    await page.addInitScript(
      ({ addressArg, lookupErrorArg, filingBaseUriArg }) => {
        window.envReady = Promise.resolve({ COMPANIES_HOUSE_FILING_BASE_URI: filingBaseUriArg });
        window.showStatus = window.showStatus || (() => {});
        window.hideStatus = window.hideStatus || (() => {});
        window.showLoading = window.showLoading || (() => {});
        window.hideLoading = window.hideLoading || (() => {});
        window.__statusMessages = [];
        window.showStatus = (message, type) => {
          window.__statusMessages.push({ message, type });
        };
        window.__submitReady__ = true;

        window.normaliseCompanyNumber = (value) => {
          let normalised = String(value || "")
            .trim()
            .toUpperCase();
          if (/^\d+$/.test(normalised)) normalised = normalised.padStart(8, "0");
          return normalised;
        };
        window.generateRandomState = () => "test-state";
        window.authUrlBuilder = { buildCompaniesHouseAuthUrl: () => Promise.resolve("https://identity.example/authorise") };
        window.companiesHouseScope = (companyNumber, resource) => `scope:${companyNumber}:${resource}`;
        // A usable token is stubbed as always held: this suite covers form validation and view
        // switching, not the OAuth redirect (the behaviour tests exercise that against the
        // simulator's real sign-in-and-permission screen).
        window.hasUsableCompaniesHouseToken = () => true;
        window.clearCompaniesHouseToken = () => {};

        window.__openTransactionCalls = [];
        window.__getRegisteredOfficeAddressCalls = [];

        window.getRegisteredOfficeAddress = (companyNumber) => {
          window.__getRegisteredOfficeAddressCalls.push(companyNumber);
          if (lookupErrorArg) {
            const error = new Error(lookupErrorArg.message);
            error.status = lookupErrorArg.status;
            return Promise.reject(error);
          }
          return Promise.resolve(addressArg);
        };
        window.openCompaniesHouseTransaction = (companyNumber, description) => {
          window.__openTransactionCalls.push({ companyNumber, description });
          return Promise.resolve({ transactionId: "test-transaction-id", status: "open" });
        };
        window.putRegisteredOfficeAddress = () => Promise.resolve({});
        window.closeCompaniesHouseTransaction = () => Promise.resolve({ transactionId: "test-transaction-id", status: "closed" });
        window.getCompaniesHouseTransaction = () =>
          Promise.resolve({
            transactionId: "test-transaction-id",
            status: "closed",
            filings: [
              { id: "f1", type: "registered-office-address", description: "Change of registered office address", status: "accepted" },
            ],
          });
      },
      { addressArg: address, lookupErrorArg: lookupError, filingBaseUriArg: filingBaseUri },
    );

    const modifiedHtml = pageHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');

    await page.route("**/changeRegisteredOffice.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });

    await page.route("**/submit.css", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/css",
        body: fs.readFileSync(path.join(process.cwd(), "web/public/submit.css"), "utf-8"),
      });
    });

    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await servePageScripts(page);
    await serveFilingResultRecord(page);
  }

  async function loadPage(page) {
    await page.goto("http://localhost:3000/companies-house/changeRegisteredOffice.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  async function lookUpCompany(page, companyNumber = "00000001") {
    await page.fill("#companyNumber", companyNumber);
    await page.click("#companyLookupBtn");
    await delay(200);
  }

  async function fillInAddress(page, address = NEW_ADDRESS) {
    await page.fill("#premises", address.premises);
    await page.fill("#addressLine1", address.addressLine1);
    await page.fill("#locality", address.locality);
    await page.fill("#region", address.region);
    await page.fill("#postalCode", address.postalCode);
    await page.selectOption("#country", address.country);
  }

  test("starts on the company number entry view", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await expect(page.locator("#companyView")).toBeVisible();
    await expect(page.locator("#formView")).toBeHidden();
  });

  test("moves to the address form and shows the current address after a successful lookup", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);

    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#currentAddressList")).toContainText("1 Example Street");
    await expect(page.locator("#currentAddressList")).toContainText("CF14 3UZ");
  });

  test("shows an error and stays on the company view when the lookup fails", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { lookupError: { message: "Company not found", status: 404 } });
    await loadPage(page);

    await lookUpCompany(page);

    await expect(page.locator("#companyView")).toBeVisible();
    await expect(page.locator("#formView")).toBeHidden();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("Company not found"))).toBe(true);
  });

  test("requires the appropriate address statement to be accepted before continuing", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await fillInAddress(page);
    // Deliberately leave #acceptOfficeStatement unchecked.
    await page.click("#continueBtn");
    await delay(200);

    await expect(page.locator("#reviewView")).toBeHidden();
    await expect(page.locator("#form-error-summary")).toContainText("section 86(2)");
    await expect(page.locator("#acceptOfficeStatement-error")).toContainText("section 86(2)");
  });

  test("moves to the review view with the new address after accepting the statement", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await fillInAddress(page);
    await page.check("#acceptOfficeStatement");
    await page.click("#continueBtn");
    await delay(200);

    await expect(page.locator("#reviewView")).toBeVisible();
    await expect(page.locator("#reviewCompanyNumber")).toContainText("00000001");
    await expect(page.locator("#reviewAddress")).toContainText("Bedford Road");
    await expect(page.locator("#reviewAddress")).toContainText("LS12 3AB");
  });

  async function reachReviewView(page) {
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);
    await fillInAddress(page);
    await page.check("#acceptOfficeStatement");
    await page.click("#continueBtn");
    await delay(200);
    await expect(page.locator("#reviewView")).toBeVisible();
  }

  async function firstPairOffsets(page) {
    return page.evaluate(() => {
      const dt = document.querySelector("#reviewAddress dt").getBoundingClientRect();
      const dd = document.querySelector("#reviewAddress dd").getBoundingClientRect();
      return { dtTop: dt.top, ddTop: dd.top, dtRight: dt.right, ddLeft: dd.left, dtBottom: dt.bottom };
    });
  }

  test("review step shows each label beside its value at desktop width", async ({ page }) => {
    setupPage(page);
    await page.setViewportSize({ width: 1024, height: 800 });
    await reachReviewView(page);

    const pair = await firstPairOffsets(page);
    expect(pair.ddTop).toBeCloseTo(pair.dtTop, 0);
    expect(pair.ddLeft).toBeGreaterThanOrEqual(pair.dtRight);
  });

  test("review step stacks each label above its value at phone width", async ({ page }) => {
    setupPage(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await reachReviewView(page);

    const pair = await firstPairOffsets(page);
    expect(pair.ddTop).toBeGreaterThanOrEqual(pair.dtBottom);
  });

  test("shows the filing result after submitting from the review view", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await fillInAddress(page);
    await page.check("#acceptOfficeStatement");
    await page.click("#continueBtn");
    await delay(200);

    await page.click("#submitFilingBtn");
    await delay(300);

    await expect(page.locator("#resultView")).toBeVisible();
    await expect(page.locator("#filingResult")).toContainText("accepted");
    const openCalls = await page.evaluate(() => window.__openTransactionCalls);
    expect(openCalls).toHaveLength(1);
    expect(openCalls[0].companyNumber).toBe("00000001");
  });

  test("shows the filing result as a submission record with the new address", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await fillInAddress(page);
    await page.check("#acceptOfficeStatement");
    await page.click("#continueBtn");
    await delay(200);
    await page.click("#submitFilingBtn");
    await delay(500);

    const record = page.locator("#filingRecord .customer-copy");
    await expect(record).toBeVisible();
    await expect(record.locator(".customer-copy-submission")).toContainText("test-transaction-id");
    await expect(record.locator(".customer-copy-status")).toHaveText("Accepted by Companies House");
    await expect(record.locator(".customer-copy-submission")).toContainText(String(new Date().getFullYear()));
    await expect(record).toContainText("Bedford Road");
    await expect(record).toContainText("LS12 3AB");
    await expect(record).toContainText("00000001");
  });

  test("the banner reads sandbox when the filing service is the Companies House test service", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(banner).toContainText("Status: sandbox.");
    await expect(banner).toContainText("test service");
  });

  test("the banner reads production when the filing service is the live register", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { filingBaseUri: "https://api.company-information.service.gov.uk" });
    await loadPage(page);

    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "production");
    await expect(banner).toContainText("Status: production.");
  });
});
