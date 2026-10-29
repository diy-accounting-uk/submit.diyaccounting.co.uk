// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/homeActivities.browser.test.js
//
// The home page's activity buttons for a Resident account, over the real catalogue: every
// button opens a page, and an activity with no page has no button.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = process.env.HOME_SCREENSHOT_DIR;

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const RESIDENT_BUNDLES = {
  bundles: [{ bundleId: "resident", allocated: true, subscriptionStatus: "active", tokensGranted: 100 }],
  tokensRemaining: 100,
};

async function serveHomeForResident(page, environmentName = "proxy") {
  await page.addInitScript(() => {
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "resident@test.diyaccounting.co.uk" }));
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (url.pathname === "/api/v1/bundle") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESIDENT_BUNDLES) });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (url.pathname === "/submit.environment-name.txt")
      return route.fulfill({ status: 200, contentType: "text/plain", body: environmentName });
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
}

test.describe("Home page activities for a Resident account", () => {
  test("every activity button opens a page, and an activity with no page has no button", async ({ page }) => {
    await serveHomeForResident(page);
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const buttons = page.locator("#dynamicActivities .activity-group button.btn:not([disabled])");
    await expect(buttons.first()).toBeVisible();
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    await expect(page.locator("#dynamicActivities")).not.toContainText("PSC");
    await expect(page.locator("#dynamicActivities")).not.toContainText(/Save diya-gl books/i);

    if (SCREENSHOT_DIR) {
      const size = page.viewportSize().width;
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `home-resident-${size}.png`), fullPage: true });
    }

    for (let index = 0; index < count; index += 1) {
      await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
      await expect(buttons.nth(index)).toBeVisible();
      await buttons.nth(index).click();
      await page.waitForURL((url) => url.pathname !== "/" || url.hash !== "");
      expect(new URL(page.url()).pathname).toMatch(/\.html$/);
    }
  });

  test("the status box and subtitle list only what the catalogue lists for prod", async ({ page }) => {
    await serveHomeForResident(page, "prod");
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const box = page.locator("#featureStatusList");
    await expect(box.locator('.status-tag[data-status="production"]')).toBeVisible();
    await expect(box).toContainText("HMRC VAT");
    await expect(box.locator('.status-tag[data-status="sandbox"]')).toHaveCount(0);
    await expect(box.locator('.status-tag[data-status="preview"]')).toHaveCount(0);
    await expect(box).not.toContainText(/Income Tax|Assist|Company Tax Return|PSC|accounts/i);
    await expect(page.locator("#homeSubtitle")).toContainText("VAT returns");
    await expect(page.locator("#homeSubtitle")).not.toContainText("Income Tax");
  });

  test("the status box lists sandbox and preview features where the catalogue lists them", async ({ page }) => {
    await serveHomeForResident(page, "ci");
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const box = page.locator("#featureStatusList");
    await expect(box.locator('.status-tag[data-status="sandbox"]')).toBeVisible();
    await expect(box.locator("li", { hasText: "Preview" })).toContainText("HMRC Assist for VAT");
    await expect(box.locator("li", { hasText: "Sandbox" })).toContainText("HMRC Income Tax (MTD)");
    await expect(page.locator("#homeSubtitle")).toContainText("Income Tax updates");
  });
});
