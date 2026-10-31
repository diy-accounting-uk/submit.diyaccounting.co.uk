// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/passFigures.browser.test.js
// My generated passes shows what each pass has earned: uses, new accounts, filed, subscribers,
// paid charges and last used, a totals row, and "fewer than 3" in place of a small count.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN, screenshotAll } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const busy = {
  code: "tiger-happy-mountain-silver",
  passTypeId: "digital-pass",
  maxUses: 50,
  useCount: 14,
  notes: "Autumn newsletter",
  figures: {
    uses: 14,
    newAccounts: 9,
    filed: 5,
    subscribers: 3,
    paidCharges: 7,
    fewerThanThree: false,
    lastUsed: "2026-10-30T10:00:00.000Z",
  },
};
const quiet = {
  code: "ocean-purple-forest-dawn",
  passTypeId: "physical-pass",
  maxUses: 1,
  useCount: 1,
  figures: {
    uses: 1,
    newAccounts: null,
    filed: null,
    subscribers: null,
    paidCharges: null,
    fewerThanThree: true,
    lastUsed: "2026-10-28T09:00:00.000Z",
  },
};
const unused = {
  code: "river-calm-stone-amber",
  passTypeId: "digital-pass",
  maxUses: 20,
  useCount: 0,
  figures: { uses: 0, newAccounts: null, filed: null, subscribers: null, paidCharges: null, fewerThanThree: true, lastUsed: null },
};

async function openPasses(page, totals) {
  await serveRealSite(page, {
    signedIn: true,
    apiHandler: (url) => {
      if (url.pathname === "/api/v1/pass/my-passes") return { passes: [busy, quiet, unused], count: 3, totals };
      if (url.pathname === "/api/v1/bundle") return { bundles: [], tokensRemaining: 0 };
      return undefined;
    },
  });
  await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#myGeneratedPasses")).toBeVisible();
}

const valueOf = (card, figure) => card.locator(`[data-figure="${figure}"] dd`);

test.describe("pass figures", () => {
  test("each card shows its figures and a pass under three new accounts shows fewer than 3", async ({ page }) => {
    await openPasses(page, {
      passes: 3,
      uses: 15,
      newAccounts: 9,
      filed: 5,
      subscribers: 3,
      paidCharges: 7,
      fewerThanThree: false,
      lastUsed: "2026-10-30T10:00:00.000Z",
    });

    const busyCard = page.locator(`[data-pass-code="${busy.code}"]`);
    await expect(valueOf(busyCard, "uses")).toHaveText("14");
    await expect(valueOf(busyCard, "new-accounts")).toHaveText("9");
    await expect(valueOf(busyCard, "filed")).toHaveText("5");
    await expect(valueOf(busyCard, "subscribers")).toHaveText("3");
    await expect(valueOf(busyCard, "paid-charges")).toHaveText("7");
    await expect(valueOf(busyCard, "last-used")).toHaveText("30 Oct 2026");

    const quietCard = page.locator(`[data-pass-code="${quiet.code}"]`);
    await expect(valueOf(quietCard, "uses")).toHaveText("1");
    for (const figure of ["new-accounts", "filed", "subscribers", "paid-charges"]) {
      await expect(valueOf(quietCard, figure)).toHaveText("fewer than 3");
    }

    await expect(valueOf(page.locator(`[data-pass-code="${unused.code}"]`), "last-used")).toHaveText("Not used yet");
    await screenshotAll(page, "pass-figures", "bundles-passes");
  });

  test("the totals row sums the passes", async ({ page }) => {
    await openPasses(page, {
      passes: 3,
      uses: 15,
      newAccounts: 9,
      filed: 5,
      subscribers: 3,
      paidCharges: 7,
      fewerThanThree: false,
      lastUsed: "2026-10-30T10:00:00.000Z",
    });

    const totals = page.locator("#generatedPassesTotals");
    await expect(totals).toContainText("All 3 passes");
    await expect(valueOf(totals, "uses")).toHaveText("15");
    await expect(valueOf(totals, "new-accounts")).toHaveText("9");
    await expect(valueOf(totals, "paid-charges")).toHaveText("7");
  });

  test("the totals row shows fewer than 3 while the new-account total is small", async ({ page }) => {
    await openPasses(page, {
      passes: 3,
      uses: 15,
      newAccounts: null,
      filed: null,
      subscribers: null,
      paidCharges: null,
      fewerThanThree: true,
      lastUsed: null,
    });

    const totals = page.locator("#generatedPassesTotals");
    await expect(valueOf(totals, "uses")).toHaveText("15");
    await expect(valueOf(totals, "new-accounts")).toHaveText("fewer than 3");
    await expect(valueOf(totals, "subscribers")).toHaveText("fewer than 3");
  });
});
