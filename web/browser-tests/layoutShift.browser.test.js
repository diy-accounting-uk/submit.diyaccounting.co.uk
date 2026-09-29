// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/layoutShift.browser.test.js
//
// Cumulative layout shift guard. Serves the real static site from disk with
// every data response delayed, so content that fills in after first paint
// (activity buttons, bundle cards) shows the shift a phone on a slow link sees.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const DATA_RESPONSE_DELAY_MS = 400;
const CLS_LIMIT = 0.1;

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

async function serveRealSiteWithSlowData(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "user@example.com" }));
    } catch {}
    window.__cumulativeLayoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cumulativeLayoutShift += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await delay(DATA_RESPONSE_DELAY_MS);
      if (url.pathname === "/api/v1/bundle") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ bundles: [{ bundleId: "resident-vat", allocated: true, tokensGranted: 100, tokensRemaining: 90 }] }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    if (pathname.endsWith(".toml")) await delay(DATA_RESPONSE_DELAY_MS);
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

test.describe("Layout shift while data loads on a phone", () => {
  for (const pagePath of ["index.html", "bundles.html"]) {
    test(`${pagePath} stays under the CLS limit at 375px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await serveRealSiteWithSlowData(page);
      await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
      await delay(2000);

      const cls = await page.evaluate(() => window.__cumulativeLayoutShift);
      expect(cls).toBeLessThan(CLS_LIMIT);
    });
  }
});
