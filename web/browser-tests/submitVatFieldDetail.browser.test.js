// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitVatFieldDetail.browser.test.js
//
// Each box of the VAT return links to its section of VAT Notice 700/12 and says where its figure sits
// in DIY Accounting's VAT workbook. A return that HMRC refuses is narrated stage by stage and leaves
// the failure panel: what was filed, where the answers are, and what HMRC's error means.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOTS = "target/screenshots/vat-field-detail";
const GRANT_ID = "0a1b2c3d-0a1b-4a1b-8a1b-0a1b2c3d4e5f";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const HELD_DAY_PASS = [{ bundleId: "day-guest", allocated: true, tokensGranted: 3, tokensRemaining: 3 }];

const STORED_RETURN = {
  vatNumber: "123456789",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  vatDueSales: 100,
  vatDueAcquisitions: 0,
  totalVatDue: 90,
  vatReclaimedCurrPeriod: 20,
  netVatDue: 70,
  totalValueSalesExVAT: 500,
  totalValuePurchasesExVAT: 100,
  totalValueGoodsSuppliedExVAT: 0,
  totalAcquisitionsExVAT: 0,
  finalised: true,
};

// The real page with the API answered here. returnAnswers are the VAT return route's answers in turn.
async function openSubmitVat(page, { returnAnswers = [], session = {} } = {}) {
  let returnCalls = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      let answer = { status: 200, body: {} };
      if (url.pathname === "/api/v1/bundle") answer = { status: 200, body: { bundles: HELD_DAY_PASS } };
      if (url.pathname === "/api/v1/hmrc/vat/return") answer = returnAnswers[Math.min(returnCalls++, returnAnswers.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, answer.delayMs ?? 0));
      await route.fulfill({
        status: answer.status,
        contentType: "application/json",
        headers: answer.headers ?? {},
        body: JSON.stringify(answer.body),
      });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
  await page.addInitScript((stored) => {
    localStorage.setItem("siteLanguage", "en");
    localStorage.setItem("consent.analytics", "declined");
    localStorage.setItem("cognitoIdToken", "test-id-token");
    for (const [key, value] of Object.entries(stored)) sessionStorage.setItem(key, value);
    // Every status message the reader is shown, in the order shown.
    window.__shownMessages = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.classList.contains("status-message")) window.__shownMessages.push(node.textContent.trim());
        }
      }
    }).observe(document, { childList: true, subtree: true });
  }, session);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/hmrc/vat/submitVat.html", { waitUntil: "load" });
}

test.describe("VAT return box detail", () => {
  test("each box's note links to its section of VAT Notice 700/12", async ({ page }) => {
    await openSubmitVat(page);
    for (const [id, box] of [
      ["vatDueSales", 1],
      ["vatDueAcquisitions", 2],
      ["totalVatDue", 3],
      ["vatReclaimedCurrPeriod", 4],
      ["netVatDue", 5],
      ["totalValueSalesExVAT", 6],
      ["totalValuePurchasesExVAT", 7],
      ["totalValueGoodsSuppliedExVAT", 8],
      ["totalAcquisitionsExVAT", 9],
    ]) {
      const link = page.locator(`#${id}-hint a[data-notice]`);
      await expect(link).toHaveText(`VAT Notice 700/12, box ${box}`);
      await expect(link).toHaveAttribute(
        "href",
        `https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012#filling-in-box-${box}`,
      );
    }
    await expect(page.locator("#vatDueSales-hint")).toHaveText(
      "Enter an amount with up to 2 decimal places, for example £600 or £193.54. VAT Notice 700/12, box 1.",
    );
  });

  test("a box's disclosure names the workbook cell, its label and a picture of it", async ({ page }) => {
    await openSubmitVat(page);
    const box1 = page.locator("#vatDueSales-source");
    await expect(box1.locator("summary")).toHaveText("In DIY Accounting's spreadsheets");
    await box1.locator("summary").click();
    await expect(box1.locator("dl")).toContainText("Vatreturns.xlsx");
    await expect(box1.locator("dl")).toContainText("VATQtr1");
    await expect(box1.locator("dl")).toContainText("G9");
    await expect(box1.locator("dl")).toContainText("VAT due on sales");
    await expect(box1).toContainText("Sheets VATQtr2 to VATQtr5 hold the same cell for the later quarters.");
    const picture = box1.locator("img");
    await expect(picture).toHaveAttribute("src", "/images/ct600-sources/VATQtr1-G9.webp");
    await expect.poll(() => picture.evaluate((image) => image.complete && image.naturalWidth)).toBeGreaterThan(0);

    const box3 = page.locator("#totalVatDue-source");
    await box3.locator("summary").click();
    await expect(box3).toContainText("The spreadsheet labels box 3 with the words of box 1.");

    const box8 = page.locator("#totalValueGoodsSuppliedExVAT-source");
    await box8.locator("summary").click();
    await expect(box8).toContainText("The spreadsheets have no cell for this.");

    fs.mkdirSync(SCREENSHOTS, { recursive: true });
    await page.locator("#vatDueSales").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENSHOTS}/boxes-1-to-3-1280.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#vatDueSales-source").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENSHOTS}/box-1-390.png` });
  });
});

