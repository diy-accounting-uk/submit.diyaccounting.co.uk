// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitVatFonts.browser.test.js
//
// On the submit VAT page a box's label and hint are words in the text font; only the amount takes the figures font.

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
  ".woff2": "font/woff2",
};

async function openSubmitVat(page, width) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: url.pathname === "/api/v1/bundle" ? '{"bundles":[]}' : "{}",
      });
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
  await page.addInitScript(() => localStorage.setItem("cognitoIdToken", "test-id-token"));
  await page.setViewportSize({ width, height: 900 });
  await page.goto("http://localhost:3000/hmrc/vat/submitVat.html", { waitUntil: "domcontentloaded" });
}

const fontOf = (locator) => locator.evaluate((element) => getComputedStyle(element).fontFamily);
const columnNameFontOf = (locator) => locator.evaluate((element) => getComputedStyle(element, "::before").fontFamily);

test.describe("Submit VAT box fonts", () => {
  for (const width of [1280, 390]) {
    test(`a box label and hint use the text font and the amount the figures font at ${width}px`, async ({ page }) => {
      await openSubmitVat(page, width);
      const label = page.locator('label[for="vatDueSales"]');
      await expect(label).toBeVisible();
      expect(await fontOf(label)).toMatch(/^Arial/);
      expect(await fontOf(page.locator("#vatDueSales-hint"))).toMatch(/^Arial/);
      expect(await fontOf(page.locator("#vatDueSales"))).toMatch(/^"?Atkinson Hyperlegible/);
      if (width < 600) expect(await columnNameFontOf(page.locator("#vatDueSales").locator("xpath=ancestor::td[1]"))).toMatch(/^Arial/);
    });
  }
});
