// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
          body: JSON.stringify({
            bundles: [
              { bundleId: "resident-vat", allocated: true, stripeSubscriptionId: "sub_1", tokensGranted: 100, tokensRemaining: 90 },
            ],
          }),
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

test.describe("Mobile layout - spreadsheet pages at 390px", () => {
  for (const pagePath of ["spreadsheets.html", "diy-accounting-spreadsheets.html"]) {
    test(`${pagePath} is no wider than the viewport at 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "domcontentloaded" });
      await delay(300);

      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        wide: [...document.body.querySelectorAll("*")]
          .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
      }));
      expect(widths.scroll, `too wide: ${widths.wide.join(", ")}`).toBeLessThanOrEqual(widths.client);
      expect(await hasRealHorizontalScroll(page)).toBe(false);
    });
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

test.describe("Feedback banner", () => {
  for (const [width, position] of [
    [390, "static"],
    [1000, "sticky"],
  ]) {
    test(`is ${position} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await serveRealSite(page);
      await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
      await delay(300);

      const banner = page.locator("#feedbackEngagementBanner");
      await banner.evaluate((el) => el.removeAttribute("hidden"));
      await expect(banner).toBeVisible();
      expect(await banner.evaluate((el) => getComputedStyle(el).position)).toBe(position);
    });
  }
});

test.describe("Header account line truncates, the brand stays whole", () => {
  const LONG_ADDRESS = "synthetic-user@test.diyaccounting.co.uk";

  async function openHeader(page, width, signedIn) {
    await page.setViewportSize({ width, height: 700 });
    await serveRealSite(page);
    await page.addInitScript(
      ({ signedIn, address }) => {
        try {
          if (signedIn) localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: address }));
          else {
            localStorage.removeItem("userInfo");
            localStorage.removeItem("cognitoIdToken");
          }
        } catch {}
      },
      { signedIn, address: LONG_ADDRESS },
    );
    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
    await delay(500);
  }

  for (const width of [1000, 390]) {
    for (const signedIn of [true, false]) {
      const state = signedIn ? "signed in" : "signed out";
      test(`brand stays whole and the account line is complete or ellipsised with its title at ${width}px, ${state}`, async ({ page }) => {
        await openHeader(page, width, signedIn);

        const status = page.locator(".login-status");
        await expect(status).toHaveText(signedIn ? `Logged in as ${LONG_ADDRESS}` : "Not logged in");
        const measured = await page.evaluate(() => {
          const brand = document.querySelector(".brand-name");
          const login = document.querySelector(".login-status");
          const loginStyle = getComputedStyle(login);
          return {
            brandHidden: getComputedStyle(brand).display === "none",
            brandClipped: brand.scrollWidth > brand.clientWidth || brand.scrollHeight - brand.clientHeight > 1,
            loginClipped: login.scrollWidth > login.clientWidth || login.scrollHeight - login.clientHeight > 1,
            loginEllipsis: loginStyle.textOverflow === "ellipsis" && loginStyle.overflow !== "visible",
            loginTitle: login.getAttribute("title"),
          };
        });
        if (!measured.brandHidden) expect(measured.brandClipped, ".brand-name is clipped").toBe(false);
        if (signedIn) {
          expect(measured.loginEllipsis, ".login-status ends in an ellipsis when it overflows").toBe(true);
          expect(measured.loginTitle, ".login-status title holds the full address").toBe(`Logged in as ${LONG_ADDRESS}`);
        } else {
          expect(measured.loginClipped, ".login-status is clipped").toBe(false);
          expect(measured.loginTitle).toBeNull();
        }
        if (width === 1000) await expect(page.locator(".brand-name")).toBeVisible();
        await expect(status).toBeInViewport();
        await expect(page.locator(".login-link")).toBeInViewport({ ratio: 1 });

        await page.locator(".header-nav").screenshot({
          path: `target/header-text/header-${width}-${signedIn ? "signed-in" : "signed-out"}.png`,
        });
      });
    }
  }

  for (const width of [390, 320]) {
    test(`a long signed-in address is ellipsised with its title and leaves the icons whole at ${width}px`, async ({ page }) => {
      const longAddress = "a.very.long.customer.address@example-company-name.co.uk";
      await page.setViewportSize({ width, height: 700 });
      await serveRealSite(page);
      await page.addInitScript((address) => {
        try {
          localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: address }));
        } catch {}
      }, longAddress);
      await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
      await delay(500);

      const measured = await page.evaluate(() => {
        const left = document.querySelector(".header-left");
        const header = document.querySelector(".header-nav").getBoundingClientRect();
        const icons = [".home-link", ".info-link"].map((selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { selector, left: box.left, right: box.right, width: box.width, top: box.top, bottom: box.bottom };
        });
        const status = document.querySelector(".login-status");
        return {
          leftScroll: left.scrollWidth,
          leftClient: left.clientWidth,
          header: { left: header.left, right: header.right, top: header.top, bottom: header.bottom },
          icons,
          statusTitle: status.getAttribute("title"),
        };
      });
      expect(measured.leftScroll).toBeLessThanOrEqual(measured.leftClient);
      for (const icon of measured.icons) {
        expect(icon.width, `${icon.selector} width`).toBeGreaterThanOrEqual(44);
        expect(icon.left, `${icon.selector} left`).toBeGreaterThanOrEqual(measured.header.left);
        expect(icon.right, `${icon.selector} right`).toBeLessThanOrEqual(measured.header.right);
        expect(icon.top, `${icon.selector} top`).toBeGreaterThanOrEqual(measured.header.top);
        expect(icon.bottom, `${icon.selector} bottom`).toBeLessThanOrEqual(measured.header.bottom);
      }
      expect(measured.statusTitle, ".login-status title holds the full address").toBe(`Logged in as ${longAddress}`);
      await expect(page.locator(".login-link")).toBeInViewport({ ratio: 1 });
      expect(await hasRealHorizontalScroll(page)).toBe(false);

      await page.locator(".header-nav").screenshot({ path: `target/header-text/header-long-${width}.png` });
    });
  }
});
