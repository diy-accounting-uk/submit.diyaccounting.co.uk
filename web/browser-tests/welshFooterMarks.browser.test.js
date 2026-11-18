// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshFooterMarks.browser.test.js
//
// On a Welsh copy, a footer link to an English-only page shows a gap between its name and its "(yn Saesneg)" mark.

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

async function serveSite(page) {
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

test.describe("Welsh footer marks", () => {
  for (const width of [1280, 390]) {
    test(`each "(yn Saesneg)" mark in the footer stands apart from its link name at ${width}px`, async ({ page }) => {
      await serveSite(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://localhost:3000/cy/index.html", { waitUntil: "load" });
      const marks = page.locator(".footer-links a .lang-mark");
      await expect(marks.first()).toBeVisible();
      const gaps = await marks.evaluateAll((spans) =>
        spans.map((span) => {
          const range = document.createRange();
          range.selectNodeContents(span.parentElement);
          range.setEndBefore(span);
          const name = range.getBoundingClientRect();
          return span.getBoundingClientRect().left - name.right;
        }),
      );
      expect(gaps.length).toBeGreaterThan(0);
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(3);
    });
  }
});
