// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileCompanyTaxReturn.operatorPreview.browser.test.js
//
// The Company Tax Return page on prod opens only to an operator whose stored preview features
// setting is on, with a banner that says it files live; everyone else on prod sees the unavailable
// panel. On ci the page opens to anyone by its listing, with its own preview hint.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/ct600-operator-preview");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

// Serves the real site from disk, signed in, with the bundle answer a person of this kind gets.
async function serveSite(page, { environmentName, operator, previewFeatures }) {
  await page.addInitScript(() => {
    localStorage.setItem("consent.analytics", "declined");
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "person@test.diyaccounting.co.uk", sub: "person-sub" }));
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (url.pathname === "/api/v1/bundle") {
      const bundles = [{ bundleId: "resident-ltd", allocated: true, tokensRemaining: 5 }];
      if (operator) bundles.push({ bundleId: "operator", allocated: true });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bundles, tokensRemaining: 5, settings: { passGeneration: true, watchedCompanies: [], previewFeatures } }),
      });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (url.pathname === "/submit.environment-name.txt") {
      return route.fulfill({ status: 200, contentType: "text/plain", body: environmentName });
    }
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

async function openPage(page, { welsh = false } = {}) {
  const pagePath = welsh ? "cy/companies-house/fileCompanyTaxReturn.html" : "companies-house/fileCompanyTaxReturn.html";
  await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "networkidle" });
}

async function shoot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

test.describe("The Company Tax Return page on prod and on ci", () => {
  for (const width of [1280, 390]) {
    test.describe(`at ${width} px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
      });

      test("an operator with preview features on sees the page with the live banner and not the preview hint", async ({ page }) => {
        await serveSite(page, { environmentName: "prod", operator: true, previewFeatures: true });
        await openPage(page);
        const banner = page.locator("[data-operator-live]");
        await expect(banner).toBeVisible();
        await expect(banner).toContainText("Live");
        await expect(banner).toContainText("It files for real: the return goes to HMRC");
        await expect(page.locator("[data-preview-sandbox]")).toHaveCount(0);
        await expect(page.locator('main [data-feature-status="preview"]')).toBeHidden();
        await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
        await expect(page.locator("h1")).toHaveText("File a Company Tax Return (preview)");
        await shoot(page, "prod-operator-preview-on");
      });

      test("a customer sees the unavailable panel", async ({ page }) => {
        await serveSite(page, { environmentName: "prod", operator: false, previewFeatures: true });
        await openPage(page);
        await expect(page.locator("#activityUnavailablePanel")).toBeVisible();
        await expect(page.locator("#activityUnavailablePanel")).toContainText("Not available here yet");
        await expect(page.locator("[data-operator-live]")).toHaveCount(0);
        await shoot(page, "prod-customer");
      });

      test("on ci the page opens by its listing with its preview hint and no banner", async ({ page }) => {
        await serveSite(page, { environmentName: "ci", operator: false, previewFeatures: false });
        await openPage(page);
        await expect(page.locator('main [data-feature-status="preview"]')).toBeVisible();
        await expect(page.locator("[data-operator-live]")).toHaveCount(0);
        await expect(page.locator("[data-preview-sandbox]")).toHaveCount(0);
        await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
        await shoot(page, "ci");
      });
    });
  }

  test("an operator with preview features off sees the unavailable panel", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", operator: true, previewFeatures: false });
    await openPage(page);
    await expect(page.locator("#activityUnavailablePanel")).toBeVisible();
    await expect(page.locator("[data-operator-live]")).toHaveCount(0);
  });

  test("an operator with preview features on for the session only sees the unavailable panel", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("previewFeatures", "on"));
    await serveSite(page, { environmentName: "prod", operator: true, previewFeatures: false });
    await openPage(page);
    await expect(page.locator("#activityUnavailablePanel")).toBeVisible();
  });

  test("the Welsh page shows the live banner in Welsh", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", operator: true, previewFeatures: true });
    await openPage(page, { welsh: true });
    const banner = page.locator("[data-operator-live]");
    await expect(banner).toContainText("Byw");
    await expect(banner).toContainText("Mae’n ffeilio go iawn");
    await expect(page.locator("h1")).toHaveText("Ffeilio Ffurflen Dreth y Cwmni (rhagolwg)");
    await shoot(page, "prod-operator-preview-on-cy");
  });
});
