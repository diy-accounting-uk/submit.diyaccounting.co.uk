// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/settings.browser.test.js
//
// The settings page behind the header cog: the preview features switch and the operator features
// switch (this session), and the pass generation switch (this account).

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = process.env.SETTINGS_SCREENSHOT_DIR;

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

// Serves the real site from disk with a signed-in user. The bundles route answers from `account`,
// which the account settings route changes, so a setting kept on the server survives a navigation.
async function serveSite(page, { environmentName = "prod", operator = false } = {}) {
  const account = { passGeneration: true };
  const settingsWrites = [];
  await page.addInitScript(() => {
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "person@test.diyaccounting.co.uk", sub: "person-sub" }));
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (url.pathname === "/api/v1/bundle") {
      const bundles = [{ bundleId: "resident-vat", allocated: true }];
      if (operator) bundles.push({ bundleId: "operator", allocated: true });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bundles, tokensRemaining: 5, settings: account }),
      });
    }
    if (url.pathname === "/api/v1/account/settings" && route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      settingsWrites.push(body);
      Object.assign(account, body);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings: account }) });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (url.pathname === "/submit.environment-name.txt") {
      return route.fulfill({ status: 200, contentType: "text/plain", body: environmentName });
    }
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
  return { account, settingsWrites };
}

