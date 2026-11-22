// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.amend.browser.test.js
// Revising micro-entity and dormant accounts from the receipt of an accepted filing: the form fills
// from the document filed, the revision texts and the approval date are checked, a receipt that
// cannot be revised is refused, and the request carries the revision.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { accountsDocumentCases, microInputFromTestServiceCase } from "@app/test-helpers/accountsDocumentCases.js";
import { buildMicroEntityAccounts } from "@app/services/microEntityAccountsIxbrl.js";
import { inAccountsLanguage } from "@app/services/accountsLanguage.js";
import { serveMoneyInput, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const PAGE_PATH = "companies-house/fileMicroEntityAccounts.html";
const RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/revised-accounts");
const WIDTHS = { desktop: 1280, phone: 390 };

const cases = accountsDocumentCases();
const microCase = cases.find((candidate) => candidate.name === "micro-entity-accounts");
const dormantCase = cases.find((candidate) => candidate.name === "micro-entity-accounts-dormant");
const smallCase = cases.find((candidate) => candidate.name === "small-company-accounts");

function accountsReceipt(document, overrides = {}) {
  return {
    kind: "companies-house-accounts",
    statusCode: "ACCEPT",
    submissionNumber: "00001A",
    companyNumber: "06846849",
    rejections: [],
    filedDocument: document,
    ...overrides,
  };
}

function serveFile(page, pattern, file, contentType = "application/javascript") {
  return page.route(pattern, (route) =>
    route.fulfill({ status: 200, contentType, body: fs.readFileSync(path.join(PUBLIC_DIR, file), "utf-8") }),
  );
}

const MICRO_TEST_CASE = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/companies-house-test-service-cases.json"), "utf8"),
).find((testCase) => testCase.name === "micro-entity-accounts");
const ACCOUNTANTS_REPORT = { accountantsName: "Jones & Partners", statement: "We compiled these accounts from the company's records." };

function microDocument({ language = "en", accountantsReport, directorsAdvances } = {}) {
  const input = {
    ...microInputFromTestServiceCase(MICRO_TEST_CASE),
    ...(accountantsReport ? { accountantsReport } : {}),
    ...(directorsAdvances ? { directorsAdvances } : {}),
  };
  return inAccountsLanguage(language, () => buildMicroEntityAccounts(input));
}

