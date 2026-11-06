// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/layoutShift.browser.test.js
//
// Cumulative layout shift guard. Serves the real static site from disk with
// every data response delayed, so content that fills in after first paint
// (activity buttons, bundle cards) shows the shift a phone on a slow link sees.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { FIXTURE_CONSOLE_INDEX, FIXTURE_DAILY_CHARTS, PIXEL_PNG, fullShapeSnapshot } from "./operatorDashboardFixtures.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const DATA_RESPONSE_DELAY_MS = 400;
const CLS_LIMIT = 0.1;

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

async function serveRealSiteWithSlowData(
  page,
  {
    heldBundles = [{ bundleId: "resident-vat", allocated: true, tokensGranted: 100, tokensRemaining: 90 }],
    apiAnswers = {},
    storage = {},
  } = {},
) {
  await page.addInitScript((extraStorage) => {
    try {
      for (const [key, value] of Object.entries(extraStorage)) localStorage.setItem(key, value);
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "user@example.com" }));
    } catch {}
    window.__cumulativeLayoutShift = 0;
    window.__shiftEntries = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cumulativeLayoutShift += entry.value;
        window.__shiftEntries.push({
          at: Math.round(entry.startTime),
          value: Number(entry.value.toFixed(4)),
          moved: entry.sources.map((source) => ({
            node: source.node
              ? `${source.node.nodeName.toLowerCase()}${source.node.id ? "#" + source.node.id : ""}.${source.node.className}`
              : "removed",
            from: [source.previousRect.x, source.previousRect.y, source.previousRect.width, source.previousRect.height].map(Math.round),
            to: [source.currentRect.x, source.currentRect.y, source.currentRect.width, source.currentRect.height].map(Math.round),
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  }, storage);

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await delay(DATA_RESPONSE_DELAY_MS);
      if (url.pathname === "/api/v1/operator/console-image") {
        await route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
        return;
      }
      if (apiAnswers[url.pathname]) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(apiAnswers[url.pathname]) });
        return;
      }
      if (url.pathname === "/api/v1/bundle") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ bundles: heldBundles }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    if (pathname.endsWith(".toml")) await delay(DATA_RESPONSE_DELAY_MS);
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

