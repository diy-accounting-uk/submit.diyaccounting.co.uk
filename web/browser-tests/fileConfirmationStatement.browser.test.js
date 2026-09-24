// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileConfirmationStatement.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const COMPANY_PROFILE = {
  companyNumber: "00000001",
  companyName: "TEST COMPANY LTD",
  companyStatus: "active",
  companyType: "ltd",
  confirmationStatementNextDue: "2026-10-05",
  confirmationStatementNextMadeUpTo: "2026-09-21",
};

const OFFICERS_RESULT = {
  officers: [{ name: "Jane Doe", officerRole: "director", appointedOn: "2020-01-01", identityVerificationDetails: { verified: true } }],
};

const PSCS_RESULT = {
  pscs: [{ name: "Jane Doe", naturesOfControl: ["ownership-of-shares-25-to-50-percent"], notifiedOn: "2020-01-01" }],
};

const FILING_DATA = {
  sicCodes: ["62012"],
  registeredEmailAddress: "test@example.com",
  paymentPeriodPaid: false,
  statementOfCapital: null,
  shareholdings: [],
  officers: [{ role: "director", type: "person", forename: "Jane", surname: "Doe", dob: "1980-01-01" }],
};

test.describe("File Confirmation Statement page", () => {
  let pageHtmlContent;

  test.beforeAll(async () => {
    pageHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/companies-house/fileConfirmationStatement.html"), "utf-8");
  });

  function setupPage(page) {
    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });
  }

  async function setupRoutes(page, { profile = COMPANY_PROFILE, lookupError = null } = {}) {
    await page.addInitScript(
      ({ profileArg, lookupErrorArg, officersArg, pscsArg, filingDataArg }) => {
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

        window.__filingDataCalls = [];
        window.__previewCalls = [];
        window.__submitCalls = [];

        window.getCompanyProfile = () => {
          if (lookupErrorArg) {
            const error = new Error(lookupErrorArg.message);
            error.status = lookupErrorArg.status;
            return Promise.reject(error);
          }
          return Promise.resolve(profileArg);
        };
        window.getOfficers = () => Promise.resolve(officersArg);
        window.getPscs = () => Promise.resolve(pscsArg);
        window.getConfirmationStatementFilingData = (companyNumber, input) => {
          window.__filingDataCalls.push({ companyNumber, ...input });
          return Promise.resolve(filingDataArg);
        };
        window.previewConfirmationStatement = (statement) => {
          window.__previewCalls.push(statement);
          return Promise.resolve({
            confirmationStatementXml: "<ConfirmationAndVerificationStatement>preview</ConfirmationAndVerificationStatement>",
          });
        };
        window.submitConfirmationStatement = (statement) => {
          window.__submitCalls.push(statement);
          return Promise.resolve({ submissionNumber: "ABC123", gatewayTimestamp: "2026-09-24T00:00:00Z" });
        };
        window.pollConfirmationStatement = (submissionNumber) =>
          Promise.resolve({ submissionNumber, statusCode: "ACCEPT", rejections: [] });
      },
      { profileArg: profile, lookupErrorArg: lookupError, officersArg: OFFICERS_RESULT, pscsArg: PSCS_RESULT, filingDataArg: FILING_DATA },
    );

    const modifiedHtml = pageHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');

    await page.route("**/fileConfirmationStatement.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });

    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
  }

  async function loadPage(page) {
    await page.goto("http://localhost:3000/companies-house/fileConfirmationStatement.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  async function lookUpCompany(page, companyNumber = "00000001") {
    await page.fill("#companyNumber", companyNumber);
    await page.click("#companyLookupBtn");
    await delay(200);
  }

  async function enterAuthCode(page, code = "AB123456") {
    await page.fill("#companyAuthCode", code);
    await page.click("#authSubmitBtn");
    await delay(200);
  }

  async function acceptLawfulPurposeStatement(page) {
    await page.check("#lawfulPurposeStatement");
  }

  test("starts on the company number entry view", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await expect(page.locator("#companyView")).toBeVisible();
    await expect(page.locator("#authView")).toBeHidden();
  });

  test("moves to the authentication code view and shows public register data after a successful lookup", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);

    await expect(page.locator("#authView")).toBeVisible();
    await expect(page.locator("#authCompanyName")).toContainText("TEST COMPANY LTD");
    await expect(page.locator("#publicOfficersBody")).toContainText("Jane Doe");
    await expect(page.locator("#publicPscsBody")).toContainText("Jane Doe");
  });

  test("shows an error and stays on the company view when the lookup fails", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { lookupError: { message: "Company not found", status: 404 } });
    await loadPage(page);

    await lookUpCompany(page);

    await expect(page.locator("#companyView")).toBeVisible();
    await expect(page.locator("#authView")).toBeHidden();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("Company not found"))).toBe(true);
  });

  test("refuses a company that is not an active private limited company", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { profile: { ...COMPANY_PROFILE, companyStatus: "dissolved" } });
    await loadPage(page);

    await lookUpCompany(page);

    await expect(page.locator("#companyView")).toBeVisible();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("active private company"))).toBe(true);
  });

  test("moves to the review view with the register data pre-filled after reading filing data", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);

    await expect(page.locator("#reviewView")).toBeVisible();
    await expect(page.locator("#sicCodes")).toHaveValue("62012");
    await expect(page.locator("#registeredEmailAddress")).toHaveValue("test@example.com");
    await expect(page.locator("#directorRowsContainer")).toContainText("Jane Doe");
    const filingDataCalls = await page.evaluate(() => window.__filingDataCalls);
    expect(filingDataCalls).toHaveLength(1);
    expect(filingDataCalls[0].companyNumber).toBe("00000001");
  });

  test("blocks the preview when a director's personal code is left blank", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    // Deliberately leave directorPersonalCode-0 blank.
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewView")).toBeHidden();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("personal code"))).toBe(true);
  });

  test("moves to the preview view once every director carries a personal code", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorPersonalCode-0", "AB123456789");
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#previewXml")).toContainText("ConfirmationAndVerificationStatement");
    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0].directors[0].personalCode).toBe("AB123456789");
  });

  test("shows the accepted filing result and the PSC follow-up after submitting", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorPersonalCode-0", "AB123456789");
    await page.click("#previewBtn");
    await delay(200);

    await page.click("#submitFilingBtn");
    await delay(300);

    await expect(page.locator("#resultView")).toBeVisible();
    await expect(page.locator("#filingResult")).toContainText("ACCEPT");
    await expect(page.locator("#pscFollowUp")).toBeVisible();
    const submitCalls = await page.evaluate(() => window.__submitCalls);
    expect(submitCalls).toHaveLength(1);
    expect(submitCalls[0].companyAuthCode).toBe("AB123456");
  });
});
