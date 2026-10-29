// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileCompanyTaxReturn.browser.test.js

import { test, expect } from "@playwright/test";
import { serveSiteStyles } from "./hmrcFieldTableAssets.js";
import { pageScrollsSideways, recordScreenshotPath } from "./submissionRecordAssets.js";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import {
  ACCOUNTS_TEXT_FIELDS,
  CT600_FORM_FIELDS,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_FIELDS,
  accountAmountIds,
  noteId,
} from "../public/lib/ct600-fields.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PAGE_URL = "http://localhost:3000/companies-house/fileCompanyTaxReturn.html";
const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const BOOK_DIRECTORY = path.join(process.cwd(), "fixtures/diya-gl/precision-code-ltd");
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const PREVIEW_BOXES = { 3: "8596148860", 30: "2025-04-01", 35: "2026-03-31", 440: 12345.67, 475: 12345.67 };
const ACCEPTED_RETURN = {
  statusCode: "ACCEPT",
  correlationId: "ABCDEF0123456789",
  irmark: "RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S",
  irmarkReceipt: "RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S",
  receiptId: "2026-10-24T11:30:00.000Z-ABCDEF0123456789",
};

const OPTIONAL_CREDITOR_LINES = ["BankLoansOverdrafts", "TaxationSocialSecurity", "BankLoansAfterOneYear"];

