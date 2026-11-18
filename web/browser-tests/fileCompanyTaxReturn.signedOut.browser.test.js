// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileCompanyTaxReturn.signedOut.browser.test.js
//
// The Company Tax Return page asks for the practice's clients only once a session exists, in English and Welsh.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function openPage(page, pagePath, { signedIn }) {
  const clientCalls = [];
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/v1/practice/clients") clientCalls.push(route.request().headers().authorization ?? "none");
      const authorised = Boolean(route.request().headers().authorization);
      await route.fulfill({
        status: authorised ? 200 : 401,
        contentType: "application/json",
        body: authorised
          ? JSON.stringify(url.pathname === "/api/v1/practice/clients" ? { clients: [] } : { bundles: [] })
          : '{"message":"Unauthorized"}',
      });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
  if (signedIn) await page.addInitScript(() => localStorage.setItem("cognitoIdToken", "test-id-token"));
  await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
  await page.waitForTimeout(1000);
  return { clientCalls, consoleErrors };
}

test.describe("Company Tax Return page and the practice's clients", () => {
  for (const pagePath of ["companies-house/fileCompanyTaxReturn.html", "cy/companies-house/fileCompanyTaxReturn.html"]) {
    test(`${pagePath} signed out asks for no clients and logs no 401`, async ({ page }) => {
      const { clientCalls, consoleErrors } = await openPage(page, pagePath, { signedIn: false });
      expect(clientCalls).toEqual([]);
      expect(consoleErrors.filter((error) => error.includes("401"))).toEqual([]);
    });
  }

  test("signed in, the page asks for the clients with the session", async ({ page }) => {
    const { clientCalls } = await openPage(page, "companies-house/fileCompanyTaxReturn.html", { signedIn: true });
    await expect.poll(() => clientCalls.length).toBeGreaterThan(0);
    expect(clientCalls[0]).toBe("Bearer test-id-token");
  });
});
