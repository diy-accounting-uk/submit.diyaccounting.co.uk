// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/scrollingRegions.browser.test.js
// At 320 and 640 wide, every element that scrolls sideways on the generated pages takes keyboard focus.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const PAGES = [
  "mtd-calendar.html",
  "rates.html",
  "vat-return-due-date-and-penalty-points.html",
  "mtd-income-tax-checker.html",
  "mtd-vat-bridging-software-compared.html",
];

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
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

for (const width of [320, 640]) {
  for (const file of PAGES) {
    test(`${file} at ${width} wide: each element that scrolls sideways takes focus and has a name`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${file}`, { waitUntil: "load" });
      const unfocusable = await page.evaluate(() =>
        [...document.querySelectorAll("main *, main")]
          .filter((el) => {
            const style = getComputedStyle(el);
            return ["auto", "scroll"].includes(style.overflowX) && el.scrollWidth > el.clientWidth && style.display !== "none";
          })
          .filter((el) => !el.hasAttribute("tabindex") || !(el.getAttribute("aria-labelledby") || el.getAttribute("aria-label")))
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? "." + el.className : ""}`),
      );
      expect(unfocusable).toEqual([]);
      await context.close();
    });
  }
}

test("the calendar's update periods table sits in a focusable, named scroll box", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  await serveRealSite(page);
  await page.goto("http://localhost:3000/mtd-calendar.html", { waitUntil: "load" });
  const box = page.locator(".table-scroll", { has: page.locator("#update-periods-caption") });
  await expect(box).toHaveAttribute("tabindex", "0");
  await expect(box).toHaveAttribute("role", "region");
  await expect(box).toHaveAttribute("aria-labelledby", "update-periods-caption");
  await context.close();
});
