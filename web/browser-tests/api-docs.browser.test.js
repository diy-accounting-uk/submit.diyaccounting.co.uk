// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/api-docs.browser.test.js
// The API docs page renders swagger-ui from files the site serves itself. The page is served
// with the edge's script-src and style-src, so a script or stylesheet from any other origin is
// blocked here as it is in production.

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
      await route.abort();
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

test.describe("page load", () => {
  test("docs/api/index.html renders swagger-ui, requests nothing that is missing and logs no console error", async ({ page }) => {
    const failedRequests = [];
    const consoleErrors = [];
    const pageErrors = [];
    page.on("response", (response) => {
      if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => failedRequests.push(`failed ${request.url()}`));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await serveRealSiteWithEdgePolicy(page);
    await page.goto("http://localhost:3000/docs/api/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#swagger-ui .swagger-container")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#swagger-ui .opblock").first()).toBeVisible({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
