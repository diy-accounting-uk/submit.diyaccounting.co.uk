// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/themeSwitch.browser.test.js
//
// The header switch cycles the colour scheme: device, light, dark. The choice
// is kept in localStorage and applied as data-theme on <html>. A page that
// pins data-theme="light" keeps the pin and shows no switch.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveRealSite(page, { pinLight = false } = {}) {
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
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      let body = fs.readFileSync(filePath);
      if (pinLight && ext === ".html") body = body.toString().replace("<html ", '<html data-theme="light" ');
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

const dataTheme = (page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const canvas = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

for (const device of ["light", "dark"]) {
  test.describe(`device prefers ${device}`, () => {
    test.use({ colorScheme: device });

    test("the switch cycles device, light, dark and the page follows", async ({ page }) => {
      await serveRealSite(page);
      await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
      const toggle = page.locator(".theme-toggle");
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-label", /device setting.*Switch to light/);
      expect(await dataTheme(page)).toBeNull();
      const deviceCanvas = await canvas(page);

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-label", /light.*Switch to dark/);
      expect(await dataTheme(page)).toBe("light");
      const lightCanvas = await canvas(page);

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-label", /dark.*Switch to device/);
      expect(await dataTheme(page)).toBe("dark");
      const darkCanvas = await canvas(page);

      expect(lightCanvas).not.toBe(darkCanvas);
      expect(deviceCanvas).toBe(device === "light" ? lightCanvas : darkCanvas);

      await toggle.click();
      expect(await dataTheme(page)).toBeNull();
      expect(await canvas(page)).toBe(deviceCanvas);
    });

    test("a stored dark choice is applied on load and survives a reload", async ({ page }) => {
      await serveRealSite(page);
      await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
      await page.locator(".theme-toggle").click();
      await page.locator(".theme-toggle").click();
      await page.reload({ waitUntil: "domcontentloaded" });
      expect(await dataTheme(page)).toBe("dark");
      await expect(page.locator(".theme-toggle")).toHaveAttribute("data-theme-mode", "dark");
    });
  });
}

test("a blocked store falls back to the device setting and the switch still works for the page view", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  });
  await serveRealSite(page);
  await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
  const toggle = page.locator(".theme-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  expect(await dataTheme(page)).toBe("light");
});

test("a page that pins the light scheme keeps the pin and shows no switch", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("colourScheme", "dark");
    } catch {}
  });
  await serveRealSite(page, { pinLight: true });
  await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".header-nav")).toBeVisible();
  await expect(page.locator(".theme-toggle")).toHaveCount(0);
  expect(await dataTheme(page)).toBe("light");
});
