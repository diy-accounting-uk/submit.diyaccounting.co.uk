// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/bundles.dayPass.browser.test.js
// bundles.html lists the free Day pass after the paid plans, labels its button "Request Day pass (free)"
// and keeps that label after a status refresh.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN, screenshotAll } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Day pass on the bundles page", () => {
  test("the Day pass card is last and its button reads Request Day pass (free)", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url) => {
        if (url.pathname === "/api/v1/bundle") return { bundles: [], tokensRemaining: 0 };
        if (url.pathname === "/api/v1/pass/my-passes") return { passes: [] };
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    const dayPassButton = page.locator('#catalogBundles button[data-bundle-id="day-guest"]');
    await expect(dayPassButton).toHaveText("Request Day pass (free)", { timeout: 15000 });

    const names = await page
      .locator("#catalogBundles button[data-bundle-name]")
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("data-bundle-name")));
    expect(names.indexOf("Resident Tax Agent")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Day pass")).toBeGreaterThan(names.lastIndexOf("Resident Tax Agent"));
    expect(names[names.length - 1]).toBe("Day pass");

    await expect(page.locator("#catalogBundles")).toContainText("One day, no card. To keep filing after today, choose a plan above.");
    await screenshotAll(page, "daypass", "bundles-day-pass-last");
  });
});
