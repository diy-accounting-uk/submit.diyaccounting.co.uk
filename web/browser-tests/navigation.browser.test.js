// web/browser-tests/navigation.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Navigation Browser Tests", () => {
  let indexHtmlContent;
  let submitVatHtmlContent;
  let loginHtmlContent;
  let bundlesHtmlContent;

  test.beforeAll(async () => {
    // Read the HTML files
    indexHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/index.html"), "utf-8");
    submitVatHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/vat/submitVat.html"), "utf-8");
    loginHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/auth/login.html"), "utf-8");
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
  });

  test.describe("Home Page Structure", () => {
    test("should display home page with navigation and dynamic activities container", async ({ page }) => {
      // Set the home page content
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify page title
      await expect(page.locator("h1")).toContainText(/DIY Accounting Submit/);

      // Verify main navigation exists with Activities link
      await expect(page.locator("nav.main-nav a:has-text('Activities')")).toBeVisible();

      // Verify dynamic activities container exists (activities load via JavaScript)
      await expect(page.locator("#dynamicActivities")).toHaveCount(1);
    });

    test("home and Activities links resolve to the directory, not index.html", async ({ page }) => {
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      await expect(page.locator("a.home-link")).toHaveAttribute("href", "./");
      await expect(page.locator("nav.main-nav a:has-text('Activities')")).toHaveAttribute("href", "./");
    });
  });

  test.describe("OAuth Callback Handling", () => {
    // test("should redirect to submitVat.html when OAuth callback parameters are detected", async ({ page }) => {
    //   // Set the home page content with OAuth parameters in URL
    //   await page.setContent(indexHtmlContent, {
    //     baseURL: "http://localhost:3000/?code=test-code&state=test-state",
    //     waitUntil: "domcontentloaded",
    //   });
    //   await setTimeout(100);
    //
    //   // Simulate URLSearchParams using the test URL
    //   const hasOAuthParams = await page.evaluate(() => {
    //     const urlParams = new URLSearchParams(document.location.search);
    //     return urlParams.get("code") !== null || urlParams.get("error") !== null;
    //   });
    //
    //   // Verify the logic detects OAuth parameters
    //   expect(hasOAuthParams).toBe(true);
    // });

    test("should not redirect when no OAuth parameters are present", async ({ page }) => {
      // Set the home page content without OAuth parameters
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Simulate URLSearchParams using the test URL
      const hasOAuthParams = await page.evaluate(() => {
        const urlParams = new URLSearchParams(document.location.search);
        return urlParams.get("code") !== null || urlParams.get("error") !== null;
      });

      expect(hasOAuthParams).toBe(false);
    });
  });

  test.describe("Main Navigation", () => {
    test("should navigate to bundles page from main navigation", async ({ page }) => {
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Mock navigation to bundles page
      await page.route("**/bundles.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: bundlesHtmlContent,
        });
      });

      // Click Bundles in main navigation
      await page.click("nav.main-nav a:has-text('Bundles')");
      await setTimeout(100);
    });

    test("should have info icon that links to about page", async ({ page }) => {
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify info icon is visible and links to about page
      const infoLink = page.locator("a.info-link");
      await expect(infoLink).toBeVisible();
      await expect(infoLink).toHaveAttribute("href", "about.html");
    });
  });

  test.describe("Login Page Navigation", () => {
    test("should navigate to login page and display auth providers", async ({ page }) => {
      await page.setContent(indexHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Mock navigation to login page
      await page.route("**/login.html", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: loginHtmlContent,
        });
      });

      // Click login link
      await page.click(".login-link");
      await setTimeout(100);

      // Simulate navigation to login page
      await page.setContent(loginHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify login page content
      await expect(page.locator("h2")).toContainText("Login");
      await expect(page.locator(".google-btn")).toBeVisible();
    });

    test("should navigate from login to coming soon page", async ({ page }) => {
      await page.setContent(loginHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Click Google login button
      await page.click(".google-btn");
      await setTimeout(100);
    });
  });

  test.describe("Bundles Page Navigation", () => {
    test("should navigate to bundles page and display service options", async ({ page }) => {
      await page.setContent(bundlesHtmlContent, {
        baseURL: "http://localhost:3000",
        waitUntil: "domcontentloaded",
      });

      // Verify services page content
      await expect(page.locator("h2")).toContainText("Bundles");
    });
  });
});
