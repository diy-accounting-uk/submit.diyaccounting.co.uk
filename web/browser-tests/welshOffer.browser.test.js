// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshOffer.browser.test.js
//
// The list of the site's Welsh services shows on the Welsh home page in Welsh and on the About page
// in English, and each of its links opens a page that declares Welsh.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

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
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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
}

// The site path each link of a list resolves to, as the browser resolves it.
async function linkedPaths(list) {
  return list
    .locator("a[href]")
    .evaluateAll((links) => links.filter((link) => link.protocol.startsWith("http")).map((link) => link.pathname));
}

function declaresWelsh(sitePath) {
  const file = path.join(PUBLIC_ROOT, sitePath);
  return fs.existsSync(file) && /<html lang="cy">/.test(fs.readFileSync(file, "utf-8"));
}

test.describe("The list of the site's Welsh services", () => {
  for (const width of [1280, 390]) {
    test(`shows on the Welsh home page in Welsh at ${width}px`, async ({ page }) => {
      await serveSite(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://localhost:3000/cy/index.html", { waitUntil: "load" });
      const list = page.locator("section[data-welsh-offer]");
      await expect(list).toBeVisible();
      await expect(list.getByRole("heading", { level: 2 })).toHaveText("Submit yn Gymraeg");
      await expect(list).toContainText("Rydym yn ateb yn Saesneg am y tro.");
      const paths = await linkedPaths(list);
      expect(paths.length).toBeGreaterThan(20);
      for (const sitePath of paths) expect(declaresWelsh(sitePath), sitePath).toBe(true);
      const box = await list.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    });

    test(`shows on the About page in English at ${width}px`, async ({ page }) => {
      await serveSite(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://localhost:3000/about.html", { waitUntil: "load" });
      const list = page.locator("section.about-welsh");
      await expect(list).toBeVisible();
      await expect(list.getByRole("heading", { level: 2 })).toHaveText("Submit in Welsh");
      await expect(list.locator('span[lang="cy"]')).toHaveText("Gallwch ysgrifennu atom yn Gymraeg. Rydym yn ateb yn Saesneg am y tro.");
      const paths = await linkedPaths(list);
      expect(paths).toContain("/cy/index.html");
      for (const sitePath of paths) expect(declaresWelsh(sitePath), sitePath).toBe(true);
      const box = await list.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    });
  }

  test("the English home page carries no such list", async ({ page }) => {
    await serveSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "load" });
    await expect(page.locator("section[data-welsh-offer]")).toHaveCount(0);
  });
});
