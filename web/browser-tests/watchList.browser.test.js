// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/watchList.browser.test.js
//
// The company watch list over the real page, scripts and catalogue: add, list, remove and open, the
// cap, the reads one at a time, and the rate-limit message, with the add action on the company
// lookup's results and profile. The API answers come from fixtures; the watch list lives in the
// fixture's account settings, which PUT /api/v1/account/settings changes. Each state is shot at
// desktop and phone width into target/screenshots/watch-list/.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/watch-list");
const BASE = "http://localhost:3000";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const COMPANIES = {
  "00000001": { name: "SIMULATOR EXAMPLE COMPANY LIMITED", status: "active", accounts: "2099-01-31", confirmation: "2099-04-30" },
  "00000003": { name: "EXAMPLE TRADING LIMITED", status: "active", accounts: "2099-12-31", confirmation: "2099-03-26" },
  "SC000000": { name: "SIMULATOR TEST COMPANY (SCOTLAND) LIMITED", status: "active", accounts: "2099-06-30", confirmation: "2099-09-30" },
  "00000002": { name: "SIMULATOR DISSOLVED COMPANY LIMITED", status: "dissolved", accounts: "2099-01-31", confirmation: "2099-04-30" },
};

function profileOf(companyNumber) {
  const company = COMPANIES[companyNumber];
  return {
    companyNumber,
    companyName: company.name,
    companyStatus: company.status,
    companyType: "ltd",
    registeredOffice: { addressLine1: "1 Example Street", postalCode: "CF14 3UZ" },
    accountsNextDue: company.accounts,
    confirmationStatementNextDue: company.confirmation,
  };
}

