// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshSwitchAddress.browser.test.js
// The language switch and the language notice carry the address as it is when they are used: a
// one-time parameter the page has removed stays behind, a query the page keeps goes with the
// reader, and a company the drill-down has moved to opens in the other language.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const PASS_CODE = "river-cloud-stone-lamp";
const SESSION_ID = "cs_test_switch_address";

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

const PROFILE = (companyNumber, companyName) => ({
  companyNumber,
  companyName,
  companyStatus: "active",
  companyType: "ltd",
  dateOfCreation: "2009-04-16",
  jurisdiction: "england-wales",
  registeredOfficeAddress: { address_line_1: "1 Example Street", locality: "Cardiff", postal_code: "CF14 3UZ", country: "Wales" },
  sicCodes: ["62012"],
});

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// The real site from disk, signed in, with the API answered here. Each purchase lookup the GA4
// purchase event makes is recorded.
async function serveSite(page, { purchaseLookups = [], language = null, generatedPasses = [PASS_CODE] } = {}) {
  await page.addInitScript((chosen) => {
    try {
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "pat@example.com" }));
      if (chosen) localStorage.setItem("siteLanguage", chosen);
    } catch {}
    window.gtag = function () {};
  }, language);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) {
      if (pathname === `/api/v1/billing/checkout/${SESSION_ID}`) {
        purchaseLookups.push(pathname);
        return json(route, { amountTotal: 900, currency: "GBP", bundleId: "resident-pro" });
      }
      if (pathname === "/api/v1/pass" && request.method() === "GET") return json(route, { valid: true, bundleId: "resident-pro" });
      if (pathname === "/api/v1/bundle") return json(route, { bundles: [], tokensRemaining: 0 });
      if (pathname === "/api/v1/pass/my-passes") {
        return json(route, { passes: generatedPasses.map((code) => ({ code, passTypeId: "digital-pass", maxUses: 20, useCount: 0 })) });
      }
      if (pathname === "/api/v1/companies-house/search") {
        return json(route, {
          items: [{ title: "SECOND EXAMPLE LIMITED", companyNumber: "00000002", companyStatus: "active", dateOfCreation: "2012-01-01" }],
          totalResults: 1,
        });
      }
      const company = pathname.match(/^\/api\/v1\/companies-house\/company\/([^/]+)$/);
      if (company) return json(route, PROFILE(company[1], company[1] === "00000002" ? "SECOND EXAMPLE LIMITED" : "FIRST EXAMPLE LIMITED"));
      return json(route, {});
    }
    const drill = pathname.match(/^(\/cy)?\/companies-house\/company\//);
    const filePath = drill
      ? path.join(PUBLIC_ROOT, drill[1] ? "cy" : "", "companies-house/companySearch.html")
      : path.join(PUBLIC_ROOT, pathname === "/" ? "index.html" : pathname);
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

// The address the switch goes to as a keyboard reader reaches it.
async function switchAddressOnFocus(page, name) {
  const link = page.locator(".language-switch").getByRole("link", { name });
  await link.focus();
  return link.getAttribute("href");
}

test("after a Stripe return the switch leaves checkout and session_id behind, and the Welsh page neither repeats the purchase nor the activation", async ({
  page,
}) => {
  const purchaseLookups = [];
  await serveSite(page, { purchaseLookups });
  await page.goto(`${SITE}/bundles.html?checkout=success&session_id=${SESSION_ID}`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(`${SITE}/bundles.html`);
  await expect.poll(() => purchaseLookups.length).toBe(1);

  expect(await switchAddressOnFocus(page, "Cymraeg")).toBe("cy/bundles.html");
  await page.locator(".language-switch").getByRole("link", { name: "Cymraeg" }).click();
  await expect(page).toHaveURL(`${SITE}/cy/bundles.html`);
  await page.waitForLoadState("networkidle");
  expect(purchaseLookups).toHaveLength(1);
  await expect(page.locator("body")).not.toContainText("Mae’r tanysgrifiad yn weithredol");
});

test("after the pass-generated status the switch leaves newPass behind", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/bundles.html?newPass=${PASS_CODE}`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(`${SITE}/bundles.html`);
  await expect(page.locator("#statusMessagesContainer")).toContainText("Track what this link earns under My generated passes");

  expect(await switchAddressOnFocus(page, "Cymraeg")).toBe("cy/bundles.html");
  await page.locator(".language-switch").getByRole("link", { name: "Cymraeg" }).click();
  await expect(page).toHaveURL(`${SITE}/cy/bundles.html`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#statusMessagesContainer")).not.toContainText(PASS_CODE);
});

test("newPass leaves the address as bundles.html starts, even when the generated passes list does not show the pass", async ({ page }) => {
  await serveSite(page, { generatedPasses: [] });
  await page.goto(`${SITE}/bundles.html?newPass=${PASS_CODE}`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(`${SITE}/bundles.html`);
  expect(await switchAddressOnFocus(page, "Cymraeg")).toBe("cy/bundles.html");
});

test("a reload after the pass-generated status does not show it again", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/bundles.html?newPass=${PASS_CODE}`, { waitUntil: "networkidle" });
  await expect(page.locator("#statusMessagesContainer")).toContainText("Track what this link earns under My generated passes");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#statusMessagesContainer")).not.toContainText(PASS_CODE);
});

test("the pass code goes with the reader from the English pass page to the Welsh one and back", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/pass.html?pass=${PASS_CODE}`, { waitUntil: "networkidle" });
  await page.locator(".language-switch").getByRole("link", { name: "Cymraeg" }).click();
  await expect(page).toHaveURL(`${SITE}/cy/pass.html?pass=${PASS_CODE}`);
  await page.locator(".language-switch").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(`${SITE}/pass.html?pass=${PASS_CODE}`);
});

test("the language notice carries the pass code to the copy in the reader's language", async ({ page }) => {
  await serveSite(page, { language: "cy" });
  await page.goto(`${SITE}/pass.html?pass=${PASS_CODE}`, { waitUntil: "networkidle" });
  const notice = page.locator(".language-notice a");
  await notice.focus();
  await expect(notice).toHaveAttribute("href", `cy/pass.html?pass=${PASS_CODE}`);
});

test("after a drill-down to a second company the switch opens that company in Welsh, and back", async ({ page }) => {
  await serveSite(page);
  await page.goto(`${SITE}/companies-house/companySearch.html?companyNumber=00000001`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(`${SITE}/companies-house/company/00000001`);
  expect(await switchAddressOnFocus(page, "Cymraeg")).toBe("/cy/companies-house/company/00000001");

  await page.locator("#newSearchBtn").click();
  await page.locator("#companyQuery").fill("second example");
  await page.locator("#companySearchForm button[type=submit]").click();
  await page.getByRole("button", { name: "SECOND EXAMPLE LIMITED" }).click();
  await expect(page).toHaveURL(`${SITE}/companies-house/company/00000002`);

  await page.locator(".language-switch").getByRole("link", { name: "Cymraeg" }).click();
  await expect(page).toHaveURL(`${SITE}/cy/companies-house/company/00000002`);
  await page.locator(".language-switch").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(`${SITE}/companies-house/company/00000002`);
});
