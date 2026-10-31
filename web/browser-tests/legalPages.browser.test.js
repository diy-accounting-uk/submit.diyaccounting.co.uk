// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/legalPages.browser.test.js
//
// The three legal pages show their last-updated date in en-GB words and pass the reader-view check.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { assertReaderView } from "../../behaviour-tests/helpers/behaviour-helpers.js";

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

const legalPages = [
  ["privacy.html", "31 October 2026"],
  ["terms.html", "31 October 2026"],
  ["accessibility.html", "9 September 2026"],
];

test.describe("Legal pages", () => {
  for (const [file, date] of legalPages) {
    test(`${file} shows its last-updated date as ${date} and reads cleanly`, async ({ page }) => {
      await serveRealSite(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`http://localhost:3000/${file}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".legal-meta")).toHaveText(`Last updated: ${date}`);
      await assertReaderView(page);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: `target/screenshots/${file.replace(".html", "")}-${width}.png`, fullPage: true });
      }
    });
  }
});
