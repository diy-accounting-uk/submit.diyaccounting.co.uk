// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/hmrcAssistReceipts.browser.test.js
// Browser tests for Assist report receipts: messages display verbatim in order with links

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveHmrcFieldTableAssets } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VAT_ASSIST_REPORT = {
  kind: "vat-assist-report",
  reportId: "12345-report-id",
  correlationId: "abc123def456",
  vrn: "123456789",
  periodKey: "26A1",
  messages: [
    {
      title: "Review the VAT on purchases (input tax)",
      body: "The input tax is lower than expected compared to other businesses in your sector.",
      action: "REVIEW",
      path: "vatReclaimedCurrPeriod",
      links: [
        {
          title: "Read guidance on VAT returns",
          url: "https://www.gov.uk/guidance/vat-returns",
        },
        { title: "Unsafe link", url: "javascript:alert(1)" },
      ],
    },
    { title: "Second message", body: "Shown after the first.", links: [] },
  ],
  figures: { vatDueSales: 100 },
  requestedAt: "2026-09-30T10:15:00.000Z",
};

test.describe("Receipts page - HMRC Assist reports", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/receipt/receipts.html"), "utf-8");
  });

  async function showAssistReceipt(page, name, receipt) {
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

  test("shows VAT Assist report messages with title and body", async ({ page }) => {
    await showAssistReceipt(page, "2026-09-30T10:15:00.000Z-assist-123", VAT_ASSIST_REPORT);

    const content = page.locator("#assistMessages");

    await expect(content).toContainText("HMRC feedback");

    await expect(content).toContainText("Review the VAT on purchases (input tax)");

    await expect(content).toContainText("The input tax is lower than expected");

    await expect(content).toContainText("Read guidance on VAT returns");

    await expect(content).toContainText("vatReclaimedCurrPeriod");
  });

  test("renders messages in order, as text, with only http(s) links, and the acknowledgement state", async ({ page }) => {
    await showAssistReceipt(page, "assist-1", {
      ...VAT_ASSIST_REPORT,
      acknowledgedAt: "2026-09-30T11:00:00.000Z",
    });
    const messages = page.locator("#assistMessages .assist-message");
    await expect(messages).toHaveCount(2);
    await expect(messages.nth(0)).toContainText("Review the VAT on purchases");
    await expect(messages.nth(1)).toContainText("Second message");
    await expect(page.locator("#assistMessages a")).toHaveCount(1);
    await expect(page.locator("#assistMessages a")).toHaveAttribute("href", "https://www.gov.uk/guidance/vat-returns");
    await expect(page.locator("#assistMessages .assist-acknowledgement")).toContainText("Acknowledged to HMRC");
  });

  test("shows an unacknowledged report as not acknowledged", async ({ page }) => {
    await showAssistReceipt(page, "assist-2", VAT_ASSIST_REPORT);
    await expect(page.locator("#assistMessages .assist-acknowledgement")).toHaveText("Not acknowledged to HMRC");
  });

  test("shows receipt details table below messages", async ({ page }) => {
    await showAssistReceipt(page, "2026-09-30T10:15:00.000Z-assist-123", VAT_ASSIST_REPORT);

    const content = page.locator("#receiptContent");

    await expect(page.locator("#assistMessages")).toContainText("HMRC feedback");
    await expect(content).toContainText("Vrn");
    await expect(content).toContainText("123456789");
    await expect(content).toContainText("Report id");
    await expect(content).toContainText("12345-report-id");
  });
});
