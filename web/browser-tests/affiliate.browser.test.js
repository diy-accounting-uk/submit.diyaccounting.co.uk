// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/affiliate.browser.test.js
// An operator sets the tier and state of a referrer on the bundles page; nobody else sees the section.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const bundleAnswer = (bundleId) => ({
  bundles: [{ bundleId, allocated: true, tokensGranted: 100, tokensConsumed: 0, tokensRemaining: 100 }],
  tokensRemaining: 100,
});

test.describe("set an affiliate", () => {
  test("an operator looks up a referrer and approves it as a casual affiliate", async ({ page }) => {
    const saved = [];
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url, request) => {
        if (url.pathname === "/api/v1/bundle") return bundleAnswer("operator");
        if (url.pathname === "/api/v1/affiliate" && request.method() === "GET") {
          return { referrerHash: "abc123", tier: "creator", state: "applied", updatedAt: "2026-01-01T00:00:00.000Z", approvedAt: null };
        }
        if (url.pathname === "/api/v1/affiliate" && request.method() === "POST") {
          saved.push(request.postDataJSON());
          return {
            referrerHash: "abc123",
            tier: "casual",
            state: "approved",
            updatedAt: "2026-01-02T00:00:00.000Z",
            approvedAt: "2026-01-02T00:00:00.000Z",
          };
        }
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#affiliateSection")).toBeVisible();
    await page.locator("#affiliateReferrerHash").fill("abc123");
    await page.locator("#affiliateLookupBtn").click();
    await expect(page.locator("#affiliateResult")).toContainText("Tier creator, state applied");

    await page.locator("#affiliateTier").selectOption("casual");
    await page.locator("#affiliateState").selectOption("approved");
    await page.locator("#affiliateSaveBtn").click();

    await expect(page.locator("#affiliateResult")).toContainText("Tier casual, state approved, approved 2026-01-02");
    expect(saved).toEqual([{ referrerHash: "abc123", tier: "casual", state: "approved" }]);
  });

  test("a customer does not see the affiliate section", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url) => {
        if (url.pathname === "/api/v1/bundle") return bundleAnswer("resident");
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#affiliateSection")).toBeHidden();
  });
});
