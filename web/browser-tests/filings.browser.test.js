// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/filings.browser.test.js
// Browser tests for the customer copy of a Companies House accounts filing and of a Company Tax
// Return: the filed documents show as filed, with the receipt, the explanations and the links.

import { test, expect } from "@playwright/test";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { accountsDocumentCases, computationsDocumentCase, SMALL_COMPANY_CASE_INPUT } from "@app/test-helpers/accountsDocumentCases.js";
import { buildSmallCompanyAccounts } from "@app/services/smallCompanyAccountsIxbrl.js";
import { serveSiteStyles } from "./hmrcFieldTableAssets.js";
import { recordScreenshotPath, pageScrollsSideways } from "./submissionRecordAssets.js";
import { screenshotAtBothWidths } from "./revisedAccountsScreenshots.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const ACCOUNTS_RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";
const CT_RECEIPT_NAME = "2026-10-24T11:30:00.000Z-ABCDEF0123456789.json";

const accountsCase = accountsDocumentCases()[0];
const smallCompanyCase = accountsDocumentCases().find((candidate) => candidate.name === "small-company-accounts");
const revisedAccountsCase = accountsDocumentCases().find((candidate) => candidate.name === "micro-entity-accounts-revised");

const ACCOUNTS_RECEIPT = {
  kind: "companies-house-accounts",
  statusCode: "ACCEPT",
  submissionNumber: "00001A",
  companyNumber: "00000003",
  rejections: [],
  filedDocument: accountsCase.xhtml,
};

const CT_RECEIPT = {
  kind: "company-tax-return",
  statusCode: "ACCEPT",
  correlationId: "ABCDEF0123456789",
  utr: "8596148860",
  irmark: "RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S",
  irmarkReceipt: "RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S",
  successMessage: "The submission was successfully received.",
  filed: {
    boxes: {
      1: "Example Trading Limited",
      2: "00000003",
      3: "8596148860",
      30: "2025-04-01",
      35: "2026-03-31",
      145: 10000,
      155: 4500,
      475: 855,
    },
    computationsIxbrl: computationsDocumentCase(),
    accountsIxbrl: smallCompanyCase.xhtml,
  },
};

const LIBRARIES = [
  "submission-record.js",
  "review-links.js",
  "filing-record.js",
  "ct600-fields.js",
  "balance-sheet-headings.js",
  "long-period.js",
  "accounts-revision.js",
  "first-accounts.js",
  "accounts-notes-check.js",
];

