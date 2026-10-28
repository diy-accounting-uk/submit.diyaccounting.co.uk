// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companySearch.browser.test.js

import { test, expect } from "@playwright/test";
import { servePageScripts } from "./hmrcFieldTableAssets.js";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const EXAMPLE_COMPANY_RESULT = {
  totalResults: 1,
  itemsPerPage: 20,
  startIndex: 0,
  items: [
    {
      companyNumber: "00000001",
      title: "SIMULATOR EXAMPLE COMPANY LIMITED",
      companyStatus: "active",
      companyType: "ltd",
      dateOfCreation: "2009-04-16",
      addressSnippet: "1 Example Street, Cardiff, CF14 3UZ",
    },
  ],
};

const EXAMPLE_COMPANY_PROFILE = {
  companyNumber: "00000001",
  companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
  companyStatus: "active",
  companyType: "ltd",
  dateOfCreation: "2009-04-16",
  jurisdiction: "england-wales",
  registeredOfficeAddress: {
    address_line_1: "1 Example Street",
    locality: "Cardiff",
    postal_code: "CF14 3UZ",
    country: "United Kingdom",
  },
  sicCodes: ["62012"],
  accountsNextDue: "2099-01-31",
  confirmationStatementNextDue: "2099-04-30",
};

test.describe("Company Lookup page", () => {
  let companySearchHtmlContent;

  test.beforeAll(async () => {
    companySearchHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/companies-house/companySearch.html"), "utf-8");
  });

  function setupPage(page) {
    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });
  }

  async function setupRoutes(page, { searchResult = EXAMPLE_COMPANY_RESULT, profile = EXAMPLE_COMPANY_PROFILE, searchError = null } = {}) {
    await page.addInitScript(
      ({ searchResultArg, profileArg, searchErrorArg }) => {
        window.showStatus = window.showStatus || (() => {});
        window.hideStatus = window.hideStatus || (() => {});
        window.showLoading = window.showLoading || (() => {});
        window.hideLoading = window.hideLoading || (() => {});
        window.__statusMessages = [];
        window.showStatus = (message, type) => {
          window.__statusMessages.push({ message, type });
        };
        window.searchCompanies = () => {
          if (searchErrorArg) {
            const error = new Error(searchErrorArg.message);
            error.status = searchErrorArg.status;
            error.retryAfterSeconds = searchErrorArg.retryAfterSeconds;
            return Promise.reject(error);
          }
          return Promise.resolve(searchResultArg);
        };
        window.getCompanyProfile = () => Promise.resolve(profileArg);
      },
      { searchResultArg: searchResult, profileArg: profile, searchErrorArg: searchError },
    );

    const modifiedHtml = companySearchHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');

    await page.route("**/companySearch.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });

    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await servePageScripts(page);
  }

  async function loadPage(page, query = "") {
    const url = query
      ? `http://localhost:3000/companies-house/companySearch.html?${query}`
      : "http://localhost:3000/companies-house/companySearch.html";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("shows the result list after a search", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await page.fill("#companyQuery", "Simulator Example");
    await page.click("#searchBtn");
    await delay(200);

    await expect(page.locator("#searchResultsContainer")).toBeVisible();
    await expect(page.locator("#searchResults")).toContainText("SIMULATOR EXAMPLE COMPANY LIMITED");
    await expect(page.locator("#searchResults")).toContainText("00000001");
    await expect(page.locator("#searchResults")).toContainText("Active");
    await expect(page.locator("#searchResults")).toContainText("16 April 2009");
  });

  test("stacks the result table into labelled rows without sideways scroll at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await page.fill("#companyQuery", "Simulator Example");
    await page.click("#searchBtn");
    await delay(300);

    const labels = await page.locator("#searchResults tbody td").evaluateAll((cells) => cells.map((cell) => cell.dataset.label));
    expect(labels).toEqual(["Company", "Number", "Status", "Incorporated", "Address"]);
    const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(scrollsSideways).toBe(false);
  });

  test("shows a message when no companies match", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { searchResult: { totalResults: 0, itemsPerPage: 20, startIndex: 0, items: [] } });
    await loadPage(page);

    await page.fill("#companyQuery", "Nonexistent Company");
    await page.click("#searchBtn");
    await delay(200);

    await expect(page.locator("#searchResults")).toContainText("No companies matched that search.");
  });

  test("shows the profile panel when a result is selected", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await page.fill("#companyQuery", "Simulator Example");
    await page.click("#searchBtn");
    await delay(200);

    await page.click("#searchResults button");
    await delay(200);

    await expect(page.locator("#profileView")).toBeVisible();
    await expect(page.locator("#companyProfile")).toContainText("SIMULATOR EXAMPLE COMPANY LIMITED");
    await expect(page.locator("#companyProfile")).toContainText("Active");
    await expect(page.locator("#companyProfile")).toContainText("Private limited company");
    await expect(page.locator("#companyProfile")).toContainText("England and Wales");
    await expect(page.locator("#companyProfile")).toContainText("16 April 2009");
    await expect(page.locator("#companyProfile")).toContainText("62012 - Business and domestic software development");
    await expect(page.locator("#companyProfile")).not.toContainText("2009-04-16");
  });

  test("puts the company number in the URL when a result is selected", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await page.fill("#companyQuery", "Simulator Example");
    await page.click("#searchBtn");
    await delay(200);

    await page.click("#searchResults button");
    await delay(200);

    expect(page.url()).toContain("companyNumber=00000001");
  });

  test("opens the profile view directly when the URL carries a company number", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page, "companyNumber=00000001");

    await expect(page.locator("#profileView")).toBeVisible();
    await expect(page.locator("#companyProfile")).toContainText("SIMULATOR EXAMPLE COMPANY LIMITED");
  });

  test("shows a retry message with the wait time when the API reports a rate limit", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      searchError: { message: "Companies House is rate limiting our lookups", status: 429, retryAfterSeconds: 300 },
    });
    await loadPage(page);

    await page.fill("#companyQuery", "Simulator Example");
    await page.click("#searchBtn");
    await delay(200);

    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("300 seconds"))).toBe(true);
  });
});
