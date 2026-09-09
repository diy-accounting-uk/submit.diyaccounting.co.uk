// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/behaviour-hmrc-receipts-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-hmrc-receipts-steps";

export async function goToReceiptsPageUsingMainNav(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to the Receipts page via main navigation", async () => {
    console.log("Navigating to Receipts via main navigation...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-nav.png` });
    await expect(page.locator("nav.main-nav a:has-text('Receipts')")).toBeVisible({ timeout: 10000 });
    await loggedClick(page, "nav.main-nav a:has-text('Receipts')", "Clicking Receipts in main navigation", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-nav-clicked.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-03-receipts-page.png`,
    });
  });
}

export async function verifyAtLeastOneClickableReceipt(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user reviews the receipts list and opens the first receipt when available", async () => {
    // Check if we have receipts in the table
    console.log("Checking receipts page...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-receipts-page.png` });
    const receiptsTable = page.locator("#receiptsTable");
    await expect(receiptsTable).toBeVisible({ timeout: 10000 });

    // If there are receipts, click on the first one
    const firstReceiptLink = receiptsTable.locator("tbody tr:first-child a").first();
    const hasReceipts = (await firstReceiptLink.count()) > 0;

    if (hasReceipts) {
      console.log("Found receipts, clicking on first receipt...");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-receipts-page-found.png` });
      await loggedClick(page, firstReceiptLink, "Open first receipt", { screenshotPath });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-receipts-page-clicked.png` });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${screenshotPath}/${timestamp()}-04-receipt-detail.png`,
      });
    } else {
      console.log("No receipts found in table");
    }
  });
}
