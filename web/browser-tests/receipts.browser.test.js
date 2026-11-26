// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/receipts.browser.test.js
// Browser tests for the receipts page: a stored receipt reads as plain names and nested values

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveHmrcFieldTableAssets, expectCleanFigures, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";
import { serveSubmissionRecordAssets, recordScreenshotPath, pageScrollsSideways } from "./submissionRecordAssets.js";
import { screenshotAtBothWidths } from "./revisedAccountsScreenshots.js";
import { registerCompany } from "@app/http-simulator/fixtures/register.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VAT_RECEIPT = {
  processingDate: "2026-09-30T10:15:00.000Z",
  paymentIndicator: "BANK",
  formBundleNumber: "256660290587",
  chargeRefNumber: "aBcD12345678",
};

const ITSA_RECEIPT = {
  periodId: "2026-27-Q1",
  periodDates: { periodStartDate: "6 April 2026", periodEndDate: "2026-07-05" },
  periodIncome: { turnover: 12500.5, other: 0 },
  periodExpenses: { costOfGoods: 3200 },
  links: [{ href: "/individuals/business/self-employment", rel: "self", method: "GET" }],
  isAmendment: false,
  notes: null,
};

const ITSA_ASSIST_RECEIPT = {
  kind: "itsa-assist-report",
  reportId: "1034fae8-9391-40ed-bbc7-d728596ef5ab",
  correlationId: "ff95553fd5bf8b67cb72f50b5a316d27956670d3",
  messages: [{ title: "Review your self-employment income", body: "Your turnover appears low." }],
  nino: "AB518777A",
  taxYear: "2024-25",
  calculationId: "59a33b1a-797e-4bb4-945f-072261e4e79e",
  requestedAt: "2026-11-18T07:59:42.601Z",
  acknowledgedAt: "2026-11-18T08:00:10.000Z",
  presentedLanguage: "cy",
};

const VAT_ASSIST_RECEIPT = {
  kind: "vat-assist-report",
  reportId: "5d0f1c1e-1b8a-4d2c-9a4b-2f5e8c3d7a10",
  messages: [{ title: "Check box 1", body: "Box 1 looks high." }],
  figures: { vatDueSales: 1250.5, totalVatDue: 1250.5 },
  periodKey: "24A1",
  vrn: "123456789",
  requestedAt: "2026-11-18T07:59:42.601Z",
};

