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
          return {
            referrerHash: "abc123",
            tier: "creator",
            state: "applied",
            updatedAt: "2026-01-01T00:00:00.000Z",
            approvedAt: null,
            hasConnectAccount: true,
            detailsSubmitted: true,
            transfersActive: false,
          };
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
    await expect(page.locator("#affiliateResult")).toContainText(
      "Tier creator, state applied, Stripe details submitted, transfers not active",
    );

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

test.describe("apply to be an affiliate", () => {
  const applicationFor = (application) => (url, request) => {
    if (url.pathname === "/api/v1/bundle") return bundleAnswer("resident");
    if (url.pathname === "/api/v1/affiliate/application" && request.method() === "GET") return application;
    return undefined;
  };

  test("a customer who has not applied starts onboarding from the section", async ({ page }) => {
    const posted = [];
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url, request) => {
        if (url.pathname === "/api/v1/affiliate/application" && request.method() === "POST") {
          posted.push(url.pathname);
          return { state: "applied", url: "https://connect.stripe.com/setup/e/acct_1" };
        }
        return applicationFor({ state: null })(url, request);
      },
    });
    await page.route("https://connect.stripe.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "stripe" }));
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#affiliateApplySection")).toBeVisible();
    await expect(page.locator("#affiliateApplyState")).toHaveText("You have not applied.");
    await page.locator("#affiliateApplyBtn").click();
    await page.waitForURL("https://connect.stripe.com/**");
    expect(posted).toEqual(["/api/v1/affiliate/application"]);
  });

  test("an applicant who left Stripe early is offered the way back in", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: applicationFor({ state: "applied", tier: "casual", detailsSubmitted: false, transfersActive: false }),
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#affiliateApplyState")).toContainText("Finish the Stripe steps");
    await expect(page.locator("#affiliateApplyBtn")).toHaveText("Continue with Stripe");
  });

  test("an applicant whose details Stripe holds waits for the decision with no button", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: applicationFor({ state: "applied", tier: "casual", detailsSubmitted: true, transfersActive: false }),
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#affiliateApplyState")).toContainText("We review the application");
    await expect(page.locator("#affiliateApplyBtn")).toBeHidden();
  });

  test("an approved affiliate sees the approval and no button", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: applicationFor({ state: "approved", tier: "casual", detailsSubmitted: true, transfersActive: true }),
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#affiliateApplyState")).toHaveText("You are an approved affiliate.");
    await expect(page.locator("#affiliateApplyBtn")).toBeHidden();
  });
});
