// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/vatReadPages.browser.test.js
// The VAT read pages (obligations, liabilities, payments, penalties) show a dash for a field HMRC
// left out or sent unreadable, never undefined, NaN or Invalid Date, and keep a wide table inside its card.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { serveHmrcFieldTableAssets, servePageScripts, serveCarriedIdentifiers, serveSiteStyles } from "./hmrcFieldTableAssets.js";
import { serveSubmissionRecordAssets, recordScreenshotPath, pageScrollsSideways } from "./submissionRecordAssets.js";

function expectNoRawValues(text) {
  for (const raw of ["undefined", "NaN", "null", "Invalid Date", "[object"]) {
    expect(text).not.toContain(raw);
  }
}

async function openPage(page, pageName, width = 1280) {
  const html = fs
    .readFileSync(path.join(process.cwd(), `web/public/hmrc/vat/${pageName}.html`), "utf-8")
    .replace("<head>", '<head><base href="http://localhost:3000/hmrc/vat/">')
    .replace(
      "<body>",
      `<body><script>
window.showStatus = function(){};
window.hideStatus = function(){};
window.showLoading = function(){};
window.hideLoading = function(){};
window.loadEnv = function(){ return Promise.resolve({}); };
</script>`,
    );
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveSiteStyles(page);
  await serveHmrcFieldTableAssets(page);
  await serveSubmissionRecordAssets(page);
  await servePageScripts(page);
  await serveCarriedIdentifiers(page);
  await page.route(`**/hmrc/vat/${pageName}.html`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`http://localhost:3000/hmrc/vat/${pageName}.html`, { waitUntil: "domcontentloaded" });
}

