// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshAvailabilityTable.browser.test.js
//
// At desktop width the Welsh availability table on the MTD calendar wraps its cells no more than the English
// one does, and the English table keeps the body text size.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function measure(page, pagePath) {
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
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
  return page.locator(".availability-table").evaluate((table) => ({
    height: table.getBoundingClientRect().height,
    width: table.getBoundingClientRect().width,
    cellFont: getComputedStyle(table.querySelector("td")).fontSize,
    bodyFont: getComputedStyle(document.body).fontSize,
    scrollsSideways: table.parentElement.scrollWidth > table.parentElement.clientWidth,
  }));
}

test.describe("MTD calendar availability table at 1280px", () => {
  test("the Welsh table is no taller than the English one and both fit their card", async ({ browser }) => {
    const englishPage = await browser.newPage();
    const welshPage = await browser.newPage();
    await welshPage.addInitScript(() => localStorage.setItem("siteLanguage", "cy"));
    await englishPage.addInitScript(() => localStorage.setItem("siteLanguage", "en"));
    for (const shown of [englishPage, welshPage]) await shown.addInitScript(() => localStorage.setItem("consent.analytics", "declined"));
    const english = await measure(englishPage, "mtd-calendar.html");
    const welsh = await measure(welshPage, "cy/mtd-calendar.html");
    for (const [name, shown] of [
      ["en", englishPage],
      ["cy", welshPage],
    ]) {
      for (const width of [1280, 390]) {
        await shown.setViewportSize({ width, height: 900 });
        await shown.locator(".availability-table").screenshot({ path: `target/screenshots/availability/${name}-table-${width}.png` });
      }
      await shown.setViewportSize({ width: 1280, height: 900 });
    }
    expect(english.cellFont).toBe(english.bodyFont);
    expect(welsh.height).toBeLessThanOrEqual(english.height);
    expect(welsh.width).toBeLessThanOrEqual(english.width + 1);
    expect(english.scrollsSideways).toBe(false);
    expect(welsh.scrollsSideways).toBe(false);
    await englishPage.close();
    await welshPage.close();
  });
});
