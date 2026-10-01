// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/receipts.browser.test.js
// Browser tests for the receipts page: a stored receipt reads as plain names and nested values

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveHmrcFieldTableAssets, expectCleanFigures } from "./hmrcFieldTableAssets.js";

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

  async function showReceipt(page, name, receipt) {
    await page.route("**/*.js", async (route) => {
      if (route.request().resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });
    await serveHmrcFieldTableAssets(page);

    const modifiedHtml = htmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/receipt/">');
    await page.setContent(modifiedHtml, { url: "http://localhost:3000/hmrc/receipt/receipts.html", waitUntil: "domcontentloaded" });
    await delay(200);
    await page.evaluate(
      async ({ receiptName, body }) => {
        window.fetchWithIdToken = async () => ({ ok: true, text: async () => JSON.stringify(body) });
        await window.viewReceipt(receiptName);
      },
      { receiptName: name, body: receipt },
    );
  }

  test("shows a VAT receipt with plain names and no raw API keys", async ({ page }) => {
    await showReceipt(page, "2026-09-30T10:15:00.000Z-256660290587", VAT_RECEIPT);

    const references = page.locator("#receiptContent");
    await expect(references.locator('[data-hmrc-field="receiptName"] .field-name')).toHaveText("Receipt name");
    await expect(references.locator('[data-hmrc-field="formBundleNumber"] .field-name')).toHaveText("Form bundle number");
    await expect(references.locator('[data-hmrc-field="formBundleNumber"] td')).toHaveText("256660290587");
    await expect(references.locator('[data-hmrc-field="chargeRefNumber"] .field-name')).toHaveText("Charge reference number");
    await expect(references.locator('[data-hmrc-field="paymentIndicator"] .field-name')).toHaveText("Payment indicator");

    const names = (await page.locator("#receiptContent .field-name").allTextContents()).join(" | ");
    expectCleanFigures(expect, names);
  });

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
