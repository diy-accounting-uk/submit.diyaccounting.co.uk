// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/homeActivities.browser.test.js
//
// The home page's activity buttons for a Resident account, over the real catalogue: every
// button opens a page, and an activity with no page has no button.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = process.env.HOME_SCREENSHOT_DIR;

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const RESIDENT_BUNDLES = {
  bundles: [{ bundleId: "resident-pro", allocated: true, subscriptionStatus: "active", tokensGranted: 100 }],
  tokensRemaining: 100,
};

async function serveHomeForResident(page, environmentName = "proxy", bundleAnswer = { status: 200, body: RESIDENT_BUNDLES }) {
  await page.addInitScript(() => {
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "resident@test.diyaccounting.co.uk" }));
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (url.pathname === "/api/v1/bundle") {
      return route.fulfill({ status: bundleAnswer.status, contentType: "application/json", body: JSON.stringify(bundleAnswer.body) });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (url.pathname === "/submit.environment-name.txt")
      return route.fulfill({ status: 200, contentType: "text/plain", body: environmentName });
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
}

test.describe("Home page activities for a Resident account", () => {
  test("every activity button opens a page, and an activity with no page has no button", async ({ page }) => {
    await serveHomeForResident(page);
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const buttons = page.locator("#dynamicActivities .activity-group button.btn:not([disabled])");
    await expect(buttons.first()).toBeVisible();
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    await expect(page.locator("#dynamicActivities")).not.toContainText("PSC Verification Statement");
    await expect(page.locator("#dynamicActivities")).not.toContainText(/Save diya-gl books/i);

    if (SCREENSHOT_DIR) {
      const size = page.viewportSize().width;
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `home-resident-${size}.png`), fullPage: true });
    }

    for (let index = 0; index < count; index += 1) {
      await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
      await expect(buttons.nth(index)).toBeVisible();
      await buttons.nth(index).click();
      await page.waitForURL((url) => url.pathname !== "/" || url.hash !== "");
      expect(new URL(page.url()).pathname).toMatch(/\.html$/);
    }
  });

  test("the Company Tax Return and the joint filing have their own Corporation Tax section, between Income Tax and Companies House", async ({
    page,
  }) => {
    await serveHomeForResident(page);
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const activities = page.locator("#dynamicActivities");
    const corporationTax = activities.locator("section.activity-group", { has: page.locator("h2", { hasText: "Corporation Tax" }) });
    await expect(corporationTax).toBeVisible();
    await expect(corporationTax).toContainText("Company Tax Return");
    await expect(
      activities.locator("section.activity-group", { has: page.locator("h2", { hasText: "Companies House" }) }),
    ).not.toContainText("Company Tax Return");
    const headings = await activities.locator("section.activity-group > h2").allTextContents();
    expect(headings.indexOf("Corporation Tax")).toBeGreaterThan(headings.indexOf("Income Tax"));
    expect(headings.indexOf("Corporation Tax")).toBeLessThan(headings.indexOf("Companies House"));
  });

  test("a catalogue with a paths array written over several lines still gives the activity buttons", async ({ page }) => {
    const catalogue = fs.readFileSync(path.join(PUBLIC_ROOT, "submit.catalogue.toml"), "utf-8");
    const oneLine = catalogue.split("\n").find((line) => line.startsWith('paths = ["companies-house/recordsLocation.html"'));
    const overLines = oneLine.replace("[", "[\n  ").replaceAll('", "', '",\n  "').replace(/\]$/, ",\n]");
    await serveHomeForResident(page);
    await page.route("**/submit.catalogue.toml", (route) =>
      route.fulfill({ status: 200, contentType: "text/x-toml", body: catalogue.replace(oneLine, overLines) }),
    );
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const buttons = page.locator("#dynamicActivities .activity-group button.btn:not([disabled])");
    await expect(buttons.first()).toBeVisible();
    await expect(page.locator("#dynamicActivities")).toContainText("Tell Companies House where the company keeps its records");
  });

  test("prod shows no status box, and the introduction lists only what the catalogue lists for prod", async ({ page }) => {
    await serveHomeForResident(page, "prod");
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#homeIntro")).toContainText("VAT returns");
    await expect(page.locator("#homeIntro")).not.toContainText("Income Tax");
    await expect(page.locator("#dynamicActivities .activity-group").first()).toBeVisible();
    await expect(page.locator('[data-feature-status="summary"]')).toBeHidden();
    await expect(page.locator('#featureStatusList .status-tag[data-status="production"]')).toHaveCount(1);
  });

  test("the status box lists sandbox and preview features where the catalogue lists them", async ({ page }) => {
    await serveHomeForResident(page, "ci");
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const box = page.locator("#featureStatusList");
    await expect(box.locator('.status-tag[data-status="sandbox"]')).toBeVisible();
    await expect(box.locator("li", { hasText: "Preview" })).toContainText("HMRC Assist for VAT");
    await expect(box.locator("li", { hasText: "Sandbox" })).toContainText("HMRC Income Tax (MTD)");
    await expect(box.locator("li", { hasText: "Preview" })).toContainText("you can try the screens, and nothing is sent");
    await expect(page.locator('[data-feature-status="summary"]')).toBeVisible();
  });

  test("a signed-out visitor sees the Companies House filings, and each button names the page that sign-in returns to", async ({
    page,
  }) => {
    await serveHomeForResident(page, "prod");
    await page.addInitScript(() => localStorage.removeItem("cognitoIdToken"));
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const activities = page.locator("#dynamicActivities");
    await expect(activities.locator("h2", { hasText: "Companies House" })).toBeVisible();
    await expect(activities).toContainText("File Micro-entity Accounts (Companies House)");
    await expect(activities).not.toContainText("Company Tax Return");
    await activities.locator("button", { hasText: "Submit VAT" }).click();
    await page.waitForURL("**/auth/login.html?next=*");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/hmrc/vat/submitVat.html");
  });

  test("the Welsh home page lists the activities and the status in Welsh", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("cognitoIdToken"));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      if (url.pathname === "/submit.environment-name.txt") return route.fulfill({ status: 200, contentType: "text/plain", body: "prod" });
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
    await page.goto("http://localhost:3000/cy/index.html", { waitUntil: "domcontentloaded" });

    const activities = page.locator("#dynamicActivities");
    await expect(activities).toContainText("Mae angen cyfrif a Bundle ar gyfer y gweithgareddau hyn.");
    await expect(activities.locator("h2").first()).toHaveText("TAW");
    await expect(activities).toContainText("Cyflwyno TAW (CThEF)");
    await expect(activities).not.toContainText(/These activities|Submit VAT|Obligations/);
    const status = page.locator("#featureStatusList");
    await expect(status).toContainText("at ddefnydd go iawn: TAW CThEF");
    await expect(status).not.toContainText(/for real use|Production/);
  });
});

