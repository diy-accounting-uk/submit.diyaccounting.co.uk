// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitVatCallback.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { servePageScripts } from "./hmrcFieldTableAssets.js";

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
    await servePageScripts(page);

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
    await expect(errorMessage).toContainText("HMRC sign-in for submit VAT failed");

    // The page must not have navigated away, and the message must still be present
    // after a delay long enough to read it.
    await delay(1000);
    expect(page.url()).toContain("submitVatCallback.html");
    await expect(errorMessage).toBeVisible();

    // The user gets an explicit way back to retry, rather than an automatic redirect.
    const navigationBtn = page.locator("#navigationBtn");
    await expect(navigationBtn).toHaveText("Back to submit VAT");

    // The message has a dismiss control consistent with the shared status widget.
    const closeButton = errorMessage.locator(".status-close-button");
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(errorMessage).toHaveCount(0);
  });

  test("names the obligations activity when its token exchange is rejected", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("oauth_state", "expected-state");
      sessionStorage.setItem("currentActivity", "/hmrc/vat/vatObligations.html");
    });
    await setupRoutes(page, {
      tokenResponseStatus: 401,
      tokenResponseBody: { message: "Upstream token endpoint rejected the token exchange", error: "invalid_client" },
    });

    await page.goto("http://localhost:3000/activities/submitVatCallback.html?code=test-code&state=expected-state", {
      waitUntil: "domcontentloaded",
    });

    const errorMessage = page.locator(".status-message.status-error, .status-error");
    await expect(errorMessage).toContainText("HMRC sign-in for VAT obligations failed");
    await expect(errorMessage).not.toContainText("Submission failed");
    await expect(page.locator("#navigationBtn")).toHaveText("Back to VAT obligations");
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

  const GRANT_ID = "0a1b2c3d-0a1b-4a1b-8a1b-0a1b2c3d4e5f";
  const MCP_STATE = `mcp.${GRANT_ID}.secret`;

  test("returns a practice's agent grant to the practice page with the connected message", async ({ page }) => {
    await page.addInitScript((grantId) => sessionStorage.setItem("practiceHmrcGrantId", grantId), GRANT_ID);
    await setupRoutes(page);
    await page.route("**/api/v1/mcp/hmrc-grants/callback", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "granted" }) });
    });
    await page.route("**/practice.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>practice</title>" });
    });

    await page.goto(`http://localhost:3000/activities/submitVatCallback.html?code=test-code&state=${MCP_STATE}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator(".status-message")).toContainText("Connected to HMRC as an agent.");
    await page.waitForURL("**/practice.html", { timeout: 5000 });
  });

  test("keeps the chat message for an MCP grant the practice page did not start", async ({ page }) => {
    await setupRoutes(page);
    await page.route("**/api/v1/mcp/hmrc-grants/callback", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "granted" }) });
    });

    await page.goto(`http://localhost:3000/activities/submitVatCallback.html?code=test-code&state=${MCP_STATE}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator(".status-message")).toContainText("HMRC access granted. Go back to your chat to carry on.");
    await delay(1800);
    expect(page.url()).toContain("submitVatCallback.html");
  });
});
