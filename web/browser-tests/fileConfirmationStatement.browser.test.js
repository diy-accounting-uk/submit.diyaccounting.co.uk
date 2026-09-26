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
  pscs: [
    {
      name: "Jane Doe",
      kind: "individual-person-with-significant-control",
      naturesOfControl: ["ownership-of-shares-25-to-50-percent"],
      notifiedOn: "2020-01-01",
      dateOfBirth: { month: 1, year: 1980 },
    },
  ],
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

  async function setupRoutes(
    page,
    { profile = COMPANY_PROFILE, lookupError = null, filingData = FILING_DATA, feeDueOnSubmit = false } = {},
  ) {
    await page.addInitScript(
      ({ profileArg, lookupErrorArg, officersArg, pscsArg, filingDataArg, feeDueOnSubmitArg }) => {
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

        window.fetchWithIdToken = (url, options = {}) => {
          if (String(url).includes("/api/v1/billing/activity-checkout")) {
            const body = JSON.parse(options.body || "{}");
            const checkoutUrl = `http://localhost:3000/simulator/activity-checkout?activityId=${encodeURIComponent(
              body.activityId,
            )}&subjectKey=${encodeURIComponent(body.subjectKey)}`;
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ checkoutUrl }) });
          }
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
        };

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
          if (feeDueOnSubmitArg) {
            const error = new Error("Payment required");
            error.status = 402;
            return Promise.reject(error);
          }
          return Promise.resolve({ submissionNumber: "ABC123", gatewayTimestamp: "2026-09-24T00:00:00Z" });
        };
        window.pollConfirmationStatement = (submissionNumber) =>
          Promise.resolve({ submissionNumber, statusCode: "ACCEPT", rejections: [] });

        window.__pscVerificationSubmitCalls = [];
        window.submitPscVerificationStatement = (statement) => {
          window.__pscVerificationSubmitCalls.push(statement);
          return Promise.resolve({ submissionNumber: "VS0001", gatewayTimestamp: "2026-09-24T00:00:00Z" });
        };
        window.pollPscVerificationStatement = (submissionNumber) =>
          Promise.resolve({ submissionNumber, statusCode: "ACCEPT", rejections: [] });
      },
      {
        profileArg: profile,
        lookupErrorArg: lookupError,
        officersArg: OFFICERS_RESULT,
        pscsArg: PSCS_RESULT,
        filingDataArg: filingData,
        feeDueOnSubmitArg: feeDueOnSubmit,
      },
    );

    const modifiedHtml = pageHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');

    await page.route("**/fileConfirmationStatement.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });

    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });

    // Stands in for the real Stripe/simulator checkout page: records the redirect's query params
    // on the Node side (the browser context that recorded __submitCalls etc. is gone once the
    // page navigates here) and serves a trivial page so the navigation resolves.
    page.activityCheckoutRequests = [];
    await page.route("**/simulator/activity-checkout*", async (route) => {
      const url = new URL(route.request().url());
      page.activityCheckoutRequests.push(Object.fromEntries(url.searchParams));
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>mock checkout</body></html>" });
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
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    // Deliberately leave directorPersonalCode-0 blank.
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewView")).toBeHidden();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("personal code"))).toBe(true);
  });

  test("blocks the preview when a director's other forenames are left blank", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorPersonalCode-0", "AB123456789");
    // Deliberately leave directorOtherForenames-0 blank.
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewView")).toBeHidden();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("other forenames"))).toBe(true);
  });

  test("moves to the preview view once every director carries other forenames and a personal code", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "AB123456789");
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#previewXml")).toContainText("ConfirmationAndVerificationStatement");
    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0].directors[0].personalCode).toBe("AB123456789");
    expect(previewCalls[0].directors[0].otherForenames).toBe("ELIZABETH");
  });

  test("shows the fee amount and a 'Pay and submit' label on the preview when the payment period is unpaid", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { filingData: { ...FILING_DATA, paymentPeriodPaid: false } });
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "AB123456789");
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewFeeMessage")).toBeVisible();
    await expect(page.locator("#previewFeeMessage")).toContainText("£61.35");
    await expect(page.locator("#submitFilingBtn")).toHaveText("Pay and submit");
  });

  test("shows no fee message and the normal submit label on the preview when the payment period is already paid", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { filingData: { ...FILING_DATA, paymentPeriodPaid: true } });
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "AB123456789");
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewFeeMessage")).toBeHidden();
    await expect(page.locator("#submitFilingBtn")).toHaveText("Submit to Companies House");
  });

  test("starts a checkout when the submit route refuses a fee-due filing", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { filingData: { ...FILING_DATA, paymentPeriodPaid: false }, feeDueOnSubmit: true });
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "AB123456789");
    await page.click("#previewBtn");
    await delay(200);

    await page.click("#submitFilingBtn");
    await page.waitForURL(/simulator\/activity-checkout/, { timeout: 10_000 });

    expect(page.activityCheckoutRequests).toHaveLength(1);
    expect(page.activityCheckoutRequests[0].activityId).toBe("file-confirmation-statement");
    expect(page.activityCheckoutRequests[0].subjectKey).toBe("00000001:2026-09-21");
    const resumeCompanyNumber = await page.evaluate(() => sessionStorage.getItem("companiesHouseConfirmationStatementResumeCompanyNumber"));
    expect(resumeCompanyNumber).toBe("00000001");
  });

  test("resumes the lookup and shows a payment-received banner when returning from checkout", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await page.evaluate(() => sessionStorage.setItem("companiesHouseConfirmationStatementResumeCompanyNumber", "00000001"));

    await page.goto("http://localhost:3000/companies-house/fileConfirmationStatement.html?checkout=success&session_id=sim_1", {
      waitUntil: "domcontentloaded",
    });
    await delay(300);

    await expect(page.locator("#authView")).toBeVisible();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("Payment received"))).toBe(true);
    expect(page.url()).not.toContain("checkout=success");
    const resumeCompanyNumber = await page.evaluate(() => sessionStorage.getItem("companiesHouseConfirmationStatementResumeCompanyNumber"));
    expect(resumeCompanyNumber).toBeNull();
  });

  test("shows the accepted filing result and the PSC follow-up after submitting", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "AB123456789");
    await page.click("#previewBtn");
    await delay(200);

    await page.click("#submitFilingBtn");
    await delay(300);

    await expect(page.locator("#resultView")).toBeVisible();
    await expect(page.locator("#filingResult")).toContainText("ACCEPT");
    await expect(page.locator("#pscFollowUp")).toBeVisible();
    await expect(page.locator('[data-psc-follow-up-row="0"]')).toContainText("Jane Doe");
    const submitCalls = await page.evaluate(() => window.__submitCalls);
    expect(submitCalls).toHaveLength(1);
    expect(submitCalls[0].companyAuthCode).toBe("AB123456");

    await page.fill("#pscPersonalCode-0", "AB1234CD56E");
    await page.click('[data-psc-verify-index="0"]');
    await delay(300);

    await expect(page.locator("#pscVerifyResult-0")).toContainText("ACCEPT");
    const pscSubmitCalls = await page.evaluate(() => window.__pscVerificationSubmitCalls);
    expect(pscSubmitCalls).toHaveLength(1);
    expect(pscSubmitCalls[0]).toMatchObject({
      companyNumber: "00000001",
      companyAuthCode: "AB123456",
      surname: "Doe",
      forename: "Jane",
      personalCode: "AB1234CD56E",
      dobMonth: 1,
      dobYear: 1980,
    });
  });

  test("adds and removes a joint holder on a shareholding", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);

    await page.click("#addShareholdingBtn");
    await expect(page.locator('[data-shareholder-row="0-0"]')).toBeVisible();
    await expect(page.locator('[data-shareholder-row="0-1"]')).toBeHidden();

    await page.fill("#holdingShareClass-0", "ORDINARY");
    await page.fill("#holdingNumberHeld-0", "10");
    await page.fill("#holderSurname-0-0", "CARTWRIGHT");
    await page.fill("#holderForename-0-0", "ANTONY");

    await page.click('.add-joint-holder-row[data-holding-index="0"]');
    await expect(page.locator('[data-shareholder-row="0-1"]')).toBeVisible();
    await page.fill("#holderSurname-0-1", "CARTWRIGHT");
    await page.fill("#holderForename-0-1", "SAMANTHA");

    await page.click('[data-shareholder-row="0-0"] .remove-joint-holder-row');
    await expect(page.locator('[data-shareholder-row="0-0"]')).toBeHidden();
    await expect(page.locator('[data-shareholder-row="0-1"]')).toBeVisible();

    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "AB123456789");
    await page.click("#previewBtn");
    await delay(200);

    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0].shareholdings).toHaveLength(1);
    expect(previewCalls[0].shareholdings[0].shareholders).toHaveLength(1);
    expect(previewCalls[0].shareholdings[0].shareholders[0].forename).toBe("SAMANTHA");
  });
});
