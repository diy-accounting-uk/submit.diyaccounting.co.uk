// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/tokenBalance.browser.test.js
// One token balance everywhere: the header follows a bundle request and a generated pass, the
// digital pass page drops its "This will use" line once a pass exists, and a reader with no
// token bundle sees no balance.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN, screenshotAll } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const totalOf = (bundles) => bundles.reduce((sum, b) => sum + Math.max(0, b.tokensGranted - (b.tokensConsumed || 0)), 0);

test.describe("token balance", () => {
  test("the header shows the new balance after Request Day pass", async ({ page }) => {
    let bundles = [];
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url, request) => {
        if (url.pathname === "/api/v1/bundle" && request.method() === "POST") {
          bundles = [{ bundleId: "day-guest", allocated: true, tokensGranted: 3, tokensConsumed: 0 }];
          return { status: "granted" };
        }
        if (url.pathname === "/api/v1/bundle") return { bundles, tokensRemaining: totalOf(bundles) };
        if (url.pathname === "/api/v1/pass/my-passes") return { passes: [] };
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator(".token-balance")).toBeHidden();
    await page.getByRole("button", { name: /^Request Day pass/ }).click();
    await expect(page.locator(".token-balance .token-count")).toHaveText("3 tokens");
    await screenshotAll(page, "balance", "bundles-after-request");
  });

  test("the digital pass page and the header agree after a pass, and the cost line goes", async ({ page }) => {
    const bundles = [
      { bundleId: "resident", allocated: true, tokensGranted: 100, tokensConsumed: 10, tokensRemaining: 90 },
      { bundleId: "day-guest", allocated: true, tokensGranted: 3, tokensConsumed: 0, tokensRemaining: 3 },
    ];
    let generated = false;
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url) => {
        if (url.pathname === "/api/v1/pass/generate") {
          generated = true;
          return { code: "tiger-happy-mountain-silver", passTypeId: "digital-pass", maxUses: 20, tokensConsumed: 10, tokensRemaining: 83 };
        }
        if (url.pathname === "/api/v1/bundle") {
          const resident = { ...bundles[0], tokensConsumed: generated ? 20 : 10, tokensRemaining: generated ? 80 : 90 };
          const list = [resident, bundles[1]];
          return { bundles: list, tokensRemaining: totalOf(list) };
        }
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/passes/generate-digital.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator(".token-balance .token-count")).toHaveText("93 tokens");
    await expect(page.locator("#tokenInfo")).toBeVisible();
    await page.locator("#generatePassBtn").click();

    await expect(page.locator("#tokensAfter")).toContainText("83 tokens remaining");
    await expect(page.locator("#tokenInfo")).toBeHidden();
    await expect(page.locator(".token-balance .token-count")).toHaveText("83 tokens");
    await screenshotAll(page, "balance", "generate-digital-after");
  });

  test("a reader with no token bundle sees no balance", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url) =>
        url.pathname === "/api/v1/bundle" ? { bundles: [{ bundleId: "operator", allocated: true }], tokensRemaining: 0 } : undefined,
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator(".login-status")).toContainText("Logged in as");
    await expect(page.locator(".token-balance")).toBeHidden();
  });
});
