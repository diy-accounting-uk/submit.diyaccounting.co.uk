// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileConfirmationStatement.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";
import { pageScrollsSideways, recordScreenshotPath, serveFilingResultAssets } from "./submissionRecordAssets.js";
import { registerCompany } from "@app/http-simulator/fixtures/register.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const COMPANY = registerCompany("00000001");

const COMPANY_PROFILE = {
  companyNumber: COMPANY.number,
  companyName: COMPANY.name,
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

// The field register and the failure panel the page imports, with the modules they read.
async function serveFieldDetailAndFailurePanel(page) {
  for (const library of [
    "confirmation-statement-fields.js",
    "field-detail.js",
    "ct600-source-cells.js",
    "accounts-page-lines.js",
    "filing-failure.js",
  ]) {
    await page.route(`**/lib/${library}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fs.readFileSync(path.join(process.cwd(), "web/public/lib", library), "utf-8"),
      });
    });
  }
}

const FILING_DATA = {
  sicCodes: ["62012"],
  registeredEmailAddress: COMPANY.email,
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
    {
      profile = COMPANY_PROFILE,
      lookupError = null,
      filingData = FILING_DATA,
      feeDueOnSubmit = false,
      filingDataError = null,
      paidReviewDate = null,
      submitError = null,
      pscSubmitError = null,
      checkoutAnswer = null,
    } = {},
  ) {
    await page.addInitScript(
      ({
        profileArg,
        lookupErrorArg,
        officersArg,
        pscsArg,
        filingDataArg,
        feeDueOnSubmitArg,
        filingDataErrorArg,
        paidReviewDateArg,
        submitErrorArg,
        pscSubmitErrorArg,
        checkoutAnswerArg,
      }) => {
        const answerError = ({ message, status, body, requestId }) =>
          Object.assign(new Error(message), { status, body, ...(requestId ? { requestId } : {}) });
        window.showStatus = window.showStatus || (() => {});
        window.hideStatus = window.hideStatus || (() => {});
        window.showLoading = window.showLoading || (() => {});
        window.hideLoading = window.hideLoading || (() => {});
        // Each stage goes into session storage too, so the record outlives the trip to the checkout page.
        window.narrateStage = (message) => {
          window.showStatus(message, "info");
          const stages = JSON.parse(sessionStorage.getItem("test.stages") || "[]");
          sessionStorage.setItem("test.stages", JSON.stringify([...stages, message]));
        };
        window.endStage = () => window.__statusMessages.push({ message: "(stage ended)", type: "info" });
        window.__statusMessages = [];
        window.showStatus = (message, type) => {
          window.__statusMessages.push({ message, type });
        };
        window.__submitReady__ = true;
        window.describeGovTalkErrors = (errors) => errors.map((entry) => entry.text);

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
            const answer = checkoutAnswerArg ?? { status: 200, body: { checkoutUrl } };
            return Promise.resolve(
              new Response(JSON.stringify(answer.body), {
                status: answer.status,
                headers: { "content-type": "application/json", ...answer.headers },
              }),
            );
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
          if (filingDataErrorArg) {
            const error = new Error(filingDataErrorArg.message);
            error.status = filingDataErrorArg.status;
            error.body = filingDataErrorArg.body;
            return Promise.reject(error);
          }
          return Promise.resolve(filingDataArg);
        };
        window.renderConfirmationStatement = (statement) => {
          window.__previewCalls.push(statement);
          return Promise.resolve({
            confirmationStatementXml: "<ConfirmationAndVerificationStatement>preview</ConfirmationAndVerificationStatement>",
          });
        };
        window.submitConfirmationStatement = (statement) => {
          window.__submitCalls.push(statement);
          // With a paid date, the fee is paid only for a statement made up to that date, as the
          // submit route keys the fee by company number and statement date.
          if (feeDueOnSubmitArg || (paidReviewDateArg && statement.reviewDate !== paidReviewDateArg)) {
            const error = new Error("Payment required");
            error.status = 402;
            return Promise.reject(error);
          }
          if (submitErrorArg) return Promise.reject(answerError(submitErrorArg));
          return Promise.resolve({ submissionNumber: "ABC123", gatewayTimestamp: "2026-09-24T00:00:00Z" });
        };
        window.pollConfirmationStatement = (submissionNumber) =>
          Promise.resolve({ submissionNumber, statusCode: "ACCEPT", rejections: [] });

        window.__pscVerificationSubmitCalls = [];
        window.submitPscVerificationStatement = (statement) => {
          window.__pscVerificationSubmitCalls.push(statement);
          if (pscSubmitErrorArg) return Promise.reject(answerError(pscSubmitErrorArg));
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
        filingDataErrorArg: filingDataError,
        paidReviewDateArg: paidReviewDate,
        submitErrorArg: submitError,
        pscSubmitErrorArg: pscSubmitError,
        checkoutAnswerArg: checkoutAnswer,
      },
    );

    const modifiedHtml = pageHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');

    await page.route("**/fileConfirmationStatement.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });

    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await servePageScripts(page);
    await serveMoneyInput(page);
    await serveSiteStyles(page);
    await serveFilingResultAssets(page);
    await serveFieldDetailAndFailurePanel(page);

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
    await page.check("#stateConfirmation");
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
    await expect(page.locator("#authCompanyName")).toContainText(COMPANY.name);
    await expect(page.locator("#publicOfficersBody")).toContainText("Jane Doe");
    await expect(page.locator("#publicPscsBody")).toContainText("Jane Doe");
  });

  test("says in the page's words that Companies House has no such company and stays on the company view", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { lookupError: { message: "Company not found", status: 404 } });
    await loadPage(page);

    await lookUpCompany(page);

    await expect(page.locator("#companyView")).toBeVisible();
    await expect(page.locator("#authView")).toBeHidden();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.startsWith("Companies House has no company with the number"))).toBe(true);
    expect(messages.some((m) => m.message.includes("Company not found"))).toBe(false);
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

  test("shows the invalid authentication code message beside the code field and stays on the code view", async ({ page }) => {
    const message = "Companies House does not accept this company authentication code. Check the 6 to 8 character code and enter it again.";
    setupPage(page);
    await setupRoutes(page, {
      filingDataError: { status: 400, message, body: { reason: "invalid-company-authentication-code", message } },
    });
    await loadPage(page);
    await lookUpCompany(page);

    await enterAuthCode(page, "ZZ999999");

    await expect(page.locator("#authView")).toBeVisible();
    await expect(page.locator("#reviewView")).toBeHidden();
    await expect(page.locator("#companyAuthCode")).toHaveAttribute("aria-invalid", "true");
    const fieldError = page.locator("#companyAuthCode-error");
    await expect(fieldError).toBeVisible();
    await expect(fieldError).toContainText(message);
    const codeBox = await page.locator("#companyAuthCode").boundingBox();
    const errorBox = await fieldError.boundingBox();
    expect(codeBox.y - (errorBox.y + errorBox.height)).toBeLessThan(40);
  });

  test("a company whose next confirmation date is still to come files made up to today, says so, and reads the register to today", async ({
    page,
  }) => {
    const ukDate = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
    const today = ukDate(new Date());
    const nextMadeUpTo = ukDate(new Date(Date.now() + 40 * 86_400_000));
    const longDate = (isoDate) =>
      new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    setupPage(page);
    await setupRoutes(page, { profile: { ...COMPANY_PROFILE, confirmationStatementNextMadeUpTo: nextMadeUpTo } });
    await loadPage(page);
    await lookUpCompany(page);

    await expect(page.locator("#authNextMadeUpTo")).toHaveText(longDate(today));
    const earlyLine = page.locator("#authFilingEarly");
    await expect(earlyLine).toBeVisible();
    await expect(earlyLine).toHaveText(
      "Filed now, the statement is made up to today, and the next confirmation date moves to a year from today.",
    );

    await enterAuthCode(page);
    const filingDataCalls = await page.evaluate(() => window.__filingDataCalls);
    expect(filingDataCalls[0].madeUpDate).toBe(today);
    await expect(page.locator("#reviewView")).toBeVisible();
    await expect(page.locator("#reviewDate")).toHaveValue(today);
  });

  test("a company whose next confirmation date has come files made up to that date, with no line about filing early", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);

    await expect(page.locator("#authNextMadeUpTo")).toHaveText("21 September 2026");
    await expect(page.locator("#authFilingEarly")).toBeHidden();
    await enterAuthCode(page);
    const filingDataCalls = await page.evaluate(() => window.__filingDataCalls);
    expect(filingDataCalls[0].madeUpDate).toBe("2026-09-21");
    await expect(page.locator("#reviewDate")).toHaveValue("2026-09-21");
  });

  test("shows the made-up date message under the made-up date when Companies House answers that the date is after today", async ({
    page,
  }) => {
    const message = "The confirmation statement date is after today.";
    setupPage(page);
    await setupRoutes(page, {
      filingDataError: { status: 400, message, body: { reason: "made-up-date-after-today", message } },
    });
    await loadPage(page);
    await lookUpCompany(page);

    await enterAuthCode(page, "SIMCS01");

    await expect(page.locator("#authView")).toBeVisible();
    await expect(page.locator("#reviewView")).toBeHidden();
    const dateError = page.locator("#authNextMadeUpTo-error");
    await expect(dateError).toBeVisible();
    await expect(dateError).toContainText("This date is after today.");
    await expect(dateError).toBeFocused();
    const dateLine = page.locator("p", { has: page.locator("#authNextMadeUpTo") });
    const lineBox = await dateLine.boundingBox();
    const errorBox = await dateError.boundingBox();
    expect(errorBox.y - (lineBox.y + lineBox.height)).toBeLessThan(40);

    await enterAuthCode(page, "SIMCS01");
    await expect(page.locator("#authNextMadeUpTo-error")).toHaveCount(1);
  });

  test("moves to the review view with the register data pre-filled after reading filing data", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);

    await expect(page.locator("#reviewView")).toBeVisible();
    await expect(page.locator("#sicCodes")).toHaveValue("62012");
    await expect(page.locator("#registeredEmailAddress")).toHaveValue(COMPANY.email);
    await expect(page.locator("#directorRowsContainer")).toContainText("Jane Doe");
    const filingDataCalls = await page.evaluate(() => window.__filingDataCalls);
    expect(filingDataCalls).toHaveLength(1);
    expect(filingDataCalls[0].companyNumber).toBe("00000001");
  });

  test("names each director with the month and year of birth only, never the day", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    await expect(page.locator('[data-director-row="0"] legend')).toHaveText("Jane Doe (January 1980)");
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
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
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
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#previewXml")).toContainText("ConfirmationAndVerificationStatement");
    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0].directors[0].personalCode).toBe("CWMPS832223");
    expect(previewCalls[0].directors[0].otherForenames).toBe("ELIZABETH");
  });

  test("the gateway's character check passes a share class's prescribed particulars, which take any text", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      filingData: {
        ...FILING_DATA,
        statementOfCapital: {
          totalAmountUnpaid: 0,
          totalNumberOfIssuedShares: 100,
          shareCurrency: "GBP",
          totalAggregateNominalValue: 100,
          shares: [
            { shareClass: "ORDINARY", prescribedParticulars: "Un bleidlais — ŵyr a wyres", numShares: 100, aggregateNominalValue: 100 },
          ],
        },
      },
    });
    for (const module of ["companies-house-text-check.js", "companies-house-gateway-text.js"]) {
      await page.route(`**/lib/${module}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: fs.readFileSync(path.join(process.cwd(), "web/public/lib", module), "utf-8"),
        }),
      );
    }
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await expect(page.locator("#prescribedParticulars-0")).toHaveValue("Un bleidlais — ŵyr a wyres");
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.fill("#shareClass-0", "ORDINARY ŵ");
    await page.click("#previewBtn");
    await delay(200);
    const messages = await page.evaluate(() => window.__statusMessages.map(({ message }) => message));
    expect(messages.join(" ")).toContain("Share class has characters Companies House does not accept: ŵ");
    expect(messages.join(" ")).not.toContain("Prescribed particulars");

    await page.fill("#shareClass-0", "ORDINARY");
    await page.click("#previewBtn");
    await delay(200);
    await expect(page.locator("#previewView")).toBeVisible();
  });

  test("a share class's prescribed particulars of 200 characters wrap inside their box and reach the preview whole", async ({ page }) => {
    const particulars =
      "One vote a share. Each share takes part equally in dividends and in a distribution of capital. ".repeat(3).slice(0, 199) + ".";
    expect(particulars).toHaveLength(200);
    setupPage(page);
    await setupRoutes(page, {
      filingData: {
        ...FILING_DATA,
        statementOfCapital: {
          totalAmountUnpaid: 0,
          totalNumberOfIssuedShares: 100,
          shareCurrency: "GBP",
          totalAggregateNominalValue: 100,
          shares: [{ shareClass: "ORDINARY", prescribedParticulars: "One vote a share.", numShares: 100, aggregateNominalValue: 100 }],
        },
      },
    });
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    const box = page.locator("#prescribedParticulars-0");
    await expect(box).toHaveAttribute("data-gateway-text", "off");
    await expect(page.locator("label[for='prescribedParticulars-0']")).toHaveText("Prescribed particulars");
    await box.fill(`  ${particulars}  `);
    const widths = await box.evaluate((field) => ({ scroll: field.scrollWidth, client: field.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);

    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);
    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls[0].statementOfCapital.shares[0].prescribedParticulars).toBe(particulars);
  });

  test("a statement whose capital and shareholders are as the register sends no statement of capital and says so", async ({ page }) => {
    setupPage(page);
    // The register answers its figures as strings, as Companies House's filing data does.
    const registerCapital = {
      totalAmountUnpaid: "0",
      totalNumberOfIssuedShares: "100",
      shareCurrency: "GBP",
      totalAggregateNominalValue: "100",
      shares: [{ shareClass: "ORDINARY", prescribedParticulars: "One vote a share.", numShares: "100", aggregateNominalValue: "100" }],
    };
    const registerHolding = { shareClass: "ORDINARY", numberHeld: "100", shareholders: [{ forename: "ELEANOR", surname: "BRAMWELL" }] };
    await setupRoutes(page, { filingData: { ...FILING_DATA, statementOfCapital: registerCapital, shareholdings: [registerHolding] } });
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);

    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls[0]).not.toHaveProperty("statementOfCapital");
    await expect(page.locator("#previewView")).toContainText("As on the register");
    await expect(page.locator("#previewView")).not.toContainText("Changed from the register");
  });

  test("sends the register's shareholdings on a statement where nothing changed", async ({ page }) => {
    setupPage(page);
    const registerHolding = {
      shareClass: "ORDINARY",
      numberHeld: 10,
      shareholders: [{ forename: "ANTONY", surname: "CARTWRIGHT" }],
    };
    await setupRoutes(page, { filingData: { ...FILING_DATA, shareholdings: [registerHolding] } });
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);

    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0].shareholdings).toHaveLength(1);
    expect(previewCalls[0].shareholdings[0].shareClass).toBe("ORDINARY");
    expect(previewCalls[0].shareholdings[0].shareholders[0].surname).toBe("CARTWRIGHT");
  });

  test("shows the fee amount and a 'Pay and submit' label on the preview when the payment period is unpaid", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { filingData: { ...FILING_DATA, paymentPeriodPaid: false } });
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
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
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
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
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);

    await page.click("#submitFilingBtn");
    await page.waitForURL(/simulator\/activity-checkout/, { timeout: 10_000 });

    expect(page.activityCheckoutRequests).toHaveLength(1);
    expect(page.activityCheckoutRequests[0].activityId).toBe("file-confirmation-statement");
    expect(page.activityCheckoutRequests[0].subjectKey).toBe("00000001:2026-09-21");
    const resume = await page.evaluate(() => sessionStorage.getItem("companiesHouseConfirmationStatementResume"));
    expect(JSON.parse(resume)).toEqual({ companyNumber: "00000001", reviewDate: "2026-09-21" });
    const stages = JSON.parse(await page.evaluate(() => sessionStorage.getItem("test.stages")));
    expect(stages.slice(-2)).toEqual(["Asking Stripe for a checkout...", "Taking you to Stripe to pay..."]);
  });

  async function submitUntilTheFee(page, checkoutAnswer) {
    setupPage(page);
    await setupRoutes(page, { filingData: { ...FILING_DATA, paymentPeriodPaid: false }, feeDueOnSubmit: true, checkoutAnswer });
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);
    await page.click("#submitFilingBtn");
    return page.locator("#statusMessagesContainer + #failureDetail");
  }

  test("a checkout Stripe could not open ends the stage, stays on the page and shows the failure panel with Help and the reference", async ({
    page,
  }) => {
    const panel = await submitUntilTheFee(page, {
      status: 500,
      headers: { "x-request-id": "6f1c2a9e-7b3d-4e2a-9c61-2d8f0b5e7a13" },
      body: { message: "Failed to create checkout session" },
    });
    await expect(panel).toHaveAttribute("data-kind", "submit-fault");
    await expect(panel.locator("[data-part=sent]")).toHaveText("Nothing was charged. Stripe did not open a checkout.");
    await expect(panel.locator("[data-part=answers]")).toHaveText(
      "Nothing was filed with Companies House. The filing is sent after the fee is paid.",
    );
    await expect(panel.locator("[data-part=next] a")).toHaveAttribute("href", "/help.html");
    await expect(panel.locator("[data-part=next]")).toContainText("6f1c2a9e-7b3d-4e2a-9c61-2d8f0b5e7a13");
    const messages = (await page.evaluate(() => window.__statusMessages)).map((m) => m.message);
    expect(messages.slice(messages.indexOf("Asking Stripe for a checkout..."))).toEqual([
      "Asking Stripe for a checkout...",
      "(stage ended)",
    ]);
    expect(page.url()).toContain("fileConfirmationStatement.html");
    expect(await page.evaluate(() => sessionStorage.getItem("companiesHouseConfirmationStatementResume"))).toBeNull();
    expect(page.activityCheckoutRequests).toHaveLength(0);
  });

  test("a fee already paid says so in the failure panel and points back to the filing", async ({ page }) => {
    const panel = await submitUntilTheFee(page, { status: 409, body: { message: "already-paid", code: "already-paid" } });
    await expect(panel).toHaveAttribute("data-kind", "business-error");
    await expect(panel.locator("[data-part=kind]")).toHaveText(
      "The fee for this filing is already paid. Go back to the filing and send it.",
    );
  });

  test("resumes the lookup and shows a payment-received banner when returning from checkout", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await page.evaluate(() =>
      sessionStorage.setItem(
        "companiesHouseConfirmationStatementResume",
        JSON.stringify({ companyNumber: "00000001", reviewDate: "2026-09-21" }),
      ),
    );

    await page.goto("http://localhost:3000/companies-house/fileConfirmationStatement.html?checkout=success&session_id=sim_1", {
      waitUntil: "domcontentloaded",
    });
    await delay(300);

    await expect(page.locator("#authView")).toBeVisible();
    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("Payment received"))).toBe(true);
    expect(page.url()).not.toContain("checkout=success");
    const resume = await page.evaluate(() => sessionStorage.getItem("companiesHouseConfirmationStatementResume"));
    expect(resume).toBeNull();
  });

  test("an early filing paid for on one day and finished on the next keeps the date its fee was paid for", async ({ page }) => {
    const paidDay = "2026-11-26";
    const nextDay = "2026-11-27";
    setupPage(page);
    await page.clock.setFixedTime(new Date(`${paidDay}T22:30:00Z`));
    await setupRoutes(page, {
      profile: { ...COMPANY_PROFILE, confirmationStatementNextMadeUpTo: "2027-01-15" },
      paidReviewDate: paidDay,
    });
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    await expect(page.locator("#reviewDate")).toHaveValue(paidDay);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);
    await page.evaluate(() => {
      window.submitConfirmationStatement = () => {
        const error = new Error("Payment required");
        error.status = 402;
        return Promise.reject(error);
      };
    });
    await page.click("#submitFilingBtn");
    await page.waitForURL(/simulator\/activity-checkout/, { timeout: 10_000 });
    expect(page.activityCheckoutRequests[0].subjectKey).toBe(`00000001:${paidDay}`);

    await page.clock.setFixedTime(new Date(`${nextDay}T00:30:00Z`));
    await page.goto("http://localhost:3000/companies-house/fileConfirmationStatement.html?checkout=success&session_id=sim_1", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("#authView")).toBeVisible();
    await expect(page.locator("#authNextMadeUpTo")).toHaveText("26 November 2026");
    await expect(page.locator("#authFilingEarly")).toBeHidden();
    await enterAuthCode(page);
    const filingDataCalls = await page.evaluate(() => window.__filingDataCalls);
    expect(filingDataCalls.map((call) => call.madeUpDate)).toEqual([paidDay]);
    await expect(page.locator("#reviewDate")).toHaveValue(paidDay);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);
    await page.click("#submitFilingBtn");

    await expect(page.locator("#resultView")).toBeVisible({ timeout: 10_000 });
    const submitCalls = await page.evaluate(() => window.__submitCalls);
    expect(submitCalls.map((call) => call.reviewDate)).toEqual([paidDay]);
    expect(page.url()).not.toContain("activity-checkout");
  });

  test("keeps the own presenter fields hidden until the option is ticked", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);

    await expect(page.locator("#ownPresenterFields")).toBeHidden();
    await page.check("#useOwnPresenter");
    await expect(page.locator("#ownPresenterFields")).toBeVisible();
    await expect(page.locator("#ownPresenterFields")).toContainText("credit account");
    await page.screenshot({ path: "target/csp1-screens/own-presenter-option-open.png", fullPage: true });
  });

  test("asks for both presenter parts before reading the register data", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);

    await page.check("#useOwnPresenter");
    await page.fill("#ownPresenterId", "OWN-PRES-7731");
    await enterAuthCode(page);

    await expect(page.locator("#authView")).toBeVisible();
    const filingDataCalls = await page.evaluate(() => window.__filingDataCalls);
    expect(filingDataCalls).toHaveLength(0);
  });

  test("the authentication code line stays while the code is short and goes at six characters", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);
    await page.fill("#companyAuthCode", "AB1");
    await page.click("#authSubmitBtn");
    const line = page.locator('#form-error-summary a[href="#companyAuthCode"]');
    await expect(line).toHaveCount(1);
    await page.fill("#companyAuthCode", "AB123");
    await expect(line).toHaveCount(1);
    await page.fill("#companyAuthCode", "AB1234");
    await expect(line).toHaveCount(0);
    await expect(page.locator("#form-error-summary")).toHaveCount(0);
  });

  test("the presenter code line goes once the code is typed", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);
    await page.check("#useOwnPresenter");
    await page.fill("#ownPresenterId", "OWN-PRES-7731");
    await enterAuthCode(page);
    const line = page.locator('#form-error-summary a[href="#ownPresenterCode"]');
    await expect(line).toHaveCount(1);
    await page.fill("#ownPresenterCode", "x");
    await expect(line).toHaveCount(0);
  });

  test("files under the own presenter: no Submit fee, own presenter on the submit, nothing in storage", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { filingData: { ...FILING_DATA, paymentPeriodPaid: false } });
    await loadPage(page);
    await lookUpCompany(page);

    await page.check("#useOwnPresenter");
    await page.fill("#ownPresenterId", "OWN-PRES-7731");
    await page.fill("#ownPresenterCode", "OwnSecretCode42");
    await enterAuthCode(page);
    await expect(page.locator("#feeMessage")).toContainText("credit account behind your presenter");

    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);

    await expect(page.locator("#previewFeeMessage")).not.toContainText("£61.35");
    await expect(page.locator("#submitFilingBtn")).toHaveText("Submit to Companies House");
    await page.click("#submitFilingBtn");
    await delay(300);

    await expect(page.locator("#resultView")).toBeVisible();
    const filingDataCalls = await page.evaluate(() => window.__filingDataCalls);
    expect(filingDataCalls[0].ownPresenter).toEqual({ id: "OWN-PRES-7731", code: "OwnSecretCode42" });
    const submitCalls = await page.evaluate(() => window.__submitCalls);
    expect(submitCalls[0].ownPresenter).toEqual({ id: "OWN-PRES-7731", code: "OwnSecretCode42" });
    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls[0].ownPresenter).toBeUndefined();
    const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
    expect(stored).not.toContain("OwnSecretCode42");
    expect(stored).not.toContain("OWN-PRES-7731");
  });

  test("sends no own presenter when the option is off", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    const filingDataCalls = await page.evaluate(() => window.__filingDataCalls);
    expect(filingDataCalls[0].ownPresenter).toBeUndefined();
  });

  test("shows the accepted filing result and the PSC follow-up after submitting", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);

    await page.click("#submitFilingBtn");
    await delay(300);

    await expect(page.locator("#resultView")).toBeVisible();
    await expect(page.locator("#filingResult")).toContainText("was accepted.");
    await expect(page.locator("#pscFollowUp")).toBeVisible();
    await expect(page.locator('[data-psc-follow-up-row="0"]')).toContainText("Jane Doe");
    const submitCalls = await page.evaluate(() => window.__submitCalls);
    expect(submitCalls).toHaveLength(1);
    expect(submitCalls[0].companyAuthCode).toBe("AB123456");

    await page.fill("#pscPersonalCode-0", "CWMPS832223");
    await page.click('[data-psc-verify-index="0"]');
    await delay(300);

    await expect(page.locator("#pscVerifyResult-0")).toContainText("was accepted.");
    const pscSubmitCalls = await page.evaluate(() => window.__pscVerificationSubmitCalls);
    expect(pscSubmitCalls).toHaveLength(1);
    expect(pscSubmitCalls[0]).toMatchObject({
      companyNumber: "00000001",
      companyAuthCode: "AB123456",
      surname: "Doe",
      forename: "Jane",
      personalCode: "CWMPS832223",
      dobMonth: 1,
      dobYear: 1980,
    });
  });

  test("a director's name from the register with a character the gateway refuses stops the confirmation statement before its preview", async ({
    page,
  }) => {
    setupPage(page);
    await setupRoutes(page, {
      filingData: {
        ...FILING_DATA,
        officers: [{ role: "director", type: "person", forename: "Jane", surname: "Dŵr", dob: "1980-01-01" }],
      },
    });
    for (const script of ["lib/companies-house-gateway-text.js", "lib/companies-house-text-check.js"]) {
      await page.route(`**/${script}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: fs.readFileSync(path.join(process.cwd(), "web/public", script), "utf-8"),
        }),
      );
    }
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await expect
      .poll(async () => (await page.evaluate(() => window.__statusMessages)).map((each) => each.message).join(" | "))
      .toContain("Jane Dŵr: surname has characters Companies House does not accept: ŵ");
    await expect(page.locator("#previewView")).toBeHidden();
  });

  async function submitWithGateway(page, { pollInterval, statuses }) {
    await page.addInitScript(
      ({ pollIntervalArg, statusesArg }) => {
        window.__pollCalls = [];
        window.__pollStatuses = statusesArg;
        window.submitConfirmationStatement = (statement) => {
          window.__submitCalls.push(statement);
          return Promise.resolve({ submissionNumber: "ABC123", gatewayTimestamp: "2026-09-24T00:00:00Z", pollInterval: pollIntervalArg });
        };
        window.pollConfirmationStatement = (submissionNumber) => {
          window.__pollCalls.push(Date.now());
          const statusCode = window.__pollStatuses.length > 1 ? window.__pollStatuses.shift() : window.__pollStatuses[0];
          return Promise.resolve({ submissionNumber, statusCode, rejections: [] });
        };
      },
      { pollIntervalArg: pollInterval, statusesArg: statuses },
    );
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);
    await page.click("#submitFilingBtn");
  }

  test("polls at the gateway's PollInterval, at most eight times, then says the filing is still being checked", async ({ page }) => {
    test.setTimeout(60_000);
    setupPage(page);
    await setupRoutes(page);
    await submitWithGateway(page, { pollInterval: 1, statuses: ["PENDING"] });

    await expect(page.locator("#checkAgainBtn")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#filingResult")).toContainText("has not finished checking submission ABC123");
    await expect(page.locator("#filingResult")).not.toContainText("was waiting to be checked");
    await expect(page.locator("#filingRecord")).toBeEmpty();
    const calls = await page.evaluate(() => window.__pollCalls);
    expect(calls).toHaveLength(8);
    for (let index = 1; index < calls.length; index++) expect(calls[index] - calls[index - 1]).toBeGreaterThanOrEqual(950);

    await page.evaluate(() => {
      window.__pollStatuses = ["ACCEPT"];
    });
    await page.click("#checkAgainBtn");
    await expect(page.locator("#filingResult")).toContainText("was accepted.", { timeout: 10_000 });
    await expect(page.locator("#checkAgainBtn")).toBeHidden();
    await expect(page.locator("#pscFollowUp")).toBeVisible();
  });

  test("a status code with no word shows as its own sentence with the code while the page checks again", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await submitWithGateway(page, { pollInterval: 1, statuses: ["INTERNAL_FAILURE", "ACCEPT"] });

    await expect(page.locator("#filingResult")).toContainText("Companies House answered INTERNAL_FAILURE for submission ABC123.", {
      timeout: 10_000,
    });
    await expect(page.locator("#filingResult")).not.toContainText("waiting to be checked");
    await expect(page.locator("#filingResult")).toContainText("was accepted.", { timeout: 10_000 });
  });

  test("polls no more when the gateway's PollInterval is 0", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await submitWithGateway(page, { pollInterval: 0, statuses: ["PENDING"] });

    await expect(page.locator("#filingResult")).toContainText("has not finished checking submission ABC123", { timeout: 5_000 });
    await expect(page.locator("#filingResult")).not.toContainText("Check again");
    await expect(page.locator("#checkAgainBtn")).toBeHidden();
    expect(await page.evaluate(() => window.__pollCalls)).toHaveLength(0);
  });

  async function reachPreview(page) {
    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);
  }

  test("each field of the review form leads with the section of the Companies Act that asks for it, with a note that links to it", async ({
    page,
  }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);
    await lookUpCompany(page);
    await enterAuthCode(page);

    await expect(page.locator('label[for="reviewDate"]')).toHaveText("Companies Act section 853A: Confirmation statement date");
    await expect(page.locator('label[for="sicCodes"]')).toHaveText("Companies Act section 853C: SIC codes");
    await expect(page.locator('label[for="registeredEmailAddress"]')).toHaveText("Companies Act section 88A: Registered email address");
    await expect(page.locator('label[for="lawfulPurposeStatement"]')).toContainText("Companies Act section 853BA: The company confirms");
    await expect(page.locator("#sicCodes-hint")).toContainText("Enter up to four, separated by commas.");
    await expect(page.locator("#sicCodes-hint a")).toHaveAttribute("href", "https://www.legislation.gov.uk/ukpga/2006/46/section/853C");
    await expect(page.locator("#sicCodes-hint a")).toHaveText("Companies Act 2006, section 853C");
    await expect(page.locator("#totalAmountUnpaid")).toHaveAttribute(
      "aria-describedby",
      "totalAmountUnpaid-hint totalAmountUnpaid-money-hint",
    );
    await expect(page.locator('label[for="directorPersonalCode-0"]')).toHaveText(
      "Companies Act section 1110A: Companies House personal code",
    );
    await expect(page.locator("#directorPersonalCode-0-hint")).toContainText("for example CWMPS832223");
    await page.screenshot({ path: recordScreenshotPath("confirmation-statement-review-fields", 1280), fullPage: true });
  });

  test("a filing the gateway refused leaves a panel that says nothing was filed and gives Companies House's error", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      submitError: {
        message: "Companies House rejected the confirmation statement submission envelope",
        status: 500,
        body: {
          message: "Companies House rejected the confirmation statement submission envelope",
          submissionNumber: "ABC123",
          errors: [{ number: "9999", text: "Review date is not valid" }],
        },
      },
    });
    await loadPage(page);
    await reachPreview(page);
    await page.click("#submitFilingBtn");

    const panel = page.locator("#failureDetail");
    await expect(panel).toBeVisible();
    await expect(page.locator("#statusMessagesContainer + #failureDetail")).toHaveCount(1);
    await expect(panel.locator("[data-part=sent]")).toHaveText(
      "Companies House did not take the confirmation statement. Nothing was filed.",
    );
    await expect(panel.locator("[data-part=answers]")).toContainText("the personal codes are kept only in this page");
    await expect(panel.locator("[data-part=kind]")).toHaveText(
      "Companies House answered with this error. Correct the answer it names and send again.",
    );
    await expect(panel.locator("[data-part=errors] li")).toHaveText(["Review date is not valid"]);
    await page.screenshot({ path: recordScreenshotPath("confirmation-statement-failure-panel", 1280), fullPage: true });
  });

  test("the Welsh page says in Welsh that no token is left and nothing was sent", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      submitError: { message: "Token limit reached", status: 403, body: { message: "Token limit reached", reason: "tokens_exhausted" } },
    });
    const welshText = fs.readFileSync(path.join(process.cwd(), "web/public/lib/welsh-text.js"), "utf-8");
    await page.addInitScript((source) => {
      new Function(source)();
      window.siteText = (id, english, values) =>
        (window.WELSH_TEXT[id] ?? english).replace(/\{([a-z]+)\}/g, (whole, name) =>
          values && name in values ? String(values[name]) : whole,
        );
    }, welshText);
    const welshHtml = fs
      .readFileSync(path.join(process.cwd(), "web/public/cy/companies-house/fileConfirmationStatement.html"), "utf-8")
      .replace("<head>", '<head><base href="http://localhost:3000/cy/companies-house/">');
    await page.route("**/fileConfirmationStatement.html*", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: welshHtml }),
    );
    await page.goto("http://localhost:3000/cy/companies-house/fileConfirmationStatement.html", { waitUntil: "domcontentloaded" });
    await delay(200);
    await reachPreview(page);
    await page.click("#submitFilingBtn");

    await expect
      .poll(() => page.evaluate(() => window.__statusMessages.filter((entry) => entry.type === "error").map((entry) => entry.message)))
      .toContainEqual(expect.stringContaining("Dim credydau (tokens) ar ôl."));
    const errors = await page.evaluate(() =>
      window.__statusMessages.filter((entry) => entry.type === "error").map((entry) => entry.message),
    );
    expect(errors.join(" ")).toContain("ni anfonwyd dim at Dŷ’r Cwmnïau");
    expect(errors.join(" ")).not.toContain("Token limit reached");
  });

  test("a fault in Submit on the filing gives Help and the reference to quote", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      submitError: { message: "Internal server error", status: 500, body: { message: "Internal server error" }, requestId: "req-roll9" },
    });
    await loadPage(page);
    await reachPreview(page);
    await page.click("#submitFilingBtn");

    const panel = page.locator("#failureDetail");
    await expect(panel.locator("[data-part=kind]")).toHaveText("This is a fault in Submit, not in your answers or your sign-in.");
    await expect(panel.locator("[data-part=next] a")).toHaveAttribute("href", "/help.html");
    await expect(panel.locator("[data-part=next]")).toContainText("req-roll9");
    await panel.locator(".failure-detail__close").click();
    await expect(page.locator("#failureDetail")).toHaveCount(0);
  });

  test("a PSC verification statement Companies House refused names the person and keeps the PSC row's own error", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      pscSubmitError: {
        message: "Companies House rejected the PSC verification statement",
        status: 400,
        body: { message: "Companies House rejected the PSC verification statement", reason: "invalid-company-authentication-code" },
      },
    });
    await loadPage(page);
    await reachPreview(page);
    await page.click("#submitFilingBtn");
    await expect(page.locator("#pscFollowUp")).toBeVisible();
    await expect(page.locator('label[for="pscPersonalCode-0"]')).toHaveText("Companies Act section 790LM: PSC personal code");

    await page.fill("#pscPersonalCode-0", "CWMPS832223");
    await page.click('[data-psc-verify-index="0"]');

    const panel = page.locator("#failureDetail");
    await expect(panel.locator("[data-part=sent]")).toHaveText(
      "Companies House did not take the verification statement for Jane Doe. Nothing was filed.",
    );
    await expect(panel.locator("[data-part=kind]")).toContainText("Companies House did not accept the company authentication code.");
    await expect(page.locator("#pscVerifyResult-0 .error")).toBeVisible();
  });

  test("shows the filed statement as a record in a customer copy with the submission number, status and date", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await lookUpCompany(page);
    await enterAuthCode(page);
    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);
    await page.click("#submitFilingBtn");

    const copy = page.locator("#filingRecord .customer-copy");
    await expect(copy).toBeVisible();
    await expect(copy.locator(".customer-copy-title")).toHaveText(`Your copy of the confirmation statement for ${COMPANY.name}`);
    await expect(copy.locator(".customer-copy-submission")).toContainText("ABC123");
    await expect(copy.locator(".customer-copy-status")).toHaveText("Accepted by Companies House");

    const statement = copy.locator(".submission-record").first();
    await expect(statement.locator(".entity")).toHaveText(COMPANY.name);
    await expect(statement.locator(".reference")).toHaveText("Company number 00000001");
    await expect(statement.locator("h2")).toHaveText("Confirmation statement");
    await expect(statement.locator(".subtitle")).toHaveText("Made up to 21 September 2026");
    await expect(statement.locator("tr", { hasText: "Lawful purpose statement" }).locator("td.text-value")).toHaveText("Accepted");
    await expect(statement.locator("tr", { hasText: "Nature of business" }).locator("td.text-value")).toHaveText(
      "Confirmed as on the register",
    );
    await expect(statement.locator("tr", { hasText: "Shareholders" }).locator("td.text-value")).toHaveText("Confirmed as on the register");
    await expect(statement.locator("tr", { hasText: "Directors verifying" }).locator("td.text-value")).toContainText("JANE ELIZABETH DOE");

    const officers = copy.locator(".submission-record").nth(1);
    await expect(officers.locator("tr", { hasText: "Jane Doe" }).locator("td.text-value")).toHaveText("Director. Identity verified");
    const pscs = copy.locator(".submission-record").nth(2);
    await expect(pscs.locator("tr", { hasText: "Jane Doe" }).locator("td.text-value")).toContainText(
      "Ownership of shares 25 to 50 percent",
    );
    await expect(copy.locator(".customer-copy-links a")).toHaveText(["Look up another company", "All your receipts"]);

    const text = await page.locator("#filingRecord").innerText();
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
  });

  for (const [width, scheme] of [
    [1280, "light"],
    [390, "dark"],
  ]) {
    test(`the filed statement reads cleanly at ${width} px in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      setupPage(page);
      await setupRoutes(page);
      await loadPage(page);
      await lookUpCompany(page);
      await enterAuthCode(page);
      await acceptLawfulPurposeStatement(page);
      await page.fill("#directorOtherForenames-0", "ELIZABETH");
      await page.fill("#directorPersonalCode-0", "CWMPS832223");
      await page.click("#previewBtn");
      await delay(200);
      await page.click("#submitFilingBtn");
      await expect(page.locator("#filingRecord .customer-copy")).toBeVisible();
      expect(await pageScrollsSideways(page)).toBe(false);
      await page.screenshot({ path: recordScreenshotPath(`confirmation-statement-result-${scheme}`, width), fullPage: true });
    });
  }

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

    await page.fill("#holderThoroughfare-0-1", "HIGH STREET");
    await page.fill("#holderCounty-0-1", "SURREY");

    await page.click('.add-transfer-row[data-holding-index="0"]');
    await page.fill("#transferDate-0-0", "2026-03-01");
    await page.fill("#transferShares-0-0", "5");
    await page.click('.add-transfer-row[data-holding-index="0"]');
    await page.fill("#transferDate-0-1", "2026-04-02");
    await page.fill("#transferShares-0-1", "2");
    await page.click('[data-transfer-row="0-1"] .remove-transfer-row');
    await expect(page.locator('[data-transfer-row="0-1"]')).toBeHidden();

    await page.click('[data-shareholder-row="0-0"] .remove-joint-holder-row');
    await expect(page.locator('[data-shareholder-row="0-0"]')).toBeHidden();
    await expect(page.locator('[data-shareholder-row="0-1"]')).toBeVisible();

    await acceptLawfulPurposeStatement(page);
    await page.fill("#directorOtherForenames-0", "ELIZABETH");
    await page.fill("#directorPersonalCode-0", "CWMPS832223");
    await page.click("#previewBtn");
    await delay(200);

    const previewCalls = await page.evaluate(() => window.__previewCalls);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0].shareholdings).toHaveLength(1);
    expect(previewCalls[0].shareholdings[0].shareholders).toHaveLength(1);
    expect(previewCalls[0].shareholdings[0].shareholders[0].forename).toBe("SAMANTHA");
    expect(previewCalls[0].shareholdings[0].shareholders[0].address.thoroughfare).toBe("HIGH STREET");
    expect(previewCalls[0].shareholdings[0].shareholders[0].address.county).toBe("SURREY");
    expect(previewCalls[0].shareholdings[0].transfers).toEqual([{ dateOfTransfer: "2026-03-01", numberSharesTransferred: 5 }]);
    const previewSummary = await page.locator("#previewSummary").innerText();
    expect(previewSummary).toContain("5 shares on 1 March 2026");
    expect(previewSummary).toContain("HIGH STREET");
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await pageScrollsSideways(page)).toBe(false);
      await page.screenshot({ path: recordScreenshotPath("confirmation-statement-transfers-preview", width), fullPage: true });
    }
  });
});