async function shoot(page, name) {
  if (!SCREENSHOT_DIR) return;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

test.describe("Settings page", () => {
  test("the cog sits between the token refresh button and Logout and opens the settings page", async ({ page }) => {
    await serveSite(page);
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "networkidle" });
    const order = await page.evaluate(() => {
      const section = document.querySelector(".login-link").parentNode;
      const names = [...section.children].map((element) => (element.matches(".token-balance") ? "tokens" : element.className));
      return names.filter((name) => ["tokens", "settings-cog", "login-link"].includes(name));
    });
    expect(order).toEqual(["tokens", "settings-cog", "login-link"]);
    await expect(page.locator(".token-balance .token-refresh-btn")).toHaveCount(1);
    await page.locator(".settings-cog").click();
    await expect(page).toHaveURL(/\/settings\.html$/);
    await expect(page.locator("h1")).toHaveText("Settings");
    await shoot(page, "settings");
  });

  test.describe("Preview features", () => {
    test("is off by default and prod hides the Practice nav link, the practice page and the Income Tax guide journey", async ({ page }) => {
      await serveSite(page);
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await expect(page.locator("#previewFeaturesSwitch")).not.toBeChecked();
      await expect(page.locator('.main-nav a[data-activity="practice"]')).toBeHidden();
      await page.goto("http://localhost:3000/practice.html", { waitUntil: "networkidle" });
      await expect(page.locator("#activityUnavailablePanel")).toBeVisible();
      await page.goto("http://localhost:3000/guide.html", { waitUntil: "networkidle" });
      await expect(page.locator("details#itsa-quarterly-update")).toHaveCount(0);
    });

    test("on, shows the nav link, opens the practice page with a sandbox banner and shows the hidden guide content", async ({ page }) => {
      await serveSite(page);
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await page.locator("#previewFeaturesSwitch").check();
      await shoot(page, "settings-preview-on");

      await page.goto("http://localhost:3000/bundles.html", { waitUntil: "networkidle" });
      await expect(page.locator('.main-nav a[data-activity="practice"]')).toBeVisible();

      await page.goto("http://localhost:3000/practice.html", { waitUntil: "networkidle" });
      await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
      const banner = page.locator("[data-preview-sandbox]");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("Sandbox");

      await page.goto("http://localhost:3000/guide.html", { waitUntil: "networkidle" });
      await expect(page.locator("details#itsa-quarterly-update")).toHaveCount(1);
      await page.goto("http://localhost:3000/help.html", { waitUntil: "networkidle" });
      await page.locator("#faq-search").fill("Self Assessment");
      await expect(page.locator('.faq-item[data-id="self-assessment-itsa"]')).toBeVisible();
    });

    test("on, sends the preview header and the synthetic HMRC account from a page it opened, and off again hides it", async ({ page }) => {
      await serveSite(page);
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await page.locator("#previewFeaturesSwitch").check();
      await page.goto("http://localhost:3000/practice.html", { waitUntil: "networkidle" });
      await expect(page.locator("[data-preview-sandbox]")).toBeVisible();

      const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/v1/practice/clients"));
      await page.evaluate(() => fetch("/api/v1/practice/clients"));
      const headers = (await request).headers();
      expect(headers["x-preview-features"]).toBe("on");
      expect(headers["hmrcaccount"]).toBe("synthetic");

      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await page.locator("#previewFeaturesSwitch").uncheck();
      await page.goto("http://localhost:3000/practice.html", { waitUntil: "networkidle" });
      await expect(page.locator("#activityUnavailablePanel")).toBeVisible();
    });

    test("on, does not send the preview header from a page the catalogue lists", async ({ page }) => {
      await serveSite(page);
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await page.locator("#previewFeaturesSwitch").check();
      await page.goto("http://localhost:3000/bundles.html", { waitUntil: "networkidle" });
      const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/v1/hmrc/vat/obligation"));
      await page.evaluate(() => fetch("/api/v1/hmrc/vat/obligation"));
      const headers = (await request).headers();
      expect(headers["x-preview-features"]).toBe("on");
      expect(headers["hmrcaccount"]).toBeUndefined();
    });
  });

  test.describe("Operator features", () => {
    test("the switch is not shown to a person who is not an operator", async ({ page }) => {
      await serveSite(page, { operator: false });
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await expect(page.locator("#previewFeaturesSwitch")).toBeVisible();
      await expect(page.locator("#operatorFeaturesRow")).toBeHidden();
    });

    test("is on by default for an operator, who sees the operator dashboard page", async ({ page }) => {
      await serveSite(page, { operator: true });
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await expect(page.locator("#operatorFeaturesSwitch")).toBeVisible();
      await expect(page.locator("#operatorFeaturesSwitch")).toBeChecked();
      await page.goto("http://localhost:3000/operator/dashboard.html", { waitUntil: "networkidle" });
      await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
    });

    test("off, hides the operator dashboard page and the operator bundle for the session, and on shows them again", async ({ page }) => {
      await serveSite(page, { operator: true });
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await page.locator("#operatorFeaturesSwitch").uncheck();
      await shoot(page, "settings-operator-off");

      await page.goto("http://localhost:3000/operator/dashboard.html", { waitUntil: "networkidle" });
      const panel = page.locator("#activityUnavailablePanel");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("Switched off in your settings");

      await page.goto("http://localhost:3000/bundles.html", { waitUntil: "networkidle" });
      await expect(page.locator('[data-bundle-id="operator"]')).toHaveCount(0);

      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await page.locator("#operatorFeaturesSwitch").check();
      await page.goto("http://localhost:3000/operator/dashboard.html", { waitUntil: "networkidle" });
      await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
    });
  });

  test.describe("Pass generation", () => {
    test("is on by default and the pass page shows its form", async ({ page }) => {
      await serveSite(page);
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await expect(page.locator("#passGenerationSwitch")).toBeChecked();
      await page.goto("http://localhost:3000/passes/generate-digital.html", { waitUntil: "networkidle" });
      await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
    });

    test("off, is saved to the account and hides both pass pages, the pass videos and the guide Passes journeys", async ({ page }) => {
      const { account, settingsWrites } = await serveSite(page);
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      const saved = page.waitForRequest(
        (candidate) => candidate.url().endsWith("/api/v1/account/settings") && candidate.method() === "PUT",
      );
      await page.locator("#passGenerationSwitch").uncheck();
      await saved;
      await expect(page.locator("#passGenerationSwitch")).not.toBeChecked();
      expect(settingsWrites).toEqual([{ passGeneration: false }]);
      expect(account.passGeneration).toBe(false);

      for (const pagePath of ["passes/generate-digital.html", "passes/generate-physical.html"]) {
        await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "networkidle" });
        await expect(page.locator("#activityUnavailablePanel")).toContainText("Switched off in your settings");
      }

      await page.goto("http://localhost:3000/guide.html", { waitUntil: "networkidle" });
      await expect(page.locator("details#generate-pass-digital")).toHaveCount(0);
      await expect(page.locator("details#generate-pass-physical")).toHaveCount(0);
      await expect(page.locator("details#my-receipts")).toHaveCount(1);

      await page.goto("http://localhost:3000/videos-account.html", { waitUntil: "networkidle" });
      await expect(page.locator("section.video-section#generate-pass-digital")).toHaveCount(0);
      await expect(page.locator("section.video-section#sign-in")).toHaveCount(1);
    });

    test("is read from the account on a new page and on again shows the pass pages", async ({ page }) => {
      const { account } = await serveSite(page);
      account.passGeneration = false;
      await page.goto("http://localhost:3000/settings.html", { waitUntil: "networkidle" });
      await expect(page.locator("#passGenerationSwitch")).not.toBeChecked();
      await page.locator("#passGenerationSwitch").check();
      await expect.poll(() => account.passGeneration).toBe(true);
      await page.goto("http://localhost:3000/passes/generate-physical.html", { waitUntil: "networkidle" });
      await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
    });
  });
});
