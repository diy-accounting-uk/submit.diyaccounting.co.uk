// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/siteScreenshotsImages.browser.test.js
// The site screenshot script loads every image on a page, lazy ones below the first screen
// included, before it takes a full-page capture.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { loadAllImages } from "../../scripts/site-screenshots.mjs";

const IMAGE = fs.readFileSync(path.join(process.cwd(), "web/public/android-chrome-192.png"));

test("lazy images far below the first screen have loaded after loadAllImages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.route("http://localhost:3000/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(".png")) {
      await route.fulfill({ status: 200, contentType: "image/png", body: IMAGE });
      return;
    }
    const pictures = Array.from(
      { length: 12 },
      (_, i) => `<div style="height: 900px"></div><img loading="lazy" src="/step-${i}.png" alt="step ${i}" width="192" height="192">`,
    ).join("");
    await route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><html><body>${pictures}</body></html>` });
  });
  await page.goto("http://localhost:3000/steps.html", { waitUntil: "load" });

  const loadedBefore = await page.evaluate(() => [...document.images].filter((image) => image.naturalWidth > 0).length);
  expect(loadedBefore).toBeLessThan(12);

  await loadAllImages(page);

  const states = await page.evaluate(() => ({
    loaded: [...document.images].filter((image) => image.complete && image.naturalWidth > 0).length,
    scrollY: window.scrollY,
  }));
  expect(states).toEqual({ loaded: 12, scrollY: 0 });
});