async function openAmend(
  page,
  receipt,
  {
    offered = true,
    width = WIDTHS.desktop,
    outcome = "ACCEPT",
    jurisdiction = "england-wales",
    profileFails = false,
    revisedStatus = "preview",
  } = {},
) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(
    ({ receiptBody, outcomeCode, companyJurisdiction, lookupFails }) => {
      window.__submitReady__ = true;
      window.profileFails = lookupFails;
      localStorage.setItem("cognitoIdToken", "token");
      window.sentAccounts = [];
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => receiptBody });
      window.showLoading = () => {};
      window.hideLoading = () => {};
      window.showStatus = (text, type) => {
        const container = document.getElementById("statusMessagesContainer");
        const message = document.createElement("div");
        message.className = `status-message status-${type}`;
        message.textContent = text;
        container.replaceChildren(message);
      };
      window.hideStatus = () => document.getElementById("statusMessagesContainer")?.replaceChildren();
      window.getCompanyProfile = async (companyNumber) => {
        if (window.profileFails) throw new TypeError("Cannot read properties of undefined (reading 'companyNumber')");
        return {
          companyNumber,
          companyName: "EXAMPLE TRADING LIMITED",
          jurisdiction: companyJurisdiction,
          registeredOffice: { addressLine1: "1 Test Street", cityOrTown: "London", postalCode: "EC1A 1AA" },
        };
      };
      window.submitMicroEntityAccounts = async (accounts) => {
        window.sentAccounts.push(accounts);
        return { submissionNumber: "00002B", gatewayTimestamp: "2026-11-22T10:00:00Z", pollInterval: 0 };
      };
      window.pollMicroEntityAccounts = async () => ({
        statusCode: outcomeCode,
        submissionNumber: "00002B",
        receiptId: "2026-11-22T10:00:00.000Z-00002B",
        rejections: outcomeCode === "REJECT" ? [{ rejectCode: "1", description: "Random Test mode rejection" }] : [],
      });
    },
    { receiptBody: receipt, outcomeCode: outcome, companyJurisdiction: jurisdiction, lookupFails: profileFails },
  );
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    else await route.continue();
  });
  await servePageScripts(page);
  await serveMoneyInput(page);
  await serveSiteStyles(page);
  await serveFile(page, "**/widgets/books-import.js", "widgets/books-import.js");
  await serveFile(page, "**/lib/books-bundle.js", "lib/books-bundle.js");
  await serveFile(page, "**/lib/accounts-revision.js", "lib/accounts-revision.js");
  await page.route("**/lib/companies-house-gateway-poll.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.companiesHouseGatewayPoll = {
        pollGatewayUntilSettled: async ({ poll }) => poll(),
        isSettled: (outcome) => outcome.statusCode === "ACCEPT" || outcome.statusCode === "REJECT",
        pendingNote: () => "",
        mayCheckAgain: () => false,
      };`,
    }),
  );
  await page.route("**/lib/services/catalog-service.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `export const fetchCatalogText = async () => "";
        export const fetchCurrentEnvironmentName = async () => "ci";
        export const parseCatalogueText = () => ({ activities: [{ id: "file-revised-accounts", name: "File Revised Accounts (Companies House, preview)" }] });
        export const activityStatus = (activity) => (activity?.id === "file-revised-accounts" ? ${JSON.stringify(revisedStatus)} : null);
        export const isRevisedAccountsOffered = () => ${offered};`,
    }),
  );
  await page.route("**/lib/services/viewer-settings.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "export const fetchViewer = async () => ({});" }),
  );
  const html = fs.readFileSync(path.join(PUBLIC_DIR, PAGE_PATH), "utf-8");
  const url = `http://localhost:3000/${PAGE_PATH}?amend=${encodeURIComponent(RECEIPT_NAME)}`;
  await page.route(`http://localhost:3000/${PAGE_PATH}**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
}

async function screenshot(page, name, width) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${width}.png`), fullPage: true });
}

async function fillRevisionTexts(page) {
  await page.fill("#revisionNonCompliance", "The original balance sheet left out the creditors due within one year.");
  await page.fill("#revisionAmendments", "The creditors due within one year are now shown, and net assets fall by the same amount.");
}

