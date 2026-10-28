// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitVatStatus.browser.test.js
//
// The submit VAT page shows one status: production for a live account, sandbox for a synthetic one.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function serveRealSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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
}

async function openSubmitVat(page, { synthetic }) {
  await serveRealSite(page);
  await page.route("**/api/v1/bundle", async (route) => {
    const bundles = synthetic ? [{ bundleId: "day-guest", qualifiers: { synthetic: true } }] : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles }) });
  });
  await page.addInitScript((isSynthetic) => {
    localStorage.setItem("cognitoIdToken", "test-id-token");
    if (isSynthetic) sessionStorage.setItem("hmrcAccount", "synthetic");
  }, synthetic);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/hmrc/vat/submitVat.html", { waitUntil: "domcontentloaded" });
}

test.describe("Submit VAT status", () => {
  test("a live account reads production", async ({ page }) => {
    await openSubmitVat(page, { synthetic: false });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "production");
    await expect(banner).toContainText("Status: production.");
    await expect(page.locator("#syntheticIndicator")).toBeHidden();
  });

  test("a synthetic account reads sandbox and never production", async ({ page }) => {
    await openSubmitVat(page, { synthetic: true });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(banner).toContainText("Status: sandbox.");
    await expect(banner).not.toContainText("production");
    await expect(page.locator("#syntheticIndicator")).toBeVisible();
  });
});
