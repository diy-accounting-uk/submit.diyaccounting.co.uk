// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/bundles.signedOut.browser.test.js
// A signed-out visitor to bundles.html and usage.html sees the signed-out panel with a Sign in
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
    await expect(panel.getByRole("heading", { name: "Sign in to see your bundles" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("#currentBundlesSection")).toBeHidden();
    await expect(page.locator("button[data-bundle-id][disabled]")).toHaveCount(0);
    await expect(page.locator("#passInput")).toBeVisible();
    await screenshotAll(page, "bundles", "bundles-signed-out");
  });

  test("bundles.html lists each bundle with its price and tokens to a signed-out visitor", async ({ page }) => {
    await serveRealSite(page, { signedIn: false });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    const catalogue = page.locator("#catalogBundles");
    await expect(catalogue).toBeVisible();
    await expect(page.getByText("Each filing uses one token.")).toHaveCount(1);
    await expect(catalogue.locator("button[data-bundle-id]").first()).toBeVisible({ timeout: 15000 });
    await expect(catalogue.locator("button[data-bundle-id='day-guest']")).toBeVisible();
    await expect(catalogue).toContainText("3 tokens for 24 hours.");
    await expect(catalogue).toContainText("100 tokens each month.");
    await expect(catalogue.getByRole("button", { name: /Subscribe £9.99\/yr — Resident VAT/ })).toBeVisible();
  });

  test("a day pass at its cap says all day passes are in use", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url) => {
        if (url.pathname === "/api/v1/bundle")
          return { bundles: [{ bundleId: "day-guest", allocated: false, bundleCapacityAvailable: false }], tokensRemaining: 0 };
        if (url.pathname === "/api/v1/pass/my-passes") return { passes: [] };
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#catalogBundles")).toContainText("All day passes are in use. Try again tomorrow, or choose a bundle.", {
      timeout: 15000,
    });
    await expect(page.locator("#catalogBundles")).not.toContainText("Global user limit");
  });

  test("usage.html shows the panel and no empty token tables", async ({ page }) => {
    await serveRealSite(page, { signedIn: false });
    await page.goto(`${SITE_ORIGIN}/usage.html`, { waitUntil: "domcontentloaded" });

    const panel = page.locator("#signedOutPanel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("#tokenSourcesTable")).toBeHidden();
    await expect(page.locator("#tokenConsumptionTable")).toBeHidden();
    await expect(page.locator("#refreshUsageBtn")).toBeHidden();
    await expect(page.getByText("Please sign in to view token usage.")).toHaveCount(0);
    await screenshotAll(page, "bundles", "usage-signed-out");
  });
});
