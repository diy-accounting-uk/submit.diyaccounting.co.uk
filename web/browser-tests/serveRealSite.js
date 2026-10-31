// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/serveRealSite.js
// Serves the real static site from disk to a page, so the real page scripts run, and answers
// /api/ calls from a handler the test supplies. Other hosts get an empty script.

import fs from "fs";
import path from "path";

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

export const SITE_ORIGIN = "http://localhost:3000";

// apiHandler(url, request) returns an object to send as JSON, or undefined for an empty object.
export async function serveRealSite(page, { signedIn = false, apiHandler = () => undefined } = {}) {
  if (signedIn) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("cognitoIdToken", "mock-id-token");
        localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "user@example.com" }));
      } catch {}
    });
  }

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const body = apiHandler(url, request);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body ?? {}) });
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

// Records the consent answer as declined and removes the banner and dialog, so a capture shows the page.
async function declineConsent(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("consent.rum", "declined");
      localStorage.setItem("consent.analytics", "declined");
    } catch {
      // storage is blocked: the banner is removed below
    }
    for (const id of ["consent-banner", "consent-dialog"]) document.getElementById(id)?.remove();
  });
}

// Screenshots of a page at phone and desktop width, light and dark, for review.
export async function screenshotAll(page, label, pageName) {
  const dir = path.join(process.cwd(), "target/rook-screenshots", label);
  fs.mkdirSync(dir, { recursive: true });
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme });
      await declineConsent(page);
      await page.screenshot({ path: path.join(dir, `${pageName}-${width}-${theme}.png`), fullPage: true });
    }
  }
}
