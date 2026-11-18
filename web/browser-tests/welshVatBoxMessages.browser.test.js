// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshVatBoxMessages.browser.test.js
//
// On the Welsh VAT return page an empty box is named with the soft mutation after "Nodwch", and the
// range and format messages keep the box name unmutated after "ar gyfer".

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

test.describe("Welsh VAT box messages", () => {
  test("an empty Box 6 reads 'Nodwch gyfanswm' and a Box 6 with pence keeps 'ar gyfer cyfanswm'", async ({ page }) => {
    await openSubmitVat(page, "cy/hmrc/vat/submitVat.html");
    expect(
      await page.evaluate(() => (validateVatWholeAmount("", "totalValueSalesExVAT", BOX_NAMES.totalValueSalesExVAT), null)),
    ).toBeNull();
    await expect(page.locator("#totalValueSalesExVAT-error")).toContainText("Nodwch gyfanswm gwerth y gwerthiannau");
    await page.evaluate(() => validateVatWholeAmount("12.50", "totalValueSalesExVAT", BOX_NAMES.totalValueSalesExVAT));
    await expect(page.locator("#totalValueSalesExVAT-error")).toContainText("ar gyfer cyfanswm gwerth y gwerthiannau");
  });

  test("the English page keeps 'Enter the total value of sales'", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("siteLanguage", "en"));
    await openSubmitVat(page, "hmrc/vat/submitVat.html");
    await page.evaluate(() => validateVatWholeAmount("", "totalValueSalesExVAT", BOX_NAMES.totalValueSalesExVAT));
    await expect(page.locator("#totalValueSalesExVAT-error")).toContainText("Enter the total value of sales");
  });
});