test.describe("Layout shift while data loads on a phone", () => {
  for (const [width, height] of [
    [375, 800],
    [375, 1000],
  ]) {
    for (const pagePath of ["index.html", "bundles.html"]) {
      test(`${pagePath} stays under the CLS limit at ${width}x${height} with bundles held`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await serveRealSiteWithSlowData(page);
        await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
        await delay(2000);

        const cls = await page.evaluate(() => window.__cumulativeLayoutShift);
        const shifts = await page.evaluate(() => window.__shiftEntries);
        expect(cls, `layout shifts (at ms, value, moved node from to as x y width height): ${JSON.stringify(shifts)}`).toBeLessThan(
          CLS_LIMIT,
        );
      });
    }
  }

  for (const [width, height] of [
    [375, 800],
    [1280, 900],
  ]) {
    for (const pagePath of ["pass.html?pass=river-cloud-stone-lamp", "bundles.html?pass=river-cloud-stone-lamp"]) {
      test(`${pagePath.split("?")[0]} with a pass in the link stays under the CLS limit at ${width}x${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await serveRealSiteWithSlowData(page, {
          apiAnswers: { "/api/v1/pass": { valid: true, bundleId: "resident-pro" } },
        });
        await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
        await expect(page.locator("#passHeading")).toHaveText("You have a pass for Resident Pro");
        await delay(1000);

        const cls = await page.evaluate(() => window.__cumulativeLayoutShift);
        const shifts = await page.evaluate(() => window.__shiftEntries);
        expect(cls, `layout shifts (at ms, value, moved node from to as x y width height): ${JSON.stringify(shifts)}`).toBeLessThan(
          CLS_LIMIT,
        );
      });
    }
  }

  test("bundles.html starts the card with Your current bundles, with no empty band above it", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await serveRealSiteWithSlowData(page, {
      heldBundles: [
        { bundleId: "operator", allocated: true, configDriven: true },
        { bundleId: "resident-pro", allocated: true, tokensGranted: 100, tokensRemaining: 80 },
      ],
    });
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "load" });
    await expect(page.locator("#currentBundles .service-item").first()).toBeVisible();

    const band = await page.evaluate(() => {
      const card = document.querySelector(".form-container").getBoundingClientRect();
      const heading = document.querySelector("#currentBundlesSection h2").getBoundingClientRect();
      return heading.top - card.top;
    });
    expect(band).toBeLessThan(40);
    await page.screenshot({ path: "target/screenshots/bundles-current-bundles-375.png" });
  });

  test("bundles.html leaves no gap above Redeem a pass when no bundles are held", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await serveRealSiteWithSlowData(page, { heldBundles: [] });
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "load" });
    await expect(page.locator("#catalogBundles .service-item").first()).toBeVisible();
    await delay(500);

    const gap = await page.evaluate(() => {
      const list = document.getElementById("catalogBundles").getBoundingClientRect();
      const pass = [...document.querySelectorAll("h2")].find((h) => h.textContent.trim() === "Have a pass?").getBoundingClientRect();
      return pass.top - list.bottom;
    });
    expect(gap).toBeLessThan(80);

    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `target/screenshots/bundles-no-bundles-${width}.png`, fullPage: true });
    }
  });

  test("bundles.html leaves no gap above Have a pass once a held bundle has loaded", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await serveRealSiteWithSlowData(page);
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "load" });
    await expect(page.locator("#currentBundles .service-item").first()).toBeVisible();
    await expect(page.locator(".bundles-block.bundles-settled")).toBeAttached();

    const gap = await page.evaluate(() => {
      const list = document.getElementById("catalogBundles").getBoundingClientRect();
      const pass = [...document.querySelectorAll("h2")].find((h) => h.textContent.trim() === "Have a pass?").getBoundingClientRect();
      return pass.top - list.bottom;
    });
    expect(gap).toBeLessThan(80);
  });

  const CAPTURED_IMAGE_SLUGS = [
    "cognito-sign-ins",
    "cognito-sign-ins-rest",
    "hmrc-authentications",
    "bundle-operations",
    "bundle-grants",
    "purchases",
    "deploy-lead-time",
    "analytics-all",
    "analytics-all-middle",
    "analytics-all-rest",
    "lambda-errors",
    "lambda-throttles",
    "bundle-allocations",
    "lambda-duration-slowest",
    "lambda-duration-rest",
    "lambda-duration-tail",
    "rum-vitals",
    "rum-errors",
  ];

  function operatorAnswers() {
    const items = { ...FIXTURE_CONSOLE_INDEX.items };
    for (const slug of CAPTURED_IMAGE_SLUGS) {
      items[`prod-${slug}`] = {
        id: `prod-${slug}`,
        target: "prod",
        env: "prod",
        group: "operations",
        title: slug,
        kind: "image",
        capturedAt: FIXTURE_CONSOLE_INDEX.generatedAt,
        imageKey: `snapshots/prod/console/prod/prod-${slug}.png`,
      };
    }
    return {
      "/api/v1/operator/snapshot": {
        ...fullShapeSnapshot(),
        generatedAt: new Date().toISOString(),
        dailyCharts: FIXTURE_DAILY_CHARTS,
        console: { ...FIXTURE_CONSOLE_INDEX, items },
      },
      "/api/v1/pass/held": { passes: [] },
    };
  }

  for (const [width, height] of [
    [1440, 900],
    [375, 800],
    [375, 1000],
  ]) {
    for (const tab of ["main", "aws-prod"]) {
      test(`operator/dashboard.html stays under the CLS limit on the ${tab} tab at ${width}x${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await serveRealSiteWithSlowData(page, { apiAnswers: operatorAnswers(), storage: { operatorDashboardTab: tab } });
        await page.goto("http://localhost:3000/operator/dashboard.html", { waitUntil: "load" });
        await expect(page.locator("#dashboardTabs:not(.dashboard-tabs-pending)")).toBeVisible();
        if (tab === "aws-prod") await expect(page.locator("img.console-capture-image").first()).toHaveAttribute("src", /^data:image\/png/);
        await delay(1500);

        const cls = await page.evaluate(() => window.__cumulativeLayoutShift);
        const shifts = await page.evaluate(() => window.__shiftEntries);
        expect(cls, `layout shifts (at ms, value, moved node from to as x y width height): ${JSON.stringify(shifts)}`).toBeLessThan(
          CLS_LIMIT,
        );
        await page.screenshot({ path: `target/screenshots/operator-dashboard-${tab}-${width}x${height}.png`, fullPage: true });
      });
    }
  }

  test("operator/dashboard.html draws no block over the line above it at 375 wide", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await serveRealSiteWithSlowData(page, { apiAnswers: operatorAnswers(), storage: { operatorDashboardTab: "aws-prod" } });
    await page.goto("http://localhost:3000/operator/dashboard.html", { waitUntil: "load" });
    await expect(page.locator("#dashboardTabs:not(.dashboard-tabs-pending)")).toBeVisible();
    await expect(page.locator("#awsLinksPanel")).toBeVisible();

    const overlaps = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll("#mainContent > *")].filter((el) => el.getBoundingClientRect().height > 0);
      const found = [];
      for (let i = 1; i < blocks.length; i++) {
        const above = blocks[i - 1].getBoundingClientRect();
        const below = blocks[i].getBoundingClientRect();
        if (below.top < above.bottom - 1) found.push({ above: blocks[i - 1].id, below: blocks[i].id, by: above.bottom - below.top });
      }
      return found;
    });
    expect(overlaps).toEqual([]);

    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll("#mainContent > *")]
        .filter((el) => el.getBoundingClientRect().height > 0 && el.scrollHeight - el.clientHeight > 1)
        .map((el) => ({ id: el.id, shown: el.clientHeight, content: el.scrollHeight })),
    );
    expect(clipped, "blocks whose content is taller than the block").toEqual([]);
  });
});
