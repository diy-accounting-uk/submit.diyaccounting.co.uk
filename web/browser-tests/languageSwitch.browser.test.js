// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/languageSwitch.browser.test.js
//
// Every page shows the language option in the header: a link that names the other language. It
// stores the reader's choice and goes to the page's copy in that language, or to the same page
// when it has none. The chrome (nav, header, footer, skip link) then reads in the chosen language on
// every page, and its links open the Welsh copy of a page where one exists.

import { test, expect } from "@playwright/test";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

const PAIRS = [
  { english: "/index.html", welsh: "/cy/index.html" },
  { english: "/get-started.html", welsh: "/cy/get-started.html" },
  { english: "/tools.html", welsh: "/cy/tools.html" },
  { english: "/bundles.html", welsh: "/cy/bundles.html" },
  { english: "/spreadsheets.html", welsh: "/cy/spreadsheets.html" },
  { english: "/mtd-calendar.html", welsh: "/cy/mtd-calendar.html" },
  { english: "/rates.html", welsh: "/cy/rates.html" },
];

for (const { welsh } of PAIRS) {
  test(`${welsh} loads every file it asks for and reads its chrome in Welsh`, async ({ page }) => {
    const missing = [];
    page.on("response", (response) => {
      if (response.status() === 404) missing.push(response.url());
    });
    await serveRealSite(page);
    await page.goto(`${SITE_ORIGIN}${welsh}`, { waitUntil: "load" });
    await expect(page.locator(".main-nav")).toHaveAttribute("aria-label", "Prif lywio");
    await expect(page.locator(".main-nav a.active")).toHaveCount(welsh === "/cy/get-started.html" ? 0 : 1);
    await expect(page.locator(".language-notice")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(missing).toEqual([]);
  });
}

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

const storeWelsh = (page) =>
  page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("siteLanguage", "cy");
        sessionStorage.setItem("seeded", "yes");
      }
    } catch {}
  });

for (const signedIn of [false, true]) {
  for (const pagePath of ["/about.html", "/hmrc/receipt/receipts.html", "/help.html", "/auth/login.html"]) {
    test(`${pagePath} shows the language option ${signedIn ? "signed in" : "signed out"}`, async ({ page }) => {
      await serveRealSite(page, { signedIn });
      await page.goto(`${SITE_ORIGIN}${pagePath}`, { waitUntil: "domcontentloaded" });
      const option = page.locator("header .header-nav .header-left .language-switch");
      await expect(option).toHaveAttribute("aria-label", "Language");
      await expect(option.getByRole("link", { name: "Cymraeg" })).toBeVisible();
    });
  }
}