test.describe("File Company Tax Return page", () => {
  let pageHtml;

  test.beforeAll(() => {
    pageHtml = fs.readFileSync(path.join(process.cwd(), "web/public/companies-house/fileCompanyTaxReturn.html"), "utf-8");
  });

  async function loadReviewView(page) {
    const html = pageHtml.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');
    await page.route("**/fileCompanyTaxReturn.html*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.route("**/*.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await serveSiteStyles(page);
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      document.getElementById("companyView").style.display = "none";
      document.getElementById("previewView").style.display = "block";
      document.getElementById("previewIxbrl").textContent = `<html>${"<ix:nonFraction>1</ix:nonFraction>".repeat(400)}</html>`;
    });
  }

  test("hides the raw iXBRL source without developer mode", async ({ page }) => {
    await loadReviewView(page);
    await expect(page.locator("#previewIxbrl")).toBeHidden();
  });

  test("shows the raw iXBRL source inside the card with developer mode", async ({ page }) => {
    await loadReviewView(page);
    await page.evaluate(() => document.body.classList.add("developer-mode"));
    const source = page.locator("#previewIxbrl");
    await expect(source).toBeVisible();
    const fits = await page.evaluate(() => {
      const pre = document.getElementById("previewIxbrl");
      const card = document.getElementById("previewView");
      return pre.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1;
    });
    expect(fits).toBe(true);
  });

  test("renders the password input as wide as the text input", async ({ page }) => {
    await loadReviewView(page);
    const widths = await page.evaluate(() => ({
      text: document.getElementById("gatewayUserId").getBoundingClientRect().width,
      password: document.getElementById("gatewayPassword").getBoundingClientRect().width,
    }));
    expect(widths.text).toBeGreaterThan(100);
    expect(widths.password).toBe(widths.text);
  });

  test("links the Company Tax Return guide and the CT600 form in a new tab", async ({ page }) => {
    await loadReviewView(page);
    for (const id of ["companyTaxReturnGuideLink", "ct600FormLink"]) {
      const link = page.locator(`#${id}`);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener");
    }
  });
});

test.describe("File Company Tax Return entry form", () => {
  async function zippedPrecisionCodeBook() {
    const zip = new JSZip();
    zip.file("book.toml", fs.readFileSync(path.join(BOOK_DIRECTORY, "book.toml")));
    zip.file("lines.jsonl", fs.readFileSync(path.join(BOOK_DIRECTORY, "lines.jsonl")));
    return zip.generateAsync({ type: "nodebuffer" });
  }

  async function serveRealSite(page, previewRequests = [], submission = { requests: [], status: 409, body: {} }) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("cognitoIdToken", "mock-id-token");
        localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "user@example.com" }));
      } catch {
        // storage can be blocked; the page then asks for sign-in
      }
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "localhost") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
        return;
      }
      if (url.pathname === "/api/v1/bundle") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles: [], tokensRemaining: 0 }) });
        return;
      }
      if (url.pathname === "/api/v1/companies-house/company/12345678") {
        const body = { companyNumber: "12345678", companyName: "Precision Code Ltd" };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        return;
      }
      if (url.pathname === "/api/v1/hmrc/ct/return/preview") {
        previewRequests.push(JSON.parse(route.request().postData()));
        const computationLines = Object.fromEntries(
          ["profitLossPerAccounts", "nonTradingLoanRelationshipCredits", "depreciation", "amortisation", "entertaining", "donations"].map(
            (name) => [name, 1],
          ),
        );
        const body = {
          boxes: PREVIEW_BOXES,
          computationLines: { ...computationLines, adjustedProfitBeforeCapitalAllowances: 2, totalCapitalAllowances: 1, adjustedProfit: 1 },
          computationsIxbrl: "<html/>",
        };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        return;
      }
      if (url.pathname === "/api/v1/hmrc/ct/return" && route.request().method() === "POST") {
        submission.requests.push(JSON.parse(route.request().postData()));
        await route.fulfill({ status: submission.status, contentType: "application/json", body: JSON.stringify(submission.body) });
        return;
      }
      if (url.pathname.startsWith("/api/v1/hmrc/ct/return/") && route.request().method() === "GET" && submission.pollBody) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(submission.pollBody) });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      const pathname = decodeURIComponent(url.pathname);
      const filePath = path.join(PUBLIC_ROOT, pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const body = fs.readFileSync(filePath);
        await route.fulfill({ status: 200, contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream", body });
      } else {
        await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
      }
    });
  }

  async function openForm(page, previewRequests, submission) {
    await serveRealSite(page, previewRequests, submission);
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#companyNumber").fill("12345678");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
  }

  // The precision-code-ltd book is a micro-entity by size, so the card opens the form on the
  // micro-entity accounts; most tests file the small company accounts the same book also gives.
  async function dropBook(page, { regime = "small" } = {}) {
    await page.locator("#booksImportFile").setInputFiles({
      name: "precision-code.diya-gl.zip",
      mimeType: "application/zip",
      buffer: await zippedPrecisionCodeBook(),
    });
    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
    await page.locator(regime === "micro" ? "#regimeMicro" : "#regimeSmall").check();
  }

  async function completeTheAnswersTheBookLeaves(page, { regime = "small" } = {}) {
    await page.locator("#utr").fill("8596148860");
    for (const id of [
      "statementSection477Exemption",
      "statementMembersNotRequiredAudit",
      "statementDirectorsResponsibilities",
      regime === "micro" ? "statementMicroEntityProvisions" : "statementSmallCompaniesRegime",
      "declarationAccepted",
    ]) {
      await page.locator(`#${id}`).check();
    }
  }

  test("the pasted book export, its file input and the accounts-in-the-book radio are gone", async ({ page }) => {
    await openForm(page);
    await expect(page.locator("#bookExport")).toHaveCount(0);
    await expect(page.locator("#bookExportFile")).toHaveCount(0);
    await expect(page.locator("#accountsSourceBook")).toHaveCount(0);
    await expect(page.locator("#booksImportDrop")).toBeVisible();
  });

  test("a dropped precision-code-ltd zip fills every field the book supplies and works the tax", async ({ page }) => {
    await openForm(page);
    await dropBook(page);

    const supplied = [
      "periodStart",
      "periodEnd",
      "associatedCompanies",
      "tradeName",
      "principalActivity",
      "accountingPolicies",
      "directors",
      "averageEmployees",
      "directorName",
      "directorDateApproved",
      "declarantName",
      "declarantStatus",
      ...CT600_FORM_FIELDS.filter((field) => ["whole-pounds", "pounds-and-pence"].includes(field.type) && !field.optional).map((f) => f.id),
      ...accountAmountIds().filter((id) => id.startsWith("current") && !OPTIONAL_CREDITOR_LINES.some((line) => id.endsWith(line))),
      ...FIXED_ASSET_CLASSES.flatMap(([className]) => FIXED_ASSET_FIELDS.map(([field]) => noteId(className, field))),
      ...ACCOUNTS_TEXT_FIELDS.map((field) => field.id),
    ];
    for (const id of new Set(supplied)) {
      await expect(page.locator(`#${id}`), id).not.toHaveValue("");
    }
    await expect(page.locator("#periodStart")).toHaveValue("2025-04-01");
    await expect(page.locator("#periodEnd")).toHaveValue("2026-03-31");
    await expect(page.locator("#currentTurnover")).toHaveValue("341283");
    await expect(page.locator("#includeFixedAssetNote")).toBeChecked();
    await expect(page.locator("#fixedAssetNoteFields")).toBeVisible();
    await expect(page.locator("#workedTaxRows")).toContainText("Box 440");
    await expect(page.locator("#workedTaxRows")).toContainText("Box 155");
    await expect(page.locator("#workedTaxRows")).toContainText("9198");
    await expect(page.locator("[aria-invalid=true]")).toHaveCount(0);
  });

  test("the filled form previews the return with the figures it holds", async ({ page }) => {
    const previewRequests = [];
    await openForm(page, previewRequests);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#ct600Table")).toContainText("Tax reference");

    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0]).toMatchObject({
      utr: "8596148860",
      companyNumber: "12345678",
      declarant: { status: "Director" },
      figures: { periodStart: "2025-04-01", periodEnd: "2026-03-31" },
    });
    expect(previewRequests[0].figures.workingSheet).toBeDefined();
    expect(previewRequests[0].smallCompany.filleted).toBe(false);
  });

  test("the submit carries the reviewed boxes, and a 409 returns the customer to the review with the message", async ({ page }) => {
    const message = "The figures changed after you reviewed them (box 440). Review the return again before you file it.";
    const submission = { requests: [], status: 409, body: { message, differingBoxes: ["440"] } };
    await openForm(page, [], submission);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();

    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();

    await expect.poll(() => submission.requests.length).toBe(1);
    expect(submission.requests[0].reviewedBoxes).toEqual(PREVIEW_BOXES);
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#statusMessagesContainer")).toContainText(message);
    expect(new URL(page.url()).hash).toBe("#review");
  });

  for (const [width, scheme] of [
    [1280, "light"],
    [390, "dark"],
  ]) {
    test(`an accepted return shows the CT600 as filed in a customer copy at ${width} px in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      const submission = {
        requests: [],
        status: 200,
        body: { correlationId: "ABCDEF0123456789", pollIntervalSeconds: 1 },
        pollBody: ACCEPTED_RETURN,
      };
      await openForm(page, [], submission);
      await dropBook(page);
      await completeTheAnswersTheBookLeaves(page);
      await page.locator("#previewBtn").click();
      await expect(page.locator("#previewView")).toBeVisible();
      await page.locator("#gatewayUserId").fill("gateway-user");
      await page.locator("#gatewayPassword").fill("gateway-password");
      await page.locator("#submitReturnBtn").click();

      const copy = page.locator("#returnRecord .customer-copy");
      await expect(copy).toBeVisible({ timeout: 15_000 });
      await expect(copy.locator(".customer-copy-title")).toHaveText("Your copy of the Company Tax Return");
      await expect(copy.locator(".customer-copy-status")).toHaveText("Accepted by HMRC");
      await expect(copy.locator(".customer-copy-submission")).toContainText("RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S");

      const record = copy.locator(".submission-record").first();
      await expect(record.locator(".entity")).toHaveText("Precision Code Ltd");
      await expect(record.locator(".reference").first()).toHaveText("Unique Taxpayer Reference 8596148860");
      await expect(record.locator("h2")).toHaveText("Company Tax Return (CT600)");
      await expect(record.locator(".subtitle")).toHaveText("Return period 1 April 2025 to 31 March 2026");
      await expect(record.locator("tr", { hasText: "Profit or loss per the accounts" })).toBeVisible();
      await expect(record.locator("tr", { hasText: "Box 440: Corporation Tax chargeable" }).locator("td.figure")).toHaveText("12,345.67");
      await expect(record.locator("tr", { hasText: "Box 475: Net Corporation Tax liability" })).toHaveClass("total");

      const receipt = copy.locator(".submission-record").nth(1);
      await expect(receipt.locator("tr", { hasText: "IRmark receipt" }).locator("td.text-value")).toHaveText(
        "RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S",
      );
      await expect(copy.locator(".customer-copy-links a").first()).toHaveAttribute(
        "href",
        "filings.html?receipt=2026-10-24T11%3A30%3A00.000Z-ABCDEF0123456789.json",
      );

      const text = await page.locator("#returnRecord").innerText();
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("NaN");
      expect(await pageScrollsSideways(page)).toBe(false);
      await page.screenshot({ path: recordScreenshotPath(`ct600-result-${scheme}`, width), fullPage: true });
    });
  }

  test("each live check shows under its field when the customer leaves it, and again in the summary", async ({ page }) => {
    await openForm(page);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);

    await page.locator("#utr").fill("123");
    await page.locator("#utr").blur();
    await expect(page.locator("#utr-error")).toContainText("10 digits");
    await expect(page.locator("#utr")).toHaveAttribute("aria-describedby", /utr-error/);
    await expect(page.locator("#utr")).toHaveAttribute("aria-invalid", "true");

    await page.locator("#associatedCompanies").fill("-1");
    await page.locator("#associatedCompanies").blur();
    await expect(page.locator("#associatedCompanies-error")).toContainText("whole number");

    await page.locator("#periodEnd").fill("2026-04-01");
    await page.locator("#periodEnd").dispatchEvent("change");
    await expect(page.locator("#period-error")).toContainText("12 months");

    await page.locator("#loanOverdrawnYes").check();
    await expect(page.locator("#loanOverdrawn-error")).toContainText("CT600A");

    await page.locator("#currentCashAtBank").fill("1");
    await page.locator("#currentCashAtBank").blur();
    await page.locator("#currentProfitAndLossAccount").focus();
    await page.locator("#currentProfitAndLossAccount").blur();
    await expect(page.locator("#currentProfitAndLossAccount-error")).toContainText("does not balance");

    await page.locator("#declarationAccepted").uncheck();
    await expect(page.locator("#declarationAccepted-error")).toContainText("declaration");

    await page.locator("#previewBtn").click();
    const summary = page.locator("#ct600-error-summary");
    await expect(summary).toBeFocused();
    await expect(summary).toHaveAttribute("role", "alert");
    for (const text of ["10 digits", "whole number", "12 months", "CT600A", "does not balance", "declaration"]) {
      await expect(summary).toContainText(text);
    }
    await summary.getByRole("link", { name: /10 digits/ }).click();
    await expect(page.locator("#utr")).toBeFocused();
    await expect(page.locator("#previewView")).toBeHidden();
  });

  async function reachReview(page) {
    await openForm(page);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
  }

  test("the review lists every answer with a Change link whose hidden text names the row", async ({ page }) => {
    await reachReview(page);
    const row = page.locator("#review-row-annualInvestmentAllowance");
    await expect(row).toContainText("Box 690: Annual investment allowance");
    await expect(row).toContainText("£52,500");
    await expect(row.getByRole("link", { name: "Change Box 690: Annual investment allowance" })).toBeVisible();
    await expect(page.locator("#review-row-currentTurnover")).toContainText("Turnover, this year");
    await expect(page.locator("#review-row-declarationAccepted")).toContainText("Yes");
    await expect(page.locator("#review-box-440").getByRole("link", { name: /^Change box 440/ })).toBeVisible();
    await expect(page.locator("#review-line-totalCapitalAllowances").getByRole("link", { name: /Change/ })).toBeVisible();
  });

  test("a Change link opens the form with the value kept and focus on the field, and Return to the review focuses the row", async ({
    page,
  }) => {
    await reachReview(page);
    await page
      .locator("#review-row-declarantStatus")
      .getByRole("link", { name: /Change/ })
      .click();
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#declarantStatus")).toBeFocused();
    await expect(page.locator("#declarantStatus")).toHaveValue("Director");
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("52500");
    await expect(page.locator("#previewBtn")).toHaveText("Return to the review");

    await page.locator("#declarantStatus").fill("Finance Director");
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#review-row-declarantStatus")).toBeFocused();
    await expect(page.locator("#review-row-declarantStatus")).toContainText("Finance Director");
  });

  test("a Change link on a worked box opens its first source field with the other answers kept", async ({ page }) => {
    await reachReview(page);
    await page
      .locator("#review-box-440")
      .getByRole("link", { name: /Change/ })
      .click();
    await expect(page.locator("#periodStart")).toBeFocused();
    await expect(page.locator("#periodEnd")).toHaveValue("2026-03-31");
    await expect(page.locator("#utr")).toHaveValue("8596148860");
  });

  test("a Change link that fails the checks returns to the form with the summary, not the review", async ({ page }) => {
    await reachReview(page);
    await page
      .locator("#review-row-utr")
      .getByRole("link", { name: /Change/ })
      .click();
    await page.locator("#utr").fill("123");
    await page.locator("#previewBtn").click();
    await expect(page.locator("#ct600-error-summary")).toBeFocused();
    await expect(page.locator("#formView")).toBeVisible();
  });

  test("the browser's Back button moves from the review to the form with the figures kept", async ({ page }) => {
    await reachReview(page);
    await expect(page).toHaveURL(/#review$/);
    await page.goBack();
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page).toHaveURL(/#form$/);
    await expect(page.locator("#currentTurnover")).toHaveValue("341283");
    await expect(page.locator("#utr")).toHaveValue("8596148860");
    await page.goForward();
    await expect(page.locator("#previewView")).toBeVisible();
  });

  test("a refusal and the 5 pound check name the figures beside the worked tax", async ({ page }) => {
    await openForm(page);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);

    await page.locator("#ownCorporationTax").fill("1");
    await page.locator("#ownCorporationTax").blur();
    await expect(page.locator("#ownCorporationTax-error")).toContainText("disagrees with your own working");

    await page.locator("#ownCorporationTax").fill("");
    await page.locator("#taxAlreadyPaid").fill("999999");
    await page.locator("#taxAlreadyPaid").blur();
    await expect(page.locator("#taxAlreadyPaid-error")).toContainText("More tax was paid than the return charges");
  });

  test("a worked box has no input and shows its rule", async ({ page }) => {
    await openForm(page);
    await dropBook(page);
    for (const box of [155, 315, 345, 430, 440, 525, 600]) {
      await expect(page.locator("#workedTaxRows")).toContainText(`Box ${box}:`);
    }
    await expect(page.locator("#workedTaxRows")).toContainText("Box 430 is box 345 plus box 395");
    await expect(page.locator("#box440")).toHaveCount(0);
    await expect(page.locator("#workedTaxRows input")).toHaveCount(0);
  });

  async function fillALossPeriod(page) {
    await page.locator("#regimeSmall").check();
    const entries = {
      periodStart: "2025-04-01",
      periodEnd: "2026-03-31",
      currentTurnover: "1000",
      currentCostOfSales: "100",
      currentAdministrativeExpenses: "51000",
      currentInterestReceivable: "0",
      currentTax: "0",
    };
    for (const [id, value] of Object.entries(entries)) {
      await page.locator(`#${id}`).fill(value);
      await page.locator(`#${id}`).blur();
    }
  }

  test("a trading loss is worked into box 780 and carried forward when no claim is made", async ({ page }) => {
    await openForm(page);
    await fillALossPeriod(page);
    await expect(page.locator("#workedTaxRows")).toContainText("Box 780: Losses of trades carried on wholly or partly in the UK");
    await expect(page.locator("#workedTaxRows")).toContainText("Box 780 is the computation's adjusted loss");
    await expect(page.locator("#workedCarriedForward")).toContainText("£50,100");
    await expect(page.locator("#workedCarryBack")).toHaveCount(0);
    await expect(page.locator("#workedTaxRows")).not.toContainText("Box 155:");
  });

  test("a loss in a trade wholly outside the UK goes in box 790", async ({ page }) => {
    await openForm(page);
    await fillALossPeriod(page);
    await page.locator("#lossOutsideUk").check();
    await expect(page.locator("#workedTaxRows")).toContainText("Box 790:");
    await expect(page.locator("#workedTaxRows")).not.toContainText("Box 780:");
  });

  for (const width of [1280, 390]) {
    test(`a carry-back claim shows the repayment and the loss left to carry forward at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openForm(page);
      await fillALossPeriod(page);
      await page.locator("#lossCarriedBack").fill("30000");
      await page.locator("#priorPeriodChargeableProfits").fill("80000");
      await page.locator("#priorPeriodChargeableProfits").blur();
      await expect(page.locator("#workedCarryBack")).toContainText("Corporation Tax repayable on the carry-back claim");
      await expect(page.locator("#workedCarryBack")).toContainText("£7,950");
      await expect(page.locator("#workedCarryBack")).toContainText("2024-04-01 to 2025-03-31");
      await expect(page.locator("#workedCarriedForward")).toContainText("£20,100");
      expect(await pageScrollsSideways(page)).toBe(false);
      const cookieDecline = page.getByRole("button", { name: "Decline" });
      if (await cookieDecline.isVisible()) await cookieDecline.click();
      await page.locator("#workedTax").screenshot({ path: recordScreenshotPath("ct600-loss-carry-back", width) });
    });
  }

  test("a loss claim above the loss is refused beside its field", async ({ page }) => {
    await openForm(page);
    await fillALossPeriod(page);
    await page.locator("#utr").fill("8596148860");
    await page.locator("#declarantName").fill("Carol Smith");
    await page.locator("#lossAgainstTotalProfits").fill("60000");
    await page.locator("#lossAgainstTotalProfits").blur();
    await expect(page.locator("#lossAgainstTotalProfits-error")).toContainText("more than the trading loss of the period");
  });

  test("the donations field adds the donations back and claims them in box 305", async ({ page }) => {
    await openForm(page);
    await page.locator("#regimeSmall").check();
    const entries = {
      periodStart: "2025-04-01",
      periodEnd: "2026-03-31",
      currentTurnover: "100000",
      currentCostOfSales: "10000",
      currentAdministrativeExpenses: "30000",
      currentInterestReceivable: "0",
      currentTax: "0",
      donations: "1000",
    };
    for (const [id, value] of Object.entries(entries)) {
      await page.locator(`#${id}`).fill(value);
      await page.locator(`#${id}`).blur();
    }
    await expect(page.locator("#workedTaxRows")).toContainText("Box 305: Qualifying donations");
    await expect(page.locator("#workedTaxRows")).toContainText("Box 155: Trading profits");
  });

  async function fillAProfitPeriod(page) {
    await page.locator("#regimeSmall").check();
    const entries = {
      periodStart: "2025-04-01",
      periodEnd: "2026-03-31",
      currentTurnover: "100000",
      currentCostOfSales: "10000",
      currentAdministrativeExpenses: "30000",
      currentInterestReceivable: "0",
      currentTax: "0",
    };
    for (const [id, value] of Object.entries(entries)) {
      await page.locator(`#${id}`).fill(value);
      await page.locator(`#${id}`).blur();
    }
  }

  for (const width of [1280, 390]) {
    test(`full expensing is taken in its own boxes and comes off the trading profit, not the main pool figure at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openForm(page);
      await fillAProfitPeriod(page);
      await expect(page.locator("#workedTaxRows")).toContainText("£60,000");
      await page.locator("#fullExpensingAllowances").fill("20000");
      await page.locator("#fullExpensingBalancingCharges").fill("500");
      await page.locator("#fullExpensingBalancingCharges").blur();
      await expect(page.locator("#workedTaxRows")).toContainText("Box 155: Trading profits");
      await expect(page.locator("#workedTaxRows")).toContainText("£40,500");
      await expect(page.locator("#mainPoolAllowances")).toHaveValue("0");
      expect(await pageScrollsSideways(page)).toBe(false);
      const cookieDecline = page.getByRole("button", { name: "Decline" });
      if (await cookieDecline.isVisible()) await cookieDecline.click();
      await page.locator("#section-allowances").screenshot({ path: recordScreenshotPath("ct600-capital-allowance-classes", width) });
    });
  }

  test("the other capital allowance classes and the qualifying expenditure boxes are inputs, and the special rate allowance asks for box 773", async ({
    page,
  }) => {
    await openForm(page);
    await fillAProfitPeriod(page);
    await page.locator("#utr").fill("8596148860");
    await page.locator("#declarantName").fill("Carol Smith");
    for (const id of [
      "specialRateAllowances",
      "specialRateBalancingCharges",
      "specialRatePoolAllowances",
      "specialRatePoolAnnualInvestmentAllowance",
      "specialRatePoolBalancingCharges",
      "annualInvestmentAllowanceOutsideTrade",
      "firstYearAllowanceExpenditure",
      "otherMachineryAndPlantExpenditure",
    ]) {
      await expect(page.locator(`#${id}`), id).toBeVisible();
    }
    await page.locator("#specialRateAllowances").fill("3000");
    await page.locator("#specialRateAllowanceExpenditure").focus();
    await page.locator("#specialRateAllowanceExpenditure").blur();
    await expect(page.locator("#specialRateAllowanceExpenditure-error")).toContainText("box 773");
    await page.locator("#specialRateAllowanceExpenditure").fill("6000");
    await page.locator("#specialRateAllowanceExpenditure").blur();
    await expect(page.locator("#specialRateAllowanceExpenditure-error")).toHaveCount(0);
    await expect(page.locator("#workedTaxRows")).toContainText("£57,000");
  });

  test("a micro-entity's book opens the micro accounts, and the preview sends the micro request", async ({ page }) => {
    const previewRequests = [];
    await openForm(page, previewRequests);
    await page.locator("#booksImportFile").setInputFiles({
      name: "precision-code.diya-gl.zip",
      mimeType: "application/zip",
      buffer: await zippedPrecisionCodeBook(),
    });
    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
    await expect(page.locator("#regimeMicro")).toBeChecked();
    await expect(page.locator("#microCurrentTurnover")).toBeVisible();
    await expect(page.locator("#microCurrentTurnover")).toHaveValue("341283");
    await expect(page.locator("#microPriorFixedAssets")).toBeVisible();
    await expect(page.locator("#currentTurnover")).toBeHidden();
    await expect(page.locator("#principalActivity")).toBeHidden();
    await expect(page.locator("#statementSmallCompaniesRegime")).toBeHidden();
    await completeTheAnswersTheBookLeaves(page, { regime: "micro" });
    await expect(page.locator("[aria-invalid=true]")).toHaveCount(0);

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    expect(previewRequests).toHaveLength(1);
    const sent = previewRequests[0];
    expect(sent.smallCompany).toBeUndefined();
    expect(sent.statementsAccepted).toEqual({
      section477Exemption: true,
      membersNotRequiredAudit: true,
      directorsResponsibilities: true,
      microEntityProvisions: true,
    });
    expect(sent.balanceSheet.priorYear.fixedAssets).toBe(182902);
    expect(sent.profitAndLoss.currentYear).toMatchObject({ turnover: 341283, otherIncome: 340, tax: 29062 });
    await expect(page.locator("#review-row-accountsRegime")).toContainText("Micro-entity accounts (FRS 105)");
    await expect(page.locator("#review-row-microCurrentRawMaterials")).toContainText("Raw materials and consumables, this year");
    await expect(page.locator("#review-row-statementMicroEntityProvisions")).toContainText("Yes");
  });

  function ixbrlAccountsFile(caseName, overrides = {}) {
    const cases = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/companies-house-test-service-cases.json"), "utf-8"),
    );
    const { name, type, govTestScenario, expectedOutcome, ...requestBody } = cases.find((testCase) => testCase.name === caseName);
    const errors = [];
    const accounts = extractAndValidateAccountsParameters(
      { body: JSON.stringify({ ...requestBody, companyNumber: "12345678", companyName: "Precision Code Ltd", ...overrides }) },
      errors,
    );
    expect(errors).toEqual([]);
    return { name: `${caseName}.xhtml`, mimeType: "application/xhtml+xml", buffer: Buffer.from(buildAccountsIxbrl(accounts)) };
  }

  test("a dropped small company iXBRL document fills the accounts section and the depreciation added back", async ({ page }) => {
    await openForm(page);
    await page.locator("#booksImportFile").setInputFiles(ixbrlAccountsFile("small-company-accounts-full"));
    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
    await expect(page.locator("#regimeSmall")).toBeChecked();
    await expect(page.locator("#periodStart")).toHaveValue("2025-04-01");
    await expect(page.locator("#periodEnd")).toHaveValue("2026-03-31");
    await expect(page.locator("#currentTurnover")).toHaveValue("8500");
    await expect(page.locator("#currentCashAtBank")).toHaveValue("5200");
    await expect(page.locator("#priorTurnover")).toHaveValue("7639");
    await expect(page.locator("#includeFixedAssetNote")).toBeChecked();
    await expect(page.locator("#depreciation")).toHaveValue("400");
    await expect(page.locator("#principalActivity")).toHaveValue("the retail of accounting software");
    await expect(page.locator("#directorName")).toHaveValue("Antony Christopher Cartwright");
  });

  test("a dropped micro-entity iXBRL document opens the micro accounts with its balance sheets", async ({ page }) => {
    await openForm(page);
    await page.locator("#booksImportFile").setInputFiles(ixbrlAccountsFile("micro-entity-accounts"));
    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
    await expect(page.locator("#regimeMicro")).toBeChecked();
    await expect(page.locator("#microCurrentFixedAssets")).toHaveValue("800");
    await expect(page.locator("#microPriorFixedAssets")).toHaveValue("0");
  });

  test("an iXBRL document for another company fills nothing", async ({ page }) => {
    await openForm(page);
    await page.locator("#booksImportFile").setInputFiles(ixbrlAccountsFile("small-company-accounts-full", { companyNumber: "99999999" }));
    await expect(page.locator("#booksImportStatus")).toContainText("99999999", { timeout: 60_000 });
    await expect(page.locator("#booksImportStatus")).toContainText("Nothing filled");
    await expect(page.locator("#currentTurnover")).toHaveValue("");
    await expect(page.locator("#periodStart")).toHaveValue("");
  });

  test("an iXBRL document for another period than the form holds fills nothing", async ({ page }) => {
    await openForm(page);
    await page.locator("#periodStart").fill("2024-01-01");
    await page.locator("#periodEnd").fill("2024-12-31");
    await page.locator("#booksImportFile").setInputFiles(ixbrlAccountsFile("small-company-accounts-full"));
    await expect(page.locator("#booksImportStatus")).toContainText("end on 2026-03-31", { timeout: 60_000 });
    await expect(page.locator("#booksImportStatus")).toContainText("Nothing filled");
    await expect(page.locator("#currentTurnover")).toHaveValue("");
    await expect(page.locator("#periodEnd")).toHaveValue("2024-12-31");
  });

  test("the send-to question offers the full or filleted copy for a small company and the note for a micro-entity", async ({ page }) => {
    await openForm(page);
    await page.locator("#regimeSmall").check();
    await expect(page.locator("#sendToHmrc")).toBeChecked();
    await expect(page.locator("#companiesHouseCopyGroup")).toBeHidden();
    await expect(page.locator("#companiesHouseMicroNote")).toBeHidden();

    await page.locator("#sendToBoth").check();
    await expect(page.locator("#companiesHouseCopyGroup")).toBeVisible();
    await expect(page.locator("#copyFull")).toBeChecked();
    await page.locator("#copyFilleted").check();
    await expect(page.locator("#copyFilleted")).toBeChecked();
    await expect(page.locator("#copyFull")).not.toBeChecked();
    await expect(page.locator("#companiesHouseMicroNote")).toBeHidden();

    await page.locator("#regimeMicro").check();
    await expect(page.locator("#companiesHouseCopyGroup")).toBeHidden();
    await expect(page.locator("#companiesHouseMicroNote")).toBeVisible();
    await expect(page.locator("#companiesHouseMicroNote")).toContainText("The profit and loss account goes to HMRC only.");

    await page.locator("#sendToHmrc").check();
    await expect(page.locator("#companiesHouseMicroNote")).toBeHidden();
    await page.locator("#regimeSmall").check();
    await expect(page.locator("#companiesHouseCopyGroup")).toBeHidden();
  });

  test("switching the regime keeps each regime's figures", async ({ page }) => {
    await openForm(page);
    await page.locator("#regimeMicro").check();
    await page.locator("#microCurrentTurnover").fill("1000");
    await page.locator("#regimeSmall").check();
    await expect(page.locator("#currentTurnover")).toBeVisible();
    await expect(page.locator("#microCurrentTurnover")).toBeHidden();
    await page.locator("#regimeMicro").check();
    await expect(page.locator("#microCurrentTurnover")).toHaveValue("1000");
  });
});
