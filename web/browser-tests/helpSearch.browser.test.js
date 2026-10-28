// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/helpSearch.browser.test.js
//
// The help page finds an answer for Self Assessment and for Companies House, at phone and desktop width.

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

const searches = [
  ["Self Assessment", "self-assessment-itsa"],
  ["Companies House", "companies-house-filings"],
];

test.describe("Help search", () => {
  for (const width of [390, 1280]) {
    for (const [query, faqId] of searches) {
      test(`searching "${query}" at ${width}px shows its answer`, async ({ page }) => {
        await serveRealSite(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto("http://localhost:3000/help.html", { waitUntil: "domcontentloaded" });
        await page.locator("#faq-search").fill(query);
        const result = page.locator(`.faq-item[data-id="${faqId}"]`);
        await expect(result).toBeVisible();
        await result.locator(".faq-question").click();
        await expect(result.locator(".faq-answer")).toBeVisible();
        await expect(result.locator(".faq-answer")).toContainText(query === "Self Assessment" ? "sandbox" : "Companies House");
      });
    }
  }
});