test.describe("VAT return stages and failure panel", () => {
  test("a refused return is narrated stage by stage, then the panel says what HMRC's error means", async ({ page }) => {
    await openSubmitVat(page, {
      session: { hmrcGrantId: GRANT_ID, hmrcTokenScope: "write:vat read:vat", submission_data: JSON.stringify(STORED_RETURN) },
      returnAnswers: [
        { status: 202, headers: { "x-request-id": "req-vat-1" }, body: {}, delayMs: 300 },
        {
          status: 400,
          delayMs: 1500,
          body: { message: "HMRC rejected the return", responseBody: { code: "VAT_TOTAL_VALUE", message: "Total VAT due is wrong" } },
        },
      ],
    });

    const panel = page.locator("#failureDetail");
    await expect(panel).toBeVisible({ timeout: 15000 });
    const shown = await page.evaluate(() => window.__shownMessages);
    const order = ["Checking your answers...", "Sending the return to HMRC...", "Waiting for HMRC's answer..."].map((stage) =>
      shown.findIndex((text) => text.includes(stage)),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    await expect(panel.locator("h2")).toHaveText("What happened");
    await expect(panel.locator('[data-part="sent"]')).toHaveText("HMRC did not take the return. Nothing was filed.");
    await expect(panel.locator('[data-part="answers"]')).toHaveText(
      "Your answers are still in this form and saved in this browser until you close the tab.",
    );
    await expect(panel.locator('[data-part="kind"]')).toHaveText("HMRC did not accept box 3: it must be box 1 plus box 2.");
    await expect(panel.locator('[data-part="errors"]')).toHaveText("Total VAT due is wrong");
    await expect(page.locator("#vatForm")).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("hmrcGrantId"))).toBe(null);

    fs.mkdirSync(SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: `${SCREENSHOTS}/failure-panel-1280.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENSHOTS}/failure-panel-390.png` });
  });

  test("a return with no answer from HMRC says it cannot tell whether HMRC has it", async ({ page }) => {
    await openSubmitVat(page, {
      session: { hmrcGrantId: GRANT_ID, hmrcTokenScope: "write:vat read:vat", submission_data: JSON.stringify(STORED_RETURN) },
      returnAnswers: [{ status: 502, body: { message: "Bad gateway" } }],
    });

    const panel = page.locator("#failureDetail");
    await expect(panel.locator('[data-part="sent"]')).toContainText("Submit did not get HMRC's answer");
    await expect(panel.locator('[data-part="kind"]')).toHaveText("This is a fault in Submit, not in your answers or your sign-in.");
  });
});
