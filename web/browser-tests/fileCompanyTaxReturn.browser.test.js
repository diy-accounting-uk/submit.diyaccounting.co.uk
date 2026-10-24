// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileCompanyTaxReturn.browser.test.js

import { test, expect } from "@playwright/test";
import { serveSiteStyles } from "./hmrcFieldTableAssets.js";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
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
const PREVIEW_BOXES = { 3: "8596148860", 440: 12345.67 };

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

  async function serveRealSite(page, previewRequests = []) {
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
          ["profitLossPerAccounts", "nonTradingLoanRelationshipCredits", "depreciation", "amortisation", "entertaining"].map((name) => [
            name,
            1,
          ]),
        );
        const body = {
          boxes: PREVIEW_BOXES,
          computationLines: { ...computationLines, adjustedProfitBeforeCapitalAllowances: 2, totalCapitalAllowances: 1, adjustedProfit: 1 },
          computationsIxbrl: "<html/>",
        };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
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

  async function openForm(page, previewRequests) {
    await serveRealSite(page, previewRequests);
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#companyNumber").fill("12345678");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
  }

  async function dropBook(page) {
    await page.locator("#booksImportFile").setInputFiles({
      name: "precision-code.diya-gl.zip",
      mimeType: "application/zip",
      buffer: await zippedPrecisionCodeBook(),
    });
    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
  }

  async function completeTheAnswersTheBookLeaves(page) {
    await page.locator("#utr").fill("8596148860");
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
      ...accountAmountIds().filter((id) => id.startsWith("current")),
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

  test("the accounts just accepted by Companies House fill the accounts section", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "filedSmallCompanyAccounts",
        JSON.stringify({
          companyNumber: "12345678",
          companyName: "Precision Code Ltd",
          periodStart: "2025-04-01",
          periodEnd: "2026-03-31",
          averageEmployees: 3,
          director: { name: "Carol Smith", dateApproved: "2026-06-01" },
          smallCompany: {
            principalActivity: "Software",
            accountingPolicies: "FRS 102 1A",
            directors: ["Carol Smith"],
            balanceSheet: {
              currentYear: {
                fixedAssets: 0,
                stocks: 0,
                debtors: 10,
                cashAtBank: 90,
                tradeCreditors: 0,
                corporationTax: 0,
                otherCreditors: 0,
                creditorsAfterOneYear: 0,
                calledUpShareCapital: 100,
                profitAndLossAccount: 0,
              },
            },
            profitAndLoss: { currentYear: { turnover: 500, costOfSales: 100, administrativeExpenses: 50, interestReceivable: 0, tax: 0 } },
          },
        }),
      );
    });
    await openForm(page);
    await expect(page.locator("#filedAccountsOffer")).toBeVisible();
    await page.locator("#useFiledAccountsBtn").click();
    await expect(page.locator("#currentTurnover")).toHaveValue("500");
    await expect(page.locator("#directorName")).toHaveValue("Carol Smith");
    await expect(page.locator("#periodStart")).toHaveValue("2025-04-01");
  });
});
