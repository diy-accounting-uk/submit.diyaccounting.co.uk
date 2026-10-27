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

test.describe("test-report pages layout and content", () => {
  test("the index shows the published report and no iframe of the Playwright report", async ({ page }) => {
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await serveRealSiteWithEdgePolicy(page);
    await page.goto("http://localhost:3000/tests/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#reportsContainer h2").first()).toBeVisible();
    await expect(page.locator("#reportsContainer iframe")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the index says no reports are published, without a console error, when the index file is not published", async ({ page }) => {
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await serveRealSiteWithEdgePolicy(page);
    await page.route("**/tests/test-reports-index.txt", (route) =>
      route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }),
    );
    await page.goto("http://localhost:3000/tests/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#noReportsMessage")).toBeVisible();
    expect(errors.filter((text) => /index not found/i.test(text))).toEqual([]);
  });

  test("the report page has no page-level horizontal scroll at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await serveRealSiteWithEdgePolicy(page);
    await page.goto("http://localhost:3000/tests/test-report-template.html?test=web-test-local", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#content")).toBeVisible();
    await expect(page.locator(".api-request h4").first()).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });

  test("the report page loads screenshots lazily and waits for a video to be played", async ({ page }) => {
    await serveRealSiteWithEdgePolicy(page);
    await page.goto("http://localhost:3000/tests/test-report-template.html?test=web-test-local", { waitUntil: "domcontentloaded" });
    const images = page.locator("#screenshotsSection img");
    await expect(images.first()).toBeAttached();
    const imageCount = await images.count();
    for (let index = 0; index < imageCount; index++) {
      await expect(images.nth(index)).toHaveAttribute("loading", "lazy");
      await expect(images.nth(index)).toHaveAttribute("decoding", "async");
      await expect(images.nth(index)).toHaveAttribute("width", "1280");
      await expect(images.nth(index)).toHaveAttribute("height", "1446");
    }
    const videos = page.locator("#videosSection video");
    const videoCount = await videos.count();
    for (let index = 0; index < videoCount; index++) {
      await expect(videos.nth(index)).toHaveAttribute("preload", "none");
    }
  });
});