test.describe("Filings page - customer copy", () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, "companies-house/filings.html"), "utf-8");

  async function openFiling(page, name, receipt, { width = 1280, styled = true, revisionOffered = false } = {}) {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((receiptBody) => {
      localStorage.setItem("cognitoIdToken", "token");
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => receiptBody });
    }, receipt);
    await page.route("**/*.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    for (const library of LIBRARIES) {
      await page.route(`**/lib/${library}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: fs.readFileSync(path.join(PUBLIC_DIR, "lib", library), "utf-8"),
        }),
      );
    }
    if (revisionOffered) {
      await page.route("**/lib/books-bundle.js", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: fs.readFileSync(path.join(PUBLIC_DIR, "lib", "books-bundle.js"), "utf-8"),
        }),
      );
      await page.route("**/lib/services/catalog-service.js", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: `export const fetchCatalogText = async () => "";
            export const fetchCurrentEnvironmentName = async () => "ci";
            export const parseCatalogueText = () => ({});
            export const isRevisedAccountsOffered = () => true;`,
        }),
      );
      await page.route("**/lib/services/viewer-settings.js", (route) =>
        route.fulfill({ status: 200, contentType: "application/javascript", body: "export const fetchViewer = async () => ({});" }),
      );
    }
    await page.route("**/companies-house/filings.page.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fs.readFileSync(path.join(PUBLIC_DIR, "companies-house/filings.page.js"), "utf-8"),
      }),
    );
    if (styled) await serveSiteStyles(page);
    await page.route("**/companies-house/filings.html**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto(`http://localhost:3000/companies-house/filings.html?receipt=${encodeURIComponent(name)}`, {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.dispatchEvent(new Event("submit-ready")));
    await expect(page.locator("#filingContent .customer-copy")).toBeVisible();
  }

  test("shows the accounts as filed, the submission number, status and date", async ({ page }) => {
    await openFiling(page, ACCOUNTS_RECEIPT_NAME, ACCOUNTS_RECEIPT);

    const copy = page.locator("#filingContent .customer-copy");
    await expect(copy.locator(".customer-copy-title")).toHaveText("Your copy of the accounts filed at Companies House");
    await expect(copy.locator(".customer-copy-submission")).toContainText("00001A");
    await expect(copy.locator(".customer-copy-status")).toHaveText("Accepted by Companies House");
    await expect(copy.locator(".customer-copy-submission")).toContainText("24 October 2026");
    await expect(copy.locator(".customer-copy-explanation")).toHaveCount(2);

    const frame = page.frameLocator("iframe.filed-document");
    await expect(frame.locator("body")).toContainText("Balance sheet");
    await expect(copy.locator(".submission-record .entity").first()).toHaveText("Companies House receipt");
    await expect(copy.locator("tr", { hasText: "Company number" }).locator("td.text-value")).toHaveText("00000003");
    await expect(copy.locator(".customer-copy-links a")).toHaveText([
      "File accounts again with corrected figures",
      "Look up another company",
      "All your receipts",
    ]);
    const text = await page.locator("#filingContent").innerText();
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
  });

  test("shows the CT600 boxes, both filed documents, and the IRmark receipt", async ({ page }) => {
    await openFiling(page, CT_RECEIPT_NAME, CT_RECEIPT);

    const copy = page.locator("#filingContent .customer-copy");
    await expect(copy.locator(".customer-copy-title")).toHaveText("Your copy of the Company Tax Return (preview)");
    await expect(copy.locator(".customer-copy-status")).toHaveText("Accepted by HMRC");
    await expect(copy.locator(".customer-copy-submission")).toContainText("RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S");
    await expect(copy.locator("#ct600Box155 td.figure")).toHaveText("£4,500");
    await expect(copy.locator("#ct600Box3 td.text-value")).toHaveText("8596148860");
    await expect(page.locator("iframe.filed-document")).toHaveCount(2);
    await expect(copy.locator("tr", { hasText: "Correlation ID" }).last().locator("td.text-value")).toHaveText("ABCDEF0123456789");
    await expect(copy.locator(".customer-copy-links a").first()).toHaveAttribute("href", "fileCompanyTaxReturn.html");
  });

  test("a return filed with HMRC's live service is no preview, and the copy names each concept once", async ({ page }) => {
    await openFiling(page, CT_RECEIPT_NAME, {
      ...CT_RECEIPT,
      gatewayTest: false,
      filed: { ...CT_RECEIPT.filed, boxes: { ...CT_RECEIPT.filed.boxes, 4: 0 } },
    });
    const copy = page.locator("#filingContent .customer-copy");
    await expect(copy.locator(".customer-copy-title")).toHaveText("Your copy of the Company Tax Return");
    await expect(copy).not.toContainText("preview");
    await expect(copy).toContainText("Tax reference 8596148860");
    await expect(copy).toContainText("Company registration number 00000003");
    await expect(copy).not.toContainText("Unique Taxpayer Reference");
    await expect(copy.locator("#ct600Box4 td.text-value")).toHaveText("Not one of the listed types");
    await expect(copy.locator("#ct600Box30 td.text-value")).toHaveText("1 April 2025");
    await expect(copy.locator("#ct600Box35 td.text-value")).toHaveText("31 March 2026");
    await expect(copy.locator("tr", { hasText: "Filed on" })).toHaveCount(0);
    await expect(copy).toContainText("Filed 24 October 2026");
  });

  test("a test filing, or one whose receipt does not say, keeps preview in its title", async ({ page }) => {
    await openFiling(page, CT_RECEIPT_NAME, { ...CT_RECEIPT, gatewayTest: true });
    await expect(page.locator(".customer-copy-title")).toHaveText("Your copy of the Company Tax Return (preview)");
  });

  test("the printed copy has no empty page and keeps each download link with its sentence", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "only Chromium prints to PDF");
    await openFiling(page, CT_RECEIPT_NAME, { ...CT_RECEIPT, gatewayTest: false });
    await page.emulateMedia({ media: "print" });
    // Every statement row, on the page and in each filed document's frame, stays on one printed page.
    const rowBreaks = [];
    for (const frame of page.frames()) {
      rowBreaks.push(
        ...(await frame.evaluate(() =>
          Array.from(document.querySelectorAll("table.statement tr"), (row) => getComputedStyle(row).breakInside),
        )),
      );
    }
    expect(rowBreaks.length).toBeGreaterThan(0);
    expect(new Set(rowBreaks)).toEqual(new Set(["avoid"]));
    const pdfPath = path.join(process.cwd(), "target/screenshots/filed-copy-print/ct-filed-copy.pdf");
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await page.pdf({ path: pdfPath, format: "A4" });
    const pages = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" })
      .split("\f")
      .filter((text, index, all) => index < all.length - 1 || text.trim());
    expect(pages.length).toBeGreaterThan(1);
    for (const [index, text] of pages.entries()) {
      expect(text.replace(/\s+/g, " ").trim().length, `page ${index + 1} holds more than a line`).toBeGreaterThan(80);
      if (text.includes("Download the")) expect(text, `page ${index + 1} keeps the link with its sentence`).toContain("Save this file");
    }
  });

  test("downloads each filed document as the exact bytes that were filed", async ({ page }) => {
    await openFiling(page, CT_RECEIPT_NAME, CT_RECEIPT);

    const links = page.locator(".filed-document-download a");
    await expect(links).toHaveCount(2);
    await expect(page.locator(".filed-document-download").first()).toContainText("Save this file with your records");
    const expected = [
      ["computations-ABCDEF0123456789.xhtml", CT_RECEIPT.filed.computationsIxbrl],
      ["accounts-ABCDEF0123456789.xhtml", CT_RECEIPT.filed.accountsIxbrl],
    ];
    for (const [index, [fileName, filed]] of expected.entries()) {
      const [download] = await Promise.all([page.waitForEvent("download"), links.nth(index).click()]);
      expect(download.suggestedFilename()).toBe(fileName);
      const downloaded = fs.readFileSync(await download.path());
      expect(downloaded.equals(Buffer.from(filed, "utf-8"))).toBe(true);
    }
  });

  test("downloads the accounts filed at Companies House as the exact bytes that were filed", async ({ page }) => {
    await openFiling(page, ACCOUNTS_RECEIPT_NAME, ACCOUNTS_RECEIPT);

    const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".filed-document-download a").click()]);
    expect(download.suggestedFilename()).toBe("accounts-00001A.xhtml");
    expect(fs.readFileSync(await download.path()).equals(Buffer.from(ACCOUNTS_RECEIPT.filedDocument, "utf-8"))).toBe(true);
  });

  test("links an accepted Company Tax Return that kept its answers to the page that amends it", async ({ page }) => {
    const formRequest = { company: { companyNumber: "00000003", companyName: "Example Trading Limited" }, values: { turnover: "1000" } };
    await openFiling(page, CT_RECEIPT_NAME, { ...CT_RECEIPT, formRequest });
    const link = page.locator("#amendFilingLink");
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Amend");
    await expect(link).toHaveAttribute("href", `fileCompanyTaxReturn.html?amend=${encodeURIComponent(CT_RECEIPT_NAME)}`);
  });

  test("offers no Amend link on a Company Tax Return that kept no answers, or on accounts", async ({ page }) => {
    await openFiling(page, CT_RECEIPT_NAME, CT_RECEIPT);
    await expect(page.locator("#amendFilingLink")).toBeHidden();
  });

  test("says so when the filing was made before the document was kept", async ({ page }) => {
    const { filedDocument, ...older } = ACCOUNTS_RECEIPT;
    expect(filedDocument).toBeTruthy();
    await openFiling(page, ACCOUNTS_RECEIPT_NAME, older);

    await expect(page.locator("#filingContent")).toContainText("made before the site kept a copy of the filed document");
    await expect(page.locator("iframe.filed-document")).toHaveCount(0);
  });

  test("offers the browser's print and hides the page chrome when printing", async ({ page }) => {
    await openFiling(page, ACCOUNTS_RECEIPT_NAME, ACCOUNTS_RECEIPT);

    await expect(page.locator("#printFilingBtn")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#filingActions")).toBeHidden();
    await expect(page.locator(".customer-copy-explanation").first()).toBeHidden();
    await expect(page.locator(".customer-copy-title")).toBeVisible();
  });

  for (const width of [1280, 390]) {
    test(`screenshot of the accounts filing at ${width} px`, async ({ page }) => {
      await openFiling(page, ACCOUNTS_RECEIPT_NAME, ACCOUNTS_RECEIPT, { width });
      expect(await pageScrollsSideways(page)).toBe(false);
      await page.screenshot({ path: recordScreenshotPath("filing-accounts", width), fullPage: true });
    });
  }
  test("offers to amend accepted micro-entity accounts where revised accounts are offered", async ({ page }) => {
    await openFiling(page, ACCOUNTS_RECEIPT_NAME, ACCOUNTS_RECEIPT, { revisionOffered: true });

    const amendHref = `fileMicroEntityAccounts.html?amend=${encodeURIComponent(ACCOUNTS_RECEIPT_NAME)}`;
    await expect(page.locator("#amendFilingLink")).toBeVisible();
    await expect(page.locator("#amendFilingLink")).toHaveAttribute("href", amendHref);
    const layoutOf = (selector) =>
      page.locator(selector).evaluate((button) => {
        const style = getComputedStyle(button);
        return { display: style.display, alignItems: style.alignItems, height: button.getBoundingClientRect().height };
      });
    expect(await layoutOf("#amendFilingLink")).toEqual(await layoutOf("#printFilingBtn"));
    const links = page.locator("#filingContent .customer-copy-links a");
    await expect(links.first()).toHaveText("Amend these accounts");
    await expect(links.first()).toHaveAttribute("href", amendHref);
    await screenshotAtBothWidths(page, "filing-amend-offered");
  });

  test("offers no amend link for accounts where revised accounts are not offered", async ({ page }) => {
    await openFiling(page, ACCOUNTS_RECEIPT_NAME, ACCOUNTS_RECEIPT);
    await expect(page.locator("#amendFilingLink")).toBeHidden();
  });

  test("offers no amend link here for accounts filed with a Company Tax Return", async ({ page }) => {
    await openFiling(page, ACCOUNTS_RECEIPT_NAME, { ...ACCOUNTS_RECEIPT, jointFilingId: "joint-1" }, { revisionOffered: true });
    await expect(page.locator("#amendFilingLink")).toBeHidden();
    await expect(page.locator("#filingContent .customer-copy-links a").first()).toHaveText("File accounts again with corrected figures");
  });

  test("says why small company accounts filed without the previous year's figures have no amend link", async ({ page }) => {
    const singleYear = buildSmallCompanyAccounts({
      ...SMALL_COMPANY_CASE_INPUT,
      balanceSheet: { current: SMALL_COMPANY_CASE_INPUT.balanceSheet.current },
      profitAndLoss: { ...SMALL_COMPANY_CASE_INPUT.profitAndLoss, prior: undefined },
      fixedAssetNote: undefined,
    });
    await openFiling(
      page,
      ACCOUNTS_RECEIPT_NAME,
      { ...ACCOUNTS_RECEIPT, companyNumber: SMALL_COMPANY_CASE_INPUT.companyNumber, filedDocument: singleYear },
      { revisionOffered: true },
    );
    await expect(page.locator("#amendFilingLink")).toBeHidden();
    await expect(page.locator("#filingNotice")).toHaveText(
      "These accounts were filed without the previous year's figures, which accounts show unless they are the company's first. This site reads the previous year back to amend accounts, so they cannot be amended here.",
    );
    await expect(page.locator("#filingContent")).toContainText(`Company number${SMALL_COMPANY_CASE_INPUT.companyNumber}`);
    await screenshotAtBothWidths(page, "filing-no-comparatives");
  });

  test("offers a company's first accounts, which have one year, to amend on the small company form", async ({ page }) => {
    const firstAccounts = buildSmallCompanyAccounts({
      ...SMALL_COMPANY_CASE_INPUT,
      dateOfIncorporation: SMALL_COMPANY_CASE_INPUT.periodStart,
      balanceSheet: { current: SMALL_COMPANY_CASE_INPUT.balanceSheet.current },
      profitAndLoss: { ...SMALL_COMPANY_CASE_INPUT.profitAndLoss, prior: undefined },
      fixedAssetNote: undefined,
    });
    await openFiling(
      page,
      ACCOUNTS_RECEIPT_NAME,
      { ...ACCOUNTS_RECEIPT, companyNumber: SMALL_COMPANY_CASE_INPUT.companyNumber, filedDocument: firstAccounts },
      { revisionOffered: true },
    );
    await expect(page.locator("#amendFilingLink")).toHaveAttribute(
      "href",
      `fileSmallCompanyAccounts.html?amend=${encodeURIComponent(ACCOUNTS_RECEIPT_NAME)}`,
    );
    await expect(page.locator("#filingNotice")).toBeHidden();
    await screenshotAtBothWidths(page, "filing-first-accounts");
  });

  test("says nothing of comparatives when accounts with both years are offered to amend", async ({ page }) => {
    await openFiling(
      page,
      ACCOUNTS_RECEIPT_NAME,
      { ...ACCOUNTS_RECEIPT, filedDocument: smallCompanyCase.xhtml },
      { revisionOffered: true },
    );
    await expect(page.locator("#amendFilingLink")).toBeVisible();
    await expect(page.locator("#filingNotice")).toBeHidden();
  });

  test("offers to amend accepted small company accounts on the small company form", async ({ page }) => {
    await openFiling(
      page,
      ACCOUNTS_RECEIPT_NAME,
      { ...ACCOUNTS_RECEIPT, filedDocument: smallCompanyCase.xhtml },
      { revisionOffered: true },
    );
    const amendHref = `fileSmallCompanyAccounts.html?amend=${encodeURIComponent(ACCOUNTS_RECEIPT_NAME)}`;
    await expect(page.locator("#amendFilingLink")).toHaveAttribute("href", amendHref);
    await expect(page.locator("#filingContent .customer-copy-links a").first()).toHaveAttribute("href", amendHref);
  });

  for (const width of [1280, 390]) {
    test(`titles the copy of revised accounts as revised (${width})`, async ({ page }) => {
      const originalName = "2026-09-20T09:00:00.000Z-00000A.json";
      await openFiling(
        page,
        ACCOUNTS_RECEIPT_NAME,
        { ...ACCOUNTS_RECEIPT, amended: true, revisesReceipt: originalName, filedDocument: revisedAccountsCase.xhtml },
        { width, revisionOffered: true },
      );

      await expect(page.locator("#filingContent .customer-copy-title")).toHaveText(
        "Your copy of the revised accounts filed at Companies House",
      );
      await expect(page.locator("#amendFilingLink")).toBeHidden();
      const original = page.locator("#filingContent .customer-copy-links a", { hasText: "See the original accounts these revise" });
      await expect(original).toHaveAttribute("href", `filings.html?receipt=${encodeURIComponent(originalName)}`);
      await expect(page.frameLocator("iframe.filed-document").locator("body")).toContainText("Revised accounts");
      const inset = await page.locator(".filed-document-download a").evaluate((link) => {
        const sheet = link.closest(".customer-copy-sheet").getBoundingClientRect();
        return link.getBoundingClientRect().left - sheet.left;
      });
      expect(inset).toBeGreaterThanOrEqual(16);
      fs.mkdirSync(path.join(process.cwd(), "target/browser-test-results/revised-accounts"), { recursive: true });
      await page.screenshot({
        path: path.join(process.cwd(), "target/browser-test-results/revised-accounts", `receipt-titled-revised-${width}.png`),
        fullPage: true,
      });
    });
  }
});

