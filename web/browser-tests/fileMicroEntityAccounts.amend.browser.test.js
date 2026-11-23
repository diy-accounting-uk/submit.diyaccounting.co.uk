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
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import { inAccountsLanguage } from "@app/services/accountsLanguage.js";
import { serveMoneyInput, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";
import { screenshotAtBothWidths } from "./revisedAccountsScreenshots.js";
import { addressLine1, registerCompany, REGISTER_COMPANY_NUMBERS } from "@app/http-simulator/fixtures/register.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const PAGE_PATH = "companies-house/fileMicroEntityAccounts.html";
const RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/revised-accounts");
const WIDTHS = { desktop: 1280, phone: 390 };

const JOINERY = registerCompany(REGISTER_COMPANY_NUMBERS[0]);
const JOINERY_OFFICE = `${addressLine1(JOINERY.address)}, ${JOINERY.address.locality}, ${JOINERY.address.postalCode}`;

const cases = accountsDocumentCases();
const microCase = cases.find((candidate) => candidate.name === "micro-entity-accounts");
const dormantCase = cases.find((candidate) => candidate.name === "micro-entity-accounts-dormant");
const smallCase = cases.find((candidate) => candidate.name === "small-company-accounts");

function accountsReceipt(document, overrides = {}) {
  return {
    kind: "companies-house-accounts",
    statusCode: "ACCEPT",
    submissionNumber: "00001A",
    companyNumber: MICRO_TEST_CASE.companyNumber,
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

function microDocument({ language = "en", accountantsReport, directorsAdvances, balanceSheet } = {}) {
  const input = {
    ...microInputFromTestServiceCase(MICRO_TEST_CASE),
    ...(accountantsReport ? { accountantsReport } : {}),
    ...(directorsAdvances ? { directorsAdvances } : {}),
    ...(balanceSheet ? { balanceSheet } : {}),
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
    welsh = false,
  } = {},
) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(
    ({ receiptBody, outcomeCode, companyJurisdiction, lookupFails, profile }) => {
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
          companyName: profile.companyName,
          jurisdiction: companyJurisdiction,
          registeredOffice: profile.registeredOffice,
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
    {
      receiptBody: receipt,
      outcomeCode: outcome,
      companyJurisdiction: jurisdiction,
      lookupFails: profileFails,
      profile: {
        companyName: JOINERY.name,
        registeredOffice: {
          addressLine1: addressLine1(JOINERY.address),
          cityOrTown: JOINERY.address.locality,
          postalCode: JOINERY.address.postalCode,
        },
      },
    },
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
      body: `${fs.readFileSync(path.join(PUBLIC_DIR, "lib/companies-house-gateway-poll.js"), "utf-8")}
        Object.assign(window.companiesHouseGatewayPoll, { pollGatewayUntilSettled: async ({ poll }) => poll() });`,
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
  if (welsh) {
    await serveFile(page, "**/lib/welsh-text.js", "lib/welsh-text.js");
    await serveFile(page, "**/widgets/page-chrome.js", "widgets/page-chrome.js");
  }
  const pagePath = welsh ? `cy/${PAGE_PATH}` : PAGE_PATH;
  // The site's own failure message, which the page script gets from the shared dom utilities.
  await serveFile(page, "**/lib/utils/dom-utils.js", "lib/utils/dom-utils.js");
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, pagePath), "utf-8")
    .replace("</head>", '<script type="module" src="/lib/utils/dom-utils.js"></script></head>');
  const url = `http://localhost:3000/${pagePath}?amend=${encodeURIComponent(RECEIPT_NAME)}`;
  await page.route(`http://localhost:3000/${pagePath}**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
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
  test("opens with the registered office the filed accounts state, which the customer can change", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#officeAddressLine1")).toHaveValue(MICRO_TEST_CASE.registeredOffice.addressLine1);
    await expect(page.locator("#officeCityOrTown")).toHaveValue(MICRO_TEST_CASE.registeredOffice.cityOrTown);
    await expect(page.locator("#officePostalCode")).toHaveValue(MICRO_TEST_CASE.registeredOffice.postalCode);
    await expect(page.locator("#officeCountry")).toHaveValue(MICRO_TEST_CASE.registeredOffice.country);
    await expect(page.locator("#officeAddressLine1")).toBeEditable();
  });

  test("says under the office fields when the register's office today differs from the filed office", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml));
    await expect(page.locator("#officeHint")).toHaveText("Filled in from the accounts you filed. Change a part to correct it.");
    await expect(page.locator("#officeDiffersHint")).toBeVisible();
    await expect(page.locator("#officeDiffersHint")).toHaveText(
      `The Companies House register gives the registered office today as ${JOINERY_OFFICE}. The revised accounts keep the office the filed accounts state unless you change it.`,
    );
    await expect(page.locator("#officeAddressLine1")).toHaveValue(MICRO_TEST_CASE.registeredOffice.addressLine1);
  });

  test("says in Welsh when the register's office today differs from the filed office", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml), { welsh: true });
    await expect(page.locator("#officeDiffersHint")).toContainText(
      `Mae cofrestr Tŷ’r Cwmnïau yn rhoi’r swyddfa gofrestredig heddiw fel ${JOINERY_OFFICE}.`,
    );
  });

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
      await expect(page.locator("#formCompanyNumber")).toHaveText(MICRO_TEST_CASE.companyNumber);
      await expect(page.locator("#periodEnd")).not.toHaveValue("");
      await expect(page.locator("#currentCurrentAssets")).not.toHaveValue("");
      await expect(page.locator("#directorName")).not.toHaveValue("");
      await expect(page.locator("#changeCompanyLink")).toBeHidden();
      await expect(page.locator("[data-feature-status]")).toHaveText(
        "Status: preview. Revised accounts are a preview here: nothing you file reaches the live Companies House register.",
      );
      expect((await page.locator("#formCompanyName").locator("..").innerText()).trim()).toBe(
        `Company ${JOINERY.name} (${MICRO_TEST_CASE.companyNumber}).`,
      );
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
      await expect(summary).toContainText("Say what was wrong with the original accounts");
      await expect(summary).toContainText("Say what the revised accounts change");
      await expect(summary).not.toContainText("Enter What");
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
    await expect(page.locator(".error-summary")).toHaveCount(0);
    await expect(page.locator("#directorDateApproved-error")).toHaveCount(0);
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
    const gap = await page.evaluate(() => {
      const field = document.getElementById("directorDateApproved").getBoundingClientRect();
      return document.getElementById("revisionLateNote").getBoundingClientRect().top - field.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(40);
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
    await screenshotAtBothWidths(page, "micro-amend-accountants-report");
  });

  test("leaves the accountants' report unticked when the accounts were filed without one", async ({ page }) => {
    await openAmend(page, accountsReceipt(microDocument()));
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#includeAccountantsReport")).not.toBeChecked();
    await expect(page.locator("#revisionAccountantsNote")).toBeHidden();
  });

  for (const language of ["en", "cy"]) {
    test(`fills the advance to the director as filed in ${language} and files it unchanged`, async ({ page }) => {
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
      await expect(page.locator("#revisionNotesNote")).toBeHidden();
      await expect(page.locator("#directorsAdvanceTerms")).toHaveValue("Repayable within nine months");
      await expect(page.locator("#directorsAdvanceAtStart")).toHaveValue("0");
      await expect(page.locator("#directorsAdvanceMade")).toHaveValue("450");
      await expect(page.locator("#directorsAdvanceRepaid")).toHaveValue("50");
      await expect(page.locator("#directorsAdvanceAtEnd")).toHaveValue("400");
      await screenshotAtBothWidths(page, `micro-amend-advance-filled-${language}`);

      await fillRevisionTexts(page);
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.evaluate(() => {
        document.getElementById("companyAuthCode").value = "ABC123";
        return handleSubmitFiling();
      });
      await expect(page.locator("#filingResult")).toContainText("Companies House accepted the revised accounts.");
      const [sent] = await page.evaluate(() => window.sentAccounts);
      expect(sent.directorsAdvances).toEqual(directorsAdvances);
    });
  }

  test("opens accounts with creditors after one year and provisions with both filled as filed, and files them with nothing retyped", async ({
    page,
  }) => {
    const filedSheet = microInputFromTestServiceCase(MICRO_TEST_CASE).balanceSheet;
    const withLines = (year) => ({
      ...year,
      creditorsAfterOneYear: 200,
      provisionsForLiabilities: 100,
      currentAssets: year.currentAssets + 300,
    });
    const balanceSheet = { current: withLines(filedSheet.current), prior: withLines(filedSheet.prior) };
    await openAmend(page, accountsReceipt(microDocument({ balanceSheet })));
    await expect(page.locator("#revisionSection")).toBeVisible();
    for (const year of ["current", "prior"]) {
      await expect(page.locator(`#${year}CreditorsAfterOneYear`)).toHaveValue("200");
      await expect(page.locator(`#${year}ProvisionsForLiabilities`)).toHaveValue("100");
      await expect(page.locator(`#${year}CurrentAssets`)).toHaveValue(String(balanceSheet[year].currentAssets));
    }
    await fillRevisionTexts(page);
    await page.fill("#directorDateApproved", "2026-11-20");
    await page.evaluate(() => {
      document.getElementById("companyAuthCode").value = "ABC123";
      return handleSubmitFiling();
    });
    await expect(page.locator("#filingResult")).toContainText("Companies House accepted the revised accounts.");
    const [sent] = await page.evaluate(() => window.sentAccounts);
    for (const [year, figures] of Object.entries(balanceSheet)) {
      for (const [line, value] of Object.entries(figures))
        expect([year, line, sent.balanceSheet[`${year}Year`][line]]).toEqual([year, line, value]);
    }
  });

  test("names no note to enter again for accounts whose notes the form carries, dormant or not", async ({ page }) => {
    await openAmend(page, accountsReceipt(microDocument()));
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#revisionNotesNote")).toBeHidden();
    await screenshotAtBothWidths(page, "micro-amend-no-notes-to-enter");
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

  const record = `filings.html?receipt=${encodeURIComponent(RECEIPT_NAME)}`;
  const refusals = [
    ["a receipt that is not accounts", { kind: "company-tax-return" }, "not an accounts filing", "../hmrc/receipt/receipts.html"],
    ["accounts Companies House did not accept", { statusCode: "REJECT" }, "did not accept those accounts", record],
    ["accounts filed with a Company Tax Return", { jointFilingId: "joint-1" }, "revise them on the Company Tax Return page", record],
    ["accounts that are already revised accounts", { amended: true }, "already revised accounts", record],
  ];
  for (const [name, overrides, text, next] of refusals) {
    test(`refuses ${name}, with one sentence and its next step`, async ({ page }) => {
      await openAmend(page, accountsReceipt(microCase.xhtml, overrides));
      await expect(page.locator("#statusMessagesContainer .status-error")).toContainText(text);
      await expect(page.locator("#statusMessagesContainer .status-message-next")).toHaveAttribute("href", next);
      await expect(page.locator("#formView")).toBeHidden();
      await expect(page.locator("#revisionBanner")).toBeHidden();
      await screenshot(page, `amend-refusal-${name.replace(/[^a-z]+/gi, "-").toLowerCase()}`, WIDTHS.desktop);
      await screenshotAtBothWidths(page, `micro-amend-refusal-${name.replace(/[^a-z]+/gi, "-").toLowerCase()}`);
    });
  }

  test("the status line ships hidden, so an amend address never paints the page's own status", () => {
    for (const language of ["", "cy/"]) {
      const html = fs.readFileSync(path.join(process.cwd(), `web/public/${language}companies-house/fileMicroEntityAccounts.html`), "utf-8");
      expect(html).toMatch(/<p[^>]*\sdata-feature-status="production"[^>]*\shidden\s*>/);
    }
  });

  test("states the revised accounts activity's status on a refusal too", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml, { statusCode: "REJECT" }));
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("did not accept those accounts");
    await expect(page.locator("[data-feature-status]")).toBeVisible();
    await expect(page.locator("[data-feature-status]")).toHaveText(
      "Status: preview. Revised accounts are a preview here: nothing you file reaches the live Companies House register.",
    );
  });

  test("refuses small company accounts, which revise on the small company page", async ({ page }) => {
    await openAmend(page, accountsReceipt(smallCase.xhtml, { companyNumber: "04549236" }));
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("small company accounts page");
    await expect(page.locator("#statusMessagesContainer .status-message-next")).toHaveAttribute(
      "href",
      `fileSmallCompanyAccounts.html?amend=${encodeURIComponent(RECEIPT_NAME)}`,
    );
    await expect(page.locator("#formView")).toBeHidden();
    await screenshotAtBothWidths(page, "micro-amend-refusal-small-company-accounts");
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

  test("says why accounts that state a heading this site cannot yet read back cannot be revised", async ({ page }) => {
    const filedSheet = microInputFromTestServiceCase(MICRO_TEST_CASE).balanceSheet;
    const withPrepayments = (year) => ({ ...year, prepaymentsAccruedIncome: 200, currentAssets: year.currentAssets - 200 });
    const balanceSheet = { current: withPrepayments(filedSheet.current), prior: withPrepayments(filedSheet.prior) };
    await openAmend(page, accountsReceipt(microDocument({ balanceSheet })));
    const status = page.locator("#statusMessagesContainer .status-error");
    await expect(status.locator(".status-message-cause")).toHaveText(
      "These accounts carry prepayments and accrued income, which this site cannot yet read back, so they cannot be revised here yet.",
    );
    await expect(status.locator(".status-message-next")).toHaveAttribute(
      "href",
      `filings.html?receipt=${encodeURIComponent(RECEIPT_NAME)}`,
    );
    await expect(page.locator("#formView")).toBeHidden();
  });

  test("shows its own sentence, and no technical message, when the accounts cannot be opened", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml), { profileFails: true });
    const status = page.locator("#statusMessagesContainer .status-error");
    await expect(status.locator(".status-message-cause")).toHaveText(
      "We could not open those accounts to revise. Open the filing again from your receipts.",
    );
    await expect(status.locator(".status-message-next")).toHaveText("Back to your receipts");
    await expect(status.locator(".status-message-next")).toHaveAttribute("href", "../hmrc/receipt/receipts.html");
    await expect(page.locator("#formView")).toBeHidden();
    await screenshotAtBothWidths(page, "micro-amend-refusal-cannot-open");
  });

  test("says revised accounts cannot be filed here where they are not offered", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml), { offered: false });
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("Revised accounts cannot be filed here yet");
    await expect(page.locator("#statusMessagesContainer .status-message-next")).toHaveText("See the filing");
    await expect(page.locator("#revisionSection")).toBeHidden();
    await screenshot(page, "amend-refusal-not-offered", WIDTHS.desktop);
    await screenshotAtBothWidths(page, "micro-amend-refusal-not-offered");
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

  test("previews the revised accounts with the statement of the revision", async ({ page }) => {
    await page.exposeFunction("buildPreviewIxbrl", (accounts) => {
      const errors = [];
      const validated = extractAndValidateAccountsParameters({ body: JSON.stringify({ companyAuthCode: "ABC123", ...accounts }) }, errors);
      if (errors.length) throw new Error(errors.join("; "));
      return buildAccountsIxbrl(validated);
    });
    await openAmend(page, accountsReceipt(microCase.xhtml));
    await serveFile(page, "**/lib/approval-date-check.js", "lib/approval-date-check.js");
    await serveFile(page, "**/lib/balance-sheet-check.js", "lib/balance-sheet-check.js");
    await serveFile(page, "**/lib/accounts-notes-check.js", "lib/accounts-notes-check.js");
    await expect(page.locator("#revisionSection")).toBeVisible();
    for (const statement of await page.locator('input[type="checkbox"][id^="statement"]').all()) await statement.check();
    await page.evaluate(() => {
      window.renderMicroEntityAccounts = async (accounts) => ({ ixbrl: await window.buildPreviewIxbrl(accounts) });
    });
    await fillRevisionTexts(page);
    await page.fill("#directorDateApproved", "2026-11-20");
    await page.click("#previewBtn");
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.frameLocator("#previewRendered").locator("body")).toContainText("Revised accounts");
    await expect(page.frameLocator("#previewRendered").locator("body")).toContainText(
      "The original balance sheet left out the creditors due within one year.",
    );
    await screenshotAtBothWidths(page, "micro-amend-preview");
  });

  test("shows the banner, the revision section and a refusal in Welsh on the Welsh page", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml), { welsh: true });
    await expect(page.locator("#revisionSection")).toBeVisible();
    await expect(page.locator("#revisionBanner")).not.toContainText("revised accounts");
    await expect(page.locator("#directorsReportConsistent")).toHaveValue("Ddim yn berthnasol");
    await screenshotAtBothWidths(page, "micro-amend-welsh-revision-section");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    const welshPage = await page.context().newPage();
    await openAmend(welshPage, accountsReceipt(microCase.xhtml, { jointFilingId: "joint-1" }), { welsh: true });
    await expect(welshPage.locator("#statusMessagesContainer")).not.toBeEmpty();
    await screenshotAtBothWidths(welshPage, "micro-amend-welsh-refusal-joint-filing");
  });

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
    await screenshotAtBothWidths(page, "micro-amend-result-rejected");
  });

  for (const [language, welsh, sentence] of [
    [
      "English",
      false,
      "Companies House holds no accounts for this company made up to 31 March 2026, so there are no accounts for revised accounts to replace.",
    ],
    [
      "Welsh",
      true,
      "Nid oes gan Dŷ’r Cwmnïau gyfrifon ar gyfer y cwmni hwn hyd at 31 Mawrth 2026, felly nid oes cyfrifon i gyfrifon diwygiedig gymryd eu lle.",
    ],
  ]) {
    test(`says in ${language} that the register holds no accounts to replace when the route refuses the filing for that`, async ({
      page,
    }) => {
      await openAmend(page, accountsReceipt(microCase.xhtml), { welsh });
      await serveFile(page, "**/lib/accounts-revision-register.js", "lib/accounts-revision-register.js");
      await expect(page.locator("#revisionSection")).toBeVisible();
      await fillRevisionTexts(page);
      await page.fill("#directorDateApproved", "2026-11-20");
      await page.evaluate((companyNumber) => {
        window.submitMicroEntityAccounts = async () => {
          const error = new Error("the route's English sentence");
          error.status = 400;
          error.reason = "revision-period-not-on-register";
          error.body = { reason: error.reason, companyNumber, periodEnd: "2026-03-31" };
          throw error;
        };
        document.getElementById("companyAuthCode").value = "ABC123";
        return handleSubmitFiling();
      }, MICRO_TEST_CASE.companyNumber);
      await expect(page.locator("#statusMessagesContainer .status-error")).toContainText(sentence);
      await expect(page.locator("#resultView")).toBeHidden();
      await screenshotAtBothWidths(page, `micro-amend-register-refusal-${language.toLowerCase()}`);
    });
  }

  test("shows the route's own message for a filing refused for any other reason", async ({ page }) => {
    await openAmend(page, accountsReceipt(microCase.xhtml));
    await serveFile(page, "**/lib/accounts-revision-register.js", "lib/accounts-revision-register.js");
    await expect(page.locator("#revisionSection")).toBeVisible();
    await fillRevisionTexts(page);
    await page.fill("#directorDateApproved", "2026-11-20");
    await page.evaluate(() => {
      window.submitMicroEntityAccounts = async () => {
        throw Object.assign(new Error("Missing director.name"), { status: 400, body: { message: "Missing director.name" } });
      };
      document.getElementById("companyAuthCode").value = "ABC123";
      return handleSubmitFiling();
    });
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("Missing director.name");
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
    await page.evaluate(
      ({ companyNumber, companyName }) => {
        company = { companyNumber, companyName };
      },
      { companyNumber: MICRO_TEST_CASE.companyNumber, companyName: JOINERY.name },
    );
    expect(await page.evaluate(() => buildAccountsPayload().revision)).toBeUndefined();
  });
});
