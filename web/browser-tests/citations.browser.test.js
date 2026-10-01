// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/citations.browser.test.js
// mtd-calendar.html and rates.html: page-chrome renders the site footer once and leaves each
// citation's own gov.uk link and "Retrieved" date in place.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function serveRealSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      const isFrame = route.request().resourceType() === "document";
      await route.fulfill({
        status: 200,
        contentType: isFrame ? "text/html" : "application/javascript",
        body: isFrame ? "<!doctype html><title>embed</title>" : "",
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

for (const pageName of ["mtd-calendar.html", "rates.html"]) {
  test.describe(pageName, () => {
    test("the first citation keeps its gov.uk link and Retrieved date and the site footer renders once", async ({ page }) => {
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${pageName}`, { waitUntil: "load" });
      await expect(page.locator("body > footer .footer-left")).toHaveCount(1);

      const firstCitation = page.locator("blockquote.source-quote > footer").first();
      await expect(firstCitation.locator("a[href^='https://www.gov.uk/']")).toHaveCount(1);
      await expect(firstCitation.locator(".retrieved")).toHaveText(/^Retrieved \d{1,2} \w+ \d{4}$/);
      await expect(firstCitation.locator(".footer-left")).toHaveCount(0);

      await expect(page.locator("footer .footer-left")).toHaveCount(1);
    });
  });
}
