// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/browser-tests/companySearch.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const DIY_ACCOUNTING_RESULT = {
  totalResults: 1,
  itemsPerPage: 20,
  startIndex: 0,
  items: [
    {
      companyNumber: "06846849",
      title: "DIY ACCOUNTING LIMITED",
      companyStatus: "active",
      companyType: "ltd",
      dateOfCreation: "2009-04-16",
      addressSnippet: "The Old Rectory, Pulham Market, IP21 4XW",
    },
  ],
};

const DIY_ACCOUNTING_PROFILE = {
  companyNumber: "06846849",
  companyName: "DIY ACCOUNTING LIMITED",
  companyStatus: "active",
  companyType: "ltd",
  dateOfCreation: "2009-04-16",
  jurisdiction: "england-wales",
  registeredOfficeAddress: {
    address_line_1: "The Old Rectory",
    locality: "Pulham Market",
    postal_code: "IP21 4XW",
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

  async function setupRoutes(page, { searchResult = DIY_ACCOUNTING_RESULT, profile = DIY_ACCOUNTING_PROFILE, searchError = null } = {}) {
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
  }

  async function loadPage(page, query = "") {
    const url = query ? `http://localhost:3000/companies-house/companySearch.html?${query}` : "http://localhost:3000/companies-house/companySearch.html";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("shows the result list after a search", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await page.fill("#companyQuery", "DIY Accounting");
    await page.click("#searchBtn");
    await delay(200);

    await expect(page.locator("#searchResultsContainer")).toBeVisible();
    await expect(page.locator("#searchResults")).toContainText("DIY ACCOUNTING LIMITED");
    await expect(page.locator("#searchResults")).toContainText("06846849");
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

    await page.fill("#companyQuery", "DIY Accounting");
    await page.click("#searchBtn");
    await delay(200);

    await page.click("#searchResults button");
    await delay(200);

    await expect(page.locator("#profileView")).toBeVisible();
    await expect(page.locator("#companyProfile")).toContainText("DIY ACCOUNTING LIMITED");
    await expect(page.locator("#companyProfile")).toContainText("active");
  });

  test("puts the company number in the URL when a result is selected", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page);

    await page.fill("#companyQuery", "DIY Accounting");
    await page.click("#searchBtn");
    await delay(200);

    await page.click("#searchResults button");
    await delay(200);

    expect(page.url()).toContain("companyNumber=06846849");
  });

  test("opens the profile view directly when the URL carries a company number", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page);
    await loadPage(page, "companyNumber=06846849");

    await expect(page.locator("#profileView")).toBeVisible();
    await expect(page.locator("#companyProfile")).toContainText("DIY ACCOUNTING LIMITED");
  });

  test("shows a retry message with the wait time when the API reports a rate limit", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { searchError: { message: "Companies House is rate limiting our lookups", status: 429, retryAfterSeconds: 300 } });
    await loadPage(page);

    await page.fill("#companyQuery", "DIY Accounting");
    await page.click("#searchBtn");
    await delay(200);

    const messages = await page.evaluate(() => window.__statusMessages);
    expect(messages.some((m) => m.message.includes("300 seconds"))).toBe(true);
  });
});