test("a page with no Welsh copy switches its chrome to Welsh and back, and keeps its English body", async ({ page }) => {
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/about.html`, { waitUntil: "domcontentloaded" });
  const heading = await page.locator("h1").textContent();
  await page.locator(".language-switch").getByRole("link", { name: "Cymraeg" }).click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/about.html`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.locator("h1")).toHaveText(heading);
  await expect(page.locator(".main-nav")).toHaveAttribute("lang", "cy");
  await expect(page.locator(".main-nav")).toHaveAttribute("aria-label", "Prif lywio");
  await expect(page.locator(".language-notice")).toHaveText("Mae’r dudalen hon yn Saesneg.");
  await expect(page.locator(".language-notice")).toHaveAttribute("lang", "cy");
  await expect(page.locator(".login-status")).toHaveText("Heb fewngofnodi");
  await expect(page.locator("a.login-link")).toHaveText("Mewngofnodi");
  await expect(page.locator("body > .skip-link")).toHaveText("Neidio i’r prif gynnwys");
  await expect(page.locator("footer")).toHaveAttribute("lang", "cy");
  await expect(page.locator("footer .footer-links")).toContainText("Preifatrwydd (yn Saesneg)");
  await expect(page.locator(".language-switch")).toHaveAttribute("aria-label", "Iaith");

  await page.locator(".language-switch").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/about.html`);
  await expect(page.locator(".main-nav")).not.toHaveAttribute("lang", /.*/);
  await expect(page.locator(".language-notice")).toHaveCount(0);
  await expect(page.locator(".login-status")).toHaveText("Not signed in");
  await expect(page.locator("footer .footer-links a", { hasText: "Privacy" })).toHaveText("Privacy");
});

test("the Welsh choice stays as the reader moves between pages, and the English choice brings English back", async ({ page }) => {
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".language-switch").getByRole("link", { name: "Cymraeg" }).click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/cy/index.html`);

  const nav = page.locator(".main-nav");
  await expect(nav.getByRole("link", { name: "Gweithgareddau" })).toHaveAttribute("href", "../cy/index.html");
  await nav.getByRole("link", { name: /^Derbynebau/ }).click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/cy/hmrc/receipt/receipts.html`);
  await expect(page.locator("h1")).toHaveText("Eich derbynebau");
  await expect(nav.getByRole("link", { name: /^Derbynebau/ })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: /^Derbynebau/ })).not.toContainText("(yn Saesneg)");
  await expect(page.locator(".language-switch").getByRole("link", { name: "English" })).toBeVisible();

  await nav.getByRole("link", { name: "Calendr MTD" }).click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/cy/mtd-calendar.html`);
  await expect(page.locator("h1")).toHaveText("Calendr MTD");
  await nav.getByRole("link", { name: "Cyfraddau treth" }).click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/cy/rates.html`);
  await expect(page.locator("h1")).toHaveText("Cyfraddau treth");

  await page.locator(".home-link").click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/cy/index.html`);

  await page.locator(".language-switch").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/`);
  await nav.getByRole("link", { name: "Receipts" }).click();
  await expect(page).toHaveURL(`${SITE_ORIGIN}/hmrc/receipt/receipts.html`);
  await expect(nav.getByRole("link", { name: "Receipts" })).toHaveAttribute("aria-current", "page");
});

test("a reader with the Welsh choice on the English address of a page with a copy gets the Welsh chrome and a link to the copy", async ({
  page,
}) => {
  await storeWelsh(page);
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/get-started.html`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${SITE_ORIGIN}/get-started.html`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.locator(".language-switch")).toHaveAttribute("aria-label", "Iaith");
  const notice = page.locator(".language-notice");
  await expect(notice).toContainText("Mae’r dudalen hon ar gael yn Gymraeg.");
  await expect(notice.getByRole("link", { name: "Darllenwch hi yn Gymraeg" })).toHaveAttribute("href", "cy/get-started.html");
  await expect(page.locator("a.login-link")).toHaveAttribute("href", "/auth/login.html?next=%2Fcy%2Fget-started.html");
});

test("a reader with the English choice on a Welsh page gets the English chrome and a link to the English page", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("siteLanguage", "en"));
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/cy/get-started.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".main-nav").getByRole("link", { name: "Bundles" })).toHaveAttribute("href", "../bundles.html");
  await expect(page.locator(".language-notice").getByRole("link", { name: "Read it in English" })).toHaveAttribute(
    "href",
    "../get-started.html",
  );
  await expect(page.locator(".language-switch").getByRole("link", { name: "Cymraeg" })).toBeVisible();
  await expect(page.locator("a.login-link")).toHaveAttribute("href", "/auth/login.html?next=%2Fget-started.html");
});

test("the Welsh header names a signed-in reader and the sign-out link in Welsh", async ({ page }) => {
  await storeWelsh(page);
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/about.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".login-status")).toHaveAttribute("aria-label", "Wedi mewngofnodi fel user@example.com");
  await expect(page.locator("a.login-link")).toHaveText("Allgofnodi");
  await expect(page.locator(".settings-cog")).toHaveAttribute("aria-label", "Gosodiadau");
});

test("the Welsh home keeps its Welsh subtitle and its activity links reach a page that exists, its Welsh copy where it has one", async ({
  page,
}) => {
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/cy/index.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toHaveText("Ffeiliwch Ffurflenni TAW a chyfrifon cwmni o’ch taenlen");
  await expect(page.locator(".activity-item button").first()).toBeVisible();
  await expect(page.locator("#homeIntro")).toContainText("£0.99 y mis neu £9.99 y flwyddyn");
  const copies = await page.evaluate(() => window.WELSH_COPIES);
  await page.locator(".activity-item button:not([disabled])").first().click();
  await page.waitForURL((url) => url.pathname !== "/cy/index.html");
  const reached = new URL(page.url()).pathname;
  if (reached.startsWith("/cy/")) expect(copies).toContain(reached.slice("/cy/".length));
  await expect(page.locator("h1")).toBeVisible();
});

test("a Welsh reader on the Welsh micro-entity accounts page reads its form and its chrome in Welsh", async ({ page }) => {
  await storeWelsh(page);
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/cy/companies-house/fileMicroEntityAccounts.html`, { waitUntil: "load" });
  await expect(page.locator("html")).toHaveAttribute("lang", "cy");
  await expect(page.locator("h1")).toHaveText("Ffeilio cyfrifon micro-endid");
  await expect(page.locator("label[for='companyNumber']")).toHaveText("Rhif y cwmni");
  await expect(page.locator(".language-notice")).toHaveCount(0);
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
          await expect(page.locator(".token-balance .token-count")).toHaveText(path === "/" ? /tokens/ : /credyd/);
          await expect(page.locator(".token-refresh-btn")).toBeVisible();
          await expect(page.locator(".login-status")).toHaveAttribute("aria-label", /^(Signed in as|Wedi mewngofnodi fel) /);
        } else {
          await expect(page.locator(".login-status")).toHaveText(path === "/" ? "Not signed in" : "Heb fewngofnodi");
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

test("the Welsh home reads its cookie banner, its cookie dialog and its How to file block in Welsh", async ({ page }) => {
  await serveRealSite(page);
  await page.goto(`${SITE_ORIGIN}/cy/index.html`, { waitUntil: "domcontentloaded" });
  const banner = page.locator("#consent-banner");
  await expect(banner).toHaveAttribute("aria-label", "Caniatâd cwcis");
  await expect(banner).toContainText("Rydym yn defnyddio cwcis");
  await expect(banner).toContainText("polisi preifatrwydd (yn Saesneg).");
  await banner.getByRole("button", { name: "Gwrthod" }).click();
  await expect(banner).toHaveCount(0);

  await page.locator("footer").getByRole("link", { name: "Dewisiadau cwcis" }).click();
  const dialog = page.locator("#consent-dialog");
  await expect(dialog.locator("h2")).toHaveText("Eich dewis cwcis");
  await expect(dialog.locator("#consent-current-choice")).toHaveText("Eich dewis: gwrthod");
  await expect(dialog.getByRole("button", { name: "Derbyn" })).toBeVisible();

  const guides = page.locator("nav.filing-guides");
  await expect(guides).toHaveAttribute("aria-label", "Sut i ffeilio");
  await expect(guides.locator("h2")).toHaveText("Sut i ffeilio");
  await expect(guides.locator("li").first()).toHaveText("Ffurflen TAW o daenlen (yn Saesneg)");
});

for (const width of [320, 390]) {
  test(`the Welsh signed-out line is whole beside the option at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await serveRealSite(page);
    await page.goto(`${SITE_ORIGIN}/cy/index.html`, { waitUntil: "domcontentloaded" });
    const status = page.locator(".login-status");
    await expect(status).toHaveText("Heb fewngofnodi");
    const clipped = await status.evaluate(
      (element) => element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight + 1,
    );
    expect(clipped, ".login-status is clipped").toBe(false);
    await expect(page.locator(".login-link")).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".language-switch a")).toBeInViewport({ ratio: 1 });
  });
}

test("the Companies House callback stays at its registered address and writes its text in the stored Welsh choice", async ({ page }) => {
  await storeWelsh(page);
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/companies-house/filingCallback.html`, { waitUntil: "load" });
  await expect(page).toHaveURL(`${SITE_ORIGIN}/companies-house/filingCallback.html`);
  await expect(page.locator("html")).toHaveAttribute("lang", "cy");
  await expect(page.locator("header h1")).toHaveText("Cysylltu â Thŷ’r Cwmnïau");
  await expect(page.locator("#navigationBtn")).toHaveText("Yn ôl i’r hafan");
  await expect(page.locator(".language-notice")).toHaveCount(0);
  await expect(page.locator("#statusMessagesContainer")).toContainText("Ni chafwyd cod awdurdodi dilys.");
});
