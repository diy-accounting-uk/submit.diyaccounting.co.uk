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
    const englishSwitch = page.locator("header nav.language-switch");
    await expect(englishSwitch).toHaveAttribute("aria-label", "Language");
    await expect(englishSwitch.locator('[aria-current="true"]')).toHaveText("English");
    const toWelsh = englishSwitch.getByRole("link", { name: "Cymraeg" });
    await expect(toWelsh).toHaveAttribute("lang", "cy");
    await expect(toWelsh).toHaveAttribute("hreflang", "cy");

    await toWelsh.click();
    await expect(page).toHaveURL(`${SITE_ORIGIN}${welsh}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator('head link[rel="alternate"][hreflang="cy"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="alternate"][hreflang="en-GB"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
    const welshSwitch = page.locator("header nav.language-switch");
    await expect(welshSwitch).toHaveAttribute("aria-label", "Iaith");
    await expect(welshSwitch.locator('[aria-current="true"]')).toHaveText("Cymraeg");

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
  await expect(page.locator("nav.language-switch")).toHaveCount(0);
});

test("the Welsh home keeps its own subtitle and its activity links reach the site root", async ({ page }) => {
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/cy/index.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".activity-item button").first()).toBeVisible();
  await expect(page.locator("#homeSubtitle")).toHaveText("Submit to HMRC and Companies House");
  await page.locator(".activity-item button:not([disabled])").first().click();
  await expect(page).not.toHaveURL(/\/cy\/(?!index\.html)/);
});
