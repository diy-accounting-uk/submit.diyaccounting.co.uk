// web/browser-tests/bundles.mobileSubscription.browser.test.js
//
// Covers issue #5: on mobile viewports, a paying subscriber must be able to
// see and reach the "Manage Subscription" button without scrolling past the
// fold. Loads the real submit.css (unlike the other bundles.* browser tests)
// because this is specifically a layout/position assertion.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const MOBILE_VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 14", width: 390, height: 844 },
];

test.describe("Bundles page - Manage Subscription button on mobile", () => {
  let bundlesHtmlContent;
  let cssContent;
  let bundleCacheContent;
  let requestCacheContent;
  let tomlParserContent;

  test.beforeAll(async () => {
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
    cssContent = fs.readFileSync(path.join(process.cwd(), "web/public/submit.css"), "utf-8");
    bundleCacheContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/bundle-cache.js"), "utf-8");
    requestCacheContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/request-cache.js"), "utf-8");
    tomlParserContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/toml-parser.js"), "utf-8");
  });

  async function setupRoutes(page) {
    await page.addInitScript(() => {
      window.showStatus = window.showStatus || (() => {});
      window.checkAuthStatus = window.checkAuthStatus || (() => {});
      window.toggleMenu = window.toggleMenu || (() => {});
      try {
        localStorage.setItem("cognitoIdToken", "mock-id-token");
        localStorage.setItem("userInfo", JSON.stringify({ sub: "user1" }));
      } catch {}
    });

    const modifiedHtml = bundlesHtmlContent
      .replace("<head>", '<head><base href="http://localhost:3000/">')
      .replace(
        "<body>",
        `<body><script>\nwindow.showStatus = window.showStatus || function(){};\nwindow.checkAuthStatus = window.checkAuthStatus || function(){};\nwindow.toggleMenu = window.toggleMenu || function(){};\n</script>`,
      );
    await page.route("**/bundles.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });

    await page.route("**/submit.css", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/css", body: cssContent });
    });

    await page.route("**/*.js", async (route) => {
      const url = route.request().url();
      const passthrough = { "toml-parser.js": tomlParserContent, "bundle-cache.js": bundleCacheContent, "request-cache.js": requestCacheContent };
      const match = Object.keys(passthrough).find((name) => url.includes(name));
      if (match) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: passthrough[match] });
      } else if (route.request().resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    await page.route("**/submit.catalogue.toml", async (route) => {
      const tomlBody = `
[[bundles]]
id = "resident-vat"
name = "Resident VAT Pass"
enable = "always"
allocation = "on-subscription"
tokensGranted = 100
`;
      await route.fulfill({ status: 200, contentType: "text/x-toml", body: tomlBody });
    });

    await page.route("**/submit.environment-name.txt", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "test\n" });
    });

    await page.route("**/api/v1/bundle", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bundles: [
            {
              bundleId: "resident-vat",
              allocated: true,
              stripeSubscriptionId: "sub_test_123",
              stripeCustomerId: "cus_test_456",
              tokensGranted: 100,
              tokensRemaining: 90,
            },
          ],
        }),
      });
    });
  }

  for (const viewport of MOBILE_VIEWPORTS) {
    test(`Manage Subscription button is visible above the fold on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupRoutes(page);
      await page.goto("http://localhost:3000/bundles.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const el = document.getElementById("currentBundles");
        return !!(el && el.querySelector('button[data-manage-subscription="true"]'));
      });
      await delay(150);

      // The subscription summary panel (moved above the catalogue list so a
      // paying subscriber sees it first) must be visible...
      const section = page.locator("#currentBundlesSection");
      await expect(section).toBeVisible();

      // ...and its Manage Subscription button must be visible and reachable
      // without scrolling past the fold.
      const manageBtn = page.locator('#currentBundles button[data-manage-subscription="true"]');
      await expect(manageBtn).toBeVisible({ timeout: 5000 });
      await expect(manageBtn).toContainText("Manage Subscription");

      const box = await manageBtn.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

      // Minimum 44x44px tap target (WCAG 2.5.5) — check the clickable area
      // including padding, not just the rendered glyph box.
      const tapTarget = await manageBtn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      });
      expect(tapTarget.height).toBeGreaterThanOrEqual(44);
      expect(tapTarget.width).toBeGreaterThanOrEqual(44);

      // Keyboard-focusable (WCAG 2.1.1)
      await manageBtn.focus();
      await expect(manageBtn).toBeFocused();

      // No horizontal scroll should be introduced.
      const scrollX = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        return window.scrollX;
      });
      expect(scrollX).toBe(0);
    });
  }
});