test.describe("Filings page - a filing Companies House has not decided", () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, "companies-house/filings.html"), "utf-8");
  const PENDING = {
    submissionNumber: "00001A",
    kind: "accounts",
    companyNumber: "00000001",
    status: "pending",
    submittedAt: "2026-11-25T10:00:00.000Z",
    rejections: [],
    clientId: null,
  };

  async function openStatus(
    page,
    { filingsInProgress = [PENDING], companyTaxReturnsInProgress = [], statusAnswers = [], query = "filing=00001A&kind=accounts" } = {},
  ) {
    await page.addInitScript(
      ({ inProgress, ctInProgress, answers }) => {
        localStorage.setItem("cognitoIdToken", "token");
        window.requestedUrls = [];
        window.fetchWithIdToken = async (url) => {
          window.requestedUrls.push(url);
          if (url.startsWith("/api/v1/hmrc/receipt"))
            return {
              ok: true,
              json: async () => ({ receipts: [], filingsInProgress: inProgress, companyTaxReturnsInProgress: ctInProgress }),
            };
          const answer = answers.shift();
          if (answer?.httpStatus) return { ok: false, status: answer.httpStatus, json: async () => ({}) };
          return answer ? { ok: true, status: 200, json: async () => answer } : { ok: false, status: 502, json: async () => ({}) };
        };
      },
      { inProgress: filingsInProgress, ctInProgress: companyTaxReturnsInProgress, answers: statusAnswers },
    );
    await page.route("**/*.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    for (const file of [
      "lib/companies-house-forms.js",
      "lib/presenter-poll-schedule.js",
      "lib/companies-house-rejections.js",
      "lib/long-period.js",
      "companies-house/filings.page.js",
    ]) {
      await page.route(`**/${file}`, (route) =>
        route.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(PUBLIC_DIR, file), "utf-8") }),
      );
    }
    await serveSiteStyles(page);
    await page.route("**/companies-house/filings.html**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto(`http://localhost:3000/companies-house/filings.html?${query}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.dispatchEvent(new Event("submit-ready")));
  }

  test("says where a pending filing is, when Submit asks Companies House, and warns against filing it again", async ({ page }) => {
    await openStatus(page);
    const panel = page.locator("#filingStatus");
    await expect(panel).toBeVisible();
    await expect(page.locator("#filingStatusHeading")).toHaveText("Annual accounts");
    await expect(page.locator("#filingStatusAnswer")).toHaveText("Companies House has the filing and has not decided yet.");
    await expect(page.locator("#filingStatusCompany")).toHaveText("00000001");
    await expect(page.locator("#filingStatusNumber")).toHaveText("00001A");
    await expect(page.locator("#filingStatusSent")).toContainText("2026");
    await expect(page.locator("#filingStatusLastAsked")).not.toBeEmpty();
    await expect(page.locator("#filingStatusNextAsk")).not.toBeEmpty();
    await expect(panel).toContainText("Companies House emails the company when it decides.");
    await expect(page.locator("#filingStatusWarning")).toContainText("beside submission 00001A");
    await expect(page.getByRole("button", { name: "Check now" })).toBeVisible();
    await expect(panel).not.toContainText("Start a new filing");
    expect(await pageScrollsSideways(page)).toBe(false);
  });

  test("says when Submit last asked Companies House from the time the list records", async ({ page }) => {
    await openStatus(page, { filingsInProgress: [{ ...PENDING, askedOnSchedule: true, lastCheckedAt: "2026-11-25T10:15:00.000Z" }] });
    await expect(page.locator("#filingStatusLastAsked")).toHaveText("Wednesday, 25 November 2026 at 10:15");
    await expect(page.locator("#filingStatusNextAsk")).not.toBeEmpty();
  });

  test("a filing Submit has not asked about yet says so", async ({ page }) => {
    await openStatus(page);
    await expect(page.locator("#filingStatusLastAsked")).toHaveText("Not yet");
  });

  test("a filing under the customer's own presenter says Submit asks when Check now is pressed, not on the schedule", async ({ page }) => {
    await openStatus(page, { filingsInProgress: [{ ...PENDING, askedOnSchedule: false, lastCheckedAt: "2026-11-25T10:02:00.000Z" }] });
    await expect(page.locator("#filingStatusLastAsked")).toHaveText("Wednesday, 25 November 2026 at 10:02");
    await expect(page.locator("#filingStatusNextAsk")).toHaveText("When you press Check now");
    await expect(page.locator("#filingStatusHow")).toContainText("under your own presenter ID");
    await expect(page.locator("#filingStatusHow")).not.toContainText("every 15 minutes");
  });

  test("Check now asks the filing's own status route and reads a submission not yet indexed as pending", async ({ page }) => {
    await openStatus(page, { statusAnswers: [{ submissionNumber: "00001A", statusCode: "PENDING", rejections: [], notYetIndexed: true }] });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusAnswer")).toContainText("has not yet added it to its records");
    await expect(page.locator("#filingStatusYouAsked")).toBeVisible();
    expect(await page.evaluate(() => window.requestedUrls)).toContain("/api/v1/companies-house/accounts/00001A");
    await expect(page.getByRole("button", { name: "Check now" })).toBeVisible();
  });

  test("Check now on an accepted filing sends the reader to the receipt and offers no more checks", async ({ page }) => {
    await openStatus(page, { statusAnswers: [{ submissionNumber: "00001A", statusCode: "ACCEPT", rejections: [] }] });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusAnswer")).toContainText("Companies House accepted the filing.");
    await expect(page.locator("#filingStatusAnswer").getByRole("link", { name: "your receipts" })).toHaveAttribute(
      "href",
      "../hmrc/receipt/receipts.html",
    );
    await expect(page.getByRole("button", { name: "Check now" })).toBeHidden();
    await expect(page.locator("#filingStatusWarning")).toBeHidden();
  });

  test("Check now on a rejected filing shows Companies House's reasons", async ({ page }) => {
    await openStatus(page, {
      statusAnswers: [
        {
          submissionNumber: "00001A",
          statusCode: "REJECT",
          rejections: [{ rejectCode: "9999", description: "The company number is wrong" }],
        },
      ],
    });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusAnswer")).toHaveText("Companies House rejected submission 00001A:");
    await expect(page.locator("#filingStatusReasons")).toContainText("The company number is wrong");
    await expect(page.getByRole("button", { name: "Check now" })).toBeHidden();
  });

  test("a failed check says to try again and keeps Check now", async ({ page }) => {
    await openStatus(page, { statusAnswers: [] });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusAnswer")).toHaveText(
      "Submit could not ask Companies House just now. Try again in a few minutes.",
    );
    await expect(page.getByRole("button", { name: "Check now" })).toBeEnabled();
  });

  test("a form on the shared poll asks on the forms route", async ({ page }) => {
    await openStatus(page, {
      filingsInProgress: [{ ...PENDING, submissionNumber: "00002B", kind: "psc-cessation" }],
      statusAnswers: [{ submissionNumber: "00002B", statusCode: "PENDING", rejections: [] }],
      query: "filing=00002B&kind=psc-cessation",
    });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusYouAsked")).toBeVisible();
    expect(await page.evaluate(() => window.requestedUrls)).toContain("/api/v1/companies-house/forms/psc-cessation/00002B");
  });

  test("a rejected filing opens with its reasons and no Check now", async ({ page }) => {
    await openStatus(page, {
      filingsInProgress: [{ ...PENDING, status: "rejected", rejections: [{ rejectCode: "1", description: "No shareholders named" }] }],
    });
    await expect(page.locator("#filingStatusReasons")).toContainText("No shareholders named");
    await expect(page.getByRole("button", { name: "Check now" })).toBeHidden();
  });

  test("a filing no longer waiting says its receipt or rejection is in the receipts", async ({ page }) => {
    await openStatus(page, { filingsInProgress: [] });
    await expect(page.locator("#filingNotice")).toHaveText(
      "Submission 00001A is no longer waiting for Companies House. Its receipt, or its rejection, is in your receipts.",
    );
    await expect(page.locator("#filingStatus")).toBeHidden();
  });
});

