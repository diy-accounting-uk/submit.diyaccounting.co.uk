// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/privacy-notice.browser.test.js
//
// Verifies that the privacy notice includes all required processing purposes,
// including the practice client filing row added for the resident-pro bundle.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
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

test.describe("Privacy Notice", () => {
  test("includes practice client filing in the Purposes of Processing table", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/privacy.html", { waitUntil: "domcontentloaded" });

    // Find the Purposes of Processing table by looking for the table that contains
    // both "Purpose" and "Legal Basis" headers in the thead, which uniquely identifies it
    const purposesTable = page
      .locator("table")
      .filter({
        has: page.locator("th").filter({ hasText: "Purpose" }),
      })
      .filter({
        has: page.locator("th").filter({ hasText: "Legal Basis" }),
      })
      .last();

    await expect(purposesTable).toBeVisible();

    const tableContent = await purposesTable.textContent();
    expect(tableContent).toContain("Filing VAT and tax data on behalf of a practice's clients");
    expect(tableContent).toContain("Contract performance");
  });
});
