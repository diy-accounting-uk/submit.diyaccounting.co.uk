// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/bundles.restrictedPass.browser.test.js
// bundles.html?pass=<code> with an email-restricted pass: the real page's pre-check must accept
// the pass (the public /api/v1/pass answer carries emailRestricted: true) and offer the bundle
// to a signed-in user, or ask a signed-out visitor to log in with the invited email.

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

const PASS_CODE = "invited-guest-pass";
const BUNDLE_ID = "invited-guest";
const BUNDLE_NAME = "Invited Guest";

// Serves the real static site from disk so the real catalogue and the real bundles.html pass
// handling (handlePassEntry, renderCatalogueBundles) are exercised, and stubs only the API.
async function serveRealSite(page, { signedIn }) {
  if (signedIn) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("cognitoIdToken", "mock-id-token");
        localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "invited@example.com" }));
      } catch {}
    });
  }

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname === "/api/v1/pass") {
      expect(url.searchParams.get("code")).toBe(PASS_CODE);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ valid: true, bundleId: BUNDLE_ID, emailRestricted: true }),
      });
      return;
    }
    if (url.pathname === "/api/v1/bundle") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles: [], tokensRemaining: 0 }) });
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

test.describe("bundles.html with an email-restricted pass", () => {
  test("signed in: reports the pass valid for the invited email and enables the Request button", async ({ page }) => {
    await serveRealSite(page, { signedIn: true });

    await page.goto(`http://localhost:3000/bundles.html?pass=${PASS_CODE}`, { waitUntil: "domcontentloaded" });

    const status = page.locator("#passStatus");
    await expect(status).toBeVisible();
    await expect(status).toHaveText(`Pass valid for the invited email. Click "Request ${BUNDLE_NAME}" to add the bundle.`);

    const requestButton = page.locator(`#catalogBundles button[data-bundle-id="${BUNDLE_ID}"]`);
    await expect(requestButton).toBeVisible();
    await expect(requestButton).toBeEnabled();
    await expect(requestButton).toHaveText(new RegExp(`^Request ${BUNDLE_NAME}`));
    await expect(requestButton).toHaveAttribute("data-pass-code", PASS_CODE);
  });

  test("signed out: asks the visitor to log in with the invited email and keeps the pass for after login", async ({ page }) => {
    await serveRealSite(page, { signedIn: false });

    await page.goto(`http://localhost:3000/bundles.html?pass=${PASS_CODE}`, { waitUntil: "domcontentloaded" });

    const status = page.locator("#passStatus");
    await expect(status).toBeVisible();
    await expect(status).toHaveText(`Pass valid! Log in with the invited email to add the "${BUNDLE_NAME}" bundle.`);

    const requestButton = page.locator(`#catalogBundles button[data-bundle-id="${BUNDLE_ID}"]`);
    await expect(requestButton).toBeVisible();
    await expect(requestButton).toBeDisabled();
    await expect(requestButton).toHaveText(new RegExp(`^Log in to add`));

    const pendingPass = await page.evaluate(() => sessionStorage.getItem("pendingPass"));
    expect(pendingPass).toBe(PASS_CODE);
  });
});