test.describe("Filings page - a Company Tax Return HMRC has not answered", () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, "companies-house/filings.html"), "utf-8");
  const CT_PENDING = {
    correlationId: "46DCD4CC7E194088B99857931C185829",
    status: "pending",
    submittedAt: "2026-11-25T10:00:00.000Z",
    lastCheckedAt: "2026-11-25T10:05:00.000Z",
    utr: "8596148860",
    companyName: "EXAMPLE LIMITED",
    companyNumber: "00000001",
    periodStart: "2025-04-01",
    periodEnd: "2026-03-31",
    clientId: null,
  };
  const QUERY = `filing=${CT_PENDING.correlationId}&kind=ct600`;

  async function openCtStatus(page, { companyTaxReturnsInProgress = [CT_PENDING], statusAnswers = [], query = QUERY } = {}) {
    await page.addInitScript(
      ({ ctInProgress, answers }) => {
        localStorage.setItem("cognitoIdToken", "token");
        window.requestedUrls = [];
        window.fetchWithIdToken = async (url) => {
          window.requestedUrls.push(url);
          if (url.startsWith("/api/v1/hmrc/receipt"))
            return { ok: true, json: async () => ({ receipts: [], filingsInProgress: [], companyTaxReturnsInProgress: ctInProgress }) };
          const answer = answers.shift();
          if (answer?.httpStatus) return { ok: false, status: answer.httpStatus, json: async () => ({}) };
          return answer ? { ok: true, status: 200, json: async () => answer } : { ok: false, status: 502, json: async () => ({}) };
        };
      },
      { ctInProgress: companyTaxReturnsInProgress, answers: statusAnswers },
    );
    await page.route("**/*.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    for (const file of [
      "lib/companies-house-forms.js",
      "lib/presenter-poll-schedule.js",
      "lib/long-period.js",
      "companies-house/filings.page.js",
    ]) {
      await page.route(`**/${file}`, (route) =>
        route.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(PUBLIC_DIR, file), "utf-8") }),
      );
    }
    await serveSiteStyles(page);
    await page.route("**/companies-house/filings.html**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto(`http://localhost:3000/companies-house/filings.html?${query}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.dispatchEvent(new Event("submit-ready")));
  }

  test("says where the return is, when Submit last asked HMRC, and warns against filing it again", async ({ page }) => {
    await openCtStatus(page);
    const panel = page.locator("#filingStatus");
    await expect(panel).toBeVisible();
    await expect(page.locator("#filingStatusHeading")).toHaveText("Company Tax Return");
    await expect(page.locator("#filingStatusAnswer")).toHaveText("HMRC has the return and has not given its final answer yet.");
    await expect(page.locator("#filingStatusCompany")).toHaveText("EXAMPLE LIMITED, 00000001");
    await expect(page.locator("#filingStatusUtr")).toHaveText("8596148860");
    await expect(page.locator("#filingStatusPeriod")).toHaveText("1 April 2025 to 31 March 2026");
    await expect(page.locator("#filingStatusNumber")).toHaveText(CT_PENDING.correlationId);
    await expect(page.locator("#filingStatusLastAsked")).toHaveText("Wednesday, 25 November 2026 at 10:05");
    await expect(page.locator("#filingStatusWarning")).toContainText(`beside the return with correlation ID ${CT_PENDING.correlationId}`);
    await expect(page.getByRole("button", { name: "Check now" })).toBeVisible();
    expect(await pageScrollsSideways(page)).toBe(false);
  });

  test("a return Submit has not asked HMRC about yet says so", async ({ page }) => {
    const { lastCheckedAt: _lastCheckedAt, ...neverAsked } = CT_PENDING;
    await openCtStatus(page, { companyTaxReturnsInProgress: [neverAsked] });
    await expect(page.locator("#filingStatusLastAsked")).toHaveText("Not yet");
  });

  test("Check now asks the Company Tax Return status route and reads pending", async ({ page }) => {
    await openCtStatus(page, {
      statusAnswers: [{ statusCode: "PENDING", correlationId: CT_PENDING.correlationId, pollIntervalSeconds: 10 }],
    });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusYouAsked")).toBeVisible();
    await expect(page.locator("#filingStatusAnswer")).toHaveText("HMRC has the return and has not given its final answer yet.");
    expect(await page.evaluate(() => window.requestedUrls)).toContain(`/api/v1/hmrc/ct/return/${CT_PENDING.correlationId}`);
    await expect(page.getByRole("button", { name: "Check now" })).toBeVisible();
  });

  test("Check now on an accepted return links its copy and receipt and offers no more checks", async ({ page }) => {
    await openCtStatus(page, {
      statusAnswers: [{ statusCode: "ACCEPT", correlationId: CT_PENDING.correlationId, receiptId: "2026-11-25T10:06:00.000Z-46DCD4CC" }],
    });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusAnswer")).toContainText("HMRC accepted the return.");
    await expect(page.locator("#filingStatusReceiptLink")).toHaveAttribute(
      "href",
      `filings.html?receipt=${encodeURIComponent("2026-11-25T10:06:00.000Z-46DCD4CC.json")}`,
    );
    await expect(page.getByRole("button", { name: "Check now" })).toBeHidden();
    await expect(page.locator("#filingStatusWarning")).toBeHidden();
  });

  test("Check now on a rejected return shows HMRC's errors", async ({ page }) => {
    await openCtStatus(page, {
      statusAnswers: [
        {
          statusCode: "REJECT",
          correlationId: CT_PENDING.correlationId,
          errors: [
            {
              number: "3001",
              text: "The submission of this document has failed due to departmental specific business logic in the Body tag.",
            },
          ],
          businessErrors: [{ number: "9284", text: "Box 145 must be present" }],
        },
      ],
    });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusAnswer")).toHaveText(
      `HMRC rejected the return with correlation ID ${CT_PENDING.correlationId}:`,
    );
    await expect(page.locator("#filingStatusReasons li")).toHaveText([
      "Error 3001: The submission of this document has failed due to departmental specific business logic in the Body tag.",
      "Error 9284: Box 145 must be present",
    ]);
    await expect(page.getByRole("button", { name: "Check now" })).toBeHidden();
  });

  test("a failed check says to try again and keeps Check now", async ({ page }) => {
    await openCtStatus(page, { statusAnswers: [] });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusAnswer")).toHaveText("Submit could not ask HMRC just now. Try again in a few minutes.");
    await expect(page.getByRole("button", { name: "Check now" })).toBeEnabled();
  });

  test("a return the status route no longer finds says it is no longer waiting", async ({ page }) => {
    await openCtStatus(page, { statusAnswers: [{ httpStatus: 404 }] });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusAnswer")).toContainText("is no longer waiting for HMRC");
    await expect(page.getByRole("button", { name: "Check now" })).toBeHidden();
  });

  test("a client's return is asked about for that client", async ({ page }) => {
    await openCtStatus(page, {
      companyTaxReturnsInProgress: [{ ...CT_PENDING, clientId: "client-1" }],
      statusAnswers: [{ statusCode: "PENDING", correlationId: CT_PENDING.correlationId }],
      query: `${QUERY}&clientId=client-1`,
    });
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.locator("#filingStatusYouAsked")).toBeVisible();
    expect(await page.evaluate(() => window.requestedUrls)).toEqual([
      "/api/v1/hmrc/receipt?clientId=client-1",
      `/api/v1/hmrc/ct/return/${CT_PENDING.correlationId}?clientId=client-1`,
    ]);
  });

  test("a return no longer waiting says so", async ({ page }) => {
    await openCtStatus(page, { companyTaxReturnsInProgress: [] });
    await expect(page.locator("#filingNotice")).toContainText(`correlation ID ${CT_PENDING.correlationId} is no longer waiting for HMRC`);
    await expect(page.locator("#filingStatus")).toBeHidden();
  });
});
