// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/supportForm.browser.test.js
//
// The support form asks where to send the reply: blank for a signed-out visitor, filled from the session for a signed-in one.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE, TEST_EMAIL_DOMAIN } from "@app/http-simulator/fixtures/register.js";

const SIGNED_IN_EMAIL = PEOPLE.priyaHaldane.email;
const OTHER_EMAIL = `accounts@${TEST_EMAIL_DOMAIN}`;

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function serveRealSite(page) {
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
}

test.describe("Support form reply address", () => {
  async function openForm(page, userInfo) {
    await serveRealSite(page);
    if (userInfo) {
      await page.addInitScript((value) => localStorage.setItem("userInfo", value), JSON.stringify(userInfo));
    }
    await page.goto("http://localhost:3000/help.html", { waitUntil: "domcontentloaded" });
    await page.locator("#open-support-form").click();
    await expect(page.locator("#support-modal")).toBeVisible();
  }

  test("a signed-out visitor sees an empty required field with its hint", async ({ page }) => {
    await openForm(page, null);
    const field = page.getByLabel("Your email address");
    await expect(field).toHaveValue("");
    await expect(field).toHaveAttribute("required", "");
    await expect(page.locator("#support-email-hint")).toHaveText("We reply by email to this address.");
  });

  test("a signed-in visitor sees the session's address, can change it, and the request carries the new one", async ({ page }) => {
    await openForm(page, { sub: "u1", email: SIGNED_IN_EMAIL });
    const field = page.getByLabel("Your email address");
    await expect(field).toHaveValue(SIGNED_IN_EMAIL);
    await field.fill(OTHER_EMAIL);
    await page.locator("#support-subject").fill("Question");
    await page.locator("#support-description").fill("Where do I find my receipt?");
    await page.locator("#support-category").selectOption("receipts");
    const request = page.waitForRequest((r) => r.url().endsWith("/api/v1/support/ticket"));
    await page.locator('#support-form button[type="submit"]').click();
    expect(JSON.parse((await request).postData()).email).toBe(OTHER_EMAIL);
  });

  test("the dropdown labels are plain and each appears once", async ({ page }) => {
    await openForm(page, null);
    const labels = await page.locator("#support-category option").allTextContents();
    expect(labels).toEqual(["Select a category", "Connecting to HMRC", "VAT submission", "Bundles and subscriptions", "Receipts", "Other"]);
  });
});
