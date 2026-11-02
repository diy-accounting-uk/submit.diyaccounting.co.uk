// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/bundles.passFeedback.browser.test.js
// bundles.html Redeem Pass button: every press shows a message that differs by outcome, a
// repeated outcome is written again, and a valid pass moves focus to the button the message names.

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

const BUNDLE_ID = "invited-guest";
const BUNDLE_NAME = "Invited Guest";

const PASS_ANSWERS = {
  "valid-pass-code": { valid: true, bundleId: BUNDLE_ID },
  "missing-pass-code": { valid: false, reason: "not_found" },
  "expired-pass-code": { valid: false, reason: "expired" },
  "used-up-pass-code": { valid: false, reason: "exhausted" },
  "revoked-pass-code": { valid: false, reason: "revoked" },
};

async function serveRealSite(page, { heldBundles = [] } = {}) {
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
    if (url.pathname === "/api/v1/pass") {
      const answer = PASS_ANSWERS[url.searchParams.get("code")] || { valid: false, reason: "not_found" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
      return;
    }
    if (url.pathname === "/api/v1/bundle") {
      const bundles = heldBundles.map((bundleId) => ({ bundleId, allocated: true }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles, tokensRemaining: 0 }) });
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

async function press(page, code) {
  await page.locator("#passInput").fill(code);
  await page.locator("#redeemPassBtn").click();
}

const MESSAGES = [
  ["missing-pass-code", "Pass not found. Please check the code and try again."],
  ["expired-pass-code", "This pass has expired."],
  ["used-up-pass-code", "This pass has been fully used."],
  ["revoked-pass-code", "This pass has been revoked."],
];

test.describe("bundles.html Redeem Pass feedback", () => {
  for (const [code, message] of MESSAGES) {
    test(`shows "${message}" for ${code}`, async ({ page }) => {
      await serveRealSite(page);
      await page.goto("http://localhost:3000/bundles.html", { waitUntil: "domcontentloaded" });

      await press(page, code);

      await expect(page.locator("#passStatus")).toBeVisible();
      await expect(page.locator("#passStatus")).toHaveText(message);
    });
  }

  test("a valid pass names the Request button and moves focus to it", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "domcontentloaded" });

    await press(page, "valid-pass-code");

    await expect(page.locator("#passStatus")).toHaveText(`Pass valid! Click "Request ${BUNDLE_NAME}" to add the bundle.`);
    const requestButton = page.locator(`#catalogBundles button[data-bundle-id="${BUNDLE_ID}"]`);
    await expect(requestButton).toBeFocused();
  });

  test("a valid pass for a bundle the account holds says the account already has it", async ({ page }) => {
    await serveRealSite(page, { heldBundles: [BUNDLE_ID] });
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");

    await press(page, "valid-pass-code");

    await expect(page.locator("#passStatus")).toHaveText(`This account already has the "${BUNDLE_NAME}" bundle.`);
  });

  test("two presses with the same outcome both write the message again", async ({ page }) => {
    await serveRealSite(page);
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "domcontentloaded" });

    await page.evaluate(() => {
      const el = document.getElementById("passStatus");
      window.__passStatusWrites = [];
      new MutationObserver(() => window.__passStatusWrites.push(el.textContent)).observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });

    await press(page, "expired-pass-code");
    await expect(page.locator("#passStatus")).toHaveText("This pass has expired.");
    await press(page, "expired-pass-code");
    await expect.poll(() => page.evaluate(() => window.__passStatusWrites.length)).toBe(3);
    await expect(page.locator("#passStatus")).toHaveText("This pass has expired.");

    const writes = await page.evaluate(() => window.__passStatusWrites);
    // The first press clears an already empty region, which is no change; the second press clears the message.
    expect(writes.filter((text) => text === "")).toHaveLength(1);
    expect(writes.filter((text) => text === "This pass has expired.")).toHaveLength(2);
  });
});
