// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitVatFormErrors.browser.test.js
//
// On the VAT return form a line of the error summary goes only once its field meets the rule the
// line names, and its going is announced.

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

async function openSubmitVat(page, pagePath) {
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
  await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
}

test.describe("VAT return error summary", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("siteLanguage", "en"));
    await openSubmitVat(page, "hmrc/vat/submitVat.html");
    await page.evaluate(() => {
      document.getElementById("vatNumber").value = "18402267";
      document.getElementById("totalValueSalesExVAT").value = "12.50";
    });
    await page.locator("#submitBtn").click();
    await expect(page.locator("#form-error-summary")).toBeVisible();
  });

  test("the VAT number line stays at eight numbers and goes at nine", async ({ page }) => {
    const line = page.locator('#form-error-summary a[href="#vatNumber"]');
    await expect(line).toHaveText("The VAT registration number must be 9 numbers");
    await page.fill("#vatNumber", "1234567");
    await expect(line).toHaveCount(1);
    await page.fill("#vatNumber", "123456789");
    await expect(line).toHaveCount(0);
    await expect(page.locator("#form-error-announcer")).toHaveText("Fixed: The VAT registration number must be 9 numbers");
  });

  test("a box line stays while the box has pence and goes at whole pounds", async ({ page }) => {
    const line = page.locator('#form-error-summary a[href="#totalValueSalesExVAT"]');
    await expect(line).toContainText("whole number without pence");
    await page.fill("#totalValueSalesExVAT", "12.5");
    await expect(line).toHaveCount(1);
    await page.fill("#totalValueSalesExVAT", "12");
    await expect(line).toHaveCount(0);
  });

  test("the declaration line goes when the box is ticked", async ({ page }) => {
    const line = page.locator('#form-error-summary a[href="#declaration"]');
    await expect(line).toHaveCount(1);
    await page.check("#declaration");
    await expect(line).toHaveCount(0);
  });
});
