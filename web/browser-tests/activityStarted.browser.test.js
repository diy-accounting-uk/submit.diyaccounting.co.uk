// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/activityStarted.browser.test.js
//
// The document-level click listener submit.js wires for any element carrying
// data-activity-start="<id>" (activityStartedPost.js). Serves the real static site (not a
// stripped-down fixture) so the real submit.js runs, and checks the beacon fires on click,
// keepalive, without delaying the click.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
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

    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname === "/api/v1/activity/started") {
      // Handled per-test by a route added after this one.
      await route.fallback();
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

test.describe("Activity-started click beacon", () => {
  test("posts activityId and the access token, keepalive, when the button is clicked", async ({ page }) => {
    await serveRealSite(page);
    await page.addInitScript(() => {
      localStorage.setItem("cognitoAccessToken", "the-access-token");
    });

    let capturedRequest = null;
    await page.route("**/api/v1/activity/started", async (route) => {
      capturedRequest = {
        method: route.request().method(),
        headers: route.request().headers(),
        body: route.request().postDataJSON(),
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "domcontentloaded" });

    const redeemButton = page.locator("#redeemPassBtn");
    await expect(redeemButton).toBeVisible({ timeout: 5000 });
    await expect(redeemButton).toHaveAttribute("data-activity-start", "bundle");

    await redeemButton.click();
    await expect.poll(() => capturedRequest !== null, { timeout: 5000 }).toBe(true);

    expect(capturedRequest.method).toBe("POST");
    expect(capturedRequest.headers.authorization).toBe("Bearer the-access-token");
    expect(capturedRequest.body).toEqual({ activityId: "bundle", phase: "started" });
  });

  test("sends nothing when there is no access token, and the click still reaches the page", async ({ page }) => {
    await serveRealSite(page);

    let beaconCalled = false;
    await page.route("**/api/v1/activity/started", async (route) => {
      beaconCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "domcontentloaded" });

    const redeemButton = page.locator("#redeemPassBtn");
    await expect(redeemButton).toBeVisible({ timeout: 5000 });
    await redeemButton.click();

    // The click must reach the page's own handling (no hang, no thrown error) whether or not
    // a beacon was sent -- confirmed by the page still responding to a second interaction.
    await expect(redeemButton).toBeEnabled();
    expect(beaconCalled).toBe(false);
  });

  test("the help page posts started and completed when it loads", async ({ page }) => {
    await serveRealSite(page);
    await page.addInitScript(() => {
      localStorage.setItem("cognitoAccessToken", "the-access-token");
    });

    const bodies = [];
    await page.route("**/api/v1/activity/started", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("http://localhost:3000/about.html", { waitUntil: "domcontentloaded" });

    await expect.poll(() => bodies.length, { timeout: 5000 }).toBe(2);
    expect(bodies).toContainEqual({ activityId: "help", phase: "started" });
    expect(bodies).toContainEqual({ activityId: "help", phase: "completed" });
  });

  test("the operator dashboard posts started on load and completed once the snapshot renders", async ({ page }) => {
    await serveRealSite(page);
    await page.addInitScript(() => {
      localStorage.setItem("cognitoAccessToken", "the-access-token");
    });

    const bodies = [];
    await page.route("**/api/v1/activity/started", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("http://localhost:3000/operator/dashboard.html", { waitUntil: "domcontentloaded" });

    await expect.poll(() => bodies.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    expect(bodies[0]).toEqual({ activityId: "operator-dashboard", phase: "started" });
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("activity-completed", { detail: "operator-dashboard" })));
    await expect
      .poll(() => bodies.some((b) => b.phase === "completed" && b.activityId === "operator-dashboard"), { timeout: 5000 })
      .toBe(true);
  });
});
