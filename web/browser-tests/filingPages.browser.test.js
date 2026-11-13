// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/filingPages.browser.test.js
// The filing landing pages: one h1, screenshots that load, a due date with its source, the action,
// and the footer links to every page.

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

const FILING_PAGES = [
  ["vat-return-from-a-spreadsheet.html", "How to file a VAT return from a spreadsheet"],
  ["micro-entity-accounts.html", "How to file micro-entity accounts at Companies House"],
  ["small-company-accounts.html", "How to file small company accounts at Companies House"],
  ["dormant-company-accounts.html", "How to file dormant company accounts at Companies House"],
  ["confirmation-statement.html", "How to file a confirmation statement (CS01)"],
];

for (const [file, heading] of FILING_PAGES) {
  test.describe(file, () => {
    test("shows its h1, its first screenshot, a due date with a source and the action", async ({ page }) => {
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${file}`, { waitUntil: "load" });
      await expect(page.locator("h1")).toHaveText(heading);
      await expect(page.locator("h1")).toHaveCount(1);

      const firstImage = page.locator(".guide-step img").first();
      await firstImage.scrollIntoViewIfNeeded();
      await expect.poll(() => firstImage.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);

      await expect(page.locator("blockquote.source-quote a[href^='https://www.gov.uk/']")).toHaveCount(1);
      await expect(page.locator("main a.btn").first()).toBeVisible();
    });

    test("the footer holds a link to each filing page", async ({ page }) => {
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${file}`, { waitUntil: "load" });
      await expect(page.locator("body > footer .footer-links")).toHaveCount(1);
      for (const [target] of FILING_PAGES) await expect(page.locator(`body > footer .footer-links a[href="${target}"]`)).toHaveCount(1);
    });
  });
}

test("the home page links to each filing page", async ({ page }) => {
  await serveRealSite(page);
  await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
  for (const [target] of FILING_PAGES) await expect(page.locator(`nav.filing-guides a[href="${target}"]`)).toHaveCount(1);
});
