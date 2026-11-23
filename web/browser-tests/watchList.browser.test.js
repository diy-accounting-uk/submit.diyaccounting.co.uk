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
import { addressLine1, NOT_HELD_COMPANY_NUMBER, registerCompany, REGISTER_COMPANY_NUMBERS } from "@app/http-simulator/fixtures/register.js";

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

// Four companies of the register, one of them dissolved, with their next dates computed from the day.
const JOINERY = registerCompany(REGISTER_COMPANY_NUMBERS[0]);
const BAKERY = registerCompany(REGISTER_COMPANY_NUMBERS[2]);
const GLENMORE = registerCompany(REGISTER_COMPANY_NUMBERS[10]);
const NORTHGATE = registerCompany(REGISTER_COMPANY_NUMBERS[1]);

const COMPANIES = Object.fromEntries(
  [JOINERY, BAKERY, GLENMORE, NORTHGATE].map((company) => [
    company.number,
    {
      name: company.name,
      status: company.status,
      address: company.address,
      accounts: company.accounts.next.due,
      confirmation: company.confirmationStatementDates.due,
    },
  ]),
);

// An ISO date as the watch list writes it, such as "31 January 2027".
const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function profileOf(companies, companyNumber) {
  const company = companies[companyNumber];
  return {
    companyNumber,
    companyName: company.name,
    companyStatus: company.status,
    companyType: "ltd",
    registeredOffice: { addressLine1: addressLine1(company.address), postalCode: company.address.postalCode },
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
// that many answer 429. account.companies holds the profiles the API answers, the fixture
// companies and any a test adds, so a profile one test adds never reaches another.
async function serveSite(page, account) {
  account.companies = { ...COMPANIES };
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
      if (account.bundleStatus) return json(route, account.bundleStatus, { message: "The bundles could not be read" });
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
        items: [JOINERY.number, GLENMORE.number].map((companyNumber) => ({
          companyNumber,
          title: account.companies[companyNumber].name,
          companyStatus: "active",
          companyType: "ltd",
          dateOfCreation: "2009-04-16",
          addressSnippet: addressLine1(account.companies[companyNumber].address),
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
      if (!account.companies[company[1]]) return json(route, 404, { message: "Not found for the specified query" });
      return json(route, 200, profileOf(account.companies, company[1]));
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
  test("a failed read of the account says the watch list could not be read, never that it is empty", async ({ page }) => {
    await serveSite(page, { watchedCompanies: ["00000001"], bundleStatus: 500 });
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#statusMessagesContainer")).toContainText("Your watch list could not be read. Try again.");
    await expect(page.locator("#watchListEmpty")).toBeHidden();
    await expect(page.locator("#watchListCount")).not.toHaveText("0 of 50 companies");
  });

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
      const account = { watchedCompanies: [JOINERY.number, BAKERY.number, GLENMORE.number] };
      await serveSite(page, account);
      await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
      const rows = page.locator("#watchListTable tbody tr");
      await expect(rows).toHaveCount(3, { timeout: 15000 });
      await expect(rows.nth(2)).toContainText("Read at", { timeout: 15000 });
      await expect(rows.nth(0)).toContainText(JOINERY.name);
      await expect(rows.nth(0)).toContainText("Active");
      await expect(rows.nth(0)).toContainText(longDate(COMPANIES[JOINERY.number].accounts));
      await expect(rows.nth(0)).toContainText(longDate(COMPANIES[JOINERY.number].confirmation));
      expect(account.profileReads).toEqual([JOINERY.number, BAKERY.number, GLENMORE.number]);
      expect(account.mostInFlight).toBe(1);
      const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(scrollsSideways).toBe(false);
      await shoot(page, "three-companies");
    });

    test(`a company Companies House no longer finds says it is not on the register at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page, { watchedCompanies: [JOINERY.number, NOT_HELD_COMPANY_NUMBER] });
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
      const account = { watchedCompanies: [JOINERY.number, BAKERY.number, GLENMORE.number], rateLimitAfter: 1 };
      await serveSite(page, account);
      await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
      await expect(page.locator("#statusMessagesContainer")).toContainText(
        "Companies House is rate limiting our lookups. Try again in 300 seconds.",
        { timeout: 15000 },
      );
      await expect(page.locator("#watchListTable tbody tr").nth(2)).toContainText("Not read from Companies House");
      expect(account.profileReads).toEqual([JOINERY.number, BAKERY.number]);
      await shoot(page, "rate-limited");
    });

    test(`the add action on the lookup's search results and profile at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const account = { watchedCompanies: [BAKERY.number] };
      await serveSite(page, account);
      await page.goto(`${BASE}/companies-house/companySearch.html`, { waitUntil: "networkidle" });
      await page.fill("#companyQuery", "Simulator");
      await page.click("#searchBtn");
      const firstAdd = page.locator("#searchResults .watch-list-add").first();
      await expect(firstAdd).toHaveText("Add to watch list", { timeout: 15000 });
      await shoot(page, "lookup-results-add");
      await firstAdd.click();
      await expect(firstAdd).toHaveText("On your watch list");
      expect(account.watchedCompanies).toEqual([BAKERY.number, JOINERY.number]);
      await page.goto(`${BASE}/companies-house/company/${GLENMORE.number}`, { waitUntil: "networkidle" });
      const profileAdd = page.locator("#watchSection .watch-list-add");
      await expect(profileAdd).toHaveText("Add to watch list", { timeout: 15000 });
      await shoot(page, "lookup-profile-add");
      await profileAdd.click();
      await expect(profileAdd).toHaveText("On your watch list");
      expect(account.watchedCompanies).toEqual([BAKERY.number, JOINERY.number, GLENMORE.number]);
    });
  }

  test("on the lookup's search results, a list that could not be read says so and reads again when pressed", async ({ page }) => {
    const account = { watchedCompanies: [], bundleStatus: 500 };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/companySearch.html`, { waitUntil: "networkidle" });
    await page.fill("#companyQuery", "Simulator");
    await page.click("#searchBtn");
    const firstAdd = page.locator("#searchResults .watch-list-add").first();
    await expect(firstAdd).toHaveText("Your watch list could not be read. Try again", { timeout: 15000 });
    await expect(firstAdd).toBeEnabled();
    delete account.bundleStatus;
    await firstAdd.click();
    await expect(firstAdd).toHaveText("Add to watch list");
    await expect(firstAdd).toBeEnabled();
  });

  test("on the lookup's search results, a list read again from one button sets every other button that could not read it", async ({
    page,
  }) => {
    const account = { watchedCompanies: [], bundleStatus: 500 };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/companySearch.html`, { waitUntil: "networkidle" });
    await page.fill("#companyQuery", "Simulator");
    await page.click("#searchBtn");
    const buttons = page.locator("#searchResults .watch-list-add");
    await expect(buttons.first()).toHaveText("Your watch list could not be read. Try again", { timeout: 15000 });
    const count = await buttons.count();
    expect(count).toBeGreaterThan(1);
    await expect(buttons.nth(1)).toHaveText("Your watch list could not be read. Try again");

    delete account.bundleStatus;
    await buttons.first().click();

    for (let index = 0; index < count; index += 1) await expect(buttons.nth(index)).toHaveText("Add to watch list");
  });

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
    expect(account.watchedCompanies).toEqual([JOINERY.number]);
    await expect(row.locator("a")).toHaveAttribute("href", `/companies-house/company/${JOINERY.number}`);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#watchListTable tbody tr")).toHaveCount(1, { timeout: 15000 });
    await page.locator("#watchListTable tbody tr a").click();
    await expect(page.locator("#drillOverview")).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe(`/companies-house/company/${JOINERY.number}`);

    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await page.locator("#watchListTable .watch-list-remove").click();
    await expect(page.locator("#watchListEmpty")).toBeVisible();
    expect(account.watchedCompanies).toEqual([]);
  });

  test("two removes in quick succession both stay removed", async ({ page }) => {
    const account = { watchedCompanies: [JOINERY.number, BAKERY.number, GLENMORE.number], settingsWriteDelayMs: 400 };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    const rows = page.locator("#watchListTable tbody tr");
    await expect(rows).toHaveCount(3, { timeout: 15000 });

    await rows.nth(0).locator(".watch-list-remove").click();
    await rows.nth(1).locator(".watch-list-remove").click();

    await expect(rows).toHaveCount(1, { timeout: 15000 });
    expect(account.watchedCompanies).toEqual([GLENMORE.number]);
    expect(account.operations).toEqual([{ remove: JOINERY.number }, { remove: BAKERY.number }]);
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
    const account = { watchedCompanies: [BAKERY.number] };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#watchListTable tbody tr")).toContainText("Read at", { timeout: 15000 });
    await page.fill("#companyQuery", "Simulator");
    await page.click("#searchBtn");
    await page.locator("#searchResults .watch-list-add").first().click();
    await expect(page.locator("#watchListTable tbody tr").nth(1)).toContainText("Read at", { timeout: 15000 });
    expect(account.profileReads).toEqual([BAKERY.number, JOINERY.number]);
  });

  test("a watch list restored from the back-forward cache reads each profile again, and keeps its companies", async ({ page }) => {
    const account = { watchedCompanies: [JOINERY.number, BAKERY.number] };
    await serveSite(page, account);
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    const rows = page.locator("#watchListTable tbody tr");
    await expect(rows.nth(1)).toContainText("Read at", { timeout: 15000 });
    expect(account.profileReads).toEqual([JOINERY.number, BAKERY.number]);

    await Promise.all([
      page.waitForEvent("load"),
      page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))),
    ]);
    await expect(rows).toHaveCount(2, { timeout: 15000 });
    await expect(rows.nth(1)).toContainText("Read at", { timeout: 15000 });
    expect(account.profileReads).toEqual([JOINERY.number, BAKERY.number, JOINERY.number, BAKERY.number]);
  });

  test("a watch list shown on its first load is not loaded twice", async ({ page }) => {
    let loads = 0;
    page.on("load", () => loads++);
    await serveSite(page, { watchedCompanies: [JOINERY.number] });
    await page.goto(`${BASE}/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#watchListTable tbody tr")).toContainText("Read at", { timeout: 15000 });
    await page.waitForTimeout(500);
    expect(loads).toBe(1);
  });

  test("the Welsh watch list page opens under /cy/ and links to the Welsh drill-down", async ({ page }) => {
    await serveSite(page, { watchedCompanies: [JOINERY.number] });
    await page.goto(`${BASE}/cy/companies-house/watchList.html`, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("Rhestr wylio cwmnïau");
    await expect(page.locator("#watchListTable tbody tr a")).toHaveAttribute("href", `/cy/companies-house/company/${JOINERY.number}`, {
      timeout: 15000,
    });
  });
});

// The full list's fifty companies all answer with a profile, for this account only.
function profilesForEveryWatchedCompany(account) {
  for (const companyNumber of account.watchedCompanies) {
    if (!account.companies[companyNumber])
      account.companies[companyNumber] = {
        name: `WATCHED COMPANY ${companyNumber} LIMITED`,
        status: "active",
        address: JOINERY.address,
        accounts: JOINERY.accounts.next.due,
        confirmation: JOINERY.confirmationStatementDates.due,
      };
  }
}
