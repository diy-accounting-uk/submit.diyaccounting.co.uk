// web/browser-tests/submitVatCallback.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("VAT submission OAuth callback error persistence", () => {
  let callbackHtmlContent;
  let statusMessagesJs;
  let loadingSpinnerJs;

  test.beforeAll(async () => {
    callbackHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/activities/submitVatCallback.html"), "utf-8");
    statusMessagesJs = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/status-messages.js"), "utf-8");
    loadingSpinnerJs = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/loading-spinner.js"), "utf-8");
  });

  async function setupRoutes(page, { tokenResponseStatus = 200, tokenResponseBody = { accessToken: "test-access-token" } } = {}) {
    await page.route("**/activities/submitVatCallback.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: callbackHtmlContent });
    });

    // Any page the user is sent back to (home, or the pending VAT submission activity)
    await page.route("**/index.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>home</title>" });
    });
    await page.route("**/hmrc/vat/submitVat.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>submitVat</title>" });
    });

    await page.route("**/*.js", async (route) => {
      const url = route.request().url();
      if (url.includes("/widgets/status-messages.js")) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: statusMessagesJs });
      } else if (url.includes("/widgets/loading-spinner.js")) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: loadingSpinnerJs });
      } else if (url.endsWith("/submit.js")) {
        // Stand in for the real ES module: signal readiness and provide a minimal
        // fetchWithIdToken that delegates to the mocked /api/v1/hmrc/token route below.
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: `
            window.fetchWithIdToken = window.fetch.bind(window);
            window.__submitReady__ = true;
            document.dispatchEvent(new CustomEvent("submit-ready"));
          `,
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      }
    });

    await page.route("**/submit.css", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/css", body: "" });
    });

    await page.route("**/api/v1/hmrc/token", async (route) => {
      await route.fulfill({
        status: tokenResponseStatus,
        contentType: "application/json",
        body: JSON.stringify(tokenResponseBody),
      });
    });
  }

  test("keeps a failed token exchange error on screen instead of redirecting it away", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("oauth_state", "expected-state");
      sessionStorage.setItem("currentActivity", "/hmrc/vat/submitVat.html");
    });
    await setupRoutes(page, { tokenResponseStatus: 500, tokenResponseBody: { message: "HMRC unavailable" } });

    await page.goto("http://localhost:3000/activities/submitVatCallback.html?code=test-code&state=expected-state", {
      waitUntil: "domcontentloaded",
    });

    const errorMessage = page.locator(".status-message.status-error, .status-error");
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText("Submission failed");

    // The page must not have navigated away, and the message must still be present
    // after a delay long enough to read it.
    await delay(1000);
    expect(page.url()).toContain("submitVatCallback.html");
    await expect(errorMessage).toBeVisible();

    // The user gets an explicit way back to retry, rather than an automatic redirect.
    const navigationBtn = page.locator("#navigationBtn");
    await expect(navigationBtn).toHaveText("Back to VAT submission");

    // The message has a dismiss control consistent with the shared status widget.
    const closeButton = errorMessage.locator(".status-close-button");
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(errorMessage).toHaveCount(0);
  });

  test("redirects back to the pending activity after a successful token exchange", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("oauth_state", "expected-state");
      sessionStorage.setItem("currentActivity", "/hmrc/vat/submitVat.html");
    });
    await setupRoutes(page, { tokenResponseStatus: 200, tokenResponseBody: { accessToken: "test-access-token" } });

    await page.goto("http://localhost:3000/activities/submitVatCallback.html?code=test-code&state=expected-state", {
      waitUntil: "domcontentloaded",
    });

    await page.waitForURL("**/hmrc/vat/submitVat.html", { timeout: 5000 });
    expect(page.url()).toContain("submitVat.html");
  });
});
