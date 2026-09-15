// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/operatorDashboardActivity.browser.test.js
// The index page's activity list: an operator-listed email's /api/v1/bundle response carries
// the "operator" bundle, and the Operator Dashboard activity shows alongside every other
// activity the account is entitled to.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

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

// Serves the real static site from disk so the real catalogue and the real index.html
// rendering script (renderDynamicActivities/getActiveBundles) are exercised, and stubs only
// the authenticated caller's /api/v1/bundle response.
async function serveRealSite(page, { bundles }) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "user@example.com" }));
    } catch {}
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname === "/api/v1/bundle") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles, tokensRemaining: 0 }) });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

test.describe("Operator Dashboard activity on the index page", () => {
  test("shows Operator Dashboard alongside the other activities when /api/v1/bundle carries the operator bundle", async ({ page }) => {
    await serveRealSite(page, {
      bundles: [{ bundleId: "operator", allocated: true }],
    });

    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
    await delay(400);

    const dynamicActivities = page.locator("#dynamicActivities");
    await expect(dynamicActivities.locator("button", { hasText: "Operator Dashboard" })).toBeVisible();
    // Renders with the always-shown activities, not instead of them
    await expect(dynamicActivities.locator("button", { hasText: "Learn about DIY Accounting Submit" })).toBeVisible();
  });

  test("omits Operator Dashboard when the account holds no operator bundle", async ({ page }) => {
    await serveRealSite(page, { bundles: [] });

    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
    await delay(400);

    const dynamicActivities = page.locator("#dynamicActivities");
    await expect(dynamicActivities.locator("button", { hasText: "Operator Dashboard" })).toHaveCount(0);
    await expect(dynamicActivities.locator("button", { hasText: "Learn about DIY Accounting Submit" })).toBeVisible();
  });
});
