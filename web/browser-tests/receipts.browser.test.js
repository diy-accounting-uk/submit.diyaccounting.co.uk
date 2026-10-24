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

  test("shows a receipt that is not an object as one content row", async ({ page }) => {
    await showReceipt(page, "plain", null);

    await expect(page.locator("#receiptContent")).toContainText("Content");
    expectCleanFigures(expect, await page.locator("#receiptContent").innerText());
  });

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
