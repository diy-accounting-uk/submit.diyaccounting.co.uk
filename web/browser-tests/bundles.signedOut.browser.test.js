// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/bundles.signedOut.browser.test.js
// A signed-out visitor to bundles.html and usage.html sees the signed-out panel with a Log in
// button, and no disabled request button or empty token table.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN, screenshotAll } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("signed-out bundles and usage pages", () => {
  test("bundles.html shows the panel and no disabled bundle button", async ({ page }) => {
    await serveRealSite(page, { signedIn: false });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    const panel = page.locator("#signedOutPanel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(page.locator("#catalogBundles")).toBeHidden();
    await expect(page.locator("button[data-bundle-id][disabled]")).toHaveCount(0);
    await expect(page.locator("#passInput")).toBeVisible();
    await screenshotAll(page, "bundles", "bundles-signed-out");
  });

  test("bundles.html?pass= shows a signed-out visitor the offer and the price after it", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: false,
      apiHandler: (url) => (url.pathname === "/api/v1/pass" ? { valid: true, bundleId: "week-guest" } : undefined),
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html?pass=some-valid-pass-code`, { waitUntil: "domcontentloaded" });

    const offer = page.locator("#passOffer");
    await expect(offer).toBeVisible();
    await expect(offer).toContainText("3 VAT submissions free for 7 days");
    await expect(offer).toContainText("£0.99 a month or £9.99 a year");
    await expect(offer).toContainText("Government Gateway");
    await expect(page.locator("#signedOutPanel")).toBeVisible();
    await screenshotAll(page, "bundles", "bundles-signed-out-pass-offer");
  });

  test("bundles.html without a pass shows no offer", async ({ page }) => {
    await serveRealSite(page, { signedIn: false });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#signedOutPanel")).toBeVisible();
    await expect(page.locator("#passOffer")).toBeHidden();
  });

  test("usage.html shows the panel and no empty token tables", async ({ page }) => {
    await serveRealSite(page, { signedIn: false });
    await page.goto(`${SITE_ORIGIN}/usage.html`, { waitUntil: "domcontentloaded" });

    const panel = page.locator("#signedOutPanel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(page.locator("#tokenSourcesTable")).toBeHidden();
    await expect(page.locator("#tokenConsumptionTable")).toBeHidden();
    await expect(page.locator("#refreshUsageBtn")).toBeHidden();
    await expect(page.getByText("Please log in to view token usage.")).toHaveCount(0);
    await screenshotAll(page, "bundles", "usage-signed-out");
  });
});
