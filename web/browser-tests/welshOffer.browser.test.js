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

  const WELSH_MESSAGES = "Gallwch ysgrifennu atom yn Gymraeg yn support@diyaccounting.co.uk. Rydym yn ateb yn Saesneg am y tro.";

  for (const address of ["cy/index.html", "cy/terms.html", "cy/companies-house/companySearch.html"]) {
    test(`the footer of ${address} says in Welsh that a message in Welsh gets its reply in English`, async ({ page }) => {
      await serveSite(page);
      await page.goto(`http://localhost:3000/${address}`, { waitUntil: "load" });
      const line = page.locator("footer .footer-welsh-messages");
      await expect(line).toHaveText(WELSH_MESSAGES);
      await expect(line.locator("a")).toHaveAttribute("href", "mailto:support@diyaccounting.co.uk");
    });
  }

  test("the Welsh help page says it beside its support buttons, in the same words as the footer and the home page's list", async ({
    page,
  }) => {
    await serveSite(page);
    await page.goto("http://localhost:3000/cy/help.html", { waitUntil: "load" });
    await expect(page.locator(".support-section #welsh-messages-line")).toHaveText(WELSH_MESSAGES);
    await expect(page.locator("footer .footer-welsh-messages")).toHaveText(WELSH_MESSAGES);
    await page.goto("http://localhost:3000/cy/index.html", { waitUntil: "load" });
    await expect(page.locator("section[data-welsh-offer] p").last()).toHaveText(WELSH_MESSAGES);
  });

  test("an English page says nothing about messages in Welsh in its footer or its help support part", async ({ page }) => {
    await serveSite(page);
    await page.goto("http://localhost:3000/help.html", { waitUntil: "load" });
    await expect(page.locator("footer .footer-links")).toHaveCount(1);
    await expect(page.locator("footer .footer-welsh-messages")).toHaveCount(0);
    await expect(page.locator("#welsh-messages-line")).toHaveCount(0);
  });

  test("the English home page carries no such list", async ({ page }) => {
    await serveSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "load" });
    await expect(page.locator("section[data-welsh-offer]")).toHaveCount(0);
  });
});
