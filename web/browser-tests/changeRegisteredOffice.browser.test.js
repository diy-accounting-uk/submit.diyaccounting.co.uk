// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/changeRegisteredOffice.browser.test.js

import { test, expect } from "@playwright/test";
import { servePageScripts, serveFilingResultRecord, serveRegisteredChange } from "./hmrcFieldTableAssets.js";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { readSubmitCss } from "./submitCss.js";
import { addressLine1, registerCompany, REGISTER_COMPANY_NUMBERS } from "@app/http-simulator/fixtures/register.js";

const TEIFI = registerCompany(REGISTER_COMPANY_NUMBERS[5]);

dotenvConfigIfNotBlank({ path: ".env.test" });

const CURRENT_ADDRESS = {
  etag: "test-etag-1",
  premises: TEIFI.address.premises,
  addressLine1: addressLine1(TEIFI.address),
  addressLine2: "",
  locality: TEIFI.address.locality,
  region: "",
  postalCode: TEIFI.address.postalCode,
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
        window.narrateStage = (message) => window.showStatus(message, "info");
        window.endStage = () => {};
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
          filings: [{ id: "f1", type: "registered-office-address", status }],
        };
      };
    }, answers);
  }

  async function loadPage(page) {
    await page.goto("http://localhost:3000/companies-house/changeRegisteredOffice.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  async function lookUpCompany(page, companyNumber = TEIFI.number) {
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
    await expect(page.locator("#currentAddressList")).toContainText(addressLine1(TEIFI.address));
    await expect(page.locator("#currentAddressList")).toContainText(TEIFI.address.postalCode);
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
    await expect(page.locator("#reviewCompanyNumber")).toContainText(TEIFI.number);
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
    expect(openCalls[0].companyNumber).toBe(TEIFI.number);
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
    await expect(record).toContainText(TEIFI.number);
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
  test("a change still processing after the reads says it is with Companies House and offers Check again, not Start a new filing", async ({
    page,
  }) => {
    setupPage(page);
    await setupRoutes(page);
    await answerTransactionReads(page, ["processing", "processing", "processing", "processing", "processing", "accepted"]);
    await loadPage(page);
    await lookUpCompany(page);
    await fillInAddress(page);
    await page.check("#acceptOfficeStatement");
    await page.click("#continueBtn");
    await delay(200);

    await page.click("#submitFilingBtn");

    const result = page.locator("#filingResult");
    await expect(result).toContainText("The change is still with Companies House. Choose Check again to ask for the outcome.", {
      timeout: 20000,
    });
    await expect(page.locator("#checkAgainBtn")).toBeVisible();
    await expect(page.locator("#startAgainBtn")).toBeHidden();

    await page.click("#checkAgainBtn");

    await expect(result).toContainText("Companies House accepted the change.", { timeout: 15000 });
    await expect(page.locator("#startAgainBtn")).toBeVisible();
    await expect(page.locator("#checkAgainBtn")).toBeHidden();
  });

  test("a failed read of the closed transaction shows the change as sent, with Check again and not Start a new filing", async ({
    page,
  }) => {
    setupPage(page);
    await setupRoutes(page);
    await answerTransactionReads(page, ["throw"]);
    await loadPage(page);
    await lookUpCompany(page);
    await fillInAddress(page);
    await page.check("#acceptOfficeStatement");
    await page.click("#continueBtn");
    await delay(200);

    await page.click("#submitFilingBtn");

    await expect(page.locator("#filingResult")).toContainText(
      "The change was sent to Companies House, and its outcome is not known yet: the status check failed (Companies House did not answer).",
      { timeout: 15000 },
    );
    await expect(page.locator("#checkAgainBtn")).toBeVisible();
    await expect(page.locator("#startAgainBtn")).toBeHidden();
    expect(await page.evaluate(() => window.__statusMessages.filter(({ type }) => type !== "info"))).toEqual([]);
  });

  test("the new address and the statement name their section of the Companies Act, each with a note and its link", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);

    await expect(page.locator("#officeAddressForm h3")).toHaveText("Companies Act section 87: New address");
    const addressNote = page.locator("#newAddress-hint");
    await expect(addressNote).toBeVisible();
    await expect(addressNote).toContainText("For 14 days after that, documents can still be served on the company at the old address.");
    await expect(addressNote.locator("a")).toHaveAttribute("href", "https://www.legislation.gov.uk/ukpga/2006/46/section/87");
    const statementNote = page.locator("#acceptOfficeStatement-hint");
    await expect(statementNote).toContainText("The notice of the change must include this statement.");
    await expect(statementNote.locator("a")).toHaveAttribute("href", "https://www.legislation.gov.uk/ukpga/2006/46/section/86");
    await expect(page.locator("#acceptOfficeStatement")).toHaveAttribute("aria-describedby", "acceptOfficeStatement-hint");
  });

  async function reachReviewWith(page, failures) {
    setupPage(page);
    await setupRoutes(page);
    await page.addInitScript(failures);
    await loadPage(page);
    await lookUpCompany(page);
    await fillInAddress(page);
    await page.check("#acceptOfficeStatement");
    await page.click("#continueBtn");
    await expect(page.locator("#reviewView")).toBeVisible();
  }

  test("a fault in Submit at the close shows the panel: the change is held open, the answers stay, and sending again files it", async ({
    page,
  }) => {
    await reachReviewWith(page, () => {
      let closes = 0;
      window.closeCompaniesHouseTransaction = () => {
        if (closes++ > 0) return Promise.resolve({ transactionId: "test-transaction-id", status: "closed" });
        const error = new Error("Request failed with status 500");
        error.status = 500;
        error.body = {};
        error.requestId = "req-close-1";
        error.service = "companiesHouse";
        return Promise.reject(error);
      };
    });

    await page.click("#submitFilingBtn");

    const panel = page.locator("#failureDetail");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-kind", "submit-fault");
    await expect(panel.locator('[data-part="sent"]')).toHaveText(
      "Companies House holds the change in an open transaction. It has not been filed.",
    );
    await expect(panel.locator('[data-part="answers"]')).toHaveText(
      "Your answers are still on this page. Sending again carries on from where the filing stopped.",
    );
    await expect(panel.locator('[data-part="kind"]')).toHaveText("This is a fault in Submit, not in your answers or your sign-in.");
    await expect(panel.locator('[data-part="next"] a')).toHaveAttribute("href", "/help.html");
    await expect(panel.locator('[data-part="next"]')).toContainText("Quote the reference req-close-1 when you ask for help.");
    await expect(page.locator("#reviewView")).toBeVisible();
    const errors = await page.evaluate(() => window.__statusMessages.filter(({ type }) => type === "error"));
    expect(errors).toEqual([{ message: "Failed to file the change with Companies House.", type: "error" }]);

    await page.click("#submitFilingBtn");

    await expect(page.locator("#filingResult")).toContainText("Companies House accepted the change.", { timeout: 15000 });
    await expect(page.locator("#failureDetail")).toHaveCount(0);
    expect(await page.evaluate(() => window.__openTransactionCalls)).toHaveLength(1);
  });

  test("Companies House refusing a field lists it on the page, and the panel says the change was not received and to start again", async ({
    page,
  }) => {
    await reachReviewWith(page, () => {
      window.putRegisteredOfficeAddress = () => {
        const error = new Error("Request failed with status 422");
        error.status = 422;
        error.body = { errors: [{ error: "Postcode is not valid", location: "$.postal_code", type: "ch:validation" }] };
        error.service = "companiesHouse";
        return Promise.reject(error);
      };
    });

    await page.click("#submitFilingBtn");

    await expect(page.locator("#validationErrors")).toHaveText("Postcode: Postcode is not valid");
    const panel = page.locator("#failureDetail");
    await expect(panel).toHaveAttribute("data-kind", "business-error");
    await expect(panel.locator('[data-part="sent"]')).toHaveText(
      "Companies House opened a transaction for the change but did not receive the change. Nothing has been filed.",
    );
    await expect(panel.locator('[data-part="answers"]')).toHaveText(
      "Choose Start a new filing and enter the answers again with the correction.",
    );
    await expect(panel.locator('[data-part="errors"]')).toHaveCount(0);

    await page.click("#startAgainBtn");
    await expect(page.locator("#failureDetail")).toHaveCount(0);
  });
});