function json(route, status, body, headers = {}) {
  return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

// The site from web/public with the API answered from fixtures. account.watchedCompanies is the
// stored watch list, which each watch list operation changes as the server does, and
// account.operations the operations sent; account.rateLimitAfter makes every profile read after
// that many answer 429.
async function serveSite(page, account) {
  account.profileReads = [];
  account.inFlight = 0;
  account.mostInFlight = 0;
  await page.addInitScript(() => {
    localStorage.setItem("consent.analytics", "declined");
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("cognitoAccessToken", "access-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "resident@test.diyaccounting.co.uk", given_name: "Alex" }));
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === "/api/v1/bundle") {
      return json(route, 200, {
        bundles: [],
        tokensRemaining: 10,
        settings: { passGeneration: true, watchedCompanies: account.watchedCompanies },
      });
    }
    if (pathname === "/api/v1/account/settings" && request.method() === "PUT") {
      if (account.settingsWriteDelayMs) await new Promise((resolve) => setTimeout(resolve, account.settingsWriteDelayMs));
      const { watchList } = JSON.parse(request.postData());
      account.operations = [...(account.operations ?? []), watchList];
      if (watchList.add && !account.watchedCompanies.includes(watchList.add)) {
        if (account.watchedCompanies.length >= 50) {
          return json(route, 409, {
            message: "The watch list holds at most 50 companies",
            reason: "watch_list_full",
            settings: { passGeneration: true, watchedCompanies: account.watchedCompanies },
          });
        }
        account.watchedCompanies = [...account.watchedCompanies, watchList.add];
      }
      if (watchList.remove) account.watchedCompanies = account.watchedCompanies.filter((number) => number !== watchList.remove);
      return json(route, 200, { settings: { passGeneration: true, watchedCompanies: account.watchedCompanies } });
    }
    if (pathname === "/api/v1/companies-house/search") {
      return json(route, 200, {
        totalResults: 2,
        itemsPerPage: 20,
        startIndex: 0,
        items: ["00000001", "SC000000"].map((companyNumber) => ({
          companyNumber,
          title: COMPANIES[companyNumber].name,
          companyStatus: "active",
          companyType: "ltd",
          dateOfCreation: "2009-04-16",
          addressSnippet: "1 Example Street",
        })),
      });
    }
    const company = pathname.match(/^\/api\/v1\/companies-house\/company\/([^/]+)$/);
    if (company) {
      account.profileReads.push(company[1]);
      account.inFlight += 1;
      account.mostInFlight = Math.max(account.mostInFlight, account.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50));
      account.inFlight -= 1;
      if (account.rateLimitAfter !== undefined && account.profileReads.length > account.rateLimitAfter) {
        return json(route, 429, { message: "Companies House is rate limiting our lookups" }, { "Retry-After": "300" });
      }
      if (!COMPANIES[company[1]]) return json(route, 404, { message: "Not found for the specified query" });
      return json(route, 200, profileOf(company[1]));
    }
    if (pathname.startsWith("/api/")) return json(route, 200, {});
    if (pathname === "/submit.environment-name.txt") return route.fulfill({ status: 200, contentType: "text/plain", body: "ci" });
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

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

const fullList = () => Array.from({ length: 50 }, (_, index) => String(index + 1).padStart(8, "0"));

test.describe("Company watch list", () => {
  for (const width of [1280, 390]) {
    test(`an empty watch list says so at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page, { watchedCompanies: [] });
      await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
      await expect(page.locator("#watchListEmpty")).toBeVisible({ timeout: 15000 });
      await expect(page.locator("#watchListCount")).toHaveText("0 of 50 companies");
      await shoot(page, "empty");
    });

    test(`lists three companies with their next dates, read one at a time, at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const account = { watchedCompanies: ["00000001", "00000003", "SC000000"] };
      await serveSite(page, account);
      await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
      const rows = page.locator("#watchListTable tbody tr");
      await expect(rows).toHaveCount(3, { timeout: 15000 });
      await expect(rows.nth(2)).toContainText("Read at", { timeout: 15000 });
      await expect(rows.nth(0)).toContainText("SIMULATOR EXAMPLE COMPANY LIMITED");
      await expect(rows.nth(0)).toContainText("Active");
      await expect(rows.nth(0)).toContainText("31 January 2099");
      await expect(rows.nth(0)).toContainText("30 April 2099");
      expect(account.profileReads).toEqual(["00000001", "00000003", "SC000000"]);
      expect(account.mostInFlight).toBe(1);
      const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(scrollsSideways).toBe(false);
      await shoot(page, "three-companies");
    });

    test(`a company Companies House no longer finds says it is not on the register at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page, { watchedCompanies: ["00000001", "09999999"] });
      await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
      await expect(page.locator("#watchListTable tbody tr").nth(1)).toContainText("Not on the register", { timeout: 15000 });
      await shoot(page, "not-on-register");
    });

    test(`a full watch list says it holds the most it can and disables adding at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const account = { watchedCompanies: fullList() };
      await serveSite(page, account);
      profilesForEveryWatchedCompany(account);
      await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
      await expect(page.locator("#watchListFull")).toBeVisible({ timeout: 15000 });
      await page.fill("#companyQuery", "Simulator");
      await page.click("#searchBtn");
      await expect(page.locator("#searchResults .watch-list-add").last()).toHaveText("Watch list full");
      await expect(page.locator("#searchResults .watch-list-add").last()).toBeDisabled();
      await page.locator("#searchResultsContainer").scrollIntoViewIfNeeded();
      await shoot(page, "cap-reached");
    });

    test(`a 429 from Companies House shows the lookup's rate-limit message and stops the reads at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const account = { watchedCompanies: ["00000001", "00000003", "SC000000"], rateLimitAfter: 1 };
      await serveSite(page, account);
      await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
      await expect(page.locator("#statusMessagesContainer")).toContainText(
        "Companies House is rate limiting our lookups. Try again in 300 seconds.",
        { timeout: 15000 },
      );
      await expect(page.locator("#watchListTable tbody tr").nth(2)).toContainText("Not read from Companies House");
      expect(account.profileReads).toEqual(["00000001", "00000003"]);
      await shoot(page, "rate-limited");
    });

    test(`the add action on the lookup's search results and profile at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const account = { watchedCompanies: ["00000003"] };
      await serveSite(page, account);
      await page.goto(`${BASE}/companies-house/companySearch.html`, { waitUntil: "networkidle" });
      await page.fill("#companyQuery", "Simulator");
      await page.click("#searchBtn");
      const firstAdd = page.locator("#searchResults .watch-list-add").first();
      await expect(firstAdd).toHaveText("Add to watch list", { timeout: 15000 });
      await shoot(page, "lookup-results-add");
      await firstAdd.click();
      await expect(firstAdd).toHaveText("On your watch list");
      expect(account.watchedCompanies).toEqual(["00000003", "00000001"]);
      await page.goto(`${BASE}/companies-house/company/SC000000`, { waitUntil: "networkidle" });
      const profileAdd = page.locator("#watchSection .watch-list-add");
      await expect(profileAdd).toHaveText("Add to watch list", { timeout: 15000 });
      await shoot(page, "lookup-profile-add");
      await profileAdd.click();
      await expect(profileAdd).toHaveText("On your watch list");
      expect(account.watchedCompanies).toEqual(["00000003", "00000001", "SC000000"]);
    });
  }

  test("adds from its own search, removes, and opens a company at its drill-down address", async ({ page }) => {
    const account = { watchedCompanies: [] };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#watchListEmpty")).toBeVisible({ timeout: 15000 });
    await page.fill("#companyQuery", "Simulator");
    await page.click("#searchBtn");
    await page.locator("#searchResults .watch-list-add").first().click();
    const row = page.locator("#watchListTable tbody tr");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Read at", { timeout: 15000 });
    expect(account.watchedCompanies).toEqual(["00000001"]);
    await expect(row.locator("a")).toHaveAttribute("href", "/companies-house/company/00000001");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#watchListTable tbody tr")).toHaveCount(1, { timeout: 15000 });
    await page.locator("#watchListTable tbody tr a").click();
    await expect(page.locator("#drillOverview")).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe("/companies-house/company/00000001");

    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await page.locator("#watchListTable .watch-list-remove").click();
    await expect(page.locator("#watchListEmpty")).toBeVisible();
    expect(account.watchedCompanies).toEqual([]);
  });

  test("two removes in quick succession both stay removed", async ({ page }) => {
    const account = { watchedCompanies: ["00000001", "00000003", "SC000000"], settingsWriteDelayMs: 400 };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    const rows = page.locator("#watchListTable tbody tr");
    await expect(rows).toHaveCount(3, { timeout: 15000 });

    await rows.nth(0).locator(".watch-list-remove").click();
    await rows.nth(1).locator(".watch-list-remove").click();

    await expect(rows).toHaveCount(1, { timeout: 15000 });
    expect(account.watchedCompanies).toEqual(["SC000000"]);
    expect(account.operations).toEqual([{ remove: "00000001" }, { remove: "00000003" }]);
  });

  test("an add the server refuses because the list is full says the list was not saved", async ({ page }) => {
    const account = { watchedCompanies: Array.from({ length: 49 }, (_, index) => String(index + 100).padStart(8, "0")) };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#watchListCount")).toHaveText("49 of 50 companies", { timeout: 15000 });
    // Another tab fills the list after this page read it.
    account.watchedCompanies = [...account.watchedCompanies, "00000999"];

    await page.fill("#companyQuery", "Simulator");
    await page.click("#searchBtn");
    await page.locator("#searchResults .watch-list-add").first().click();

    await expect(page.locator("#statusMessagesContainer")).toContainText("The watch list was not saved. Try again.");
    await expect(page.locator("#watchListCount")).toHaveText("50 of 50 companies");
    await expect(page.locator("#searchResults .watch-list-add").first()).toHaveText("Watch list full");
    expect(account.watchedCompanies).toHaveLength(50);
  });

  test("reads each profile once per visit, also after an add", async ({ page }) => {
    const account = { watchedCompanies: ["00000003"] };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#watchListTable tbody tr")).toContainText("Read at", { timeout: 15000 });
    await page.fill("#companyQuery", "Simulator");
    await page.click("#searchBtn");
    await page.locator("#searchResults .watch-list-add").first().click();
    await expect(page.locator("#watchListTable tbody tr").nth(1)).toContainText("Read at", { timeout: 15000 });
    expect(account.profileReads).toEqual(["00000003", "00000001"]);
  });

  test("the Welsh watch list page opens under /cy/ and links to the Welsh drill-down", async ({ page }) => {
    await serveSite(page, { watchedCompanies: ["00000001"] });
    await page.goto(`${BASE}/cy/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("Rhestr wylio cwmnïau");
    await expect(page.locator("#watchListTable tbody tr a")).toHaveAttribute("href", "/cy/companies-house/company/00000001", {
      timeout: 15000,
    });
  });
});

// The full list's fifty companies all answer with a profile.
function profilesForEveryWatchedCompany(account) {
  for (const companyNumber of account.watchedCompanies) {
    if (!COMPANIES[companyNumber])
      COMPANIES[companyNumber] = {
        name: `WATCHED COMPANY ${companyNumber} LIMITED`,
        status: "active",
        accounts: "2099-01-31",
        confirmation: "2099-04-30",
      };
  }
}