test.describe("Receipts page - receipt details", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/receipt/receipts.html"), "utf-8");
  });

  async function showReceipt(page, name, receipt, { width = 1280, styled = false } = {}) {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/*.js", async (route) => {
      if (route.request().resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });
    await servePageScripts(page);
    await serveHmrcFieldTableAssets(page);
    await serveSubmissionRecordAssets(page);
    if (styled) await serveSiteStyles(page);

    const modifiedHtml = htmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/receipt/">');
    await page.route("**/hmrc/receipt/receipts.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });
    await page.goto("http://localhost:3000/hmrc/receipt/receipts.html", { waitUntil: "domcontentloaded" });
    await delay(200);
    await page.evaluate(
      async ({ receiptName, body }) => {
        window.fetchWithIdToken = async () => ({ ok: true, text: async () => JSON.stringify(body) });
        await window.viewReceipt(receiptName);
      },
      { receiptName: name, body: receipt },
    );
  }

  test("lists each receipt by date and receipt number, with no size column", async ({ page }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);
    await page.evaluate(async () => {
      localStorage.setItem("cognitoIdToken", "token");
      const items = [
        {
          name: "2026-10-02T09:00:00.000Z-AAA.json",
          timestamp: "2026-10-02T09:00:00.000Z",
          formBundleNumber: "AAA",
          kind: "company-tax-return",
          size: 32749,
        },
        { name: "2026-10-01T09:00:00.000Z-BBB.json", timestamp: "2026-10-01T09:00:00.000Z", formBundleNumber: "BBB", kind: null },
      ];
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ receipts: items }) });
      await window.fetchReceipts();
    });

    await expect(page.locator("#receiptsTable thead th")).toHaveText(["Date", "Receipt"]);
    await expect(page.locator("#receiptsTable tbody tr")).toHaveCount(2);
    await expect(page.locator("#receiptsTable tbody tr").nth(0).locator("td")).toHaveCount(2);
    await expect(page.locator("#receiptsTable tbody tr").nth(0).locator("td").nth(1)).toContainText("AAA");
    await expect(page.locator("#receiptsTable tbody tr").nth(1).locator("td").nth(1)).toContainText("BBB");
  });

  test("a pending Companies House filing and a rejected one are rows of the receipts table, each linking its status page", async ({
    page,
  }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);
    await page.evaluate(async () => {
      localStorage.setItem("cognitoIdToken", "token");
      const filingsInProgress = [
        { submissionNumber: "00001A", kind: "accounts", status: "pending", submittedAt: "2026-11-18T10:00:00.000Z", rejections: [] },
        {
          submissionNumber: "00001B",
          kind: "confirmation-statement",
          status: "rejected",
          submittedAt: "2026-11-17T10:00:00.000Z",
          rejections: [{ rejectCode: "11686", description: "You must provide the name of each shareholder" }],
        },
      ];
      const receipts = [
        { name: "2026-11-17T12:00:00.000Z-AAA.json", timestamp: "2026-11-17T12:00:00.000Z", formBundleNumber: "AAA", kind: null },
      ];
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ receipts, filingsInProgress }) });
      await window.fetchReceipts();
    });

    await expect(page.locator(".filings-in-progress")).toHaveCount(0);
    const rows = page.locator("#receiptsTable tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveClass(/filing-in-progress/);
    await expect(rows.nth(0)).toContainText("Accounts: Pending, submission number 00001A");
    await expect(rows.nth(0).getByRole("link", { name: "submission number 00001A" })).toHaveAttribute(
      "href",
      "../../companies-house/filings.html?filing=00001A&kind=accounts",
    );
    await expect(rows.nth(1).locator("td").nth(1)).toContainText("AAA");
    await expect(rows.nth(2)).toContainText("Confirmation statement: Rejected by Companies House, submission number 00001B");
    await expect(rows.nth(2)).toContainText("You must provide the name of each shareholder");
    await expect(rows.nth(2).getByRole("link", { name: "submission number 00001B" })).toHaveAttribute(
      "href",
      "../../companies-house/filings.html?filing=00001B&kind=confirmation-statement",
    );
    await expect(page.locator("#emptyState")).toBeHidden();
  });

  test("a client's pending filing links its status page with the client", async ({ page }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);
    await page.evaluate(async () => {
      localStorage.setItem("cognitoIdToken", "token");
      const filingsInProgress = [
        {
          submissionNumber: "00002A",
          kind: "psc-cessation",
          status: "pending",
          submittedAt: "2026-11-18T10:00:00.000Z",
          clientId: "client-1",
        },
      ];
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ receipts: [], filingsInProgress }) });
      await window.fetchReceipts();
    });

    await expect(page.locator("#receiptsTable tbody tr").getByRole("link")).toHaveAttribute(
      "href",
      "../../companies-house/filings.html?filing=00002A&kind=psc-cessation&clientId=client-1",
    );
  });

  test("with no filing waiting and no receipt the page says there are no receipts", async ({ page }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);
    await page.evaluate(async () => {
      localStorage.setItem("cognitoIdToken", "token");
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ receipts: [], filingsInProgress: [] }) });
      await window.fetchReceipts();
    });

    await expect(page.locator("#emptyState")).toHaveText("No receipts yet.");
    await expect(page.locator("#receiptsTable")).toBeHidden();
  });

  test("lists the accounts and both returns of a long period of account under one row, titled by return and dates", async ({ page }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);
    await page.evaluate(async () => {
      localStorage.setItem("cognitoIdToken", "token");
      const filingId = "0b8f3a52-6f1e-4c8e-9a47-5d2f7c1e4b10";
      const poa = { filingId, parts: 2, periodOfAccountStart: "2025-01-01", periodOfAccountEnd: "2026-03-31" };
      const items = [
        {
          name: "2026-10-03T09:00:00.000Z-HM1.json",
          timestamp: "2026-10-03T09:00:00.000Z",
          formBundleNumber: "HM1",
          kind: "company-tax-return",
          longPeriod: { ...poa, filingId: "11111111-2222-4333-8444-555555555555", part: 1 },
          amended: true,
        },
        {
          name: "2026-10-02T09:10:00.000Z-CT2.json",
          timestamp: "2026-10-02T09:10:00.000Z",
          formBundleNumber: "CT2",
          kind: "company-tax-return",
          jointFilingId: filingId,
          longPeriod: { ...poa, part: 2 },
        },
        {
          name: "2026-10-02T09:05:00.000Z-CT1.json",
          timestamp: "2026-10-02T09:05:00.000Z",
          formBundleNumber: "CT1",
          kind: "company-tax-return",
          jointFilingId: filingId,
          longPeriod: { ...poa, part: 1 },
        },
        {
          name: "2026-10-02T09:00:00.000Z-ACC1.json",
          timestamp: "2026-10-02T09:00:00.000Z",
          formBundleNumber: "ACC1",
          kind: "companies-house-accounts",
          jointFilingId: filingId,
        },
      ];
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ receipts: items }) });
      await window.fetchReceipts();
    });

    await expect(page.locator("#receiptsTable tbody tr")).toHaveCount(2);
    const filing = page.locator("#receiptsTable tbody tr").nth(1).locator("td.receipt-cell .receipt-entry");
    await expect(filing).toHaveCount(3);
    await expect(filing.nth(0)).toContainText("Accounts: ACC1");
    await expect(filing.nth(1)).toContainText("Company Tax Return (preview) 1 of 2 (1 January 2025 to 31 December 2025): CT1");
    await expect(filing.nth(2)).toContainText("Company Tax Return (preview) 2 of 2 (1 January 2026 to 31 March 2026): CT2");
    await expect(page.locator("#receiptsTable tbody tr").nth(0)).toContainText(
      "Amended Company Tax Return (preview) 1 of 2 (1 January 2025 to 31 December 2025): HM1",
    );
  });

  test("lists the accounts and the Company Tax Return of one joint filing under one row, and a lone half with no title", async ({
    page,
  }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);
    const jointFilingId = "0b8f6f0e-6d3e-4a39-9a55-2f1f4c6d8a10";
    await page.evaluate(async (id) => {
      localStorage.setItem("cognitoIdToken", "token");
      const items = [
        {
          name: "2026-10-02T09:05:00.000Z-CT1.json",
          timestamp: "2026-10-02T09:05:00.000Z",
          formBundleNumber: "CT1",
          kind: "company-tax-return",
          jointFilingId: id,
        },
        {
          name: "2026-10-02T09:00:00.000Z-ACC1.json",
          timestamp: "2026-10-02T09:00:00.000Z",
          formBundleNumber: "ACC1",
          kind: "companies-house-accounts",
          jointFilingId: id,
        },
        {
          name: "2026-10-01T09:00:00.000Z-CT2.json",
          timestamp: "2026-10-01T09:00:00.000Z",
          formBundleNumber: "CT2",
          kind: "company-tax-return",
        },
      ];
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ receipts: items }) });
      await window.fetchReceipts();
    }, jointFilingId);

    await expect(page.locator("#receiptsTable tbody tr")).toHaveCount(2);
    const pair = page.locator("#receiptsTable tbody tr").nth(0).locator("td.receipt-cell .receipt-entry");
    await expect(pair).toHaveCount(2);
    await expect(pair.nth(0)).toContainText("Company Tax Return (preview): CT1");
    await expect(pair.nth(1)).toContainText("Accounts: ACC1");
    const lone = page.locator("#receiptsTable tbody tr").nth(1).locator(".receipt-entry");
    await expect(lone).toHaveCount(1);
    await expect(lone).not.toContainText("Company Tax Return (preview):");
  });

  test("lists the revised accounts and the amended Company Tax Return under the filing they amend, marked as amended", async ({ page }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT, { styled: true });
    const jointFilingId = "0b8f6f0e-6d3e-4a39-9a55-2f1f4c6d8a10";
    await page.evaluate(async (id) => {
      localStorage.setItem("cognitoIdToken", "token");
      const items = [
        {
          name: "2026-10-09T09:05:00.000Z-CT2.json",
          timestamp: "2026-10-09T09:05:00.000Z",
          formBundleNumber: "CT2",
          kind: "company-tax-return",
          jointFilingId: id,
          amended: true,
        },
        {
          name: "2026-10-09T09:00:00.000Z-ACC2.json",
          timestamp: "2026-10-09T09:00:00.000Z",
          formBundleNumber: "ACC2",
          kind: "companies-house-accounts",
          jointFilingId: id,
          amended: true,
        },
        {
          name: "2026-10-02T09:05:00.000Z-CT1.json",
          timestamp: "2026-10-02T09:05:00.000Z",
          formBundleNumber: "CT1",
          kind: "company-tax-return",
          jointFilingId: id,
          amended: false,
        },
        {
          name: "2026-10-02T09:00:00.000Z-ACC1.json",
          timestamp: "2026-10-02T09:00:00.000Z",
          formBundleNumber: "ACC1",
          kind: "companies-house-accounts",
          jointFilingId: id,
          amended: false,
        },
      ];
      window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ receipts: items }) });
      await window.fetchReceipts();
    }, jointFilingId);

    await expect(page.locator("#receiptsTable tbody tr")).toHaveCount(1);
    const entries = page.locator("#receiptsTable tbody tr").nth(0).locator("td.receipt-cell .receipt-entry");
    await expect(entries).toHaveCount(4);
    await expect(entries.nth(0)).toContainText("Amended Company Tax Return (preview): CT2");
    await expect(entries.nth(1)).toContainText("Revised accounts: ACC2");
    await expect(entries.nth(2)).toContainText("Company Tax Return (preview): CT1");
    await expect(entries.nth(3)).toContainText("Accounts: ACC1");
    await screenshotAtBothWidths(page, "receipts-revised-listed");
  });

  test("shows a VAT receipt as a record inside the customer copy", async ({ page }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);

    const copy = page.locator("#receiptContent .customer-copy");
    await expect(copy.locator(".customer-copy-title")).toHaveText("Your copy of the receipt for a VAT return");
    await expect(copy.locator(".customer-copy-status")).toHaveText("Accepted by HMRC");
    await expect(copy.locator(".customer-copy-submission")).toContainText("256660290587");
    await expect(copy.locator(".customer-copy-explanation")).toContainText("BANK means a payment through your bank.");
    await expect(copy.locator(".customer-copy-explanation")).toContainText("Quote charge reference aBcD12345678");
    await expect(copy.locator(".submission-record .entity")).toHaveText("VAT return receipt");
    await expect(copy.locator(".submission-record .reference")).toHaveText("Form bundle number 256660290587");
    await expect(copy.locator(".submission-record tr", { hasText: "Payment indicator" }).locator("td.text-value")).toHaveText("BANK");
    await expect(copy.locator(".submission-record tr", { hasText: "Charge reference number" }).locator("td.text-value")).toHaveText(
      "aBcD12345678",
    );
    await expect(copy.locator(".customer-copy-links a")).toHaveText([
      "Back to your receipts",
      "See your VAT obligations",
      "See your VAT payments",
    ]);
    await expect(page.locator("#receiptHeading")).toBeHidden();
    expectCleanFigures(expect, await page.locator("#receiptContent").innerText());
  });

  test("shows the processing date as a date and time, not the stored timestamp", async ({ page }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);

    const processingDate = page.locator("#receiptContent .customer-copy-submission");
    await expect(processingDate).toContainText("30 September 2026");
    await expect(processingDate).not.toContainText("T10:15");
    await expect(processingDate).not.toContainText("Z");
    await expect(page.locator("#receiptContent .submission-record .subtitle")).toContainText("Processed 30 September 2026");
  });

  test("says so, without undefined or a blank, when HMRC returned no charge reference", async ({ page }) => {
    const { chargeRefNumber, ...repayment } = VAT_RECEIPT;
    expect(chargeRefNumber).toBeTruthy();
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", repayment);

    const row = page.locator("#receiptContent .submission-record tr", { hasText: "Charge reference number" });
    await expect(row.locator("td.text-value")).toHaveText("Not returned by HMRC");
    await expect(page.locator("#receiptContent .customer-copy-explanation")).not.toContainText("charge reference");
    expectCleanFigures(expect, await page.locator("#receiptContent").innerText());
  });

  test("heads the value column of a receipt with text values Value, not Amount", async ({ page }) => {
    await showReceipt(page, "2026-10-01T09:00:00.000Z-2026-27-Q1", ITSA_RECEIPT);

    await expect(page.locator("#receiptContent .field-table thead th.field-amount")).toHaveText("Value");
    await expect(page.locator("#receiptHeading")).toBeVisible();
  });

  test("shows a dash, not Invalid Date, for an assist report acknowledged at an unreadable time", async ({ page }) => {
    await showReceipt(page, "assist", {
      kind: "vat-assist-report",
      acknowledgedAt: "not a time",
      messages: [{ title: "A message", body: "Body" }],
    });

    await expect(page.locator("#assistMessages .assist-acknowledgement")).toHaveText("Acknowledged to HMRC on —");
  });

  test("names every field of an Income Tax Assist report, and the boxes of a VAT one", async ({ page }) => {
    await showReceipt(page, "itsa-assist", ITSA_ASSIST_RECEIPT);
    const content = page.locator("#receiptContent");
    for (const [field, name] of [
      ["kind", "Record type"],
      ["reportId", "Report ID"],
      ["nino", "National Insurance number"],
      ["requestedAt", "Requested"],
      ["acknowledgedAt", "Acknowledged to HMRC"],
      ["presentedLanguage", "Language of HMRC feedback"],
    ]) {
      await expect(content.locator(`[data-hmrc-field="${field}"] .field-name`)).toHaveText(name);
    }

    await showReceipt(page, "vat-assist", VAT_ASSIST_RECEIPT);
    await expect(content.locator('[data-hmrc-field="figures.vatDueSales"] .field-name')).toContainText(
      "VAT due in the period on sales and other outputs",
    );
    await expect(content.locator('[data-hmrc-field="vrn"] .field-name')).toHaveText("VAT registration number");
    await expect(content.locator('[data-hmrc-field="periodKey"] .field-name')).toHaveText("Period key");
  });

  test("names the fields of an Income Tax Assist report in Welsh on the Welsh copy", async ({ page }) => {
    const welshHtml = fs.readFileSync(path.join(process.cwd(), "web/public/cy/hmrc/receipt/receipts.html"), "utf-8");
    await page.addInitScript(() => localStorage.setItem("siteLanguage", "cy"));
    await page.route("**/*.js", async (route) => {
      if (route.request().resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });
    await servePageScripts(page);
    await serveHmrcFieldTableAssets(page);
    await serveSubmissionRecordAssets(page);
    for (const file of ["widgets/page-chrome.js", "lib/welsh-text.js"]) {
      await page.route(`**/${file}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: fs.readFileSync(path.join(process.cwd(), "web/public", file), "utf-8"),
        }),
      );
    }
    await page.route("**/cy/hmrc/receipt/receipts.html", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: welshHtml }),
    );
    await page.goto("http://localhost:3000/cy/hmrc/receipt/receipts.html", { waitUntil: "domcontentloaded" });
    await delay(200);
    await page.evaluate(async (body) => {
      window.fetchWithIdToken = async () => ({ ok: true, text: async () => JSON.stringify(body) });
      await window.viewReceipt("itsa-assist");
    }, ITSA_ASSIST_RECEIPT);

    const content = page.locator("#receiptContent");
    for (const [field, name] of [
      ["kind", "Math o gofnod"],
      ["reportId", "ID yr adroddiad"],
      ["nino", "Rhif Yswiriant Gwladol"],
      ["requestedAt", "Gofynnwyd amdano"],
      ["acknowledgedAt", "Rhoddwyd gwybod i CThEF"],
    ]) {
      await expect(content.locator(`[data-hmrc-field="${field}"] .field-name`)).toHaveText(name);
    }
  });

  test("shows a receipt that is not an object as one content row", async ({ page }) => {
    await showReceipt(page, "plain", null);

    await expect(page.locator("#receiptContent")).toContainText("Content");
    expectCleanFigures(expect, await page.locator("#receiptContent").innerText());
  });

  for (const width of [1280, 390]) {
    for (const colorScheme of ["light", "dark"]) {
      test(`lists a joint filing and a VAT row with nothing cut at ${width} px in ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT, { width, styled: true });
        await page.evaluate(async () => {
          localStorage.setItem("cognitoIdToken", "token");
          const items = [
            {
              name: "2026-10-02T09:05:00.000Z-CT1.json",
              timestamp: "2026-10-02T09:05:00.000Z",
              formBundleNumber: "RB3VJQ7ATMNZ7DXZRD3GQ4KTXY2",
              kind: "company-tax-return",
              jointFilingId: "0b8f6f0e-6d3e-4a39-9a55-2f1f4c6d8a10",
            },
            {
              name: "2026-10-02T09:00:00.000Z-CH1.json",
              timestamp: "2026-10-02T09:00:00.000Z",
              formBundleNumber: "2026100200012345678901",
              kind: "companies-house-accounts",
              jointFilingId: "0b8f6f0e-6d3e-4a39-9a55-2f1f4c6d8a10",
            },
            {
              name: "2026-10-01T09:00:00.000Z-VAT.json",
              timestamp: "2026-10-01T09:00:00.000Z",
              formBundleNumber: "256660290587",
              kind: null,
            },
          ];
          window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ receipts: items }) });
          await window.fetchReceipts();
        });
        await expect(page.locator("#receiptsTable tbody tr")).toHaveCount(2);

        const cut = await page.evaluate(() => {
          const viewport = document.documentElement.clientWidth;
          return [...document.querySelectorAll("#receiptsTable td, #receiptsTable td a")]
            .filter((el) => el.getBoundingClientRect().right > viewport || el.scrollWidth > el.clientWidth + 1)
            .map((el) => el.textContent.trim());
        });
        expect(cut).toEqual([]);
        expect(await pageScrollsSideways(page)).toBe(false);
        await page.screenshot({ path: recordScreenshotPath(`receipts-list-${colorScheme}`, width) });
      });
    }
  }

  for (const width of [1280, 390]) {
    test(`screenshot of the VAT receipt at ${width} px`, async ({ page }) => {
      await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT, { width, styled: true });
      expect(await pageScrollsSideways(page)).toBe(false);
      await page.locator("#receiptDisplay").screenshot({ path: recordScreenshotPath("receipt", width) });
    });
  }

  test("shows an ITSA receipt with nested values as Parent: field rows", async ({ page }) => {
    await showReceipt(page, "2026-10-01T09:00:00.000Z-2026-27-Q1", ITSA_RECEIPT);

    const content = page.locator("#receiptContent");
    await expect(content).not.toContainText("[Object]");
    await expect(content).not.toContainText("[Array");
    await expect(content).not.toContainText("NaN");

    await expect(content.locator('[data-hmrc-field="periodDates.periodStartDate"] .field-name')).toHaveText("Period dates: start date");
    await expect(content.locator('[data-hmrc-field="periodDates.periodStartDate"] td')).toHaveText("6 April 2026");
    await expect(content.locator('[data-hmrc-field="periodIncome.turnover"] .field-name')).toHaveText("Period income: turnover");
    await expect(content.locator('[data-hmrc-field="periodIncome.turnover"] td')).toHaveText("£12,500.50");
    await expect(content.locator('[data-hmrc-field="periodExpenses.costOfGoods"] .field-name')).toHaveText(
      "Period expenses: cost of goods",
    );
    await expect(content.locator('[data-hmrc-field="links.0.href"] .field-name')).toHaveText("Links 1: link");
    await expect(content.locator('[data-hmrc-field="isAmendment"] td')).toHaveText("No");
    await expect(content.locator('[data-hmrc-field="notes"] td')).toHaveText("—");

    const names = (await page.locator("#receiptContent .field-name").allTextContents()).join(" | ");
    expectCleanFigures(expect, names);
  });
});

