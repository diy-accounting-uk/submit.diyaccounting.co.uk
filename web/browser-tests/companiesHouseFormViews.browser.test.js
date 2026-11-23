// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companiesHouseFormViews.browser.test.js
// Each Companies House form that files through the shared filing route moves between its views, the
// company, the form, the review and the result, and a message shown on one view is not left above
// the next.

import { test, expect } from "@playwright/test";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

const FORMS = [
  "appointOfficer",
  "ceasePsc",
  "changeAccountingRefDate",
  "changeCompanyName",
  "changeOfficer",
  "changePscDetails",
  "notifyPsc",
  "pscStatements",
  "recordsLocation",
  "removeOfficer",
];

for (const form of FORMS) {
  test(`${form}: an error shown on one view is gone when the reader starts a new filing`, async ({ page }) => {
    await serveRealSite(page, { signedIn: true });
    await page.goto(`${SITE_ORIGIN}/companies-house/${form}.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#companyView")).toBeVisible();
    await page.evaluate(() => window.showStatus("Enter the date the change took effect.", "error"));
    const messages = page.locator("#statusMessagesContainer");
    await expect(messages).toContainText("Enter the date the change took effect.");

    await page.locator("#startAgainBtn").dispatchEvent("click");
    await expect(page.locator("#companyView")).toBeVisible();
    await expect(messages).not.toContainText("Enter the date the change took effect.");
  });
}

for (const form of FORMS) {
  test(`${form}: a second refusal replaces the first`, async ({ page }) => {
    await serveRealSite(page, { signedIn: true });
    await page.goto(`${SITE_ORIGIN}/companies-house/${form}.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#companyView")).toBeVisible();
    const messages = page.locator("#statusMessagesContainer");

    await page.evaluate(() => window.showError("The first answer is refused."));
    await expect(messages).toContainText("The first answer is refused.");
    await page.evaluate(() => window.showError("The second answer is refused."));

    await expect(messages).toContainText("The second answer is refused.");
    await expect(messages).not.toContainText("The first answer is refused.");
  });
}
