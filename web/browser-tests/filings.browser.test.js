// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/filings.browser.test.js
// Browser tests for the customer copy of a Companies House accounts filing and of a Company Tax
// Return: the filed documents show as filed, with the receipt, the explanations and the links.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { accountsDocumentCases, computationsDocumentCase } from "@app/test-helpers/accountsDocumentCases.js";
import { serveSiteStyles } from "./hmrcFieldTableAssets.js";
import { recordScreenshotPath, pageScrollsSideways } from "./submissionRecordAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const ACCOUNTS_RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";
const CT_RECEIPT_NAME = "2026-10-24T11:30:00.000Z-ABCDEF0123456789.json";

const accountsCase = accountsDocumentCases()[0];
const smallCompanyCase = accountsDocumentCases().find((candidate) => candidate.name === "small-company-accounts");

const ACCOUNTS_RECEIPT = {
  kind: "companies-house-accounts",
  statusCode: "ACCEPT",
  submissionNumber: "00001A",
  companyNumber: "06846849",
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
      2: "06846849",
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

const LIBRARIES = ["submission-record.js", "filing-record.js", "ct600-fields.js"];

test.describe("Filings page - customer copy", () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, "companies-house/filings.html"), "utf-8");

  async function openFiling(page, name, receipt, { width = 1280, styled = true } = {}) {
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
    await expect(copy.locator("tr", { hasText: "Company number" }).locator("td.text-value")).toHaveText("06846849");
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
    await expect(copy.locator(".customer-copy-title")).toHaveText("Your copy of the Company Tax Return");
    await expect(copy.locator(".customer-copy-status")).toHaveText("Accepted by HMRC");
    await expect(copy.locator(".customer-copy-submission")).toContainText("RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S");
    await expect(copy.locator("#ct600Box155 td.figure")).toHaveText("£4,500");
    await expect(copy.locator("#ct600Box3 td.text-value")).toHaveText("8596148860");
    await expect(page.locator("iframe.filed-document")).toHaveCount(2);
    await expect(copy.locator("tr", { hasText: "Correlation ID" }).last().locator("td.text-value")).toHaveText("ABCDEF0123456789");
    await expect(copy.locator(".customer-copy-links a").first()).toHaveAttribute("href", "fileCompanyTaxReturn.html");
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
});
