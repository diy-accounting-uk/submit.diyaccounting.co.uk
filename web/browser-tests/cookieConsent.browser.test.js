// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/cookieConsent.browser.test.js
//
// Covers B19's code half (cookie consent banner). GA4 loads with
// every consent type denied by default (lib/analytics.js); this banner is
// the only way a visitor can turn analytics, landing attribution and the
// session beacon on. Serves the real static site from
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
    if (url.pathname === "/submit.env") {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "GA4_MEASUREMENT_ID=G-TESTMEASURE\n" });
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

function trackRequests(page) {
  const seen = { gtag: 0, beacon: 0 };
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("https://www.googletagmanager.com/gtag/js")) seen.gtag += 1;
    if (url.endsWith("/api/v1/session/beacon") && !request.postDataJSON()?.consentAnswer) seen.beacon += 1;
  });
  return seen;
}

test.describe("Cookie consent banner", () => {
  test("before a choice there is no attribution, no gtag.js request and no beacon", async ({ page }) => {
    const seen = trackRequests(page);
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html?gclid=abc123&utm_source=google", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#consent-dialog")).toBeVisible({ timeout: 5000 });
    await delay(500);

    expect(await page.evaluate(() => localStorage.getItem("attribution.landing"))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem("__diy_session__"))).toBeNull();
    expect(seen.gtag).toBe(0);
    expect(seen.beacon).toBe(0);
  });

  test("after Accept the attribution is stored, gtag.js is requested and the beacon is sent", async ({ page }) => {
    const seen = trackRequests(page);
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html?gclid=abc123&utm_source=google", { waitUntil: "domcontentloaded" });
    await page.locator("#consent-dialog #consent-accept").click();

    await expect.poll(() => seen.gtag).toBe(1);
    await expect.poll(() => seen.beacon).toBe(1);
    const landing = await page.evaluate(() => JSON.parse(localStorage.getItem("attribution.landing")));
    expect(landing).toMatchObject({ gclid: "abc123", utmSource: "google" });
  });

  test("Decline stores no attribution and sends no gtag.js request or beacon", async ({ page }) => {
    const seen = trackRequests(page);
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html?gclid=abc123", { waitUntil: "domcontentloaded" });
    await page.locator("#consent-dialog #consent-decline").click();
    await delay(500);

    expect(await page.evaluate(() => localStorage.getItem("attribution.landing"))).toBeNull();
    expect(seen.gtag).toBe(0);
    expect(seen.beacon).toBe(0);
  });

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
    expect(calls[0]).toEqual([
      "consent",
      "default",
      { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" },
    ]);
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

  test("a visit whose URL carries gclid gets the whole-page dialog with equal Accept and Reject", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html?gclid=abc123", { waitUntil: "domcontentloaded" });

    const dialog = page.locator("#consent-dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#consent-banner")).toHaveCount(0);
    await expect(dialog).toContainText("Google");

    const viewport = page.viewportSize();
    const box = await dialog.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);

    const accept = await page.locator("#consent-accept").boundingBox();
    const reject = await page.locator("#consent-decline").boundingBox();
    expect(reject.width).toBeCloseTo(accept.width, 0);
    expect(reject.height).toBeCloseTo(accept.height, 0);
    await expect(page.locator("#consent-decline")).toHaveText("Reject");

    await page.locator("#consent-decline").focus();
    await expect(page.locator("#consent-decline")).toBeFocused();
  });

  test("a utm_ parameter alone also gets the dialog, on any page", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/privacy.html?utm_source=google", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#consent-dialog")).toBeVisible({ timeout: 5000 });
  });

  test("Reject on the dialog opens the page, stores no attribution and posts a count with no identifier", async ({ page }) => {
    const answers = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/v1/session/beacon")) answers.push(request.postDataJSON());
    });
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html?gclid=abc123", { waitUntil: "domcontentloaded" });
    await page.locator("#consent-dialog #consent-decline").click();

    await expect(page.locator("#consent-dialog")).toHaveCount(0);
    await expect.poll(() => answers.length).toBe(1);
    expect(answers[0]).toEqual({ consentAnswer: "rejected", consentSurface: "dialog" });
    expect(await page.evaluate(() => localStorage.getItem("attribution.landing"))).toBeNull();
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("Accept on the dialog stores the attribution and posts an accepted count", async ({ page }) => {
    const answers = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/v1/session/beacon") && request.postDataJSON()?.consentAnswer) {
        answers.push(request.postDataJSON());
      }
    });
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html?gclid=abc123", { waitUntil: "domcontentloaded" });
    await page.locator("#consent-dialog #consent-accept").click();

    await expect.poll(() => answers.length).toBe(1);
    expect(answers[0]).toEqual({ consentAnswer: "accepted", consentSurface: "dialog" });
    const landing = await page.evaluate(() => JSON.parse(localStorage.getItem("attribution.landing")));
    expect(landing).toMatchObject({ gclid: "abc123" });
  });

  test("a plain visit keeps the banner and posts a banner count", async ({ page }) => {
    const answers = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/v1/session/beacon")) answers.push(request.postDataJSON());
    });
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#consent-banner")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#consent-dialog")).toHaveCount(0);

    await page.locator("#consent-decline").click();
    await expect.poll(() => answers.length).toBe(1);
    expect(answers[0]).toEqual({ consentAnswer: "rejected", consentSurface: "banner" });
  });

  test("the Cookie choices footer link reopens the choice after an answer", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
    await page.locator("#consent-decline").click();
    await expect(page.locator("#consent-banner")).toHaveCount(0);

    await page.locator("[data-cookie-choices]").first().click();
    await expect(page.locator("#consent-dialog")).toBeVisible();
  });
});
