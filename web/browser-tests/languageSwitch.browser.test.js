// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/languageSwitch.browser.test.js
//
// A page with hreflang alternates shows an English / Cymraeg switch in the header: the
// current language as plain text, the other as a link to the same page in that language.

import { test, expect } from "@playwright/test";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

const PAIRS = [
  { english: "/index.html", welsh: "/cy/index.html" },
  { english: "/get-started.html", welsh: "/cy/get-started.html" },
];

for (const { english, welsh } of PAIRS) {
  test(`${english} links to ${welsh} and back`, async ({ page }) => {
    await serveRealSite(page);
    await page.goto(`${SITE_ORIGIN}${english}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    const englishSwitch = page.locator("header .header-nav .header-left .language-switch");
    await expect(englishSwitch).toHaveAttribute("aria-label", "Language");
    await expect(englishSwitch.locator("a")).toHaveCount(1);
    const toWelsh = englishSwitch.getByRole("link", { name: "Cymraeg" });
    await expect(toWelsh).toHaveAttribute("lang", "cy");
    await expect(toWelsh).toHaveAttribute("hreflang", "cy");

    await toWelsh.click();
    await expect(page).toHaveURL(`${SITE_ORIGIN}${welsh}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator('head link[rel="alternate"][hreflang="cy"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="alternate"][hreflang="en-GB"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
    await expect(page.locator("aside.welsh-services")).toContainText("0300 200 1900");
    const welshSwitch = page.locator("header .header-nav .header-left .language-switch");
    await expect(welshSwitch).toHaveAttribute("aria-label", "Iaith");
    await expect(welshSwitch.locator("a")).toHaveCount(1);

    await welshSwitch.getByRole("link", { name: "English" }).click();
    const expected = english === "/index.html" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${english}`;
    await expect(page).toHaveURL(expected);
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  });
}

test("a page without alternates shows no language switch", async ({ page }) => {
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/about.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".header-nav")).toBeVisible();
  await expect(page.locator(".language-switch")).toHaveCount(0);
});

test("the Welsh home keeps its Welsh subtitle and its activity links reach the site root", async ({ page }) => {
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/cy/index.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toHaveText("Ffeiliwch Ffurflenni TAW a chyfrifon cwmni o’ch taenlen");
  await expect(page.locator(".activity-item button").first()).toBeVisible();
  await expect(page.locator("#homeIntro")).toContainText("£0.99 y mis neu £9.99 y flwyddyn");
  await page.locator(".activity-item button:not([disabled])").first().click();
  await expect(page).not.toHaveURL(/\/cy\/(?!index\.html)/);
});

for (const { path, otherName } of [
  { path: "/", otherName: "Cymraeg" },
  { path: "/cy/index.html", otherName: "English" },
]) {
  for (const signedIn of [false, true]) {
    for (const width of [1280, 768, 375]) {
      const state = signedIn ? "signed in" : "signed out";
      test(`${path} header keeps the language switch whole and clear of the account row at ${width}px, ${state}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await serveRealSite(page, {
          signedIn,
          apiHandler: (url) =>
            url.pathname === "/api/v1/bundle"
              ? {
                  bundles: [{ bundleId: "resident-pro", allocated: true, tokensGranted: 99999, tokensConsumed: 0 }],
                  tokensRemaining: 99999,
                }
              : undefined,
        });
        await page.goto(`${SITE_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
        const bandSwitch = page.locator("header .header-nav .header-left .language-switch");
        await expect(bandSwitch).toBeVisible();
        if (signedIn) {
          await expect(page.locator(".token-balance .token-count")).toHaveText(/tokens/);
          await expect(page.locator(".token-refresh-btn")).toBeVisible();
          await expect(page.locator(".login-status")).toHaveAttribute("aria-label", /^(Signed in as|Wedi mewngofnodi fel) /);
        } else {
          await expect(page.locator(".login-status")).toHaveText("Not logged in");
        }
        const other = bandSwitch.getByRole("link", { name: otherName });
        await expect(other).toBeInViewport({ ratio: 1 });

        const boxes = await page.evaluate(() => {
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          };
          return {
            band: rect(document.querySelector("header .header-nav")),
            switchBox: rect(document.querySelector(".language-switch")),
            auth: rect(document.querySelector(".auth-section")),
            authItems: [".auth-section > *", ".token-balance a", ".token-refresh-btn"]
              .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => ({ name: el.className, ...rect(el) })),
            others: [".home-link", ".info-link", ".theme-toggle", ".auth-section > *", ".token-balance a", ".token-refresh-btn"]
              .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => ({ name: el.className, ...rect(el) })),
          };
        });
        const { band, switchBox, auth } = boxes;
        for (const item of boxes.authItems) {
          expect(item.left, `${item.name} stays inside the account row on the left`).toBeGreaterThanOrEqual(auth.left - 0.5);
          expect(item.right, `${item.name} stays inside the account row on the right`).toBeLessThanOrEqual(auth.right + 0.5);
        }
        if (width === 375) expect(band.bottom - band.top, "the band keeps its two phone rows").toBeLessThan(100);
        expect(switchBox.left, "switch inside the band on the left").toBeGreaterThanOrEqual(band.left);
        expect(switchBox.right, "switch inside the band on the right").toBeLessThanOrEqual(band.right + 0.5);
        expect(switchBox.bottom, "switch inside the band below").toBeLessThanOrEqual(band.bottom);
        for (const other of boxes.others) {
          const apart =
            switchBox.right <= other.left + 0.5 ||
            other.right <= switchBox.left + 0.5 ||
            switchBox.bottom <= other.top + 0.5 ||
            other.bottom <= switchBox.top + 0.5;
          expect(apart, `switch does not overlap ${other.name}`).toBe(true);
        }

        const tag = `${path === "/" ? "en" : "cy"}-${signedIn ? "in" : "out"}-${width}`;
        if (width !== 768) await page.locator("header").screenshot({ path: `target/lang7/${tag}.png` });
      });
    }
  }
}
