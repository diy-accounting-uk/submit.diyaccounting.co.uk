// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitVatStatus.browser.test.js
//
// Each VAT page shows one status: production for a live account, sandbox for a synthetic one, and the
// submit page and the read pages agree.

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

async function openVatPage(page, pageName, { synthetic }) {
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
  await page.goto(`http://localhost:3000/hmrc/vat/${pageName}`, { waitUntil: "domcontentloaded" });
}

test.describe("Submit VAT status", () => {
  test("a live account reads production", async ({ page }) => {
    await openVatPage(page, "submitVat.html", { synthetic: false });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "production");
    await expect(banner).toContainText("Status: production.");
    await expect(page.locator("#syntheticIndicator")).toBeHidden();
  });

  test("a synthetic account reads sandbox and never production", async ({ page }) => {
    await openVatPage(page, "submitVat.html", { synthetic: true });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(banner).toContainText("Status: sandbox.");
    await expect(banner).not.toContainText("production");
    await expect(page.locator("#syntheticIndicator")).toBeVisible();
  });
});

const VAT_PAGES = [
  "submitVat.html",
  "vatObligations.html",
  "vatLiabilities.html",
  "vatPayments.html",
  "vatPenalties.html",
  "viewVatReturn.html",
];

async function statusOf(page, pageName, synthetic) {
  await openVatPage(page, pageName, { synthetic });
  const banner = page.locator("p.hint[data-feature-status]").first();
  await expect(banner).toContainText("Status: ");
  return banner.getAttribute("data-feature-status");
}

test.describe("VAT pages agree on the status", () => {
  for (const pageName of VAT_PAGES) {
    test(`${pageName} reads sandbox for a synthetic account`, async ({ page }) => {
      await openVatPage(page, pageName, { synthetic: true });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(banner).toContainText("Status: sandbox.");
      await expect(banner).not.toContainText("production");
    });
  }

  for (const synthetic of [false, true]) {
    test(`the obligations page shows the submit page's status for a ${synthetic ? "synthetic" : "live"} account`, async ({ page }) => {
      const submitStatus = await statusOf(page, "submitVat.html", synthetic);
      const obligationsStatus = await statusOf(page, "vatObligations.html", synthetic);
      expect(obligationsStatus).toBe(submitStatus);
      expect(obligationsStatus).toBe(synthetic ? "sandbox" : "production");
    });
  }
});
