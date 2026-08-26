// web/browser-tests/cookieConsent.browser.test.js
//
// Covers B19's code half (cookie consent banner). GA4 loads with
// analytics_storage denied by default (lib/analytics.js); this banner is
// the only way a visitor can turn it on. Serves the real static site from
// disk (not a stripped-down fixture) so the real submit.js and analytics.js
// run, and checks the show/accept/persist/decline flow end to end.

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
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    // Never let the GA4 tag loader or any /api/* call hit the real network.
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
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

async function gtagConsentCalls(page) {
  return page.evaluate(() => (window.dataLayer || []).filter((entry) => entry[0] === "consent").map((entry) => Array.from(entry)));
}

test.describe("Cookie consent banner", () => {
  test("shows on first visit with plain wording and a link to the privacy policy", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });

    const banner = page.locator("#consent-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText("cookies");
    await expect(banner.locator('a[href="/privacy.html"]')).toBeVisible();
    await expect(banner.locator("#consent-accept")).toBeVisible();
    await expect(banner.locator("#consent-decline")).toBeVisible();

    // Consent starts denied.
    const calls = await gtagConsentCalls(page);
    expect(calls[0]).toEqual(["consent", "default", { analytics_storage: "denied" }]);
  });

  test("Accept dismisses the banner, grants GA4 consent, and persists the choice", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });

    const banner = page.locator("#consent-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await banner.locator("#consent-accept").click();
    await expect(banner).toBeHidden();

    const storage = await page.evaluate(() => ({
      rum: localStorage.getItem("consent.rum"),
      analytics: localStorage.getItem("consent.analytics"),
    }));
    expect(storage.rum).toBe("granted");
    expect(storage.analytics).toBe("granted");

    const calls = await gtagConsentCalls(page);
    expect(calls.some((c) => c[1] === "update" && c[2].analytics_storage === "granted")).toBe(true);

    // Persist across a reload: banner must not reappear.
    await page.reload({ waitUntil: "domcontentloaded" });
    await delay(300);
    await expect(page.locator("#consent-banner")).toHaveCount(0);

    // And the saved choice is applied immediately on the new page load,
    // before any user interaction.
    const callsAfterReload = await gtagConsentCalls(page);
    expect(callsAfterReload.some((c) => c[1] === "update" && c[2].analytics_storage === "granted")).toBe(true);
  });

  test("Decline dismisses the banner, keeps GA4 denied, and persists so the banner does not return", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });

    const banner = page.locator("#consent-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await banner.locator("#consent-decline").click();
    await expect(banner).toBeHidden();

    const storage = await page.evaluate(() => ({
      rum: localStorage.getItem("consent.rum"),
      analytics: localStorage.getItem("consent.analytics"),
    }));
    expect(storage.rum).toBe("declined");
    expect(storage.analytics).toBe("declined");

    await page.reload({ waitUntil: "domcontentloaded" });
    await delay(300);
    await expect(page.locator("#consent-banner")).toHaveCount(0);
  });

  test("Accept and Decline are keyboard reachable with a visible focus outline", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });

    const acceptBtn = page.locator("#consent-accept");
    await expect(acceptBtn).toBeVisible({ timeout: 5000 });
    await acceptBtn.focus();
    await expect(acceptBtn).toBeFocused();

    const outline = await acceptBtn.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
  });
});
