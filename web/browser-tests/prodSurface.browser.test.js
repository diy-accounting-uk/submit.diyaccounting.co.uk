// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/prodSurface.browser.test.js
//
// What a visitor sees on prod and on ci, over the real catalogue and pages: the nav, the guard
// panel on a page that is not listed in the environment, the calendar's web form links and the
// status boxes.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = process.env.PROD_SURFACE_SCREENSHOT_DIR;

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

async function serveSite(page, environmentName) {
  await page.addInitScript(() => {
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "resident@test.diyaccounting.co.uk" }));
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (url.pathname === "/api/v1/bundle") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles: [], tokensRemaining: 0 }) });
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

async function shoot(page, name) {
  if (!SCREENSHOT_DIR) return;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

test.describe("Prod surface", () => {
  test("the nav has no Practice link in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "networkidle" });
    await expect(page.locator(".main-nav a", { hasText: "Bundles" })).toBeVisible();
    await expect(page.locator('.main-nav a[data-activity="practice"]')).toBeHidden();
    await expect(page.locator(".main-nav a", { hasText: "Practice" })).toBeHidden();
  });

  test("the nav shows Practice in ci", async ({ page }) => {
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "networkidle" });
    await expect(page.locator(".main-nav a", { hasText: "Practice" })).toBeVisible();
  });

  test("an Income Tax page shows the not-available panel in place of its form in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/hmrc/itsa/dashboard.html", { waitUntil: "networkidle" });
    const panel = page.locator("#activityUnavailablePanel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Not available here yet");
    await expect(page.locator("main form")).toHaveCount(0);
    await shoot(page, "guard-prod");
  });

  for (const pagePath of ["companies-house/fileConfirmationStatement.html", "practice.html", "mcp-harness.html"]) {
    test(`${pagePath} shows the panel in prod`, async ({ page }) => {
      await serveSite(page, "prod");
      await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "networkidle" });
      // The guard reads the catalogue, imports two services and reads the viewer's settings first.
      await expect(page.locator("#activityUnavailablePanel")).toBeVisible({ timeout: 15000 });
    });
  }

  test("an Income Tax page keeps its form in ci", async ({ page }) => {
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/hmrc/itsa/dashboard.html", { waitUntil: "networkidle" });
    await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
  });

  test("a VAT page is not guarded in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/hmrc/vat/submitVat.html", { waitUntil: "networkidle" });
    await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
  });

  test("the calendar's web form links are plain text in prod except for the production rows", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/mtd-calendar.html", { waitUntil: "networkidle" });
    await expect(page.locator('a[href="hmrc/itsa/dashboard.html"]')).toHaveCount(0);
    await expect(page.locator('a[href="companies-house/fileConfirmationStatement.html"]')).toHaveCount(0);
    await expect(page.locator('a[href="hmrc/vat/submitVat.html"]')).toHaveCount(1);
    await expect(page.locator('a[href="companies-house/changeRegisteredOffice.html"]')).toHaveCount(1);
  });

  test("the calendar keeps every web form link in ci", async ({ page }) => {
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/mtd-calendar.html", { waitUntil: "networkidle" });
    await expect(page.locator('a[href="hmrc/itsa/dashboard.html"]')).toHaveCount(1);
  });

  for (const pagePath of ["bundles.html", "mcp.html", "about.html", "guide.html", "help.html", "videos.html", "videos-hmrc-itsa.html"]) {
    test(`${pagePath} lists only production features in its status box in prod`, async ({ page }) => {
      await serveSite(page, "prod");
      await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "networkidle" });
      const box = page.locator('[data-feature-status="summary"]');
      await expect(box).toContainText("HMRC VAT");
      await expect(box.locator('.status-tag[data-status="production"]')).toHaveCount(1);
      await expect(box.locator('.status-tag[data-status="sandbox"]')).toHaveCount(0);
      await expect(box).not.toContainText("Income Tax");
      await shoot(page, `${pagePath.replace(".html", "")}-status-prod`);
    });

    test(`${pagePath} lists the sandbox features in its status box in ci`, async ({ page }) => {
      await serveSite(page, "ci");
      await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "networkidle" });
      const box = page.locator('[data-feature-status="summary"]');
      await expect(box.locator('.status-tag[data-status="sandbox"]')).toHaveCount(1);
      await expect(box).toContainText("HMRC Income Tax (MTD)");
    });
  }

  test("the practice status box in ci lists the sandbox features", async ({ page }) => {
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/practice.html", { waitUntil: "networkidle" });
    await expect(page.locator('[data-feature-status="summary"] .status-tag[data-status="sandbox"]')).toHaveCount(1);
  });
});