test.describe("File micro-entity accounts page - revising accounts from a receipt", () => {
  for (const [label, width] of Object.entries(WIDTHS)) {
    test(`fills the form from the document filed and shows the revision section (${label})`, async ({ page }) => {
      await openAmend(page, accountsReceipt(microCase.xhtml), { width });

      await expect(page.locator("#formView")).toBeVisible();
      await expect(page.locator("#revisionBanner")).toBeVisible();
      await expect(page.locator("#revisionBanner")).toContainText("You are revising the accounts filed at Companies House");
      await expect(page.locator("#revisionBanner")).toContainText("The original accounts stay on the public register");
      await expect(page.locator("#revisionSection")).toBeVisible();
      await expect(page.locator("#revisionSection")).toContainText("and nothing else");
      await expect(page.locator("#revisionSection")).toContainText("within 28 days of approving them");
      await expect(page.locator("#revisionOriginalDate")).toHaveValue("2026-09-15");
      await expect(page.locator("#revisionOriginalDate")).toHaveJSProperty("readOnly", true);
      await expect(page.locator("#revisionTexts-hint")).toContainText("Companies House prints both texts");
      await expect(page.locator("#formCompanyNumber")).toHaveText("06846849");
      await expect(page.locator("#periodEnd")).not.toHaveValue("");
      await expect(page.locator("#currentCurrentAssets")).not.toHaveValue("");
      await expect(page.locator("#directorName")).not.toHaveValue("");
      await expect(page.locator("#changeCompanyLink")).toBeHidden();
      await expect(page.locator("[data-feature-status]")).toHaveText(
        "Status: preview. Revised accounts are a preview here: nothing you file reaches the live Companies House register.",
      );
      expect((await page.locator("#formCompanyName").locator("..").innerText()).trim()).toBe("Company EXAMPLE TRADING LIMITED (06846849).");
      await expect(page.locator("#revisionDownloads")).toBeAttached();
      await expect(page.locator("#revisionDownloads")).toBeEmpty();
      await screenshot(page, "amend-banner-and-revision-section", width);
    });
  }

  test("fills a dormant company's accounts with the dormant box ticked", async ({ page }) => {
    await openAmend(page, accountsReceipt(dormantCase.xhtml, { companyNumber: "09991482" }));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#dormant")).toBeChecked();
    await expect(page.locator("#dormantFields")).toBeVisible();
    await expect(page.locator("#formCompanyNumber")).toHaveText("09991482");
  });

  for (const [label, width] of Object.entries(WIDTHS)) {
    test(`asks for both revision texts before the preview (${label})`, async ({ page }) => {
      await openAmend(page, accountsReceipt(microCase.xhtml), { width });
      await expect(page.locator("#revisionSection")).toBeVisible();
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.locator("#accountsForm button[type='submit']").first().click();

      const summary = page.locator(".error-summary");
      await expect(summary).toBeVisible();
      await expect(summary).toContainText("What was wrong with the original accounts?");
      await expect(summary).toContainText("What do the revised accounts change?");
      await screenshot(page, "amend-refusal-texts-required", width);
    });
  }

  test("refuses a revision approved before the original accounts", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await fillRevisionTexts(page);
    await page.fill("#directorDateApproved", "2026-09-01");
    const problems = await page.evaluate(() => {
      reportRevisionProblems();
      return document.querySelector(".error-summary")?.textContent ?? "";
    });
    expect(problems).toContain("on or after 2026-09-15");

    await page.fill("#directorDateApproved", "2026-09-15");
    expect(await page.evaluate(() => reportRevisionProblems())).toBe(false);
    await screenshot(page, "amend-refusal-date-before-original", WIDTHS.desktop);
  });

  test("says when the date approved is more than 28 days ago", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml));
    await expect(page.locator("#revisionSection")).toBeVisible();
    const today = new Date();
    const daysAgo = (days) => new Date(today.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await page.fill("#directorDateApproved", daysAgo(10));
    await expect(page.locator("#revisionLateNote")).toBeHidden();
    await page.fill("#directorDateApproved", daysAgo(40));
    await expect(page.locator("#revisionLateNote")).toBeVisible();
    await expect(page.locator("#revisionLateNote")).toContainText("more than 28 days ago");
    await screenshot(page, "amend-late-note", WIDTHS.desktop);
  });

  test("asks for the original approval date when the filed accounts do not give it", async ({ page }) => {
    const undated = microCase.xhtml.replace(
      /<ix:nonNumeric name="core:DateAuthorisationFinancialStatementsForIssue"[^>]*>[^<]*<\/ix:nonNumeric>/,
      "",
    );
    await openAmend(page, accountsReceipt(undated));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#revisionOriginalDate")).toHaveValue("");
    await expect(page.locator("#revisionOriginalDate")).toHaveJSProperty("readOnly", false);
    await expect(page.locator("#revisionOriginalDate")).toHaveJSProperty("required", true);
    await fillRevisionTexts(page);
    const required = await page.evaluate(() => {
      window.formErrors.requireFormFields(document.getElementById("accountsForm"));
      return document.querySelector(".error-summary")?.textContent ?? "";
    });
    expect(required).toContain("Enter the date the original accounts were approved");
    const problems = await page.evaluate(() => {
      reportRevisionProblems();
      return document.querySelector(".error-summary")?.textContent ?? "";
    });
    expect(problems).toContain("Enter the date the original accounts were approved");

    await page.fill("#revisionOriginalDate", "2026-09-15");
    await page.fill("#directorDateApproved", "2026-09-20");
    expect(await page.evaluate(() => reportRevisionProblems())).toBe(false);
  });

  test("ticks the accountants' report and fills it as the accounts were filed", async ({ page }) => {
    await openAmend(page, accountsReceipt(microDocument({ accountantsReport: ACCOUNTANTS_REPORT })));
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#includeAccountantsReport")).toBeChecked();
    await expect(page.locator("#accountantsName")).toHaveValue(ACCOUNTANTS_REPORT.accountantsName);
    await expect(page.locator("#accountantsStatement")).toHaveValue(ACCOUNTANTS_REPORT.statement);
    await expect(page.locator("#revisionAccountantsNote")).toBeHidden();
  });

  test("leaves the accountants' report unticked when the accounts were filed without one", async ({ page }) => {
    await openAmend(page, accountsReceipt(microDocument()));
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#includeAccountantsReport")).not.toBeChecked();
    await expect(page.locator("#revisionAccountantsNote")).toBeHidden();
  });

  for (const language of ["en", "cy"]) {
    test(`names the advances to directors, which this form has no boxes for, in accounts filed in ${language}`, async ({ page }) => {
      const directorName = microInputFromTestServiceCase(MICRO_TEST_CASE).directorName;
      const directorsAdvances = [
        { name: directorName, terms: "Repayable within nine months", balanceAtStart: 0, advanced: 450, repaid: 50, balanceAtEnd: 400 },
      ];
      await openAmend(
        page,
        accountsReceipt(microDocument({ language, directorsAdvances })),
        language === "cy" ? { jurisdiction: "wales" } : {},
      );
      await expect(page.locator("#revisionSection")).toBeVisible();
      await expect(page.locator("#revisionNotesNote")).toBeVisible();
      await expect(page.locator("#revisionNotesNote")).toHaveText(
        "The filed accounts carry these notes, which you must enter again: advances and credits to directors.",
      );
    });
  }

  test("names no note to enter again for accounts whose notes the form carries, dormant or not", async ({ page }) => {
    await openAmend(page, accountsReceipt(microDocument()));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#revisionNotesNote")).toBeHidden();
    await openAmend(page, accountsReceipt(dormantCase.xhtml, { companyNumber: "09991482" }));
    await expect(page.locator("#dormant")).toBeChecked();
    await expect(page.locator("#revisionNotesNote")).toBeHidden();
  });

  test("asks for the accountants' report again when the filed report cannot be read", async ({ page }) => {
    const document = microDocument({ accountantsReport: ACCOUNTANTS_REPORT }).replace(/bus:NameEntityAccountants/g, "bus:SomethingElse");
    await openAmend(page, accountsReceipt(document));
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#revisionAccountantsNote")).toBeVisible();
    await expect(page.locator("#includeAccountantsReport")).not.toBeChecked();
  });

  test("sets the language choice to Welsh for accounts filed in Welsh", async ({ page }) => {
    await openAmend(page, accountsReceipt(microDocument({ language: "cy" })), { jurisdiction: "wales" });
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#documentLanguageCy")).toBeChecked();
  });

  test("sets the language choice to English for a Welsh company's accounts filed in English", async ({ page }) => {
    await openAmend(page, accountsReceipt(microDocument()), { jurisdiction: "wales" });
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#documentLanguageEn")).toBeChecked();
  });

  const refusals = [
    ["a receipt that is not accounts", { kind: "company-tax-return" }, "not an accounts filing"],
    ["accounts Companies House did not accept", { statusCode: "REJECT" }, "did not accept those accounts"],
    ["accounts filed with a Company Tax Return", { jointFilingId: "joint-1" }, "revise them on the Company Tax Return page"],
    ["accounts that are already revised accounts", { amended: true }, "already revised accounts"],
  ];
  for (const [name, overrides, text] of refusals) {
    test(`refuses ${name}, with one sentence`, async ({ page }) => {
      await openAmend(page, accountsReceipt(microCase.xhtml, overrides));
      await expect(page.locator("#statusMessagesContainer .status-error")).toContainText(text);
      await expect(page.locator("#formView")).toBeHidden();
      await expect(page.locator("#revisionBanner")).toBeHidden();
      await screenshot(page, `amend-refusal-${name.replace(/[^a-z]+/gi, "-").toLowerCase()}`, WIDTHS.desktop);
    });
  }

  test("refuses small company accounts, which revise on the small company page", async ({ page }) => {
    await openAmend(page, accountsReceipt(smallCase.xhtml, { companyNumber: "04549236" }));
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("small company accounts page");
    await expect(page.locator("#formView")).toBeHidden();
  });

  const statuses = [
    ["production", "Status: production. Revised accounts you file here reach the live Companies House register."],
    ["sandbox", "Status: sandbox. Revised accounts you file here go to the Companies House test service and file nothing real."],
    ["preview", "Status: preview. Revised accounts are a preview here: nothing you file reaches the live Companies House register."],
    [
      null,
      "Status: not yet in production. Revised accounts are not filed for real from here yet. The availability table says what each filing does.",
    ],
  ];
  for (const [status, line] of statuses) {
    test(`states the revised accounts activity's ${status ?? "unnamed"} status while revising`, async ({ page }) => {
      await openAmend(page, accountsReceipt(microCase.xhtml), { revisedStatus: status });
      await expect(page.locator("#formView")).toBeVisible();
      await expect(page.locator("[data-feature-status]")).toHaveText(line);
    });
  }

  test("shows its own sentence, and no technical message, when the accounts cannot be opened", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml), { profileFails: true });
    const status = page.locator("#statusMessagesContainer .status-error");
    await expect(status).toHaveText("We could not open those accounts to revise. Open the filing again from your receipts.");
    await expect(page.locator("#formView")).toBeHidden();
  });

  test("says revised accounts cannot be filed here where they are not offered", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml), { offered: false });
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("Revised accounts cannot be filed here yet");
    await expect(page.locator("#revisionSection")).toBeHidden();
    await screenshot(page, "amend-refusal-not-offered", WIDTHS.desktop);
  });

  for (const [label, width] of Object.entries(WIDTHS)) {
    test(`files the revision and names the revised accounts in the result (${label})`, async ({ page }) => {
      await openAmend(page, accountsReceipt(microCase.xhtml), { width });
      await expect(page.locator("#revisionSection")).toBeVisible();
      await fillRevisionTexts(page);
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.evaluate(() => {
        document.getElementById("companyAuthCode").value = "ABC123";
        return handleSubmitFiling();
      });

      await expect(page.locator("#filingResult")).toContainText("Companies House accepted the revised accounts.");
      const [sent] = await page.evaluate(() => window.sentAccounts);
      expect(sent.revision).toEqual({
        originalDateOfApproval: "2026-09-15",
        nonCompliance: "The original balance sheet left out the creditors due within one year.",
        amendments: "The creditors due within one year are now shown, and net assets fall by the same amount.",
        revisesReceipt: RECEIPT_NAME,
      });
      expect(sent.director.dateApproved).toBe("2026-11-20");
      await screenshot(page, "amend-result-accepted", width);
    });
  }

  test("names the revised accounts when Companies House rejects them", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml), { outcome: "REJECT" });
    await expect(page.locator("#revisionSection")).toBeVisible();
    await fillRevisionTexts(page);
    await page.fill("#directorDateApproved", "2026-11-20");
    await page.evaluate(() => {
      document.getElementById("companyAuthCode").value = "ABC123";
      return handleSubmitFiling();
    });
    await expect(page.locator("#filingResult")).toContainText("Companies House rejected the revised accounts.");
  });

  test("a new filing after the revision files original accounts", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#periodEnd")).toHaveJSProperty("readOnly", true);
    await page.evaluate(() => startAgain());
    await expect(page.locator("#revisionBanner")).toBeHidden();
    await expect(page.locator("#periodStart")).toHaveJSProperty("readOnly", false);
    await expect(page.locator("#periodEnd")).toHaveJSProperty("readOnly", false);
    await expect(page.locator("[data-feature-status]")).toContainText("Status: production.");
    await expect(page.locator("[data-feature-status]")).toHaveAttribute("data-feature-status", "production");
    await page.evaluate(() => {
      company = { companyNumber: "06846849", companyName: "EXAMPLE TRADING LIMITED" };
    });
    expect(await page.evaluate(() => buildAccountsPayload().revision)).toBeUndefined();
  });
});
