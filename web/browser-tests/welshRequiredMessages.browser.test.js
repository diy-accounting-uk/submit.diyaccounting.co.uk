// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshRequiredMessages.browser.test.js
//
// On a Welsh copy, an empty required field is named in Welsh in the error summary and beside the field.

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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: url.pathname === "/api/v1/bundle" ? '{"bundles":[]}' : "{}",
      });
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
  await page.addInitScript(() => localStorage.setItem("cognitoIdToken", "test-id-token"));
}

test.describe("Welsh required-field messages", () => {
  test("the Welsh micro-entity accounts page names an empty company number in Welsh", async ({ page }) => {
    await serveSite(page);
    await page.goto("http://localhost:3000/cy/companies-house/fileMicroEntityAccounts.html", { waitUntil: "load" });
    await page.locator("#companyNumber").fill("");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#companyNumber-error")).toContainText("Nodwch rif y cwmni");
    await expect(page.locator("#form-error-summary")).toContainText("Nodwch rif y cwmni");
    await expect(page.locator("#form-error-summary")).not.toContainText("Enter the company number");
  });

  test("the English page keeps its English message", async ({ page }) => {
    await serveSite(page);
    await page.addInitScript(() => localStorage.setItem("siteLanguage", "en"));
    await page.goto("http://localhost:3000/companies-house/fileMicroEntityAccounts.html", { waitUntil: "load" });
    await page.locator("#companyNumber").fill("");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#companyNumber-error")).toContainText("Enter the company number");
  });
});
