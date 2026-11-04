// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/commissionEarnings.browser.test.js
// My generated passes shows the referrer's own held, payable and paid commission, with the day
// each held part releases, and shows nothing for a caller who has earned nothing.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN, screenshotAll } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const pass = { code: "tiger-happy-mountain-silver", passTypeId: "digital-pass", maxUses: 50, useCount: 2 };

async function openPasses(page, earnings) {
  await serveRealSite(page, {
    signedIn: true,
    apiHandler: (url) => {
      if (url.pathname === "/api/v1/pass/my-passes") return { passes: [pass], count: 1 };
      if (url.pathname === "/api/v1/bundle") return { bundles: [], tokensRemaining: 0 };
      if (url.pathname === "/api/v1/commission/mine") return earnings;
      return undefined;
    },
  });
  await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#myGeneratedPasses")).toBeVisible();
}

test.describe("commission earnings", () => {
  test("shows held with its release dates, payable and paid", async ({ page }) => {
    await openPasses(page, {
      currency: "gbp",
      held: {
        totalPence: 400,
        releases: [
          { releaseDate: "2026-12-01", amountPence: 300 },
          { releaseDate: "2026-12-05", amountPence: 100 },
        ],
      },
      payable: { totalPence: 250 },
      paid: { totalPence: 1099 },
    });

    const block = page.locator("#commissionEarnings");
    await expect(block).toBeVisible();
    await expect(block.locator('[data-earnings="held"]')).toHaveText("Held: £4.00");
    await expect(block.locator('[data-earnings="releases"]')).toHaveText(
      "£3.00 releases on 1 December 2026; £1.00 releases on 5 December 2026",
    );
    await expect(block.locator('[data-earnings="payable"]')).toHaveText("Payable: £2.50");
    await expect(block.locator('[data-earnings="paid"]')).toHaveText("Paid: £10.99");
    await screenshotAll(page, "commission-earnings", "bundles-earnings");
  });

  test("shows nothing when nothing has been earned", async ({ page }) => {
    await openPasses(page, { currency: "gbp", held: { totalPence: 0, releases: [] }, payable: { totalPence: 0 }, paid: { totalPence: 0 } });
    await expect(page.locator("#commissionEarnings")).toBeHidden();
  });
});