test.describe("Home page when the account's bundles cannot be read", () => {
  test("says the list may leave out activities the account holds, and shows no token balance", async ({ page }) => {
    await serveHomeForResident(page, "proxy", { status: 500, body: { message: "The bundles could not be read" } });
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await expect(page.locator("#dynamicActivities .activity-message--error")).toHaveText(
      "Your bundles could not be read, so this list may leave out activities you hold. Reload the page to try again.",
    );
    await expect(page.locator("#dynamicActivities .activity-group").first()).toBeVisible();
    await expect(page.getByText("0 tokens")).toHaveCount(0);
  });

  test("says nothing of the kind when the bundles are read", async ({ page }) => {
    await serveHomeForResident(page);
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await expect(page.locator("#dynamicActivities .activity-group").first()).toBeVisible();
    await expect(page.locator("#dynamicActivities .activity-message--error")).toHaveCount(0);
  });

  test("says so in Welsh on the Welsh home page", async ({ page }) => {
    await serveHomeForResident(page, "proxy", { status: 503, body: { message: "Unavailable" } });
    await page.goto("http://localhost:3000/cy/index.html", { waitUntil: "networkidle" });
    await expect(page.locator("#dynamicActivities .activity-message--error")).toContainText("Nid oedd modd darllen eich bwndeli");
  });
});
