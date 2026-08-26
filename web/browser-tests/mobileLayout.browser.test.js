// web/browser-tests/mobileLayout.browser.test.js
//
// Regression guard for issue #8 ("packed" mobile UI). Serves the real
// static site from disk (not a stripped-down fixture) at common mobile
// widths and checks the page itself never gains real horizontal scroll —
// wide content (like a plain content table) must scroll inside its own
// container instead of pushing the page wider than the viewport.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
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
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "user@example.com" }));
    } catch {}
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/v1/bundle") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ bundles: [{ bundleId: "resident-vat", allocated: true, stripeSubscriptionId: "sub_1", tokensGranted: 100, tokensRemaining: 90 }] }),
        });
        return;
      }
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

async function hasRealHorizontalScroll(page) {
  return page.evaluate(() => {
    const before = window.scrollX;
    window.scrollTo(9999, 0);
    const after = window.scrollX;
    window.scrollTo(before, 0);
    return after > 0;
  });
}

const MOBILE_WIDTHS = [375, 414];
const PAGES = ["index.html", "bundles.html", "privacy.html", "terms.html", "accessibility.html", "hmrc/vat/vatObligations.html"];

test.describe("Mobile layout - no page-level horizontal scroll", () => {
  for (const width of MOBILE_WIDTHS) {
    for (const pagePath of PAGES) {
      test(`${pagePath} at ${width}px does not scroll horizontally`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await serveRealSite(page);
        await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "domcontentloaded" });
        await delay(300);

        expect(await hasRealHorizontalScroll(page)).toBe(false);
      });
    }
  }
});

test.describe("Mobile layout - specific findings", () => {
  test("header auth section wraps instead of clipping the Logout link at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
    await delay(300);

    const logout = page.locator(".login-link");
    await expect(logout).toBeVisible();
    const box = await logout.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  });

  test("privacy.html's wide table scrolls inside its own container, not the page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await serveRealSite(page);
    await page.goto("http://localhost:3000/privacy.html", { waitUntil: "domcontentloaded" });
    await delay(300);

    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    const overflowX = await table.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe("auto");

    expect(await hasRealHorizontalScroll(page)).toBe(false);
  });
});
