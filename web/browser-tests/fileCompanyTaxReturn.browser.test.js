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
import { extractAndValidateCtReturnParameters } from "@app/services/hmrcCtReturnRequest.js";
import {
  ACCOUNTS_TEXT_FIELDS,
  CT600_FORM_FIELDS,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_FIELDS,
  accountAmountIds,
  noteId,
} from "../public/lib/ct600-fields.js";
import { PEOPLE, registerCompany } from "@app/http-simulator/fixtures/register.js";
const USER_EMAIL = PEOPLE.samPatel.email;
const DIRECTOR = `${PEOPLE.samPatel.forename} ${PEOPLE.samPatel.surname}`;
const PRACTICE_NAME = registerCompany("00000009").name;
const OTHER_COMPANY_NUMBER = registerCompany("00000003").number;

dotenvConfigIfNotBlank({ path: ".env.test" });

const PAGE_URL = "http://localhost:3000/companies-house/fileCompanyTaxReturn.html";
const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const BOOK_DIRECTORY = path.join(process.cwd(), "fixtures/diya-gl/precision-code-ltd");
const LOAN_BOOK_DIRECTORY = path.join(process.cwd(), "fixtures/diya-gl/precision-code-ltd-loan");
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

// The company profiles the lookup answers: by default a company with accounts on the register, and
// one whose first accounts start on the precision-code-ltd book's period start.
const ESTABLISHED_PROFILE = {
  companyNumber: "00000007",
  companyName: "Precision Code Ltd",
  dateOfCreation: "2019-04-01",
  accountsLastPeriodEnd: "2025-03-31",
};
const FIRST_ACCOUNTS_PROFILE = { companyNumber: "00000007", companyName: "Precision Code Ltd", dateOfCreation: "2025-04-01" };

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
  async function zippedPrecisionCodeBook(directory = BOOK_DIRECTORY) {
    const zip = new JSZip();
    zip.file("book.toml", fs.readFileSync(path.join(directory, "book.toml")));
    zip.file("lines.jsonl", fs.readFileSync(path.join(directory, "lines.jsonl")));
    return zip.generateAsync({ type: "nodebuffer" });
  }

  async function serveRealSite(page, previewRequests = [], submission = { requests: [], status: 409, body: {} }, practice = {}) {
    await page.addInitScript((email) => {
      try {
        localStorage.setItem("cognitoIdToken", "mock-id-token");
        localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email }));
      } catch {
        // storage can be blocked; the page then asks for sign-in
      }
    }, USER_EMAIL);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "localhost") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
        return;
      }
      if (url.pathname === "/submit.environment-name.txt") {
        await route.fulfill({ status: 200, contentType: "text/plain", body: "ci" });
        return;
      }
      if (url.pathname === "/api/v1/bundle") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles: [], tokensRemaining: 0 }) });
        return;
      }
      if (url.pathname === "/api/v1/practice/clients" && practice.clientsStatus) {
        await route.fulfill({
          status: practice.clientsStatus,
          contentType: "application/json",
          body: JSON.stringify(practice.clientsBody ?? {}),
        });
        return;
      }
      if (url.pathname === "/api/v1/diya-gl" && practice.books) {
        practice.requested?.push(url.pathname + url.search);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ books: practice.books }) });
        return;
      }
      if (url.pathname.startsWith("/api/v1/diya-gl/") && practice.zipBase64) {
        practice.requested?.push(url.pathname + url.search);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ zipBase64: practice.zipBase64 }) });
        return;
      }
      if (url.pathname === "/api/v1/companies-house/company/00000007") {
        const body = submission.profile ?? ESTABLISHED_PROFILE;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        return;
      }
      if (url.pathname === "/api/v1/hmrc/ct/return/preview" && submission.previewBody) {
        previewRequests.push(JSON.parse(route.request().postData()));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(submission.previewBody) });
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
        const body = JSON.parse(route.request().postData());
        submission.requests.push(body);
        submission.headers?.push(route.request().headers());
        const reply = submission.reply?.(body) ?? { status: submission.status, body: submission.body };
        await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
        return;
      }
      if (url.pathname === "/api/v1/hmrc/receipt" && submission.receiptList) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ receipts: submission.receiptList }) });
        return;
      }
      if (url.pathname.startsWith("/api/v1/hmrc/receipt/") && (submission.receipt || submission.receiptsByName)) {
        const name = decodeURIComponent(url.pathname.split("/").pop());
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(submission.receiptsByName?.[name] ?? submission.receipt),
        });
        return;
      }
      if (
        url.pathname.startsWith("/api/v1/hmrc/ct/return/") &&
        route.request().method() === "GET" &&
        (submission.poll || submission.pollBody)
      ) {
        const polled = submission.poll?.(url.pathname.split("/").pop()) ?? submission.pollBody;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(polled) });
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
    await page.locator("#companyNumber").fill("00000007");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
  }

  // The precision-code-ltd book is a micro-entity by size, so the card opens the form on the
  // micro-entity accounts; most tests file the small company accounts the same book also gives.
  async function dropBook(page, { regime = "small", directory = BOOK_DIRECTORY } = {}) {
    await page.locator("#booksImportFile").setInputFiles({
      name: "precision-code.diya-gl.zip",
      mimeType: "application/zip",
      buffer: await zippedPrecisionCodeBook(directory),
    });
    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
    await page.locator(regime === "micro" ? "#regimeMicro" : "#regimeSmall").check();
  }

  async function completeTheAnswersTheBookLeaves(page, { regime = "small" } = {}) {
    await page.locator("#utr").fill("8596148860");
    await page.locator("#directorDateApproved").fill("2026-09-15");
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

  test("states HMRC's status of a return it has not settled in words, never as its code", async ({ page }) => {
    const submission = {
      requests: [],
      status: 200,
      body: { correlationId: "CORRPEND", irmark: "IRMARK", pollIntervalSeconds: 0 },
      pollBody: { statusCode: "PENDING", correlationId: "CORRPEND", pollIntervalSeconds: 0 },
    };
    await openForm(page, [], submission);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();

    const result = page.locator("#returnResult");
    await expect(result).toContainText("Return CORRPEND is waiting to be checked. Checking again...", { timeout: 30_000 });
    await expect(result).not.toContainText("PENDING");
  });

  test("a book that fills one field says so in the singular, in English and Welsh", async ({ page }) => {
    for (const [prefix, sentence] of [
      ["", "Filled 1 field from precision-code.diya-gl.zip for the period"],
      ["/cy", "Llenwyd 1 maes o precision-code.diya-gl.zip ar gyfer y cyfnod"],
    ]) {
      await serveRealSite(page, [], { requests: [], status: 409, body: {} });
      // The form's entries cut to the period start alone, so the fill counts one field.
      await page.route("**/lib/ct600-fields.js", async (route) => {
        const source = fs.readFileSync(path.join(process.cwd(), "web/public/lib/ct600-fields.js"), "utf-8");
        const body = source.replace(
          "export function formEntriesFromBook(",
          'export function formEntriesFromBook(figures) {\n  return [["periodStart", figures.periodStart]];\n}\nfunction allFormEntriesFromBook(',
        );
        await route.fulfill({ status: 200, contentType: "application/javascript", body });
      });
      if (prefix) await page.addInitScript(() => localStorage.setItem("siteLanguage", "cy"));
      await page.goto(PAGE_URL.replace("/companies-house/", `${prefix}/companies-house/`), { waitUntil: "domcontentloaded" });
      await page.locator("#companyNumber").fill("00000007");
      await page.locator("#companyLookupBtn").click();
      await expect(page.locator("#formView")).toBeVisible();
      await page.locator("#booksImportFile").setInputFiles({
        name: "precision-code.diya-gl.zip",
        mimeType: "application/zip",
        buffer: await zippedPrecisionCodeBook(),
      });
      await expect(page.locator("#booksImportStatus")).toContainText(sentence, { timeout: 60_000 });
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  test("the Welsh page sets the reference of a return HMRC has not settled apart from the words around it", async ({ page }) => {
    const submission = {
      requests: [],
      status: 200,
      body: { correlationId: "CORRPEND", irmark: "IRMARK", pollIntervalSeconds: 0 },
      pollBody: { statusCode: "PENDING", correlationId: "CORRPEND", pollIntervalSeconds: 600 },
    };
    await page.addInitScript(() => localStorage.setItem("siteLanguage", "cy"));
    await serveRealSite(page, [], submission);
    await page.goto(PAGE_URL.replace("/companies-house/", "/cy/companies-house/"), { waitUntil: "domcontentloaded" });
    await page.locator("#companyNumber").fill("00000007");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
    await page.locator("#booksImportFile").setInputFiles({
      name: "precision-code.diya-gl.zip",
      mimeType: "application/zip",
      buffer: await zippedPrecisionCodeBook(),
    });
    await expect(page.locator("#booksImportStatus")).toContainText(/^Llenwyd \d+ maes o precision-code\.diya-gl\.zip/, { timeout: 60_000 });
    await page.locator("#regimeSmall").check();
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();

    await expect(page.locator("#returnResult")).toHaveText("Ffurflen CORRPEND: yn aros i gael ei gwirio. Yn gwirio eto...", {
      timeout: 30_000,
    });
  });

  test("at phone width the IRmark receipt of an accepted return breaks inside the customer's copy", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openForm(page, [], {
      requests: [],
      status: 200,
      body: { correlationId: ACCEPTED_RETURN.correlationId, irmark: ACCEPTED_RETURN.irmark, pollIntervalSeconds: 0 },
      pollBody: ACCEPTED_RETURN,
    });
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();

    const receipt = page.locator(".customer-copy-submission dd").first();
    await expect(receipt).toHaveText(ACCEPTED_RETURN.irmarkReceipt, { timeout: 30_000 });
    const [copy, box] = [await page.locator(".customer-copy").boundingBox(), await receipt.boundingBox()];
    expect(box.x + box.width).toBeLessThanOrEqual(copy.x + copy.width + 0.5);
    expect(await receipt.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });

  test("the pasted book export, its file input and the accounts-in-the-book radio are gone", async ({ page }) => {
    await openForm(page);
    await expect(page.locator("#bookExport")).toHaveCount(0);
    await expect(page.locator("#bookExportFile")).toHaveCount(0);
    await expect(page.locator("#accountsSourceBook")).toHaveCount(0);
    await expect(page.locator("#booksImportDrop")).toBeVisible();
  });

  test("the loans question adds, shows and removes a row for each participator", async ({ page }) => {
    await openForm(page);
    await dropBook(page);
    await expect(page.locator("#loansDetail")).toBeHidden();
    await page.locator("#loansMadeYes").check();
    await expect(page.locator("#loansDetail")).toBeVisible();
    await expect(page.locator("#loanName1")).toBeVisible();
    await page.locator("#addLoanBtn").click();
    await expect(page.locator("#loanName2")).toBeVisible();
    await page.locator("#loanName2").fill("David Brown");
    await page.locator("#repaidSinceYes").check();
    await expect(page.locator("#repaymentName1")).toBeVisible();
    await expect(page.locator("#repaymentName1 option")).toHaveText(["Choose a participator", "David Brown"]);
    await page.locator('[data-loan-row="2"] button[data-remove="loan"]').click();
    await expect(page.locator("#loanName2")).toHaveCount(0);
    await page.locator('[data-repayment-row="1"] button[data-remove="repayment"]').click();
    await expect(page.locator("#repaymentName1")).toHaveCount(0);
  });

  test("a box field's label leads with its box, its note links the guide, and its spreadsheet cell opens from a closed disclosure", async ({
    page,
  }) => {
    await openForm(page);
    await expect(page.locator('label[for="nonTradingLoanRelationshipCredits"]')).toHaveText(/^Box 170: /);
    const link = page.locator("#nonTradingLoanRelationshipCredits-hint a");
    await expect(link).toHaveText("Company Tax Return guide");
    await expect(link).toHaveAttribute("href", /the-company-tax-return-guide#/);
    const disclosure = page.locator("#nonTradingLoanRelationshipCredits-source");
    await expect(disclosure.locator("summary")).toHaveText("In DIY Accounting's spreadsheets");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(disclosure.locator("dl")).toBeHidden();
    await disclosure.locator("summary").click();
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(disclosure.locator("dl")).toContainText("Financialaccounts.xlsx");
    await expect(disclosure.locator("dl")).toContainText("CorporationTax");
    await expect(disclosure.locator("dl")).toContainText("K24");
    await expect(disclosure.locator("dl")).toContainText("Add gross bank interest received");
    const image = disclosure.locator("img");
    await expect(image).toHaveAttribute("src", "/images/ct600-sources/CorporationTax-K24.webp");
    await expect(image).toHaveAttribute("alt", "The CorporationTax sheet at cell K24");
    await expect(image).toHaveAttribute("loading", "lazy");
  });

  test("a field with no box leads with its reference and links the source of its term, or has neither", async ({ page }) => {
    await openForm(page);
    await expect(page.locator('label[for="tradeName"]')).toHaveText("Trade name");
    await expect(page.locator("#tradeName-hint a")).toHaveCount(0);
    await expect(page.locator("#tradeName-source")).toContainText("E8");
    await expect(page.locator('label[for="includeComparatives"]')).toHaveText("Schedule 1 paragraph 7: Include last year's figures");
    await expect(page.locator("#includeComparatives-hint a")).toHaveAttribute(
      "href",
      "https://www.legislation.gov.uk/uksi/2008/409/schedule/1/paragraph/7",
    );
    await expect(page.locator('label[for="includeFixedAssetNote"]')).toHaveText(
      "Schedule 1 paragraph 48: Include the tangible fixed assets note",
    );
    await expect(page.locator("#includeFixedAssetNote-source")).toBeAttached();
  });

  test("the page's own questions lead with their reference and carry their note", async ({ page }) => {
    await openForm(page);
    await expect(page.locator("#sendTo")).toHaveText("Where are you sending these accounts?");
    await expect(page.locator("#sendTo-hint")).toBeVisible();
    await expect(page.locator("#sendTo-hint a")).toHaveCount(0);
    await expect(page.locator("#companiesHouseCopy")).toHaveText("Companies Act section 444: Which copy goes to Companies House?");
    await expect(page.locator("#companiesHouseCopy-hint a")).toHaveAttribute(
      "href",
      "https://www.legislation.gov.uk/ukpga/2006/46/section/444",
    );
    await expect(page.locator("#companiesHouseCopy-source")).toBeAttached();
    await expect(page.locator("#accountsRegime")).toHaveText(
      "Companies Act sections 381 and 384A: Which accounts does the company prepare?",
    );
    await expect(page.locator("#accountsRegime-hint a")).toHaveText([
      "Companies Act 2006, section 381",
      "Companies Act 2006, section 384A",
    ]);
    await expect(page.locator("#accountsRegime-source")).toContainText("The spreadsheets have no cell for this.");
    await expect(page.locator("#firstPeriodStart")).toHaveText(
      "Box 30: Does the first accounting period start on the first day of the accounts?",
    );
    await expect(page.locator("#firstPeriodStart-hint a")).toHaveText("Company Tax Return guide");
    await page.locator("#periodStart").fill("2025-01-01");
    await page.locator("#periodEnd").fill("2026-03-31");
    await page.locator("#periodEnd").dispatchEvent("change");
    await expect(page.locator("#firstPeriodStart")).toHaveText(/^Box 30: Does the first accounting period start on 1 January 2025\?$/);
  });

  test("each accounts line shows its format item, its note and both years' cells, and a sum names every cell", async ({ page }) => {
    await openForm(page);
    const turnover = page.locator("tr", { has: page.locator("#currentTurnover") });
    await expect(turnover.locator("th")).toHaveText("Profit and loss item 1: Turnover");
    await expect(page.locator("#currentTurnover")).toHaveAttribute("aria-describedby", "currentTurnover-hint");
    await expect(page.locator("#priorTurnover")).toHaveAttribute("aria-describedby", "currentTurnover-hint");
    const description = await page
      .locator("#priorTurnover")
      .evaluate((input) => document.getElementById(input.getAttribute("aria-describedby")).textContent);
    expect(description).toContain("Sales of goods and services in the period");
    await expect(page.locator("#currentTurnover-hint a")).toHaveText("The accounts regulations, Schedule 1");
    const disclosure = page.locator("#currentTurnover-source");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await disclosure.locator("summary").click();
    await expect(disclosure.locator("dl")).toContainText("This year");
    await expect(disclosure.locator("dl")).toContainText("F9");
    await expect(disclosure.locator("dl")).toContainText("Last year");
    await expect(disclosure.locator("dl")).toContainText("B9");
    await expect(disclosure.locator("img")).toHaveCount(2);
    await expect(disclosure.locator("img").first()).toHaveAttribute("src", "/images/ct600-sources/PubPandL-F9.webp");
    await expect(disclosure.locator("img").last()).toHaveAttribute("src", "/images/ct600-sources/PubPandL-B9.webp");

    const reserve = page.locator("#currentProfitAndLossAccount-source");
    await reserve.locator("summary").click();
    await expect(reserve.locator("dl")).toContainText("F37 + F38 (worked from these cells)");
    await expect(reserve.locator("img")).toHaveCount(4);
  });

  test("a loan row's fields lead with their CT600A box and carry the note and the disclosure", async ({ page }) => {
    await openForm(page);
    await page.locator("#loansMadeYes").check();
    await expect(page.locator('label[for="loanName1"]')).toHaveText("CT600A A10: Name of participator or associate");
    await expect(page.locator("#loanName1-hint a")).toHaveText("CT600A guide");
    const disclosure = page.locator("#loanAmount1-source");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await disclosure.locator("summary").click();
    await expect(disclosure.locator("dl")).toContainText("PubBalSht!E29 − OpenAccounts!E30 (worked from these cells)");
    await expect(disclosure.locator("img")).toHaveCount(2);
    await expect(page.locator("#loanRate1-source")).toContainText("The spreadsheets have no cell for this.");
  });

  test("a loan row's errors wait until its field is left or the return is previewed, not the Yes answer", async ({ page }) => {
    await openForm(page);
    await dropBook(page);
    await page.locator("#loansMadeYes").check();
    await expect(page.locator("#loanName1")).toBeVisible();
    await expect(page.locator("#loansMade-error")).toHaveCount(0);
    await expect(page.locator("#loanName1-error")).toHaveCount(0);
    await expect(page.locator("#loanAmount1-error")).toHaveCount(0);

    await page.locator("#loanName1").focus();
    await page.locator("#loanAmount1").focus();
    await expect(page.locator("#loanName1-error")).toContainText("Enter the participator's name, 2 to 56 characters");
    await expect(page.locator("#loanAmount1-error")).toHaveCount(0);
    await expect(page.locator("#loansMade-error")).toHaveCount(0);

    await page.locator("#loanName1").fill("Carol Smith");
    await page.locator("#previewBtn").click();
    await expect(page.locator("#loanName1-error")).toHaveCount(0);
    await expect(page.locator("#loanAmount1-error")).toContainText("Enter the amount still owed in whole pounds, above 0");
    await expect(page.locator("#loansMade-error")).toHaveCount(0);
  });

  test("the loan and repayment buttons are styled as the page's secondary buttons", async ({ page }) => {
    await openForm(page);
    await dropBook(page);
    await page.locator("#loansMadeYes").check();
    await page.locator("#addLoanBtn").click();
    await page.locator("#repaidSinceYes").check();
    for (const button of [
      page.locator("#addLoanBtn"),
      page.locator('[data-loan-row="2"] button[data-remove="loan"]'),
      page.locator("#addRepaymentBtn"),
      page.locator('[data-repayment-row="1"] button[data-remove="repayment"]'),
    ]) {
      await expect(button).toHaveClass("secondary-button");
      await expect(button).toHaveCSS("border-top-style", "solid");
    }
    expect(await page.locator("#addLoanBtn").evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
      await page.locator("#backToFormBtn").evaluate((node) => parseFloat(getComputedStyle(node).minHeight)),
    );
  });

  test("a book with an overdrawn director's loan account opens the loans question at Yes with the amount and works the tax", async ({
    page,
  }) => {
    await openForm(page);
    await dropBook(page, { directory: LOAN_BOOK_DIRECTORY });
    await expect(page.locator("#loansMadeYes")).toBeChecked();
    await expect(page.locator("#loansBookNote")).toContainText("overdrawn by £12,000 at the end and £0 at the start");
    await expect(page.locator("#loanName1")).toHaveValue("Carol Smith");
    await expect(page.locator("#loanAmount1")).toHaveValue("12000");
    await expect(page.locator("#workedTaxRows")).toContainText("Box 480");
    await expect(page.locator("#workedLoanTax")).toContainText("£4,050");
    await expect(page.locator("#workedTaxRows")).toContainText("Section 455 rate for Carol Smith");
    await expect(page.locator("#workedTaxRows")).toContainText("33.75%");
    await page.locator("#loanRate1").fill("35.75");
    await expect(page.locator("#workedLoanTax")).toContainText("£4,290");
    await expect(page.locator("#workedTaxRows")).toContainText("the rate you entered");
  });

  test("a repayment dated after today shows its error under its own date field", async ({ page }) => {
    await openForm(page);
    await dropBook(page, { directory: LOAN_BOOK_DIRECTORY });
    await page.locator("#repaidSinceYes").check();
    await page.locator("#repaymentName1").selectOption("Carol Smith");
    await page.locator("#repaymentDate1").fill("2999-01-01");
    await page.locator("#repaymentDate1").blur();
    await expect(page.locator("#repaymentDate1-error")).toContainText("after today");
    await page.locator("#repaymentDate1").fill("2026-06-30");
    await page.locator("#repaymentRepaid1").fill("2000");
    await page.locator("#repaymentRepaid1").blur();
    await expect(page.locator("#repaymentDate1-error")).toHaveCount(0);
    await expect(page.locator("#workedLoanTax")).toContainText("£3,375");
  });

  test("a dropped precision-code-ltd zip fills every field the book supplies and works the tax", async ({ page }) => {
    await openForm(page);
    // The accounts lines and the employees count start at 0; blanked, a value after the drop is the book's.
    await page.evaluate(() => {
      for (const input of document.querySelectorAll("#formSections input")) if (input.defaultValue === "0") input.value = "";
    });
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
      "declarantName",
      "declarantStatus",
      ...CT600_FORM_FIELDS.filter((field) => ["whole-pounds", "pounds-and-pence"].includes(field.type) && !field.optional).map((f) => f.id),
      ...accountAmountIds().filter((id) => id.startsWith("current") && !OPTIONAL_CREDITOR_LINES.some((line) => id.endsWith(line))),
      ...FIXED_ASSET_CLASSES.flatMap(({ id: className }) => FIXED_ASSET_FIELDS.map(({ id: field }) => noteId(className, field))),
      ...ACCOUNTS_TEXT_FIELDS.map((field) => field.id).filter((id) => !id.startsWith("directorsAdvance") && id !== "directorDateApproved"),
    ];
    for (const id of new Set(supplied)) {
      await expect(page.locator(`#${id}`), id).not.toHaveValue("");
    }
    await expect(page.locator("#periodStart")).toHaveValue("2025-04-01");
    await expect(page.locator("#periodEnd")).toHaveValue("2026-03-31");
    await expect(page.locator("#currentTurnover")).toHaveValue("341283");
    await expect(page.locator("#directorDateApproved"), "a book holds no approval date").toHaveValue("");
    await expect(page.locator("#includeFixedAssetNote")).toBeChecked();
    await expect(page.locator("#fixedAssetNoteFields")).toBeVisible();
    await expect(page.locator("#workedTaxRows")).toContainText("Box 440");
    await expect(page.locator("#workedTaxRows")).toContainText("Box 155");
    await expect(page.locator("#workedTaxRows")).toContainText("9198");
    await expect(page.locator("[aria-invalid=true]")).toHaveCount(0);
  });

  test("a section a published video shows has a closed Watch this part that loads the player at its second", async ({ page }) => {
    await serveRealSite(page);
    const list = JSON.parse(fs.readFileSync(path.join(process.cwd(), "web/public/videos/publish.json"), "utf8"));
    const typed = list.videos.find((video) => video.id === "file-company-tax-return-typed");
    typed.sections = { "section-allowances": 83 };
    await page.route("**/videos/publish.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) }),
    );
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#companyNumber").fill("00000007");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();

    const panel = page.locator("#section-allowances > details.section-video");
    await expect(panel.locator("summary")).toHaveText("Watch this part");
    await expect(panel).not.toHaveAttribute("open", "");
    await expect(panel.locator("iframe")).toHaveCount(0);
    await expect(page.locator("#section-company > details.section-video")).toHaveCount(0);
    await panel.locator("summary").click();
    await expect(panel.locator("iframe")).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${typed.videoId}?start=83`);
    await expect(panel.locator("a.section-video__link")).toHaveText("Watch from 1:23");
    await expect(panel.locator("a.section-video__link")).toHaveAttribute("href", `https://youtu.be/${typed.videoId}?t=83`);
  });

  test("a printed form leaves out the Watch this part panels", async ({ page }) => {
    await serveRealSite(page);
    const list = JSON.parse(fs.readFileSync(path.join(process.cwd(), "web/public/videos/publish.json"), "utf8"));
    list.videos.find((video) => video.id === "file-company-tax-return-typed").sections = { "section-allowances": 83 };
    await page.route("**/videos/publish.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) }),
    );
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#companyNumber").fill("00000007");
    await page.locator("#companyLookupBtn").click();
    const panel = page.locator("#section-allowances > details.section-video");
    await expect(panel).toBeVisible();
    await panel.locator("summary").click();
    await page.emulateMedia({ media: "print" });
    await expect(panel).toBeHidden();
    await page.emulateMedia({ media: "screen" });
    await expect(panel).toBeVisible();
  });

  test("the review is the return about to be filed: a Box column, the period in words, and the accounts as tables whose Change links open their box", async ({
    page,
  }) => {
    await openForm(page);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#previewView h3").first()).toHaveText("The return you are about to file");
    const utr = page.locator("#review-row-utr td");
    await expect(utr.nth(0)).toHaveText("Box 3");
    await expect(utr.nth(1)).toHaveText("Tax reference");
    await expect(page.locator("#review-row-period td").nth(0)).toHaveText("Box 30");
    await expect(page.locator("#review-row-period td").nth(2)).toHaveText(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
    await expect(page.locator("#review-row-periodEnd td").nth(0)).toHaveText("Box 35");
    await expect(page.locator("#reviewAnswers td")).not.toHaveText([/^Box \d+: /]);

    const profitAndLoss = page.locator('table[data-ledger="profitAndLoss"]');
    await expect(profitAndLoss.locator("caption")).toHaveText("Profit and loss account");
    const columns = await profitAndLoss.locator("thead th").allTextContents();
    expect(columns.slice(0, 2)).toEqual(["Line", "This year"]);
    expect(columns.length).toBeLessThanOrEqual(3);
    const turnover = profitAndLoss.locator("tbody tr", { has: page.locator("#review-row-currentTurnover") });
    await expect(turnover.locator("th")).toHaveText("Turnover");
    await expect(page.locator("#review-row-currentTurnover")).toContainText(/£[\d,]+/);
    await expect(page.locator('table[data-ledger="balanceSheet"] tbody tr').first().locator("th")).toHaveText("Fixed assets");

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("#previewView").screenshot({ path: `target/screenshots/ct600-review/review-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#review-row-currentTurnover a.review-change").click();
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#currentTurnover")).toBeFocused();
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
      companyNumber: "00000007",
      declarant: { status: "Director" },
      figures: { periodStart: "2025-04-01", periodEnd: "2026-03-31" },
    });
    expect(previewRequests[0].figures.workingSheet).toBeDefined();
    expect(previewRequests[0].smallCompany.filleted).toBe(false);
  });

  // The route's own reading of a preview request: the problems it finds with the years the accounts state.
  function comparativesProblems(request) {
    const errors = [];
    extractAndValidateCtReturnParameters({ body: JSON.stringify(request) }, errors, {
      requireGatewayCredentials: false,
      requireReviewedBoxes: false,
      requireLongPeriod: false,
    });
    return errors.filter((message) => /priorYear|dateOfIncorporation/.test(message));
  }

  test("an established company's accounts show last year's figures: the box is ticked and locked, and the line says why", async ({
    page,
  }) => {
    const previewRequests = [];
    await openForm(page, previewRequests, { requests: [], profile: ESTABLISHED_PROFILE });
    await dropBook(page);
    await expect(page.locator("#includeComparatives")).toBeChecked();
    await expect(page.locator("#includeComparatives")).toBeDisabled();
    await expect(page.locator("#firstAccountsLine")).toHaveText(
      "These are not the company's first accounts, so they show the prior year's figures beside this year's. Only first accounts, which start on the day the company was incorporated, leave them out.",
    );
    await expect(page.locator("#priorTurnover")).toBeVisible();
    await completeTheAnswersTheBookLeaves(page);

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    const sent = previewRequests[0];
    expect(sent.smallCompany.dateOfIncorporation).toBeUndefined();
    expect(sent.smallCompany.balanceSheet.priorYear).toBeDefined();
    expect(comparativesProblems(sent)).toEqual([]);
  });

  test("a company's first accounts leave out last year's figures and send the date of incorporation", async ({ page }) => {
    const previewRequests = [];
    await openForm(page, previewRequests, { requests: [], profile: FIRST_ACCOUNTS_PROFILE });
    await dropBook(page);
    await expect(page.locator("#includeComparatives")).not.toBeChecked();
    await expect(page.locator("#includeComparatives")).toBeDisabled();
    await expect(page.locator("#firstAccountsLine")).toHaveText(
      "These are the company's first accounts: the period starts on the day it was incorporated, 1 April 2025, so there is no prior year.",
    );
    await expect(page.locator("#priorTurnover")).toBeHidden();
    await completeTheAnswersTheBookLeaves(page);

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    const sent = previewRequests[0];
    expect(sent.smallCompany.dateOfIncorporation).toBe("2025-04-01");
    expect(sent.smallCompany.balanceSheet.priorYear).toBeUndefined();
    expect(sent.smallCompany.profitAndLoss.priorYear).toBeUndefined();
    expect(comparativesProblems(sent)).toEqual([]);
  });

  test("a period that does not start on the day of incorporation is not the company's first, and the box follows the period", async ({
    page,
  }) => {
    await openForm(page, [], { requests: [], profile: FIRST_ACCOUNTS_PROFILE });
    await page.locator("#periodStart").fill("2025-05-01");
    await expect(page.locator("#includeComparatives")).toBeChecked();
    await expect(page.locator("#firstAccountsLine")).toContainText("These are not the company's first accounts");
    await page.locator("#periodStart").fill("2025-04-01");
    await expect(page.locator("#includeComparatives")).not.toBeChecked();
    await expect(page.locator("#firstAccountsLine")).toContainText("These are the company's first accounts");
  });

  test("a micro-entity's first accounts leave out last year's balance sheet and send the date of incorporation", async ({ page }) => {
    const previewRequests = [];
    await openForm(page, previewRequests, { requests: [], profile: FIRST_ACCOUNTS_PROFILE });
    await dropBook(page, { regime: "micro" });
    await expect(page.locator("#microCurrentFixedAssets")).toBeVisible();
    await expect(page.locator("#microPriorFixedAssets")).toBeHidden();
    await completeTheAnswersTheBookLeaves(page, { regime: "micro" });

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    const sent = previewRequests[0];
    expect(sent.dateOfIncorporation).toBe("2025-04-01");
    expect(sent.balanceSheet.priorYear).toBeUndefined();
    expect(sent.profitAndLoss.priorYear).toBeUndefined();
    expect(comparativesProblems(sent)).toEqual([]);
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

  // The receipt of an accepted filing carries the answers it was made from: the form of a
  // filled book, read back from the page the way the page reads it to send.
  const AMEND_RECEIPT_NAME = "2026-10-24T11:30:00.000Z-ABCDEF0123456789.json";
  const ORIGINAL_JOINT_FILING_ID = "0b8f6f0e-6d3e-4a39-9a55-2f1f4c6d8a10";

  async function formValuesOnThePage(page) {
    return page.evaluate(() => {
      const values = {};
      for (const control of document.getElementById("returnForm").querySelectorAll("input, textarea")) {
        if (control.type === "radio") {
          if (control.checked) values[control.name] = control.value;
        } else if (control.type === "checkbox") {
          values[control.id] = control.checked;
        } else {
          values[control.id] = control.value;
        }
      }
      return values;
    });
  }

  async function filledFormValues(page) {
    await openForm(page);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    return formValuesOnThePage(page);
  }

  async function openAmendment(page, receipt) {
    const submission = { requests: [], status: 200, body: { correlationId: "NEW", pollIntervalSeconds: 1 }, receipt };
    await serveRealSite(page, [], submission);
    await page.goto(`${PAGE_URL}?amend=${encodeURIComponent(AMEND_RECEIPT_NAME)}`, { waitUntil: "domcontentloaded" });
    return submission;
  }

  // The page waits at least a second between checks; the tests that run the checks out do not.
  const waitNoLongerThanFiveMilliseconds = (page) =>
    page.addInitScript(() => {
      const setTimeoutAsAsked = window.setTimeout;
      window.setTimeout = (callback, delay, ...rest) => setTimeoutAsAsked(callback, Math.min(delay ?? 0, 5), ...rest);
    });

  test("states HMRC's status in words when the checks run out before HMRC settles the return", async ({ page }) => {
    const submission = {
      requests: [],
      status: 200,
      body: { correlationId: "CORRPEND", irmark: "IRMARK", pollIntervalSeconds: 0 },
      pollBody: { statusCode: "PENDING", correlationId: "CORRPEND", pollIntervalSeconds: 0 },
    };
    await waitNoLongerThanFiveMilliseconds(page);
    await openForm(page, [], submission);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();

    const result = page.locator("#returnResult");
    await expect(result).toHaveText("HMRC has not settled the return yet. Return CORRPEND is still waiting to be checked.", {
      timeout: 30_000,
    });
  });

  for (const [statusCode, word] of [
    ["PENDING", "waiting to be checked"],
    ["PARKED", "held for a check by hand"],
  ]) {
    test(`states Companies House's status of accounts it has not settled, ${statusCode}, in words`, async ({ page }) => {
      await waitNoLongerThanFiveMilliseconds(page);
      await openForm(page, [], { requests: [], status: 200, body: {} });
      await page.route("**/api/v1/companies-house/accounts", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ submissionNumber: "00001A", pollIntervalSeconds: 0 }),
        }),
      );
      await page.route("**/api/v1/companies-house/accounts/00001A", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ statusCode, submissionNumber: "00001A", rejections: [] }),
        }),
      );
      await dropBook(page);
      await completeTheAnswersTheBookLeaves(page);
      await page.locator("#sendToBoth").check();
      await page.locator("#previewBtn").click();
      await expect(page.locator("#previewView")).toBeVisible();
      await page.locator("#companyAuthCode").fill("ABC123");
      await page.locator("#gatewayUserId").fill("gateway-user");
      await page.locator("#gatewayPassword").fill("gateway-password");
      await page.locator("#submitReturnBtn").click();

      const outcome = page.locator("#companiesHouseOutcome");
      await expect(outcome).toContainText(`Companies House has not settled the accounts yet. Submission 00001A is ${word}.`, {
        timeout: 30_000,
      });
      await expect(outcome).not.toContainText(statusCode);
    });
  }

  async function submitAndAccept(page, { both = false } = {}) {
    const submission = {
      requests: [],
      status: 200,
      body: { correlationId: ACCEPTED_RETURN.correlationId, irmark: ACCEPTED_RETURN.irmark, pollIntervalSeconds: 0 },
      pollBody: ACCEPTED_RETURN,
    };
    await openForm(page, [], submission);
    const accountsPosts = [];
    await page.route("**/api/v1/companies-house/accounts", (route) => {
      accountsPosts.push(JSON.parse(route.request().postData()));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ submissionNumber: "00001A", pollIntervalSeconds: 0 }),
      });
    });
    await page.route("**/api/v1/companies-house/accounts/00001A", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: "ACCEPT", submissionNumber: "00001A", rejections: [] }),
      }),
    );
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    if (both) await page.locator("#sendToBoth").check();
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    if (both) await page.locator("#companyAuthCode").fill("ABC123");
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();
    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the Company Tax Return", { timeout: 30_000 });
    return { submission, accountsPosts };
  }

  const DRAFT_KEY = "formDraft.ct600.user1.00000007";

  async function savedDraft(page) {
    return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), DRAFT_KEY);
  }

  async function lookUpAgain(page) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#companyNumber").fill("00000007");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
  }

  test("typed answers are saved in this browser and come back after a reload with Restore my answers", async ({ page }) => {
    await openForm(page);
    await expect(page.locator("#draftKeepDays")).toHaveValue("28");
    await page.locator("#periodStart").fill("2025-04-01");
    await page.locator("#periodEnd").fill("2026-03-31");
    await page.locator("#currentTurnover").fill("123456");
    await expect.poll(async () => (await savedDraft(page))?.values?.currentTurnover).toBe("123456");
    const record = await savedDraft(page);
    expect(record.period).toEqual({ periodStart: "2025-04-01", periodEnd: "2026-03-31" });
    for (const secret of ["gatewayUserId", "gatewayPassword", "companyAuthCode"]) expect(record.values).not.toHaveProperty(secret);

    await lookUpAgain(page);
    const notice = page.locator("#draftRestore");
    await expect(notice).toContainText("Answers saved in this browser");
    await expect(notice).toContainText("for the period 1 April 2025 to 31 March 2026");
    await expect(page.locator("#currentTurnover")).toHaveValue("0");
    await page.getByRole("button", { name: "Restore my answers" }).click();
    await expect(page.locator("#currentTurnover")).toHaveValue("123456");
    await expect(page.locator("#periodEnd")).toHaveValue("2026-03-31");
    await expect(notice).toHaveCount(0);
  });

  test("Start again deletes the saved answers and leaves the form empty", async ({ page }) => {
    await openForm(page);
    await page.locator("#currentTurnover").fill("123456");
    await expect.poll(() => savedDraft(page)).not.toBeNull();

    await lookUpAgain(page);
    await page.getByRole("button", { name: "Start again" }).click();
    await expect(page.locator("#draftRestore")).toHaveCount(0);
    expect(await savedDraft(page)).toBeNull();
    await expect(page.locator("#currentTurnover")).toHaveValue("0");
  });

  test("with Do not keep chosen, nothing is in this browser after a reload", async ({ page }) => {
    await openForm(page);
    await page.locator("#currentTurnover").fill("123456");
    await expect.poll(() => savedDraft(page)).not.toBeNull();
    await page.locator("#draftKeepDays").selectOption("0");
    await expect(page.locator("#draftDeleted")).toHaveText("Your answers are not kept in this browser.");
    expect(await savedDraft(page)).toBeNull();
    await page.locator("#currentTurnover").fill("654321");
    await page.waitForTimeout(1500);

    await lookUpAgain(page);
    await expect(page.locator("#draftRestore")).toHaveCount(0);
    await expect(page.locator("#draftKeepDays")).toHaveValue("0");
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("formDraft.ct600.")))).toEqual([]);
  });

  test("the saved answers are deleted when HMRC accepts the return", async ({ page }) => {
    const submission = {
      requests: [],
      status: 200,
      body: { correlationId: ACCEPTED_RETURN.correlationId, irmark: ACCEPTED_RETURN.irmark, pollIntervalSeconds: 0 },
      pollBody: ACCEPTED_RETURN,
    };
    await openForm(page, [], submission);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await expect.poll(async () => (await savedDraft(page))?.values?.declarationAccepted).toBe(true);

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();
    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the Company Tax Return", { timeout: 30_000 });
    await expect.poll(() => savedDraft(page)).toBeNull();
  });

  test("a joint filing's saved answers are deleted once Companies House and HMRC have both accepted", async ({ page }) => {
    const submission = {
      requests: [],
      status: 200,
      body: { correlationId: ACCEPTED_RETURN.correlationId, irmark: ACCEPTED_RETURN.irmark, pollIntervalSeconds: 0 },
      pollBody: ACCEPTED_RETURN,
    };
    await openForm(page, [], submission);
    await page.route("**/api/v1/companies-house/accounts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ submissionNumber: "00001A", pollIntervalSeconds: 0 }),
      }),
    );
    await page.route("**/api/v1/companies-house/accounts/00001A", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: "ACCEPT", submissionNumber: "00001A", rejections: [] }),
      }),
    );
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#sendToBoth").check();
    await expect.poll(async () => (await savedDraft(page))?.values?.sendTo).toBe("both");

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await page.locator("#companyAuthCode").fill("ABC123");
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();
    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the Company Tax Return", { timeout: 30_000 });
    await expect.poll(() => savedDraft(page)).toBeNull();
  });

  test("a joint filing offers Start a new filing only once Companies House has decided the accounts, and names the submission meanwhile", async ({
    page,
  }) => {
    const submission = {
      requests: [],
      status: 200,
      body: { correlationId: ACCEPTED_RETURN.correlationId, irmark: ACCEPTED_RETURN.irmark, pollIntervalSeconds: 0 },
      pollBody: ACCEPTED_RETURN,
    };
    await openForm(page, [], submission);
    let companiesHouseStatus = "PENDING";
    await page.route("**/api/v1/companies-house/accounts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ submissionNumber: "00001A", pollIntervalSeconds: 0 }),
      }),
    );
    await page.route("**/api/v1/companies-house/accounts/00001A", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: companiesHouseStatus, submissionNumber: "00001A", rejections: [] }),
      }),
    );
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    await page.locator("#sendToBoth").check();
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await page.locator("#companyAuthCode").fill("ABC123");
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();
    await expect(page.locator("#sendCtNowBtn")).toBeVisible({ timeout: 30_000 });

    await page.locator("#sendCtNowBtn").click();
    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the Company Tax Return", { timeout: 30_000 });
    await expect(page.locator("#startAgainBtn")).toBeHidden();
    await expect(page.locator("#startAgainPendingNote")).toHaveText(
      "Companies House has not decided the accounts yet (submission 00001A). A new filing for this company and period waits until it does, so the accounts are not filed twice.",
    );

    companiesHouseStatus = "ACCEPT";
    await page.locator("#waitForCompaniesHouseBtn").click();
    await expect(page.locator("#companiesHouseOutcome")).toContainText("Companies House accepted the accounts", { timeout: 30_000 });
    await expect(page.locator("#startAgainBtn")).toBeVisible();
    await expect(page.locator("#startAgainPendingNote")).toBeHidden();
  });

  test("a return filed with HMRC alone can be amended to correct its attached accounts, with nothing sent to Companies House", async ({
    page,
  }) => {
    const { submission, accountsPosts } = await submitAndAccept(page);
    await expect(page.locator("#amendPanel")).toBeVisible();
    await expect(page.locator("#amendReturnBtn")).toBeVisible();
    await expect(page.locator("#amendAttachedAccountsBtn")).toBeVisible();
    await expect(page.locator("#amendAccountsBtn")).toBeHidden();
    await expect(page.locator("#amendHmrcHint")).toBeVisible();
    await expect(page.locator("#amendBothHint")).toBeHidden();

    await page.locator("#amendAttachedAccountsBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#accountsLockNote")).toHaveText(
      "You are correcting the accounts attached to the return. HMRC gets them with the amended return; Companies House gets nothing.",
    );
    await expect(page.locator("#averageEmployees")).toBeEnabled();
    await page.locator("#averageEmployees").fill("7");
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#sendStepHeading")).toHaveText("Send the amended return to HMRC");
    await expect(page.locator("#companyAuthCodeGroup")).toBeHidden();
    await expect(page.locator("#revisionGroup")).toBeHidden();
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();
    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the amended Company Tax Return", { timeout: 30_000 });

    expect(submission.requests).toHaveLength(2);
    const amended = submission.requests[1];
    expect(amended).toMatchObject({ amended: true, averageEmployees: 7 });
    expect(amended).not.toHaveProperty("jointFilingId");
    expect(amended).not.toHaveProperty("revision");
    expect(accountsPosts).toEqual([]);
  });

  test("a joint filing's amend panel keeps its revised-accounts choice and offers no attached-accounts amendment", async ({ page }) => {
    const { accountsPosts } = await submitAndAccept(page, { both: true });
    expect(accountsPosts).toHaveLength(1);
    await expect(page.locator("#amendPanel")).toBeVisible();
    await expect(page.locator("#amendReturnBtn")).toBeVisible();
    await expect(page.locator("#amendAttachedAccountsBtn")).toBeHidden();
    await expect(page.locator("#amendBothHint")).toBeVisible();
    await expect(page.locator("#amendHmrcHint")).toBeHidden();
  });

  test("?amend= refills the form from the receipt and sends an amended return under the original jointFilingId", async ({ page }) => {
    const values = await filledFormValues(page);
    expect(Object.keys(values).some((key) => /password|authcode|gatewayuser/i.test(key))).toBe(false);
    const receipt = {
      kind: "company-tax-return",
      statusCode: "ACCEPT",
      formRequest: { company: { companyNumber: "00000007", companyName: "Precision Code Ltd" }, values },
    };
    const submission = await openAmendment(page, receipt);

    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#formCompanyName")).toHaveText("Precision Code Ltd");
    await expect(page.locator("#currentTurnover")).toHaveValue("341283");
    await expect(page.locator("#utr")).toHaveValue("8596148860");
    await expect(page.locator("#declarationAccepted")).toBeChecked();

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#sendStepHeading")).toHaveText("Send the amended return to HMRC");
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();

    await expect.poll(() => submission.requests.length).toBe(1);
    expect(submission.requests[0]).toMatchObject({ amended: true, gatewayUserId: "gateway-user" });
    expect(submission.requests[0]).not.toHaveProperty("jointFilingId");
    expect(submission.requests[0].formValues).toEqual(expect.objectContaining({ currentTurnover: "341283", utr: "8596148860" }));
    expect(JSON.stringify(submission.requests[0].formValues)).not.toContain("gateway-password");
  });

  test("?amend= on a joint filing keeps its jointFilingId and asks for the revised accounts first", async ({ page }) => {
    const values = { ...(await filledFormValues(page)), sendTo: "both" };
    const receipt = {
      kind: "company-tax-return",
      statusCode: "ACCEPT",
      jointFilingId: ORIGINAL_JOINT_FILING_ID,
      formRequest: { company: { companyNumber: "00000007", companyName: "Precision Code Ltd" }, values },
    };
    await openAmendment(page, receipt);

    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#accountsLockNote")).toContainText("You are revising the accounts filed at Companies House");
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#sendStepHeading")).toHaveText(
      "Send the revised accounts to Companies House and the amended return to HMRC",
    );
    await expect(page.locator("#revisionGroup")).toBeVisible();
    await expect(page.locator("#revisionNonCompliance")).toBeVisible();
    await expect(page.locator("#revisionAmendments")).toBeVisible();
    await expect(page.locator("#companyAuthCode")).toHaveValue("");
  });

  test("the revised accounts are not sent until both statements about the original accounts are given", async ({ page }) => {
    const values = { ...(await filledFormValues(page)), sendTo: "both" };
    const receipt = {
      kind: "company-tax-return",
      statusCode: "ACCEPT",
      jointFilingId: ORIGINAL_JOINT_FILING_ID,
      formRequest: { company: { companyNumber: "00000007", companyName: "Precision Code Ltd" }, values },
    };
    const accountsRequests = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/v1/companies-house/accounts") accountsRequests.push(request);
    });
    await openAmendment(page, receipt);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await page.locator("#companyAuthCode").fill("ABC123");
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");

    await page.locator("#submitReturnBtn").click();

    await expect(page.locator("body")).toContainText("Say what was wrong with the original accounts");
    await expect(page.locator("body")).toContainText("Say what the revised accounts change");

    await page.locator("#revisionNonCompliance").fill("A liability was left out.");
    await page.locator("#submitReturnBtn").click();

    await expect(page.locator("body")).toContainText("Say what the revised accounts change");
    expect(accountsRequests).toHaveLength(0);
  });

  test("?amend= on a receipt filed before the answers were kept says so and starts nothing", async ({ page }) => {
    await openAmendment(page, { kind: "company-tax-return", statusCode: "ACCEPT" });

    await expect(page.locator("#statusMessagesContainer")).toContainText("its answers were not kept");
    await expect(page.locator("#companyView")).toBeVisible();
    await expect(page.locator("#formView")).toBeHidden();
  });

  test("?amend= on a receipt that was not accepted, or is not a filing, says so and starts nothing", async ({ page }) => {
    await openAmendment(page, { kind: "company-tax-return", statusCode: "REJECT", formRequest: { company: {}, values: {} } });
    await expect(page.locator("#statusMessagesContainer")).toContainText("was not accepted");
    await expect(page.locator("#formView")).toBeHidden();

    await openAmendment(page, { statusCode: "ACCEPT", formBundleNumber: "123" });
    await expect(page.locator("#statusMessagesContainer")).toContainText("cannot be amended");
    await expect(page.locator("#formView")).toBeHidden();
  });

  // --- A period of account longer than 12 months: two returns -----------------------------------

  const LONG_ANSWERS = {
    utr: "8596148860",
    periodStart: "2025-01-01",
    periodEnd: "2026-03-31",
    currentTurnover: "250000",
    currentCostOfSales: "50000",
    currentAdministrativeExpenses: "81000",
    currentInterestReceivable: "1000",
    currentTax: "24962",
    currentDebtors: "10000",
    currentCashAtBank: "116100",
    currentTradeCreditors: "5000",
    currentCorporationTax: "24962",
    currentTaxationSocialSecurity: "1000",
    currentCalledUpShareCapital: "100",
    currentProfitAndLossAccount: "95038",
    principalActivity: "Software consultancy",
    accountingPolicies: "The accounts are prepared under FRS 102 section 1A.",
    directors: DIRECTOR,
    averageEmployees: "2",
    directorName: DIRECTOR,
    directorDateApproved: "2026-06-30",
    declarantName: DIRECTOR,
    nonTradingLoanRelationshipCredits: "1000",
    depreciation: "6000",
    donations: "2000",
    donationsPaid: "2000",
    donationsPaidAp2: "0",
    annualInvestmentAllowance: "12000",
    mainPoolAllowances: "1800",
    mainPoolAllowancesAp2: "363",
  };

  async function typeLongForm(page, extra = {}) {
    for (const [id, value] of Object.entries({ ...LONG_ANSWERS, ...extra })) await page.locator(`#${id}`).fill(value);
    await page.locator("#loansMadeAp2Yes").check();
    await page.locator("#loanName1Ap2").fill(DIRECTOR);
    await page.locator("#loanAmount1Ap2").fill("15000");
    for (const id of [
      "statementSection477Exemption",
      "statementMembersNotRequiredAudit",
      "statementDirectorsResponsibilities",
      "statementSmallCompaniesRegime",
      "declarationAccepted",
    ]) {
      await page.locator(`#${id}`).check();
    }
  }

  const LONG_COMPUTATION_LINES = {
    profitLossPerAccounts: 120000,
    nonTradingLoanRelationshipCredits: 1000,
    depreciation: 6000,
    amortisation: 0,
    entertaining: 0,
    donations: 2000,
    adjustedProfitBeforeAccountingPeriodAdjustments: 127000,
    totalCapitalAllowances: 13800,
  };
  const FIRST_RETURN_BOXES = {
    "3": "8596148860",
    "30": "2025-01-01",
    "35": "2025-12-31",
    "50": "yes",
    "85A": "yes",
    "305": 2000,
    "440": 19273.46,
    "475": 19273.46,
  };
  const SECOND_RETURN_BOXES = {
    "3": "8596148860",
    "30": "2026-01-01",
    "35": "2026-03-31",
    "50": "yes",
    "85A": "yes",
    "440": 5688.68,
    "480": 5062.5,
    "475": 5688.68,
  };
  const LONG_PREVIEW = (secondBoxes = SECOND_RETURN_BOXES) => ({
    periodOfAccount: { periodStart: "2025-01-01", periodEnd: "2026-03-31" },
    accountsIxbrl: "<html/>",
    returns: [
      {
        part: 1,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        boxes: FIRST_RETURN_BOXES,
        computationsIxbrl: "<html/>",
        computationLines: {
          ...LONG_COMPUTATION_LINES,
          timeApportionment: -25121,
          adjustedProfitBeforeCapitalAllowances: 101879,
          adjustedProfit: 88079,
        },
        taxDueDate: "2026-10-01",
        returnDueDate: "2027-03-31",
      },
      {
        part: 2,
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        boxes: secondBoxes,
        computationsIxbrl: "<html/>",
        computationLines: {
          ...LONG_COMPUTATION_LINES,
          totalCapitalAllowances: 363,
          timeApportionment: -101879,
          adjustedProfitBeforeCapitalAllowances: 25121,
          adjustedProfit: 24758,
        },
        taxDueDate: "2027-01-01",
        returnDueDate: "2027-03-31",
      },
    ],
  });
  const IRMARKS = { A1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", A2: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" };

  // The server's answers to each send: return 1 is accepted, return 2 gets the answer the test names.
  function longSubmission({ secondOutcome = "ACCEPT", secondPostStatus = 200 } = {}) {
    const submission = {
      requests: [],
      headers: [],
      status: 200,
      body: {},
      previewBody: LONG_PREVIEW(),
      reply: (body) => {
        const part = body.longPeriod?.part;
        if (part === 2 && secondPostStatus !== 200)
          return {
            status: secondPostStatus,
            body: { message: "Return 2 of 2 files after return 1 of 2 is accepted. Send return 1 first." },
          };
        return { status: 200, body: { correlationId: `CORR000${part}`, irmark: IRMARKS[`A${part}`], pollIntervalSeconds: 1 } };
      },
      poll: (correlationId) => {
        const part = Number(correlationId.slice(-1));
        if (part === 2 && secondOutcome === "REJECT") {
          return {
            statusCode: "REJECT",
            correlationId,
            irmark: IRMARKS.A2,
            businessErrors: [{ number: "9043", text: "Check that Box 435 agrees with the result of the computation of marginal relief" }],
          };
        }
        return {
          statusCode: "ACCEPT",
          correlationId,
          irmark: IRMARKS[`A${part}`],
          irmarkReceipt: IRMARKS[`A${part}`],
          receiptId: `2026-11-12T10:0${part}:00.000Z-CORR000${part}`,
        };
      },
    };
    return submission;
  }

  async function reachLongReview(page, submission = longSubmission(), previewRequests = []) {
    await openForm(page, previewRequests, submission);
    await typeLongForm(page);
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
  }

  async function sendBoth(page) {
    await page.locator("#gatewayUserId").fill("gateway-user");
    await page.locator("#gatewayPassword").fill("gateway-password");
    await page.locator("#submitReturnBtn").click();
  }

  test("states HMRC's status of return 1 of 2 it has not settled in words, never as its code", async ({ page }) => {
    const submission = longSubmission();
    submission.poll = (correlationId) => ({ statusCode: "PENDING", correlationId, pollIntervalSeconds: 1 });
    await reachLongReview(page, submission);
    await sendBoth(page);

    const result = page.locator("#returnResult");
    await expect(result).toContainText("Return 1 of 2 CORR0001 is waiting to be checked. Checking again...", { timeout: 30_000 });
    await expect(result).not.toContainText("PENDING");
  });

  test("the long period panel shows at 12 months and a day and not at 12 months", async ({ page }) => {
    await openForm(page);
    const panel = page.locator("#longPeriodPanel");
    await page.locator("#periodStart").fill("2025-01-01");
    await page.locator("#periodEnd").fill("2025-12-31");
    await expect(panel).toBeHidden();
    await expect(page.locator("#mainPoolAllowancesAp2")).toBeHidden();
    await page.locator("#periodEnd").fill("2026-01-01");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("This period of account files as two returns");
    await expect(panel).toContainText("Return 1 of 2: 1 January 2025 to 31 December 2025 (365 days)");
    await expect(panel).toContainText("Return 2 of 2: 1 January 2026 to 1 January 2026 (1 days)");
    await expect(panel.getByRole("link", { name: /update the dates/ })).toHaveAttribute(
      "href",
      "https://www.gov.uk/corporation-tax-accounting-period",
    );
    await page.locator("#periodEnd").fill("2026-10-01");
    await expect(panel).toBeHidden();
    await expect(page.locator("#period-error")).toContainText("18 months at most");
  });

  test("a period of 13 months and then of 12 leaves no two-return heading in the worked tax", async ({ page }) => {
    await openForm(page);
    await typeLongForm(page);
    const firstReturn = page.locator("#workedTax").getByRole("heading", { name: /Return 1 of 2/ });
    await page.locator("#periodEnd").fill("2026-01-31");
    await page.locator("#periodEnd").blur();
    await expect(firstReturn).toBeVisible();

    await page.locator("#periodEnd").fill("2025-12-31");
    await page.locator("#periodEnd").blur();
    await expect(page.locator("#longPeriodPanel")).toBeHidden();
    await expect(firstReturn).toBeHidden();
  });

  test("a 13-month period with an own working that disagrees with the first return still shows both returns' worked tax", async ({
    page,
  }) => {
    await openForm(page);
    await typeLongForm(page);
    await page.locator("#periodEnd").fill("2026-01-31");
    await page.locator("#periodEnd").blur();
    const firstReturn = page.locator(".worked-tax__return").filter({ has: page.getByRole("heading", { name: /^Return 1 of 2/ }) });
    const secondReturn = page.locator(".worked-tax__return").filter({ has: page.getByRole("heading", { name: /^Return 2 of 2/ }) });
    const box440 = (section) =>
      section
        .locator(".worked-tax__row", { hasText: "Box 440:" })
        .first()
        .locator("dd")
        .first()
        .innerText()
        .then((text) => Number(text.replace(/[^0-9.-]/g, "")));
    await expect(firstReturn).toBeVisible();
    const first440 = await box440(firstReturn);
    const second440 = await box440(secondReturn);
    expect(first440).toBeGreaterThan(0);

    await page.locator("#ownCorporationTax").fill(String(first440 + 100));
    await page.locator("#ownCorporationTax").blur();

    await expect(page.locator("#workedTaxEmpty")).toBeHidden();
    await expect(firstReturn).toBeVisible();
    await expect(secondReturn).toBeVisible();
    expect(await box440(firstReturn)).toBe(first440);
    expect(await box440(secondReturn)).toBe(second440);
  });

  test("a long period shows two columns, the second with the suffix Ap2 and each limit in its hint", async ({ page }) => {
    await openForm(page);
    await page.locator("#periodStart").fill("2025-01-01");
    await page.locator("#periodEnd").fill("2026-03-31");
    await expect(page.locator("#annualInvestmentAllowance")).toBeVisible();
    await expect(page.locator("#annualInvestmentAllowanceAp2")).toBeVisible();
    await expect(page.locator('label[for="annualInvestmentAllowanceAp2"]')).toContainText("(return 2)");
    await expect(page.locator('label[for="annualInvestmentAllowance"]')).toContainText("(return 1)");
    await expect(page.locator("#annualInvestmentAllowance-hint")).toContainText(
      "The most for 1 January 2025 to 31 December 2025 is £1,000,000",
    );
    await expect(page.locator("#annualInvestmentAllowanceAp2-hint")).toContainText(
      "The most for 1 January 2026 to 31 March 2026 is £246,575",
    );
    await expect(page.locator("#mainPoolAllowances-hint")).toContainText("main pool rate for this period is 18%");
    await expect(page.locator("#loansPart2")).toBeVisible();
    await expect(page.locator("#donationsPaidGroup")).toBeVisible();
    await expect(page.locator("#firstPeriodStart")).toHaveText("Box 30: Does the first accounting period start on 1 January 2025?");
    for (const id of ["annualInvestmentAllowance", "annualInvestmentAllowanceAp2", "donationsPaidAp2", "associatedCompaniesAp2"]) {
      await expect(page.locator(`#${id}`)).toHaveAttribute("aria-describedby", `${id}-hint`);
    }
  });

  test("a period that spans the main pool rate change shows the hybrid rate", async ({ page }) => {
    await openForm(page);
    await page.locator("#periodStart").fill("2025-10-01");
    await page.locator("#periodEnd").fill("2026-12-31");
    await expect(page.locator("#mainPoolAllowances-hint")).toContainText("hybrid");
    await expect(page.locator("#mainPoolAllowancesAp2-hint")).toContainText("main pool rate for this period is 14%");
  });

  test("a first accounting period that does not start on the first day is refused beside its question", async ({ page }) => {
    await openForm(page);
    await page.locator("#periodStart").fill("2025-01-01");
    await page.locator("#periodEnd").fill("2026-03-31");
    await page.locator("#firstPeriodStartNo").check();
    await expect(page.locator("#firstPeriodStart-error")).toContainText(
      "Submit files a long period when the first accounting period starts on the first day of the accounts.",
    );
  });

  test("a long period previews the two columns, shows two reviews, and sends return 1 then return 2 with one sign-in and one filing id", async ({
    page,
  }) => {
    const submission = longSubmission();
    const previewRequests = [];
    await reachLongReview(page, submission, previewRequests);

    expect(previewRequests[0].figures.accountingPeriods).toHaveLength(2);
    expect(previewRequests[0].figures.accountingPeriods[1]).toMatchObject({ mainPoolAllowances: 363 });
    expect(previewRequests[0].figures.accountingPeriods[1].loansToParticipators.loans).toEqual([{ name: DIRECTOR, amount: 15000 }]);
    expect(previewRequests[0].longPeriod).toBeUndefined();
    await expect(page.locator("#reviewReturn1Heading")).toHaveText("Return 1 of 2: 1 January 2025 to 31 December 2025");
    await expect(page.locator("#reviewReturn2Heading")).toHaveText("Return 2 of 2: 1 January 2026 to 31 March 2026");
    await expect(page.locator("#review-return-1")).toContainText("Tax is due on 1 October 2026. The return is due on 31 March 2027.");
    await expect(page.locator("#review-return-2")).toContainText("Tax is due on 1 January 2027. The return is due on 31 March 2027.");
    await expect(page.locator("#review-box-85A")).toContainText("Accounts attached are for a different period");
    await expect(page.locator("#review-box-440")).toContainText("19,273.46");
    await expect(page.locator("#review-box-440Ap2")).toContainText("5,688.68");
    await expect(page.locator("#review-line-timeApportionment")).toContainText("Time apportionment: 365 of 455 days");
    await expect(page.locator("#review-line-timeApportionmentAp2")).toContainText("Time apportionment: 90 of 455 days");
    await expect(page.locator("#review-row-mainPoolAllowancesAp2")).toContainText("£363");
    await expect(page.locator("#review-box-480Ap2 a.review-change")).toHaveAttribute("data-field", "loansMadeAp2");
    await expect(page.locator("#review-box-305 a.review-change")).toHaveAttribute("data-field", "donationsPaid");

    await expect(page.locator("#sendStepHeading")).toHaveText("Send two returns to HMRC");
    await expect(page.locator("#longSendOrder")).toContainText("return 1 of 2, then return 2 of 2");
    await sendBoth(page);

    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the Company Tax Return 1 of 2", { timeout: 30_000 });
    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the Company Tax Return 2 of 2", { timeout: 30_000 });
    await expect(page.locator("#returnIrmark")).toContainText(`Return 1 of 2 IRmark: ${IRMARKS.A1}`);
    await expect(page.locator("#returnIrmark")).toContainText(`Return 2 of 2 IRmark: ${IRMARKS.A2}`);
    await expect(page.locator("#returnRecord .customer-copy")).toHaveCount(2);
    await expect(page.locator("#returnRecord .customer-copy-title").first()).toHaveText(
      "Your copy of the Company Tax Return (preview) 1 of 2",
    );
    await expect(page.locator("#returnRecord .customer-copy-title").last()).toHaveText(
      "Your copy of the Company Tax Return (preview) 2 of 2",
    );

    expect(submission.requests).toHaveLength(2);
    const [first, second] = submission.requests;
    expect(first.longPeriod.part).toBe(1);
    expect(second.longPeriod).toEqual({ filingId: first.longPeriod.filingId, part: 2 });
    expect(first.reviewedBoxes).toEqual(FIRST_RETURN_BOXES);
    expect(second.reviewedBoxes).toEqual(SECOND_RETURN_BOXES);
    expect(second.gatewayPassword).toBe("gateway-password");
    expect(first).not.toHaveProperty("jointFilingId");
    expect(await page.locator("#gatewayPassword").inputValue()).toBe("");
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain("gateway-password");
  });

  test("the scenario header goes on both sends", async ({ page }) => {
    const submission = longSubmission();
    await reachLongReview(page, submission);
    await page.evaluate(() => {
      sessionStorage.setItem("showDeveloperOptions", "true");
      window.dispatchEvent(new Event("developer-mode-changed"));
    });
    await page.locator("#govTestScenario").fill("CT600_REJECT_SECOND_RETURN");
    await sendBoth(page);
    await expect.poll(() => submission.requests.length, { timeout: 30_000 }).toBe(2);
    expect(submission.headers.map((headers) => headers["gov-test-scenario"])).toEqual([
      "CT600_REJECT_SECOND_RETURN",
      "CT600_REJECT_SECOND_RETURN",
    ]);
  });

  test("once return 1 is accepted its accounts, 15 month figures and first column lock, and return 2's column stays open", async ({
    page,
  }) => {
    const submission = longSubmission({ secondOutcome: "REJECT" });
    await reachLongReview(page, submission);
    await sendBoth(page);

    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the Company Tax Return 1 of 2", { timeout: 30_000 });
    await expect(page.locator("#returnResult")).toContainText("HMRC rejected the Company Tax Return 2 of 2", { timeout: 30_000 });
    await expect(page.locator("#returnErrors")).toContainText("Error 9043");
    await expect(page.locator("#returnErrors")).toContainText("send return 2 of 2 again");
    await expect(page.locator("#returnRecord .customer-copy")).toHaveCount(1);
    await expect(page.locator("#tryAgainBtn")).toBeVisible();

    await page.locator("#tryAgainBtn").click();
    await page.locator("#backToFormBtn").click();
    await expect(page.locator("#firstReturnLockNote")).toHaveText(
      "Return 1 is filed with HMRC. Send return 2 first, then amend return 1 from its receipt.",
    );
    for (const id of ["currentTurnover", "periodEnd", "depreciation", "mainPoolAllowances", "donationsPaid", "annualInvestmentAllowance"]) {
      await expect(page.locator(`#${id}`), id).toBeDisabled();
    }
    for (const id of ["mainPoolAllowancesAp2", "annualInvestmentAllowanceAp2", "donationsPaidAp2", "loanAmount1Ap2"]) {
      await expect(page.locator(`#${id}`), id).toBeEnabled();
    }
    await expect(page.locator("#declarantName")).toBeEnabled();

    await page.locator("#mainPoolAllowancesAp2").fill("300");
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#sendStepHeading")).toHaveText("Send return 2 of 2 to HMRC");
    await expect(page.locator("#submitReturnBtn")).toHaveText("Submit return 2 of 2 to HMRC");
  });

  test("a reload between the sends resumes at return 2 with no password kept", async ({ page }) => {
    const submission = longSubmission({ secondPostStatus: 502 });
    await reachLongReview(page, submission);
    await sendBoth(page);
    await expect(page.locator("#statusMessagesContainer")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => submission.requests.length).toBe(2);

    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jointFiling")).sending.longPeriod);
    expect(saved.filingId).toBe(submission.requests[0].longPeriod.filingId);
    expect(saved.parts[0]).toMatchObject({ correlationId: "CORR0001", statusCode: "ACCEPT", irmark: IRMARKS.A1 });
    expect(saved.parts[1]).toBeNull();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#previewView")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#sendStepHeading")).toHaveText("Send return 2 of 2 to HMRC");
    await expect(page.locator("#longSendOrder")).toContainText("Return 2 of 2 is the one left to send");
    await expect(page.locator("#gatewayPassword")).toHaveValue("");
    await expect(page.locator("#currentTurnover")).toBeDisabled();
    await expect(page.locator("#mainPoolAllowancesAp2")).toHaveValue("363");
    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the Company Tax Return 1 of 2");
  });

  test("?amend= on return 2's receipt refills both columns and amends only the return whose boxes change", async ({ page }) => {
    const filingId = "0b8f3a52-6f1e-4c8e-9a47-5d2f7c1e4b10";
    const list = [
      { name: "2026-11-12T10:02:00.000Z-CORR0002.json", kind: "company-tax-return", longPeriod: { filingId, part: 2, parts: 2 } },
      { name: "2026-11-12T10:01:00.000Z-CORR0001.json", kind: "company-tax-return", longPeriod: { filingId, part: 1, parts: 2 } },
    ];
    const submission = longSubmission();
    await openForm(page, [], submission);
    await typeLongForm(page);
    const values = await formValuesOnThePage(page);
    const company = { companyNumber: "00000007", companyName: "Precision Code Ltd" };
    const base = { kind: "company-tax-return", statusCode: "ACCEPT", formRequest: { company, values } };
    const changedSecond = { ...SECOND_RETURN_BOXES, 705: 300, 440: 5000 };
    const amendment = longSubmission();
    amendment.previewBody = LONG_PREVIEW(changedSecond);
    amendment.receiptList = list;
    amendment.receiptsByName = {
      [list[0].name]: { ...base, longPeriod: { filingId, part: 2, parts: 2 }, filed: { boxes: SECOND_RETURN_BOXES } },
      [list[1].name]: { ...base, longPeriod: { filingId, part: 1, parts: 2 }, filed: { boxes: FIRST_RETURN_BOXES } },
    };
    await serveRealSite(page, [], amendment);
    await page.goto(`${PAGE_URL}?amend=${encodeURIComponent(list[0].name)}`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#formView")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#mainPoolAllowancesAp2")).toHaveValue("363");
    await expect(page.locator("#loanName1Ap2")).toHaveValue(DIRECTOR);
    await expect(page.locator("#periodStart")).toBeDisabled();
    await expect(page.locator("#periodEnd")).toBeDisabled();
    await page.locator("#mainPoolAllowancesAp2").fill("300");
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    await expect(page.locator("#sendStepHeading")).toHaveText("Send the amended return 2 of 2 to HMRC");
    await sendBoth(page);

    await expect(page.locator("#returnResult")).toContainText("HMRC accepted the amended Company Tax Return 2 of 2", { timeout: 30_000 });
    expect(amendment.requests).toHaveLength(1);
    expect(amendment.requests[0]).toMatchObject({ amended: true, longPeriod: { filingId, part: 2 } });
    expect(amendment.requests[0].reviewedBoxes).toEqual(changedSecond);
  });

  test("?amend= on a long filing with only one accepted return says so and starts nothing", async ({ page }) => {
    const filingId = "0b8f3a52-6f1e-4c8e-9a47-5d2f7c1e4b10";
    const name = "2026-11-12T10:01:00.000Z-CORR0001.json";
    const submission = longSubmission();
    submission.receiptList = [{ name, kind: "company-tax-return", longPeriod: { filingId, part: 1, parts: 2 } }];
    submission.receiptsByName = {
      [name]: {
        kind: "company-tax-return",
        statusCode: "ACCEPT",
        longPeriod: { filingId, part: 1, parts: 2 },
        filed: { boxes: FIRST_RETURN_BOXES },
        formRequest: { company: { companyNumber: "00000007", companyName: "Precision Code Ltd" }, values: {} },
      },
    };
    await serveRealSite(page, [], submission);
    await page.goto(`${PAGE_URL}?amend=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#statusMessagesContainer")).toContainText(
      "Only one of the two returns of this filing has an accepted receipt",
    );
    await expect(page.locator("#formView")).toBeHidden();
  });

  for (const width of [1280, 390]) {
    test(`the long period panel, the columns and the two reviews at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await reachLongReview(page);
      await page.locator("#returnForm").evaluate(() => {});
      await page.locator("#backToFormBtn").click();
      await page.locator("#section-period").screenshot({ path: recordScreenshotPath("ct600-long-period-panel", width) });
      await page.locator("#section-allowances").screenshot({ path: recordScreenshotPath("ct600-long-period-columns", width) });
      await page.locator("#section-loans").screenshot({ path: recordScreenshotPath("ct600-long-period-loans", width) });
      await page.locator("#workedTax").screenshot({ path: recordScreenshotPath("ct600-long-period-worked-tax", width) });
      await page.locator("#previewBtn").click();
      await expect(page.locator("#previewView")).toBeVisible();
      await page.locator("#longReviews").screenshot({ path: recordScreenshotPath("ct600-long-period-reviews", width) });
      await page.locator(".send-step").screenshot({ path: recordScreenshotPath("ct600-long-period-send", width) });
      expect(await pageScrollsSideways(page)).toBe(false);
    });
  }

  for (const scheme of ["light", "dark"]) {
    test(`the long period form, both reviews and the second rejection pass axe at WCAG A and AA in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await reachLongReview(page, longSubmission({ secondOutcome: "REJECT" }));
      await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
      const violations = (selector) =>
        page.evaluate(async (scope) => {
          const results = await window.axe.run(document.querySelector(scope), {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
          });
          return results.violations.map(
            (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
          );
        }, selector);
      expect(await violations("#previewView")).toEqual([]);
      await page.locator("#backToFormBtn").click();
      expect(await violations("#formView")).toEqual([]);
      await page.locator("#previewBtn").click();
      await expect(page.locator("#previewView")).toBeVisible();
      await sendBoth(page);
      await expect(page.locator("#returnErrors")).toContainText("Error 9043", { timeout: 30_000 });
      expect(await violations("#resultView")).toEqual([]);
    });
  }

  for (const scheme of ["light", "dark"]) {
    test(`the result view gives its buttons one width and the HMRC heading a gap at 390 px in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await openForm(page, [], { requests: [], status: 200, body: {}, pollBody: ACCEPTED_RETURN });
      await page.evaluate(() => {
        document.getElementById("formView").style.display = "none";
        document.getElementById("resultView").style.display = "block";
        document.getElementById("jointProgress").style.display = "block";
        document.getElementById("hmrcHeading").style.display = "block";
        for (const id of ["sendCtNowBtn", "waitForCompaniesHouseBtn", "tryAgainBtn"])
          document.getElementById(id).style.display = "inline-flex";
        document.getElementById("companiesHouseOutcome").textContent = "Companies House has your accounts.";
      });

      const widths = await page.evaluate(() =>
        ["sendCtNowBtn", "waitForCompaniesHouseBtn"].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().width)),
      );
      expect(widths[1]).toBe(widths[0]);
      const gapAboveHmrc = await page.evaluate(() => {
        const heading = document.getElementById("hmrcHeading").getBoundingClientRect().top;
        return heading - document.getElementById("waitForCompaniesHouseBtn").getBoundingClientRect().bottom;
      });
      expect(gapAboveHmrc).toBeGreaterThanOrEqual(16);
      await page.locator("#resultView").screenshot({ path: recordScreenshotPath(`ct600-joint-result-${scheme}`, 390) });
    });
  }

  for (const [mismatch, label] of [
    [true, "warns when the IRmark on HMRC's receipt differs"],
    [false, "shows no IRmark warning when the receipt matches"],
  ]) {
    test(`an accepted return ${label}`, async ({ page }) => {
      const submission = {
        requests: [],
        status: 200,
        body: { correlationId: "ABCDEF0123456789", pollIntervalSeconds: 1 },
        pollBody: mismatch ? { ...ACCEPTED_RETURN, irmarkReceiptMismatch: true } : ACCEPTED_RETURN,
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
      const resultWarning = page.locator("#irmarkMismatchWarning");
      const copyWarning = copy.locator(".customer-copy-warning");
      if (mismatch) {
        await expect(resultWarning).toBeVisible();
        await expect(resultWarning).toContainText("IRmark on HMRC's receipt is different from the one we calculated");
        await expect(copyWarning).toBeVisible();
        await expect(copyWarning).toContainText("Contact support if you need the difference explained");
      } else {
        await expect(resultWarning).toHaveCount(0);
        await expect(copyWarning).toHaveCount(0);
      }
    });
  }

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
      await expect(copy.locator(".customer-copy-title")).toHaveText("Your copy of the Company Tax Return (preview)");
      await expect(copy.locator(".customer-copy-status")).toHaveText("Accepted by HMRC");
      await expect(copy.locator(".customer-copy-submission")).toContainText("RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S");

      const record = copy.locator(".submission-record").first();
      await expect(record.locator(".entity")).toHaveText("Precision Code Ltd");
      await expect(record.locator(".reference").first()).toHaveText("Tax reference 8596148860");
      await expect(record.locator("h2")).toHaveText("Company Tax Return (CT600, preview)");
      await expect(record.locator(".subtitle")).toHaveText("Period of the return 1 April 2025 to 31 March 2026");
      await expect(record.locator("tr", { hasText: "Profit or loss before tax per the accounts" })).toBeVisible();
      await expect(record.locator("tr", { hasText: "Corporation Tax chargeable (box 440)" }).locator("td.figure")).toHaveText("12,345.67");
      await expect(record.locator("tr", { hasText: "Net Corporation Tax liability (box 475)" })).toHaveClass("total");

      const receipt = copy.locator(".submission-record").nth(1);
      await expect(receipt.locator("tr", { hasText: "IRmark receipt" }).locator("td.text-value")).toHaveText(
        "RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S",
      );
      await expect(copy.locator(".customer-copy-links a").first()).toHaveAttribute(
        "href",
        "filings.html?receipt=2026-10-24T11%3A30%3A00.000Z-ABCDEF0123456789.json",
      );

      await expect(page.locator("#receiptProof")).toContainText("proof that it filed this return");
      await expect(copy).toContainText("This receipt is the company's proof that it filed the return");
      const help = page.locator("#supportHelp");
      await expect(help.getByRole("link", { name: "HMRC Online Services Helpdesk" })).toHaveAttribute(
        "href",
        /gov\.uk\/.*online-services-helpdesk/,
      );
      await expect(help.getByRole("link", { name: "support@diyaccounting.co.uk" })).toHaveAttribute(
        "href",
        "mailto:support@diyaccounting.co.uk",
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

    await page.locator("#periodEnd").fill("2025-03-31");
    await page.locator("#periodEnd").dispatchEvent("change");
    await expect(page.locator("#period-error")).toContainText("The period cannot end before it starts");

    await page.locator("#loansMadeYes").check();
    await page.locator("#loanName1").focus();
    await page.locator("#loanName1").blur();
    await expect(page.locator("#loanName1-error")).toContainText("participator's name");

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
    for (const text of [
      "10 digits",
      "whole number",
      "cannot end before it starts",
      "participator's name",
      "does not balance",
      "declaration",
    ]) {
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
    await expect(row.locator("td").nth(0)).toHaveText("Box 690");
    await expect(row.locator("td").nth(1)).toHaveText("Annual investment allowance: capital allowances");
    await expect(row).toContainText("£52,500");
    await expect(row.getByRole("link", { name: "Change Annual investment allowance: capital allowances" })).toBeVisible();
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

  async function workedBoxPounds(page, box) {
    const text = await page
      .locator("#workedTaxRows .worked-tax__row", { hasText: `Box ${box}:` })
      .first()
      .locator("dd")
      .first()
      .innerText();
    return Number(text.replace(/[^0-9.-]/g, ""));
  }

  test("an own working that disagrees with the worked tax leaves box 440 and box 600 in the panel", async ({ page }) => {
    await openForm(page);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    const box440 = await workedBoxPounds(page, 440);
    expect(box440).toBeGreaterThan(0);

    await page.locator("#ownCorporationTax").fill(String(box440 + 100));
    await page.locator("#ownCorporationTax").blur();

    await expect(page.locator("#workedTaxEmpty")).toBeHidden();
    await expect(page.locator("#workedTaxRows")).toContainText("Box 440:");
    await expect(page.locator("#workedTaxRows")).toContainText("Box 600:");
    expect(await workedBoxPounds(page, 440)).toBe(box440);
  });

  test("the review refuses an own working that disagrees with the worked tax, naming both figures", async ({ page }) => {
    await openForm(page);
    await dropBook(page);
    await completeTheAnswersTheBookLeaves(page);
    const box440 = await workedBoxPounds(page, 440);
    const box475 = await workedBoxPounds(page, 475);
    const own = box440 + 100;

    await page.locator("#ownCorporationTax").fill(String(own));
    await page.locator("#previewBtn").click();

    await expect(page.locator("#previewView")).toBeHidden();
    const error = page.locator("#ownCorporationTax-error");
    await expect(error).toContainText("disagrees with your own working");
    await expect(error).toContainText(box475.toFixed(2));
    await expect(error).toContainText(own.toFixed(2));
  });

  test("the accounts lines of both years and the average number of employees start at 0", async ({ page }) => {
    await openForm(page);
    for (const id of ["currentTurnover", "priorTurnover", "currentFixedAssets", "currentCalledUpShareCapital", "averageEmployees"]) {
      await expect(page.locator(`#${id}`), id).toHaveValue("0");
    }
    await page.locator("#regimeMicro").check();
    await expect(page.locator("#microCurrentTurnover")).toHaveValue("0");
    await expect(page.locator("#directorsAdvanceMade")).toHaveValue("");
  });

  test("an advance fills the terms with a common arrangement until they are typed, and clears with every amount at 0", async ({ page }) => {
    await openForm(page);
    const terms = page.locator("#directorsAdvanceTerms");
    await expect(terms).toHaveValue("");
    await page.locator("#directorsAdvanceMade").fill("500");
    await expect(terms).toHaveValue("Interest free if repaid within 12 months of the year end; unsecured; repayable on demand.");
    await expect(page.locator("#directorsAdvanceTerms-hint").getByRole("link", { name: "Section 413" })).toHaveAttribute(
      "href",
      "https://www.legislation.gov.uk/ukpga/2006/46/section/413",
    );
    await page.locator("#directorsAdvanceMade").fill("0");
    await expect(terms).toHaveValue("");

    await page.locator("#directorsAdvanceMade").fill("500");
    await terms.fill("Interest at 2.25%; unsecured; repaid by 31 December");
    await page.locator("#directorsAdvanceMade").fill("0");
    await expect(terms).toHaveValue("Interest at 2.25%; unsecured; repaid by 31 December");
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
    await expect(page.locator("#review-row-microCurrentRawMaterials")).toContainText("Cost of raw materials and consumables, this year");
    await expect(page.locator("#review-row-statementMicroEntityProvisions")).toContainText("Yes");
  });

  test("micro-entity accounts ask for the note on advances to directors and the preview sends it", async ({ page }) => {
    const previewRequests = [];
    await openForm(page, previewRequests);
    await dropBook(page, { regime: "micro" });
    for (const id of [
      "directorsAdvanceName",
      "directorsAdvanceTerms",
      "directorsAdvanceAtStart",
      "directorsAdvanceMade",
      "directorsAdvanceRepaid",
    ]) {
      await expect(page.locator(`#${id}`), id).toBeVisible();
    }
    await expect(page.locator("#principalActivity")).toBeHidden();
    await expect(page.locator("#accountingPolicies")).toBeHidden();
    await completeTheAnswersTheBookLeaves(page, { regime: "micro" });
    const director = await page.locator("#directorName").inputValue();
    await page.locator("#directorsAdvanceName").fill(director);
    await page.locator("#directorsAdvanceTerms").fill("Interest free and repayable on demand");
    await page.locator("#directorsAdvanceAtStart").fill("0");
    await page.locator("#directorsAdvanceMade").fill("443");
    await page.locator("#directorsAdvanceRepaid").fill("0");
    await expect(page.locator("[aria-invalid=true]")).toHaveCount(0);

    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0].directorsAdvances).toEqual([
      { name: director, terms: "Interest free and repayable on demand", balanceAtStart: 0, advanced: 443, repaid: 0, balanceAtEnd: 443 },
    ]);
    await expect(page.locator("#review-row-directorsAdvanceTerms")).toContainText("Interest free and repayable on demand");
  });

  function ixbrlAccountsFile(caseName, overrides = {}) {
    const cases = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/companies-house-test-service-cases.json"), "utf-8"),
    );
    const { name, type, govTestScenario, expectedOutcome, ...requestBody } = cases.find((testCase) => testCase.name === caseName);
    const errors = [];
    const accounts = extractAndValidateAccountsParameters(
      { body: JSON.stringify({ ...requestBody, companyNumber: "00000007", companyName: "Precision Code Ltd", ...overrides }) },
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

  test("a Company Tax Return filed for the company fills the accounts from its document and the return's answers from its boxes", async ({
    page,
  }) => {
    const ctName = "2026-10-24T11:30:00.000Z-ABCDEF0123456789.json";
    const submission = {
      requests: [],
      status: 200,
      body: {},
      receiptList: [
        {
          name: ctName,
          kind: "company-tax-return",
          companyNumber: "00000007",
          periodStart: "2025-04-01",
          periodEnd: "2026-03-31",
          timestamp: "2026-10-24T11:30:00.000Z",
        },
        {
          name: "2026-10-25T10:00:00.000Z-00001B.json",
          kind: "companies-house-accounts",
          companyNumber: "00000003",
          periodStart: "2025-04-01",
          periodEnd: "2026-03-31",
          timestamp: "2026-10-25T10:00:00.000Z",
        },
        { name: "2026-10-26T10:00:00.000Z-VAT1.json", kind: null, timestamp: "2026-10-26T10:00:00.000Z" },
      ],
      receiptsByName: {
        [ctName]: {
          kind: "company-tax-return",
          statusCode: "ACCEPT",
          correlationId: "ABCDEF0123456789",
          filed: {
            boxes: {
              2: "00000007",
              3: "8596148860",
              30: "2025-04-01",
              35: "2026-03-31",
              160: 1200,
              170: 350,
              975: "Antony Cartwright",
              440: 9198,
            },
            accountsIxbrl: ixbrlAccountsFile("small-company-accounts-full").buffer.toString("utf-8"),
          },
        },
      },
    };
    await openForm(page, [], submission);
    await expect(page.locator("#filedReceiptsSelect option")).toHaveText([
      "Company Tax Return, 1 April 2025 to 31 March 2026, filed 24 October 2026",
    ]);

    await page.locator("#filedReceiptsUse").click();

    const status = page.locator("#booksImportStatus");
    await expect(status).toContainText("your Company Tax Return for 1 April 2025 to 31 March 2026", { timeout: 60_000 });
    await expect(status).toContainText("The return's own answers as filed fill");
    await expect(page.locator("#periodStart")).toHaveValue("2025-04-01");
    await expect(page.locator("#periodEnd")).toHaveValue("2026-03-31");
    await expect(page.locator("#currentTurnover")).toHaveValue("8500");
    await expect(page.locator("#currentCashAtBank")).toHaveValue("5200");
    await expect(page.locator("#utr")).toHaveValue("8596148860");
    await expect(page.locator("#lossesBroughtForward")).toHaveValue("1200");
    await expect(page.locator("#nonTradingLoanRelationshipCredits")).toHaveValue("350");
    await expect(page.locator("#declarantName")).toHaveValue("Antony Cartwright");
  });

  test("a company whose last return Submit filed starts this year's from it, with last year's accounts as the prior year", async ({
    page,
  }) => {
    // A loss pool larger than the profit leaves losses to carry forward and no tax to set income tax against.
    const values = { ...(await filledFormValues(page)), lossesBroughtForward: "1000000000", incomeTaxDeducted: "", taxAlreadyPaid: "0" };
    const ctName = "2026-10-24T11:30:00.000Z-ABCDEF0123456789.json";
    const submission = {
      requests: [],
      status: 200,
      body: {},
      receiptList: [
        {
          name: ctName,
          kind: "company-tax-return",
          companyNumber: "00000007",
          periodStart: "2025-04-01",
          periodEnd: "2026-03-31",
          timestamp: "2026-10-24T11:30:00.000Z",
        },
      ],
      receiptsByName: {
        [ctName]: {
          kind: "company-tax-return",
          statusCode: "ACCEPT",
          formRequest: { company: { companyNumber: "00000007", companyName: "Precision Code Ltd" }, values },
          filed: {
            boxes: { 2: "00000007", 30: "2025-04-01", 35: "2026-03-31", 315: 41250, 326: 1, 975: values.declarantName, 985: "Director" },
            accountsIxbrl: ixbrlAccountsFile("small-company-accounts-full").buffer.toString("utf-8"),
          },
        },
      },
    };
    await openForm(page, [], submission);
    const panel = page.locator("#lastYearPanel");
    await expect(panel).toContainText("Submit filed this company's Company Tax Return for 1 April 2025 to 31 March 2026.");

    await page.getByRole("button", { name: "Start from last year's return" }).click();

    await expect(page.locator("#lastYearStarted")).toContainText("Started from your Company Tax Return for 1 April 2025 to 31 March 2026", {
      timeout: 60_000,
    });
    await expect(page.locator("#lastYearStarted")).toContainText("Box 160 is the losses it carried forward.");
    await expect(page.locator("#lastYearStarted")).toContainText("Last year's accounts figures are those filed with that return.");
    await expect(page.locator("#periodStart")).toHaveValue("2026-04-01");
    await expect(page.locator("#periodEnd")).toHaveValue("2027-03-31");
    await expect(page.locator("#priorPeriodChargeableProfits")).toHaveValue("41250");
    await expect(page.locator("#associatedCompanies")).toHaveValue("1");
    await expect(page.locator("#tradeName")).toHaveValue(values.tradeName);
    await expect(page.locator("#declarantName")).toHaveValue(values.declarantName);
    await expect(page.locator("#statementSection477Exemption")).toBeChecked();
    await expect(page.locator("#regimeSmall")).toBeChecked();
    await expect(page.locator("#priorTurnover")).toHaveValue("8500");
    await expect(page.locator("#priorCashAtBank")).toHaveValue("5200");
    await expect(page.locator("#currentTurnover")).toHaveValue("0");
    const carried = Number(await page.locator("#lossesBroughtForward").inputValue());
    expect(carried).toBeGreaterThan(0);
    expect(carried).toBeLessThan(1000000000);
  });

  test("a return that kept no accounts takes last year's accounts from the register, and one that kept no answers leaves box 160", async ({
    page,
  }) => {
    const ctName = "2026-10-24T11:30:00.000Z-ABCDEF0123456789.json";
    const submission = {
      requests: [],
      status: 200,
      body: {},
      receiptList: [
        {
          name: ctName,
          kind: "company-tax-return",
          companyNumber: "00000007",
          periodStart: "2025-04-01",
          periodEnd: "2026-03-31",
          timestamp: "2026-10-24T11:30:00.000Z",
        },
      ],
      receiptsByName: {
        [ctName]: {
          kind: "company-tax-return",
          statusCode: "ACCEPT",
          filed: { boxes: { 2: "00000007", 30: "2025-04-01", 35: "2026-03-31", 326: 0 } },
        },
      },
    };
    await openForm(page, [], submission);
    await page.route("**/api/v1/companies-house/company/00000007/last-accounts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          outcome: "mapped",
          set: { madeUpDate: "2026-03-31" },
          accounts: {
            regime: "micro",
            balanceSheet: { fixedAssets: 800, currentAssets: 6000, calledUpShareCapital: 100 },
            profitAndLoss: null,
          },
        }),
      }),
    );

    await page.getByRole("button", { name: "Start from last year's return" }).click();

    const started = page.locator("#lastYearStarted");
    await expect(started).toContainText("That return kept no answers to work its losses from, so box 160 is left for you.", {
      timeout: 60_000,
    });
    await expect(started).toContainText("Last year's accounts figures are the company's accounts on the Companies House register.");
    await expect(page.locator("#regimeMicro")).toBeChecked();
    await expect(page.locator("#microPriorFixedAssets")).toHaveValue("800");
    await expect(page.locator("#microPriorCurrentAssets")).toHaveValue("6000");
    await expect(page.locator("#periodEnd")).toHaveValue("2027-03-31");
  });

  test("a company with no return filed through Submit is offered no start from last year", async ({ page }) => {
    await openForm(page, [], { requests: [], status: 200, body: {}, receiptList: [] });
    await expect(page.locator("#lastYearPanel")).toBeHidden();
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
    await page
      .locator("#booksImportFile")
      .setInputFiles(ixbrlAccountsFile("small-company-accounts-full", { companyNumber: OTHER_COMPANY_NUMBER }));
    await expect(page.locator("#booksImportStatus")).toContainText(OTHER_COMPANY_NUMBER, { timeout: 60_000 });
    await expect(page.locator("#booksImportStatus")).toContainText("Nothing filled");
    await expect(page.locator("#currentTurnover")).toHaveValue("0");
    await expect(page.locator("#periodStart")).toHaveValue("");
  });

  test("an iXBRL document for another period than the form holds fills nothing", async ({ page }) => {
    await openForm(page);
    await page.locator("#periodStart").fill("2024-01-01");
    await page.locator("#periodEnd").fill("2024-12-31");
    await page.locator("#booksImportFile").setInputFiles(ixbrlAccountsFile("small-company-accounts-full"));
    await expect(page.locator("#booksImportStatus")).toContainText("end on 2026-03-31", { timeout: 60_000 });
    await expect(page.locator("#booksImportStatus")).toContainText("Nothing filled");
    await expect(page.locator("#currentTurnover")).toHaveValue("0");
    await expect(page.locator("#periodEnd")).toHaveValue("2024-12-31");
  });

  test("the send-to question offers HMRC alone where the joint filing is not enabled", async ({ page }) => {
    await serveRealSite(page);
    const catalogue = fs
      .readFileSync(path.join(PUBLIC_ROOT, "submit.catalogue.toml"), "utf-8")
      .replace(/(id = "file-company-tax-return-with-accounts"[\s\S]*?environments = )\[[^\]]*\]/, '$1["prod"]');
    await page.route("**/submit.catalogue.toml", (route) => route.fulfill({ status: 200, contentType: "text/x-toml", body: catalogue }));
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#companyNumber").fill("00000007");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#sendToHmrc")).toBeChecked();
    await expect(page.locator("#sendToBoth")).toBeHidden();
    await expect(page.locator("#sendToBoth")).toBeDisabled();
    await expect(page.locator("#sendTo-hint")).toHaveText("The accounts go to HMRC with the Company Tax Return.");
  });

  test("the send-to question offers both choices where the joint filing is enabled", async ({ page }) => {
    await openForm(page);
    await expect(page.locator("#sendToBoth")).toBeVisible();
    await expect(page.locator("#sendToBoth")).toBeEnabled();
    await expect(page.locator("#sendTo-hint")).toContainText("Companies House gets the accounts first");
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

  const CLIENT = {
    clientId: "client-1",
    displayName: "Precision Code Ltd",
    identifiers: { utr: "1234567890", companyNumber: "00000007" },
    archivedAt: null,
  };

  async function openPracticePage(page, { clients = [CLIENT], previewRequests = [], ...rest } = {}) {
    await serveRealSite(page, previewRequests, undefined, { clientsStatus: 200, clientsBody: { clients }, ...rest });
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
  }

  test("asks who the return is for only when the practice clients call answers 200", async ({ page }) => {
    await serveRealSite(page, [], undefined, { clientsStatus: 403, clientsBody: { message: "licence needed" } });
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#companyNumber")).toBeVisible();
    await expect(page.getByText("Who is this return for?")).toBeHidden();
  });

  test("lists my own company and each client that is not archived", async ({ page }) => {
    await openPracticePage(page, {
      clients: [CLIENT, { ...CLIENT, clientId: "client-2", displayName: "Archived Ltd", archivedAt: "2026-01-01" }],
    });
    await expect(page.getByText("Who is this return for?")).toBeVisible();
    await expect(page.locator("#clientChoiceOptions label")).toHaveText(["My own company", "Precision Code Ltd (00000007)"]);
  });

  test("a client fills the company number and the UTR and files as the agent", async ({ page }) => {
    const previewRequests = [];
    await openPracticePage(page, { previewRequests });
    await page.locator("#clientChoice-client-1").check();
    await expect(page.locator("#companyNumber")).toHaveValue("00000007");
    await expect(page.locator("#companyNumber")).toHaveJSProperty("readOnly", true);
    await expect(page.locator("#practiceNameGroup")).toBeVisible();
    await page.locator("#practiceName").fill(PRACTICE_NAME);
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#utr")).toHaveValue("1234567890");
    await expect(page.locator("#utr")).toHaveJSProperty("readOnly", true);
    await expect(page.locator("#declarantStatus")).toHaveValue("Agent");
    await expect(page.locator("#agentSection")).toBeVisible();
    await expect(page.locator("#sendToBoth")).toBeDisabled();
    await expect(page.locator("#gatewayWhose")).toContainText("practice's own agent");

    await dropBook(page);
    await page.locator("#directorDateApproved").fill("2026-09-15");
    for (const id of [
      "statementSection477Exemption",
      "statementMembersNotRequiredAudit",
      "statementDirectorsResponsibilities",
      "statementSmallCompaniesRegime",
      "declarationAccepted",
    ]) {
      await page.locator(`#${id}`).check();
    }
    await page.locator("#previewBtn").click();
    await expect(page.locator("#statusMessagesContainer")).toContainText("Confirm that the company has authorised the practice");
    expect(previewRequests).toHaveLength(0);

    await page.locator("#agentAuthorised").check();
    await page.locator("#previewBtn").click();
    await expect(page.locator("#previewView")).toBeVisible();
    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0]).toMatchObject({
      clientId: "client-1",
      agent: { practiceName: PRACTICE_NAME, authorisationConfirmed: true },
      declarant: { status: "Agent" },
    });
  });

  test("stops a client with no UTR and links to Practice clients", async ({ page }) => {
    await openPracticePage(page, { clients: [{ ...CLIENT, identifiers: { utr: null, companyNumber: "00000007" } }] });
    await page.locator("#clientChoice-client-1").check();
    await expect(page.locator("#clientStop")).toContainText("Add the company's UTR to Precision Code Ltd on Practice clients");
    await expect(page.locator("#clientStop a")).toHaveAttribute("href", "../practice.html");
    await expect(page.locator("#companyLookupBtn")).toBeDisabled();
  });

  test("a saved book of the client fills the form", async ({ page }) => {
    const requested = [];
    const zipBase64 = (await zippedPrecisionCodeBook()).toString("base64");
    await openPracticePage(page, {
      books: [{ bookId: "book-1", title: "Precision Code FY26", latestVersion: 2 }],
      zipBase64,
      requested,
    });
    await page.locator("#clientChoice-client-1").check();
    await page.locator("#practiceName").fill(PRACTICE_NAME);
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator("#savedBooksSelect option")).toHaveText(["Precision Code FY26 (version 2)"]);
    await page.locator("#savedBooksUse").click();
    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
    expect(requested.some((entry) => entry.includes("clientId=client-1"))).toBe(true);
  });
});
