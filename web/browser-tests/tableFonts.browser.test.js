// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/tableFonts.browser.test.js
//
// A table heading is words in the text font. A cell of figures takes the figures font; a cell of words
// in a .table-words table takes the text font.

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
  ".txt": "text/plain",
};

async function openPage(page, pagePath, width) {
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
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "domcontentloaded" });
}

const fontOf = (locator) => locator.evaluate((element) => getComputedStyle(element).fontFamily);

test.describe("Table fonts", () => {
  for (const width of [1280, 390]) {
    test(`a rates table's headings use the text font and its figures the figures font at ${width}px`, async ({ page }) => {
      await openPage(page, "rates.html", width);
      const table = page.locator("table.rates-table").nth(1);
      await expect(table).toBeAttached();
      expect(await fontOf(table.locator("thead th").first())).toMatch(/^Arial/);
      expect(await fontOf(table.locator("tbody th").first())).toMatch(/^Arial/);
      expect(await fontOf(table.locator("tbody td").first())).toMatch(/^"?Atkinson Hyperlegible/);
    });

    test(`the calendar's business type table uses the text font for its headings and its word cells at ${width}px`, async ({ page }) => {
      await openPage(page, "mtd-calendar.html", width);
      const table = page.locator("table.deadline-table.table-words").first();
      await expect(table).toBeAttached();
      expect(await fontOf(table.locator("thead th").first())).toMatch(/^Arial/);
      expect(await fontOf(table.locator("tbody td").first())).toMatch(/^Arial/);
    });
  }
});
