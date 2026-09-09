// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changeRegisteredOffice.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const CURRENT_ADDRESS = {
  etag: "test-etag-1",
  premises: "The Old Rectory",
  addressLine1: "The Old Rectory",
  addressLine2: "",
  locality: "Pulham Market",
  region: "",
  postalCode: "IP21 4XW",
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

  async function setupRoutes(page, { address = CURRENT_ADDRESS, lookupError = null } = {}) {
    await page.addInitScript(
      ({ addressArg, lookupErrorArg }) => {
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
            filings: [{ id: "f1", type: "registered-office-address", description: "Change of registered office address", status: "accepted" }],
          });
      },
      { addressArg: address, lookupErrorArg: lookupError },
    );

    const modifiedHtml = pageHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');

    await page.route("**/changeRegisteredOffice.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });

    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
  }

  async function loadPage(page) {
    await page.goto("http://localhost:3000/companies-house/changeRegisteredOffice.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  async function lookUpCompany(page, companyNumber = "06846849") {
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
    await expect(page.locator("#currentAddressList")).toContainText("The Old Rectory");
    await expect(page.locator("#currentAddressList")).toContainText("IP21 4XW");
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
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("section 86(2)"))).toBe(true);
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
    await expect(page.locator("#reviewCompanyNumber")).toContainText("06846849");
    await expect(page.locator("#reviewAddress")).toContainText("Bedford Road");
    await expect(page.locator("#reviewAddress")).toContainText("LS12 3AB");
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
    expect(openCalls[0].companyNumber).toBe("06846849");
  });
});
