// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/passRelease.browser.test.js
// An operator sees a Release button on a pass held for review; nobody else does.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const bundleAnswer = (bundleId) => ({
  bundles: [{ bundleId, allocated: true, tokensGranted: 100, tokensConsumed: 0, tokensRemaining: 100 }],
  tokensRemaining: 100,
});

const heldPass = { code: "tiger-happy-mountain-silver", passTypeId: "digital-pass", useCount: 1000, heldForReview: true };
const openPass = { code: "river-quiet-garden-amber", passTypeId: "digital-pass", useCount: 3, heldForReview: false };

test.describe("release a pass held for review", () => {
  test("an operator releases a held pass and the list reloads", async ({ page }) => {
    let released = false;
    const releaseBodies = [];
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url, request) => {
        if (url.pathname === "/api/v1/bundle") return bundleAnswer("operator");
        if (url.pathname === "/api/v1/pass/release") {
          releaseBodies.push(request.postDataJSON());
          released = true;
          return { code: heldPass.code, useCount: 1000, reviewLimit: 2000, heldForReview: false };
        }
        if (url.pathname === "/api/v1/pass/my-passes") {
          return { passes: [released ? { ...heldPass, heldForReview: false } : heldPass, openPass] };
        }
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    const heldCard = page.locator(`[data-pass-code="${heldPass.code}"]`).first();
    await expect(heldCard).toContainText("on hold for review");
    await expect(page.locator(`[data-pass-code="${openPass.code}"] .pass-release`)).toHaveCount(0);
    await heldCard.locator(".pass-release").click();

    await expect(heldCard.locator(".pass-release")).toHaveCount(0);
    expect(releaseBodies).toEqual([{ code: heldPass.code, raiseBy: 1000 }]);
  });

  test("a customer sees no Release button on a held pass", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url) => {
        if (url.pathname === "/api/v1/bundle") return bundleAnswer("resident");
        if (url.pathname === "/api/v1/pass/my-passes") return { passes: [heldPass] };
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator(`[data-pass-code="${heldPass.code}"]`).first()).toContainText("on hold for review");
    await expect(page.locator(".pass-release")).toHaveCount(0);
  });

  test("each pass has a Post link to its campaign on the marketing site", async ({ page }) => {
    const vatPass = { ...openPass, bundleId: "resident-vat" };
    const otherPass = { ...heldPass, bundleId: "day-guest" };
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url) => {
        if (url.pathname === "/api/v1/bundle") return bundleAnswer("resident");
        if (url.pathname === "/api/v1/pass/my-passes") return { passes: [vatPass, otherPass] };
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    const vatPost = page.locator(`[data-pass-code="${vatPass.code}"] a.pass-post`);
    await expect(vatPost).toHaveAttribute("href", `https://ci-marketing.diyaccounting.co.uk/?pass=${vatPass.code}#submit-vat`);
    await expect(vatPost).toHaveAttribute("target", "_blank");
    await expect(vatPost).toHaveAttribute("rel", "noopener");
    await expect(page.locator(`[data-pass-code="${otherPass.code}"] a.pass-post`)).toHaveAttribute(
      "href",
      `https://ci-marketing.diyaccounting.co.uk/?pass=${otherPass.code}#submit-all`,
    );
  });
});
