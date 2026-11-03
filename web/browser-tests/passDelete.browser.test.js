// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/passDelete.browser.test.js
// My generated passes: a trash button per pass, a checkbox per pass with Select all and Delete
// selected, and an in-page confirm before either delete. A deleted pass leaves the list.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN, screenshotAll } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const figures = { uses: 0, newAccounts: null, filed: null, subscribers: null, paidCharges: null, fewerThanThree: true, lastUsed: null };
const passes = [
  { code: "tiger-happy-mountain-silver", passTypeId: "digital-pass", maxUses: 50, useCount: 0, notes: "Autumn newsletter", figures },
  { code: "ocean-purple-forest-dawn", passTypeId: "physical-pass", maxUses: 1, useCount: 0, figures },
];

async function openPasses(page) {
  const live = [...passes];
  const deleteRequests = [];
  await serveRealSite(page, {
    signedIn: true,
    apiHandler: (url, request) => {
      if (url.pathname === "/api/v1/pass/my-passes") return { passes: live, count: live.length };
      if (url.pathname === "/api/v1/pass/delete") {
        const { codes } = JSON.parse(request.postData());
        deleteRequests.push(codes);
        for (const code of codes)
          live.splice(
            live.findIndex((pass) => pass.code === code),
            1,
          );
        return { results: codes.map((code) => ({ code, status: "deleted" })), deletedCount: codes.length };
      }
      if (url.pathname === "/api/v1/bundle") return { bundles: [], tokensRemaining: 0 };
      return undefined;
    },
  });
  await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#myGeneratedPasses")).toBeVisible();
  await expect(page.locator(".pass-delete")).toHaveCount(live.length);
  return deleteRequests;
}

test.describe("delete generated passes", () => {
  test("the trash button names its pass, asks to confirm, and removes only that pass", async ({ page }) => {
    const deleteRequests = await openPasses(page);

    const trash = page.getByRole("button", { name: "Delete pass tiger-happy-mountain-silver" });
    const box = await trash.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);

    await trash.click();
    const confirm = page.locator("#passDeleteConfirm");
    await expect(confirm).toContainText("Delete pass tiger-happy-mountain-silver?");
    expect(deleteRequests).toEqual([]);

    await confirm.getByRole("button", { name: "Keep" }).click();
    await expect(confirm).toHaveCount(0);
    expect(deleteRequests).toEqual([]);

    await trash.click();
    await page.locator("#passDeleteConfirm").getByRole("button", { name: "Yes, delete" }).click();

    await expect(page.locator('[data-pass-code="tiger-happy-mountain-silver"]')).toHaveCount(0);
    await expect(page.locator('[data-pass-code="ocean-purple-forest-dawn"]').first()).toBeVisible();
    expect(deleteRequests).toEqual([["tiger-happy-mountain-silver"]]);
  });

  test("Select all ticks every pass and Delete selected removes them after a confirm", async ({ page }) => {
    const deleteRequests = await openPasses(page);

    const deleteSelected = page.locator("#deleteSelectedPassesBtn");
    await expect(deleteSelected).toBeDisabled();

    await page.getByLabel("Select all").check();
    await expect(page.getByRole("checkbox", { name: "Select pass tiger-happy-mountain-silver" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Select pass ocean-purple-forest-dawn" })).toBeChecked();
    await expect(deleteSelected).toHaveText("Delete selected (2)");
    await screenshotAll(page, "pass-delete", "bundles-passes-selected");

    await deleteSelected.click();
    await expect(page.locator("#passDeleteConfirm")).toContainText("Delete 2 passes?");
    expect(deleteRequests).toEqual([]);
    await screenshotAll(page, "pass-delete", "bundles-passes-confirm");

    await page.locator("#passDeleteConfirm").getByRole("button", { name: "Yes, delete" }).click();

    await expect(page.locator(".pass-delete")).toHaveCount(0);
    await expect(page.locator("#generatedPassesToolbar")).toBeHidden();
    expect(deleteRequests).toEqual([["tiger-happy-mountain-silver", "ocean-purple-forest-dawn"]]);
  });

  test("ticking one pass deletes only that pass", async ({ page }) => {
    const deleteRequests = await openPasses(page);

    await page.getByRole("checkbox", { name: "Select pass ocean-purple-forest-dawn" }).check();
    await expect(page.locator("#selectAllPasses")).not.toBeChecked();
    await page.locator("#deleteSelectedPassesBtn").click();
    await page.locator("#passDeleteConfirm").getByRole("button", { name: "Yes, delete" }).click();

    await expect(page.locator(".pass-delete")).toHaveCount(1);
    expect(deleteRequests).toEqual([["ocean-purple-forest-dawn"]]);
  });
});
