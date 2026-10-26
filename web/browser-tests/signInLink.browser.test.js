// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/signInLink.browser.test.js
// A signed-out visitor on a page two directories deep follows the header's Log in link and lands
// on /auth/login.html, not on a path nested under the page's own directory.

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
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function serveRealSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost" || url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const filePath = path.join(PUBLIC_ROOT, pathname === "/" ? "/index.html" : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

for (const pagePath of ["hmrc/vat/vatObligations.html", "hmrc/itsa/dashboard.html"]) {
  test(`${pagePath} Log in link leads to /auth/login.html with nothing missing and no console error`, async ({ page }) => {
    const failedRequests = [];
    const consoleErrors = [];
    page.on("response", (response) => {
      if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await serveRealSite(page);
    await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "domcontentloaded" });
    const loginLink = page.locator("a.login-link");
    await expect(loginLink).toHaveAttribute("href", "/auth/login.html");
    await loginLink.click();
    await page.waitForURL("**/auth/login.html");
    expect(new URL(page.url()).pathname).toBe("/auth/login.html");
    await page.waitForLoadState("networkidle");
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
