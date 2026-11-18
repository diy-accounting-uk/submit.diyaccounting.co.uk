// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshCallbacks.browser.test.js
//
// The callback pages keep their registered English addresses. A reader whose stored choice is Welsh
// reads each one in Welsh, the skip link included; a reader with no choice reads it in English.

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
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const CALLBACKS = [
  { page: "companies-house/filingCallback.html", welsh: "Cysylltu â Thŷ’r Cwmnïau", english: "Connecting to Companies House" },
  { page: "activities/submitVatCallback.html", welsh: "Cysylltu â CThEF", english: "Connecting to HMRC" },
  { page: "auth/loginWithCognitoCallback.html", welsh: "Yn eich mewngofnodi", english: "Signing you in" },
  { page: "auth/loginWithMockCallback.html", welsh: "Yn eich mewngofnodi", english: "Signing you in" },
];

async function openCallback(page, callbackPath, language) {
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
  if (language) await page.addInitScript((choice) => localStorage.setItem("siteLanguage", choice), language);
  await page.goto(`http://localhost:3000/${callbackPath}`, { waitUntil: "load" });
}

test.describe("Callback pages and the language choice", () => {
  for (const { page: callbackPath, welsh, english } of CALLBACKS) {
    test(`${callbackPath} reads in Welsh, skip link included, for a Welsh choice`, async ({ page }) => {
      await openCallback(page, callbackPath, "cy");
      expect(new URL(page.url()).pathname).toBe(`/${callbackPath}`);
      await expect(page.locator("html")).toHaveAttribute("lang", "cy");
      await expect(page.locator("body > .skip-link")).toHaveText("Neidio i’r prif gynnwys");
      await expect(page.locator("header h1")).toHaveText(welsh);
      await expect(page.locator("main")).not.toContainText("If nothing happens");
    });

    test(`${callbackPath} stays English with no choice`, async ({ page }) => {
      await openCallback(page, callbackPath, null);
      await expect(page.locator("body > .skip-link")).toHaveText("Skip to main content");
      await expect(page.locator("header h1")).toHaveText(english);
    });
  }
});
