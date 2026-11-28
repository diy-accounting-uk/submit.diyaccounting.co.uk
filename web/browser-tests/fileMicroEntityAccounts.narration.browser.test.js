// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.narration.browser.test.js
// Filing the accounts says what the page is doing: the request is held open here, so the first
// stage's message is what the reader sees.

import { test, expect } from "@playwright/test";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

test("sending the accounts says so before Companies House answers", async ({ page }) => {
  await serveRealSite(page, {
    signedIn: true,
    apiHandler: (url) => (url.pathname === "/api/v1/bundle" ? { bundles: [{ bundleId: "resident-ltd", allocated: true }] } : undefined),
  });
  await page.goto(`${SITE_ORIGIN}/companies-house/fileMicroEntityAccounts.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.getElementById("companyAuthCode").value = "ABC123";
    window.buildAccountsPayload = () => ({});
    window.submitMicroEntityAccounts = () => new Promise(() => {});
    // eslint-disable-next-line no-undef -- the page's own filing step
    handleSubmitFiling();
  });
  await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the accounts to Companies House...");
});
