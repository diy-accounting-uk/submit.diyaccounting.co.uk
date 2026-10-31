// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/bundles.names.browser.test.js
// bundles.html and usage.html show catalogue names, never raw ids, and say truthfully how to
// generate a pass.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN, screenshotAll } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const bundlesAnswer = (bundleId) => ({
  bundles: [
    {
      bundleId,
      allocated: true,
      tokensGranted: 100,
      tokensConsumed: 10,
      tokensRemaining: 90,
      tokenEvents: [{ activity: "generate-pass-digital", tokensUsed: 10, timestamp: "2026-10-20T10:00:00Z" }],
    },
  ],
  tokensRemaining: 90,
});

function apiFor(bundleId) {
  return (url) => {
    if (url.pathname === "/api/v1/bundle") return bundlesAnswer(bundleId);
    if (url.pathname === "/api/v1/pass/my-passes") return { passes: [] };
    return undefined;
  };
}

test.describe("bundles and usage names", () => {
  test("usage.html names bundles and activities", async ({ page }) => {
    await serveRealSite(page, { signedIn: true, apiHandler: apiFor("resident") });
    await page.goto(`${SITE_ORIGIN}/usage.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#tokenSourcesBody")).toContainText("Resident");
    await expect(page.locator("#tokenConsumptionBody")).toContainText("Generate Digital Pass");
    await expect(page.locator("#tokenSourcesBody")).not.toContainText("resident-");
    await expect(page.locator("#tokenConsumptionBody")).not.toContainText("generate-pass-digital");
    await screenshotAll(page, "names", "usage");
  });

  test("bundles.html never shows a bundle id and tells a day-pass holder which bundles generate passes", async ({ page }) => {
    await serveRealSite(page, { signedIn: true, apiHandler: apiFor("day-guest") });
    const idsSeen = [];
    await page.exposeFunction("recordCurrentBundleText", (text) => idsSeen.push(text));
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const row = document.querySelector("#currentBundles .bundle-row-name");
        if (row) window.recordCurrentBundleText(row.textContent);
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#currentBundles .bundle-row-name")).toHaveText("Day pass");
    expect(idsSeen.length).toBeGreaterThan(0);
    expect(idsSeen.every((text) => text === "Day pass" || text.trim() === "")).toBe(true);

    const empty = page.locator("#generatedPassesEmpty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("A pass is generated from a bundle that allows it");
    await expect(empty).toContainText("Resident");
    await expect(empty).not.toContainText("home page");
    await screenshotAll(page, "names", "bundles-day-pass");
  });

  test("bundles.html tells a Resident holder where to generate a pass", async ({ page }) => {
    await serveRealSite(page, { signedIn: true, apiHandler: apiFor("resident") });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    const empty = page.locator("#generatedPassesEmpty");
    await expect(empty).toContainText("Generate Digital Pass or Generate Physical Pass");
    await screenshotAll(page, "names", "bundles-resident");
  });

  test("bundles.html names the bundles that generate passes when the passes answer before the catalogue service is ready", async ({
    page,
  }) => {
    await serveRealSite(page, { signedIn: true, apiHandler: apiFor("day-guest") });
    const pageErrors = [];
    const consoleProblems = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") consoleProblems.push(msg.text());
    });
    // The catalogue arrives first, the passes answer next, the environment name (read before the
    // catalogue service exists) arrives last.
    await page.route("**/api/v1/pass/my-passes*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fallback();
    });
    await page.route("**/submit.environment-name.txt", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fallback();
    });
    await page.goto(`${SITE_ORIGIN}/bundles.html`, { waitUntil: "domcontentloaded" });

    const empty = page.locator("#generatedPassesEmpty");
    await expect(empty).toContainText("Resident", { timeout: 15000 });
    expect(consoleProblems.filter((text) => text.includes("Failed to fetch my generated passes"))).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
