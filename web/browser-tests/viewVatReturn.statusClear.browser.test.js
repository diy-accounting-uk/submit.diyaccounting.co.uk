// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/browser-tests/viewVatReturn.statusClear.browser.test.js
// A failed retrieval attempt leaves an error banner behind (status-message.js never
// auto-hides type: "error"). Regression check for that stale banner surviving into a
// later, successful attempt on the same page — see viewVatReturn.html's handleFormSubmission.

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let serverProcess;
let baseUrl;

test.beforeAll(async () => {
  const port = await new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/static-server.mjs", "web/public"], {
      cwd: path.resolve(process.cwd()),
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess = child;
    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/LISTENING_ON:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.stderr.on("data", (chunk) => console.error(`[static-server] ${chunk}`));
    child.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  serverProcess?.kill();
});

test.describe("viewVatReturn - stale status banners", () => {
  test("a failed retrieval's error banner is cleared once a resubmit succeeds", async ({ page }) => {
    // Replace the real submit.js module (OAuth/HMRC-service plumbing not under test) with a
    // stub that still exercises the page's own authorizedFetch/getGovClientHeaders call sites.
    await page.route("**/submit.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.authorizedFetch = (url, options) => fetch(url, options);
          window.getGovClientHeaders = async () => ({});
        `,
      });
    });

    // Stub the catalogue-driven scope check so the direct-fetch branch runs without a real OAuth token.
    await page.route("**/hmrc-scope-check.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.hmrcScopeCheck = {
            isTokenSufficient: async () => true,
            clearHmrcToken: () => {},
            getOAuthScopeString: async () => "read:vat",
          };
        `,
      });
    });

    let attempt = 0;
    await page.route("**/api/v1/hmrc/vat/return*", async (route) => {
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "Not found for the specified query" }),
        });
      } else {
        // Delay the second response so the assertions below run while the retry is still
        // in flight — the real regression left the stale banner up for the whole gap
        // between clicking retrieve and the response arriving, not just after it resolved.
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            periodKey: "17A2",
            vatDueSales: 1000,
            vatDueAcquisitions: 0,
            totalVatDue: 1000,
            vatReclaimedCurrPeriod: 200,
            netVatDue: 800,
            totalValueSalesExVAT: 5000,
            totalValuePurchasesExVAT: 1000,
            totalValueGoodsSuppliedExVAT: 0,
            totalAcquisitionsExVAT: 0,
            finalised: true,
          }),
        });
      }
    });

    // A pre-existing access token routes handleFormSubmission straight to the direct-fetch
    // branch instead of an HMRC OAuth redirect.
    await page.addInitScript(() => {
      sessionStorage.setItem("hmrcAccessToken", "test-access-token");
    });

    await page.goto(
      `${baseUrl}/hmrc/vat/viewVatReturn.html?vrn=193054661&periodStart=2017-01-01&periodEnd=2017-03-31`,
      { waitUntil: "domcontentloaded" },
    );

    // Auto-submit fires on load (URL params + access token both present) and the mocked
    // endpoint 404s on this first call — the page's catch-block error banner appears.
    const errorBanner = page.locator("#statusMessagesContainer .status-message.status-error");
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText(/Failed to retrieve return/);
    await page.screenshot({ path: "target/browser-test-results/viewVatReturn-stale-banner-01-error.png" });

    // Resubmit — the form is visible again because the catch block re-expands it on error.
    await page.locator("#retrieveBtn").click();

    // The stale error banner must clear as soon as the new attempt starts, not only once the
    // (deliberately delayed) response comes back — a poll landing in that gap is what made the
    // real behaviour test fail fast on a banner from the previous, already-abandoned attempt.
    await expect(errorBanner).toHaveCount(0, { timeout: 1_000 });
    await page.screenshot({ path: "target/browser-test-results/viewVatReturn-stale-banner-02-mid-flight.png" });

    // Success once the delayed response lands.
    await expect(page.locator("#returnResults")).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toHaveCount(0);
    await page.screenshot({ path: "target/browser-test-results/viewVatReturn-stale-banner-03-success.png" });
  });
});
