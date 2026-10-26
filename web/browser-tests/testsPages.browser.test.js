// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/testsPages.browser.test.js
// The test-report pages run their scripts from files. The pages are served with the edge's
// script-src, which has no 'unsafe-inline', so an inline script is blocked here as it is in production.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
};
const EDGE_CSP =
  "default-src 'self'; " +
  "script-src 'self' https://client.rum.us-east-1.amazonaws.com https://www.googletagmanager.com https://accounts.google.com https://apis.google.com https://www.gstatic.com; " +
  "style-src 'self' 'unsafe-inline' https://www.gstatic.com; img-src 'self' data:; connect-src 'self'";

async function serveRealSiteWithEdgePolicy(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        headers: { "content-security-policy": EDGE_CSP },
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

test.describe("test-report pages under the edge script policy", () => {
  for (const pagePath of ["tests/index.html", "tests/test-report-template.html?test=web-test"]) {
    test(`${pagePath} raises no content security policy violation`, async ({ page }) => {
      const violations = [];
      page.on("console", (message) => {
        if (message.type() === "error" && /Content Security Policy/i.test(message.text())) violations.push(message.text());
      });
      await serveRealSiteWithEdgePolicy(page);
      await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      expect(violations).toEqual([]);
    });
  }
});