test.describe("VAT read pages - fields HMRC leaves out", () => {
  test("obligations: an open obligation has no received date, and an unknown status is a dash", async ({ page }) => {
    await openPage(page, "vatObligations");
    await page.evaluate(() => {
      document.getElementById("vrn").value = "123456789";
      window.displayObligations([
        { start: "2026-07-01", end: "2026-08-31", due: "2026-10-07", status: "O" },
        { start: "2026-04-01", end: "2026-06-30", due: "2026-08-07", status: "F", received: "2026-07-30" },
        { start: "bad", end: undefined, status: "X" },
      ]);
    });

    const rows = page.locator("#obligationsTable tbody tr");
    await expect(rows.nth(0).locator("td").nth(3)).toHaveText("Not yet received");
    await expect(rows.nth(1).locator("td").nth(3)).toHaveText("30 Jul 2026");
    await expect(rows.nth(2).locator("td").nth(0)).toHaveText("—");
    await expect(rows.nth(2).locator("td").nth(1)).toHaveText("—");
    await expect(rows.nth(2).locator("td").nth(2)).toHaveText("—");
    await expect(rows.nth(2).locator("td").nth(3)).toHaveText("—");
    expectNoRawValues(await page.locator("#obligationsTable").innerText());
    expect(await page.locator("#obligationsTable").innerText()).not.toContain("Invalid Date");
  });

  test("liabilities: a missing amount, type or date is a dash, and a paid liability says Paid", async ({ page }) => {
    await openPage(page, "vatLiabilities");
    await page.evaluate(() => {
      window.displayLiabilities([
        {
          taxPeriod: { from: "2026-04-01", to: "2026-06-30" },
          type: "VAT Return Debit Charge",
          originalAmount: 1234.5,
          outstandingAmount: 100,
          due: "2026-08-07",
        },
        { taxPeriod: { from: "2026-01-01", to: "2026-03-31" }, type: "VAT Return Debit Charge", originalAmount: 900, due: "2026-05-07" },
        { taxPeriod: {}, originalAmount: "abc", outstandingAmount: "oops", due: "not a date" },
      ]);
    });

    const rows = page.locator("#liabilitiesTable tbody tr");
    await expect(rows.nth(0).locator("td").nth(3)).toHaveText("£100.00");
    await expect(rows.nth(1).locator("td").nth(3)).toHaveText("Paid");
    for (let column = 0; column < 5; column += 1) {
      await expect(rows.nth(2).locator("td").nth(column)).toHaveText("—");
    }
    const text = await page.locator("#liabilitiesTable").innerText();
    expectNoRawValues(text);
    expect(text).not.toContain("Invalid Date");
  });

  test("payments: a missing amount is a dash, an unreadable date is a dash, a payment not yet received is Pending", async ({ page }) => {
    await openPage(page, "vatPayments");
    await page.evaluate(() => {
      window.displayPayments([{ amount: 500.25, received: "2026-07-15" }, { amount: 90 }, { received: "garbage" }]);
    });

    const rows = page.locator("#paymentsTable tbody tr");
    await expect(rows.nth(0)).toContainText("£500.25");
    await expect(rows.nth(0)).toContainText("15 Jul 2026");
    await expect(rows.nth(1).locator("td").nth(1)).toHaveText("Pending");
    await expect(rows.nth(2).locator("td").nth(0)).toHaveText("—");
    await expect(rows.nth(2).locator("td").nth(1)).toHaveText("—");
    const text = await page.locator("#paymentsTable").innerText();
    expectNoRawValues(text);
    expect(text).not.toContain("Invalid Date");
  });

  test("penalties: missing fields are dashes in the summary and both tables", async ({ page }) => {
    await openPage(page, "vatPenalties");
    await page.evaluate(() => {
      window.displayPenalties({
        lateSubmissionPenalty: { summary: {}, details: [{ penaltyCategory: "point", penaltyCreationDate: "junk" }] },
        latePaymentPenalty: { details: [{ penaltyStatus: "posted", principalChargeBillingFrom: "2026-04-01" }, {}] },
        totalisations: {},
      });
    });

    const summaryText = await page.locator("#penaltiesSummary").innerText();
    expect(summaryText).toContain("Active penalty points");
    expectNoRawValues(summaryText);
    const lateSubmission = page.locator("#lateSubmissionPenaltiesTable tbody tr").first();
    await expect(lateSubmission.locator("td").nth(0)).toHaveText("Point");
    await expect(lateSubmission.locator("td").nth(1)).toHaveText("—");
    await expect(lateSubmission.locator("td").nth(2)).toHaveText("—");
    await expect(lateSubmission.locator("td").nth(4)).toHaveText("—");
    const latePayment = page.locator("#latePaymentPenaltiesTable tbody tr");
    await expect(latePayment.nth(0).locator("td").nth(3)).toHaveText("—");
    await expect(latePayment.nth(1).locator("td").nth(0)).toHaveText("—");
    const text = await page
      .locator("#penaltiesResults, #penaltiesSummary, #lateSubmissionPenaltiesTable, #latePaymentPenaltiesTable")
      .allInnerTexts();
    expectNoRawValues(text.join("\n"));
    expect(text.join("\n")).not.toContain("Invalid Date");
  });

  test("a table wider than its card scrolls inside itself at phone width", async ({ page }) => {
    await openPage(page, "vatPenalties", 390);
    await page.evaluate(() => {
      document.getElementById("penaltiesResults").style.display = "block";
      window.displayPenalties({
        latePaymentPenalty: {
          details: [
            {
              principalChargeReference: "XC00178236592",
              penaltyCategory: "LPP1",
              penaltyStatus: "posted",
              principalChargeBillingFrom: "2026-01-01",
              principalChargeBillingTo: "2026-03-31",
              penaltyAmountPosted: 12345.67,
              principalChargeDueDate: "2026-05-07",
            },
          ],
        },
      });
    });

    expect(await pageScrollsSideways(page)).toBe(false);
    await expect(page.locator("#latePaymentPenaltiesTable .table-scroll")).toHaveCount(1);
    await page.screenshot({ path: recordScreenshotPath("vatPenalties", 390) });
  });
});