test.describe("Receipts page - a practice's clients", () => {
  const BAKERY = registerCompany("00000003");
  const PROPERTIES = registerCompany("00000005");
  const PRACTICE_CLIENTS = [
    { clientId: "client-1", displayName: BAKERY.name, identifiers: { companyNumber: BAKERY.number } },
    { clientId: "client-2", displayName: PROPERTIES.name, identifiers: { companyNumber: PROPERTIES.number } },
    { clientId: "client-3", displayName: "Old Mill Ltd", archivedAt: "2026-10-01T00:00:00.000Z" },
  ];
  const OWN_FILING = {
    submissionNumber: "00003A",
    kind: "accounts",
    status: "pending",
    submittedAt: "2026-11-20T10:00:00.000Z",
    rejections: [],
  };
  const CLIENT_FILING = {
    submissionNumber: "00003B",
    kind: "accounts",
    status: "rejected",
    submittedAt: "2026-11-21T10:00:00.000Z",
    rejections: [{ rejectCode: "9999", description: "The company authentication code is wrong" }],
    clientId: "client-1",
  };

  async function openReceipts(page, { clients, welsh = false }) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route("**/*.js", async (route) => {
      if (route.request().resourceType() === "script")
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      else await route.continue();
    });
    await servePageScripts(page);
    await serveHmrcFieldTableAssets(page);
    await serveSubmissionRecordAssets(page);
    await serveSiteStyles(page);
    // The Welsh page's script text comes through page-chrome.js's siteText, from lib/welsh-text.js.
    for (const file of welsh ? ["widgets/page-chrome.js", "lib/welsh-text.js"] : []) {
      await page.route(`**/${file}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: fs.readFileSync(path.join(process.cwd(), "web/public", file)),
        }),
      );
    }
    const pagePath = welsh ? "web/public/cy/hmrc/receipt/receipts.html" : "web/public/hmrc/receipt/receipts.html";
    const base = welsh ? "http://localhost:3000/cy/hmrc/receipt/" : "http://localhost:3000/hmrc/receipt/";
    const html = fs.readFileSync(path.join(process.cwd(), pagePath), "utf-8").replace("<head>", `<head><base href="${base}">`);
    await page.route("**/receipts.html", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto(`${base}receipts.html`, { waitUntil: "domcontentloaded" });
    await delay(200);
    await page.evaluate(
      async ({ clientList, own, forClient }) => {
        localStorage.setItem("cognitoIdToken", "token");
        window.requestedUrls = [];
        window.fetchWithIdToken = async (url) => {
          window.requestedUrls.push(url);
          if (url === "/api/v1/practice/clients") {
            return clientList
              ? { ok: true, json: async () => ({ clients: clientList }) }
              : { ok: false, status: 403, json: async () => ({}) };
          }
          const clientId = new URL(url, "http://localhost").searchParams.get("clientId");
          const filingsInProgress = clientId === "client-1" ? [forClient] : clientId ? [] : [own];
          return { ok: true, json: async () => ({ receipts: [], filingsInProgress }) };
        };
        await window.showClientChoice();
        await window.fetchReceipts();
      },
      { clientList: clients, own: OWN_FILING, forClient: CLIENT_FILING },
    );
  }

  test("a practice chooses whose receipts to see, and a client's rejected filing shows under that client", async ({ page }) => {
    await openReceipts(page, { clients: PRACTICE_CLIENTS });

    const choice = page.locator("#receiptsClient");
    await expect(page.locator("#receiptsClientChoice")).toBeVisible();
    await expect(page.getByLabel("Show the receipts of")).toBeVisible();
    await expect(choice.locator("option")).toHaveText([
      "My own filings",
      `${BAKERY.name} (${BAKERY.number})`,
      `${PROPERTIES.name} (${PROPERTIES.number})`,
    ]);
    await expect(page.locator("#receiptsTable")).toContainText("00003A");
    await expect(page.locator("#receiptsTable")).not.toContainText("00003B");

    await choice.selectOption("client-1");
    await expect(page.locator("#receiptsTable")).toContainText("00003B");
    await expect(page.locator("#receiptsTable")).toContainText("The company authentication code is wrong");
    await expect(page.locator("#receiptsTable")).not.toContainText("00003A");
    expect(await page.evaluate(() => window.requestedUrls.at(-1))).toBe("/api/v1/hmrc/receipt?clientId=client-1");

    fs.mkdirSync("target/prc1", { recursive: true });
    await page.screenshot({ path: "target/prc1/receipts-practice-client-en.png", fullPage: true });
  });

  test("a slow answer for the reader's own list does not replace the list of the client chosen since", async ({ page }) => {
    await openReceipts(page, { clients: PRACTICE_CLIENTS });
    await page.evaluate(() => {
      const answer = window.fetchWithIdToken;
      window.fetchWithIdToken = async (url) => {
        if (url === "/api/v1/hmrc/receipt") await new Promise((resolve) => setTimeout(resolve, 400));
        return answer(url);
      };
      window.ownListDrawn = window.fetchReceipts();
    });

    await page.locator("#receiptsClient").selectOption("client-1");
    await expect(page.locator("#receiptsTable")).toContainText("00003B");
    await page.evaluate(() => window.ownListDrawn);

    await expect(page.locator("#receiptsTable")).toContainText("00003B");
    await expect(page.locator("#receiptsTable")).not.toContainText("00003A");
  });

  test("the Welsh page offers the same choice in Welsh", async ({ page }) => {
    await openReceipts(page, { clients: PRACTICE_CLIENTS, welsh: true });
    await expect(page.locator("#receiptsClientChoice")).toBeVisible();
    await expect(page.locator("#receiptsClient option").first()).not.toHaveText("My own filings");
    await page.locator("#receiptsClient").selectOption("client-1");
    await expect(page.locator("#receiptsTable")).toContainText("00003B");
    await expect(page.locator("#receiptsTable")).not.toContainText("Rejected by Companies House");
    fs.mkdirSync("target/prc1", { recursive: true });
    await page.screenshot({ path: "target/prc1/receipts-practice-client-cy.png", fullPage: true });
  });

  for (const [label, clients] of [
    ["a reader whose practice has no clients", []],
    ["a reader with no practice", null],
  ]) {
    test(`${label} sees no client choice and their own filings`, async ({ page }) => {
      await openReceipts(page, { clients });
      await expect(page.locator("#receiptsClientChoice")).toBeHidden();
      await expect(page.locator("#receiptsTable")).toContainText("00003A");
      expect(await page.evaluate(() => window.requestedUrls.filter((url) => url.startsWith("/api/v1/hmrc/receipt")))).toEqual([
        "/api/v1/hmrc/receipt",
      ]);
    });
  }
});
