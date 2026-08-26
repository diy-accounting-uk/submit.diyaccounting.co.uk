// web/browser-tests/passRedeemer.browser.test.js
//
// Covers issue #6: a pass link pointed straight at an activity page must
// redeem in place, without forcing a detour through bundles.html.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Pass Redeemer widget on an activity page", () => {
  let passRedeemerJsContent;
  let statusMessagesJsContent;

  test.beforeAll(async () => {
    passRedeemerJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/pass-redeemer.js"), "utf-8");
    statusMessagesJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/status-messages.js"), "utf-8");
  });

  function activityPageHtml() {
    return `<!doctype html>
<html lang="en">
  <head><base href="http://localhost:3000/" /></head>
  <body>
    <div id="statusMessagesContainer" role="alert" aria-live="polite"></div>
    <main id="mainContent"><h1>Activity page</h1></main>
    <script>
      window.__submitReady__ = true;
      window.fetchWithIdToken = function (url, opts) {
        const init = Object.assign({}, opts);
        init.headers = Object.assign({}, init.headers, { Authorization: "Bearer mock-id-token" });
        return fetch(url, init);
      };
    </script>
    <script src="widgets/status-messages.js"></script>
    <script src="widgets/pass-redeemer.js"></script>
  </body>
</html>`;
  }

  async function setupRoutes(page, { loggedIn = true, passResponse = null } = {}) {
    if (loggedIn) {
      await page.addInitScript(() => {
        try {
          localStorage.setItem("cognitoIdToken", "mock-id-token");
        } catch {}
      });
    }

    await page.route("**/activity.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: activityPageHtml() });
    });
    await page.route("**/widgets/status-messages.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: statusMessagesJsContent });
    });
    await page.route("**/widgets/pass-redeemer.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: passRedeemerJsContent });
    });
    if (passResponse) {
      await page.route("**/api/v1/pass", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(passResponse) });
      });
    }
  }

  test("prompts to log in and preserves the pass for after login when not authenticated", async ({ page }) => {
    await setupRoutes(page, { loggedIn: false });
    await page.goto("http://localhost:3000/activity.html?pass=word-word-word-word", { waitUntil: "domcontentloaded" });
    await delay(300);

    await expect(page.locator("#statusMessagesContainer")).toContainText("Log in to redeem your pass.");

    const pendingPass = await page.evaluate(() => sessionStorage.getItem("pendingPass"));
    const postLoginRedirect = await page.evaluate(() => sessionStorage.getItem("postLoginRedirect"));
    expect(pendingPass).toBe("word-word-word-word");
    expect(postLoginRedirect).toContain("/activity.html");
    expect(postLoginRedirect).toContain("pass=word-word-word-word");
  });

  test("redeems the pass in place for a logged-in user and drops ?pass= from the URL", async ({ page }) => {
    await setupRoutes(page, { loggedIn: true, passResponse: { redeemed: true, bundleId: "invited-guest" } });

    let bundleChangedFired = false;
    await page.exposeFunction("__reportBundleChanged", () => {
      bundleChangedFired = true;
    });
    await page.addInitScript(() => {
      window.addEventListener("bundle-changed", () => window.__reportBundleChanged());
    });

    await page.goto("http://localhost:3000/activity.html?pass=word-word-word-word", { waitUntil: "domcontentloaded" });
    await delay(300);

    await expect(page.locator("#statusMessagesContainer")).toContainText('Pass redeemed! Bundle "invited-guest" has been added.');
    expect(new URL(page.url()).searchParams.has("pass")).toBe(false);
    expect(bundleChangedFired).toBe(true);
  });

  test("shows an inline error with a link back to Bundles when the pass is invalid", async ({ page }) => {
    await setupRoutes(page, { loggedIn: true, passResponse: { redeemed: false, reason: "expired" } });
    await page.goto("http://localhost:3000/activity.html?pass=word-word-word-word", { waitUntil: "domcontentloaded" });
    await delay(300);

    await expect(page.locator("#statusMessagesContainer")).toContainText("This pass has expired.");
    const bundlesLink = page.locator('#statusMessagesContainer a[href="/bundles.html"]');
    await expect(bundlesLink).toHaveCount(1);
    expect(new URL(page.url()).searchParams.has("pass")).toBe(false);
  });

  test("does nothing when no pass parameter is present", async ({ page }) => {
    await setupRoutes(page, { loggedIn: true });
    await page.goto("http://localhost:3000/activity.html", { waitUntil: "domcontentloaded" });
    await delay(300);

    await expect(page.locator("#statusMessagesContainer")).toBeEmpty();
  });
});
