// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshBundles.browser.test.js
//
// The Welsh Bundles page writes its bundle cards, passes text, affiliate text and status key in Welsh,
// with product names and prices as the catalogue gives them.

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

const API_BODIES = {
  "/api/v1/bundle": { bundles: [] },
  "/api/v1/affiliate/application": { state: "none" },
  "/api/v1/pass/my-passes": { passes: [] },
};

async function openBundles(page, pagePath, apiBodies = API_BODIES) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(apiBodies[url.pathname] ?? {}) });
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
  await expect(page.locator("button[data-bundle-id]").first()).toBeVisible();
}

test.describe("Welsh Bundles page", () => {
  test("the bundle cards read in Welsh and keep the product names and prices", async ({ page }) => {
    await openBundles(page, "cy/bundles.html");
    const text = await page.locator("main").innerText();
    expect(text).toContain("Tanysgrifio £9.99 y flwyddyn — Resident VAT");
    expect(text).toContain("neu £0.99 y mis");
    expect(text).toContain("Cyflwyno Ffurflenni TAW i CThEF. £9.99/yr / £0.99/mo, canslo unrhyw bryd.");
    expect(text).toContain("100 credyd (tokens) bob mis.");
    expect(text).toContain("Un diwrnod, dim cerdyn.");
    for (const english of ["Subscribe £", "or £0.99/month", "tokens each month", "One day, no card", "cancel anytime"]) {
      expect(text).not.toContain(english);
    }
  });

  test("the passes and affiliate text read in Welsh", async ({ page }) => {
    await openBundles(page, "cy/bundles.html");
    await expect(page.locator("#affiliateApplyState")).toHaveText("Nid ydych wedi gwneud cais.");
    await expect(page.locator("#affiliateApplyBtn")).toHaveText("Gwneud cais gyda Stripe");
    await expect(page.locator("#generatedPassesEmpty")).toContainText("Nid ydych wedi creu unrhyw docynnau eto.");
  });

  test("the status key on the Welsh page uses the home page's Welsh status words", async ({ page }) => {
    await openBundles(page, "cy/bundles.html");
    const statusList = page.locator('[data-feature-status-list="auto"]').first();
    await expect(statusList.locator(".status-tag").first()).toBeVisible();
    const words = await statusList.locator(".status-tag").allInnerTexts();
    for (const word of words) expect(["Cynhyrchu", "Prawf", "Rhagolwg"]).toContain(word.trim());
    await expect(statusList).not.toContainText("for real use");
    await expect(statusList).not.toContainText("against a test service");
  });

  test("a held bundle's Remove and the affiliate row read in Welsh", async ({ page }) => {
    await openBundles(page, "cy/bundles.html", {
      ...API_BODIES,
      "/api/v1/bundle": { bundles: [{ bundleId: "day-guest", allocated: true, tokensGranted: 3, tokensRemaining: 3 }] },
      "/api/v1/affiliate/application": { state: "approved", terms: { name: "Standard" } },
    });
    const current = page.locator("#currentBundles");
    await expect(current.locator("[data-remove-bundle-id]")).toHaveText("Dileu");
    await expect(current.locator("[data-affiliate-row] .bundle-row-name")).toHaveText("Partner cyswllt");
    await expect(current.locator("[data-withdraw-affiliate]")).toHaveText("Dileu");
    await expect(current.locator("[data-affiliate-row]")).toContainText("wedi’i gymeradwyo · Standard");
    await expect(current).not.toContainText("Remove");
    await expect(current).not.toContainText("Affiliate");
  });

  test("the English page keeps its English", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("siteLanguage", "en"));
    await openBundles(page, "bundles.html");
    const text = await page.locator("main").innerText();
    expect(text).toContain("Subscribe £9.99/yr — Resident VAT");
    expect(text).toContain("100 tokens each month.");
  });
});
