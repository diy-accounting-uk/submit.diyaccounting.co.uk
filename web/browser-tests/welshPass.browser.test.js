// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshPass.browser.test.js
// cy/pass.html: a pass link read in Welsh, at phone and desktop width, from the pass check to the
// redeemed state, the already-held sentence, and the language switch that keeps the pass code.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PEOPLE } from "@app/http-simulator/fixtures/register.js";
const USER_EMAIL = PEOPLE.samPatel.email;

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const CODE = "river-cloud-stone-lamp";
const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/welsh-pass");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Serves the real site from disk, signed in, with the pass API answered from the options. Each
// redeem request's headers are recorded.
async function serveSite(page, { redeem = { redeemed: true, bundleId: "resident-pro", expiry: null }, redeemRequests = [] } = {}) {
  await page.addInitScript((email) => {
    try {
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email }));
    } catch {}
  }, USER_EMAIL);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (url.pathname === "/api/v1/pass" && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ valid: true, bundleId: "resident-pro" }),
      });
    }
    if (url.pathname === "/api/v1/pass" && request.method() === "POST") {
      redeemRequests.push(request.headers());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(redeem) });
    }
    if (url.pathname === "/api/v1/bundle") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles: [], tokensRemaining: 0 }) });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    const pathname = decodeURIComponent(url.pathname) === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
}

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const width of [1280, 390]) {
  test(`the Welsh pass page shows a valid pass in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await serveSite(page);
    await page.goto(`${SITE}/cy/pass.html?pass=${CODE}`, { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", "cy");
    await expect(page.locator("#passHeading")).toHaveText("Mae gennych docyn ar gyfer Resident Pro", { timeout: 15000 });
    const message = page.locator("#passMessage");
    await expect(message).toContainText("Mae’r tocyn hwn yn ychwanegu Resident Pro at eich cyfrif DIY Accounting Submit.");
    await expect(message).toContainText("Gydag ef gallwch gyflwyno Ffurflenni TAW i CThEF");
    await expect(page.locator("#passRedeemBtn")).toHaveText("Defnyddio’r tocyn");
    await expect(page.locator("#passAfterAction")).toHaveText(`Rydych wedi mewngofnodi fel ${USER_EMAIL}.`);
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "valid");
  });

  test(`the Welsh pass page shows the redeemed pass in Welsh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const redeemRequests = [];
    await serveSite(page, { redeemRequests });
    await page.goto(`${SITE}/cy/pass.html?pass=${CODE}`, { waitUntil: "networkidle" });
    await page.locator("#passRedeemBtn").click();
    await expect(page.locator("#passHeading")).toHaveText("Mae’r tocyn wedi’i ddefnyddio", { timeout: 15000 });
    await expect(page.locator("#passMessage")).toContainText("Ychwanegodd eich tocyn Resident Pro.");
    await expect(page.locator("#passMessage")).toContainText("Gallwch nawr gyflwyno Ffurflenni TAW i CThEF");
    await expect(page.locator("#passHomeLink")).toHaveText("Ewch i’ch gweithgareddau");
    await expect(page.locator("#passHomeLink")).toHaveAttribute("href", "index.html");
    expect(redeemRequests[0]["x-site-language"]).toBe("cy");
    expect(await noSideScroll(page)).toBe(true);
    await shoot(page, "redeemed");
  });
}

test("a pass the account already holds on terms as good says so in Welsh", async ({ page }) => {
  await serveSite(page, { redeem: { redeemed: false, reason: "already_held", bundleId: "resident-pro" } });
  await page.goto(`${SITE}/cy/pass.html?pass=${CODE}`, { waitUntil: "networkidle" });
  await page.locator("#passRedeemBtn").click();
  await expect(page.locator("#passHeading")).toHaveText("Mae’r Bundle hwn gennych eisoes", { timeout: 15000 });
  await expect(page.locator("#passMessage")).toContainText("ar delerau sydd o leiaf cystal â’r hyn y mae’r tocyn hwn yn ei roi");
});

test("an ended pass says so in Welsh", async ({ page }) => {
  await serveSite(page);
  await page.route("**/api/v1/pass?code=*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ valid: false, reason: "expired" }) }),
  );
  await page.goto(`${SITE}/cy/pass.html?pass=${CODE}`, { waitUntil: "networkidle" });
  await expect(page.locator("#passHeading")).toHaveText("Ni weithiodd y tocyn hwn", { timeout: 15000 });
  await expect(page.locator("#passError")).toHaveText("Mae’r tocyn hwn wedi dod i ben. Gofynnwch i’r anfonwr am un newydd.");
});

test("a pass redeemed on the English page sends no Welsh language header", async ({ page }) => {
  const redeemRequests = [];
  await serveSite(page, { redeemRequests });
  await page.addInitScript(() => localStorage.setItem("siteLanguage", "en"));
  await page.goto(`${SITE}/pass.html?pass=${CODE}`, { waitUntil: "networkidle" });
  await page.locator("#passRedeemBtn").click();
  await expect(page.locator("#passHeading")).toHaveText("Pass redeemed", { timeout: 15000 });
  expect(redeemRequests[0]["x-site-language"]).toBeUndefined();
});

test("the language switch goes from the English pass page to the Welsh one and back with the pass code kept", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/pass.html?pass=${CODE}`, { waitUntil: "networkidle" });
  const toWelsh = page.locator(".language-switch a");
  await expect(toWelsh).toHaveAttribute("href", `cy/pass.html?pass=${CODE}`, { timeout: 15000 });
  await toWelsh.click();
  await expect(page).toHaveURL(`${SITE}/cy/pass.html?pass=${CODE}`);
  await expect(page.locator("#passHeading")).toHaveText("Mae gennych docyn ar gyfer Resident Pro", { timeout: 15000 });
  const toEnglish = page.locator(".language-switch a");
  await expect(toEnglish).toHaveAttribute("href", `../pass.html?pass=${CODE}`);
  await toEnglish.click();
  await expect(page).toHaveURL(`${SITE}/pass.html?pass=${CODE}`);
  await expect(page.locator("#passHeading")).toHaveText("You have a pass for Resident Pro", { timeout: 15000 });
});

test("a reader who chose Welsh reads the English pass page's sentences wholly in Welsh", async ({ page }) => {
  await serveSite(page);
  await page.addInitScript(() => localStorage.setItem("siteLanguage", "cy"));
  await page.goto(`${SITE}/pass.html?pass=${CODE}`, { waitUntil: "networkidle" });
  await expect(page.locator("#passHeading")).toHaveText("Mae gennych docyn ar gyfer Resident Pro", { timeout: 15000 });
  await expect(page.locator("#passMessage")).toContainText("Gydag ef gallwch gyflwyno Ffurflenni TAW i CThEF");
});

test("a reader who chose English reads the Welsh pass page's sentences wholly in English", async ({ page }) => {
  await serveSite(page);
  await page.addInitScript(() => localStorage.setItem("siteLanguage", "en"));
  await page.goto(`${SITE}/cy/pass.html?pass=${CODE}`, { waitUntil: "networkidle" });
  await expect(page.locator("#passHeading")).toHaveText("You have a pass for Resident Pro", { timeout: 15000 });
  await expect(page.locator("#passMessage")).toContainText("With it you can submit VAT returns to HMRC");
});
