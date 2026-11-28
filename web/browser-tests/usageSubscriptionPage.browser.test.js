// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/usageSubscriptionPage.browser.test.js
// The usage page's Manage subscription button as a reader sees it: the stages of the trip to the
// subscription page at Stripe, and the failure panel when Stripe gives no page.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/roll13");
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const base64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const ID_TOKEN = `${base64Url({ alg: "none" })}.${base64Url({ sub: "user1", email: "reader@example.com", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const SUBSCRIBED = [
  {
    bundleId: "resident-vat",
    allocated: true,
    stripeSubscriptionId: "sub_test_1",
    stripeCustomerId: "cus_test_1",
    tokensGranted: 100,
    tokensConsumed: 4,
    tokenResetAt: "2026-12-14T00:00:00.000Z",
  },
];

function hold() {
  let arrive;
  let open;
  const arrived = new Promise((resolve) => (arrive = resolve));
  const opened = new Promise((resolve) => (open = resolve));
  return {
    arrived,
    open,
    pass: () => {
      arrive();
      return opened;
    },
  };
}

// The real usage page from disk, signed in with a Stripe subscription, and the portal route answered here.
async function openUsage(page, { portal, holds = {} } = {}) {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript((token) => {
    localStorage.setItem("consent.analytics", "declined");
    localStorage.setItem("cognitoIdToken", token);
    localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "reader@example.com" }));
    // Each stage goes into session storage too, so the record outlives the trip to Stripe's page.
    new MutationObserver((changes) => {
      for (const change of changes) {
        for (const node of change.addedNodes) {
          if (node.nodeType !== 1 || !node.matches('.status-message[data-request-id="submission-stage"]')) continue;
          const stages = JSON.parse(sessionStorage.getItem("test.stages") || "[]");
          stages.push(node.querySelector(".status-message-content").textContent);
          sessionStorage.setItem("test.stages", JSON.stringify(stages));
        }
      }
    }).observe(document, { childList: true, subtree: true });
  }, ID_TOKEN);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/v1/billing/portal") {
      await holds.portal?.pass();
      return route.fulfill(
        portal ?? {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ portalUrl: "http://localhost:3000/stripe-stub.html" }),
        },
      );
    }
    if (url.pathname === "/stripe-stub.html")
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Stripe</title>" });
    if (url.pathname === "/api/v1/bundle") return json({ bundles: SUBSCRIBED, tokensRemaining: 10 });
    if (url.pathname.startsWith("/api/")) return json({});
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
  await page.goto("http://localhost:3000/usage.html", { waitUntil: "load" });
  await expect(page.locator("#manageSubscriptionBtn")).toBeVisible();
}

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`) });
}

const stage = (page) =>
  page.locator('#statusMessagesContainer .status-message[data-request-id="submission-stage"] .status-message-content');

for (const width of [1280, 390]) {
  test(`Manage subscription says it is asking Stripe for the subscription page, then goes there, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const holds = { portal: hold() };
    await openUsage(page, { holds });
    await page.locator("#manageSubscriptionBtn").click();
    await holds.portal.arrived;
    await expect(stage(page)).toHaveText(["Asking Stripe for your subscription page..."]);
    await expect(page.locator("#manageSubscriptionBtn")).toBeDisabled();
    await shoot(page, "usage-portal-asking");
    holds.portal.open();
    await page.waitForURL("**/stripe-stub.html");
    const stages = JSON.parse(await page.evaluate(() => sessionStorage.getItem("test.stages")));
    expect(stages.slice(-2)).toEqual(["Asking Stripe for your subscription page...", "Taking you to your subscription page at Stripe..."]);
  });

  test(`a subscription page Stripe could not open shows the failure panel and gives the button back, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openUsage(page, {
      portal: {
        status: 500,
        contentType: "application/json",
        headers: { "x-request-id": "6f1c2a9e-7b3d-4e2a-9c61-2d8f0b5e7a13" },
        body: JSON.stringify({ message: "Failed to create billing portal session" }),
      },
    });
    await page.locator("#manageSubscriptionBtn").click();
    const panel = page.locator("#statusMessagesContainer + #failureDetail");
    await expect(panel).toHaveAttribute("data-kind", "submit-fault");
    await expect(stage(page)).toHaveCount(0);
    await expect(panel.locator("[data-part=sent]")).toHaveText("Stripe did not open your subscription page.");
    await expect(panel.locator("[data-part=answers]")).toHaveText("Your subscription and your bundles have not changed.");
    await expect(panel.locator("[data-part=kind]")).toHaveText(
      "Submit did not get a page to open from Stripe. This is a fault in Submit or at Stripe, not in your account. Try again later.",
    );
    await expect(panel.locator("[data-part=next]")).toContainText("6f1c2a9e-7b3d-4e2a-9c61-2d8f0b5e7a13");
    await expect(page.locator("#manageSubscriptionBtn")).toBeEnabled();
    await expect(page.locator("#manageSubscriptionBtn")).toHaveText("Manage subscription");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await shoot(page, "usage-portal-failed");
  });
}
