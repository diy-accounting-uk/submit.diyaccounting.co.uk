// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/accountsLinesSite.js
// The real micro-entity and small company accounts pages from disk, signed in, for a company whose
// last filed accounts are this form's prior year, so the page fills last year's column.

import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { registerCompany, registerDates } from "@app/http-simulator/fixtures/register.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export const DATES = registerDates();

const MICRO_ACCOUNTS = {
  regime: "micro",
  period: { start: DATES.filed.start, end: DATES.filed.end },
  approvalDate: DATES.filed.approvedOn,
  balanceSheet: {
    fixedAssets: 10000,
    currentAssets: 5000,
    creditorsWithinOneYear: 3000,
    creditorsAfterOneYear: 2000,
    netAssets: 10000,
    calledUpShareCapital: 100,
    profitAndLossAccount: 9900,
    capitalAndReserves: 10000,
  },
  profitAndLoss: null,
  filleted: false,
  dormant: false,
};

const SMALL_ACCOUNTS = {
  regime: "small",
  period: { start: DATES.filed.start, end: DATES.filed.end },
  approvalDate: DATES.filed.approvedOn,
  balanceSheet: {
    fixedAssets: 8000,
    stocks: 600,
    debtors: 3400,
    cashAtBank: 9000,
    currentAssets: 13000,
    tradeCreditors: 1200,
    corporationTax: 1400,
    otherCreditors: 400,
    creditorsWithinOneYear: 3000,
    creditorsAfterOneYear: 3000,
    netAssets: 15000,
    calledUpShareCapital: 100,
    profitAndLossAccount: 14900,
    capitalAndReserves: 15000,
  },
  profitAndLoss: {
    format: 1,
    figures: { turnover: 60000, costOfSales: 24000, administrativeExpenses: 31000, interestReceivable: 0, tax: 1000 },
  },
  filleted: false,
  dormant: false,
};

const COMPANIES = { "00000001": MICRO_ACCOUNTS, "SC000001": SMALL_ACCOUNTS };

function profile(companyNumber) {
  const company = registerCompany(companyNumber);
  return {
    companyNumber,
    companyName: company.name,
    accountsNextPeriodStart: DATES.next.start,
    companyStatus: company.status,
    companyType: "ltd",
    jurisdiction: company.jurisdiction,
    registeredOffice: {
      addressLine1: `${company.address.premises} ${company.address.street}`,
      cityOrTown: company.address.locality,
      postalCode: company.address.postalCode,
      country: company.address.country,
    },
  };
}

const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

export async function serveAccountsSite(page) {
  await page.addInitScript(() => {
    localStorage.setItem("consent.analytics", "declined");
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("cognitoAccessToken", "access-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "resident@test.diyaccounting.co.uk", given_name: "Alex" }));
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === "/api/v1/bundle")
      return json(route, { bundles: [{ bundleId: "resident-ltd", allocated: true }], tokensRemaining: 10 });
    const company = pathname.match(/^\/api\/v1\/companies-house\/company\/([^/]+)(\/.*)?$/);
    if (company && COMPANIES[company[1]] && !company[2]) return json(route, profile(company[1]));
    if (company && COMPANIES[company[1]] && company[2] === "/last-accounts") {
      const madeUpDate = DATES.filed.end;
      return json(route, {
        companyNumber: company[1],
        outcome: "mapped",
        set: { transactionId: `TX${company[1]}`, madeUpDate, filedOn: DATES.filed.filedOn, paperFiled: false },
        accounts: COMPANIES[company[1]],
      });
    }
    if (pathname.startsWith("/api/")) return json(route, {});
    if (pathname === "/submit.environment-name.txt") return route.fulfill({ status: 200, contentType: "text/plain", body: "ci" });
    const filePath = path.join(PUBLIC_ROOT, pathname === "/" ? "index.html" : pathname);
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

export async function lookUpCompany(page, form, companyNumber, { welsh = false } = {}) {
  await page.goto(`http://localhost:3000${welsh ? "/cy" : ""}/companies-house/${form}.html`, { waitUntil: "networkidle" });
  await page.fill("#companyNumber", companyNumber);
  await page.locator("#companyForm button[type=submit]").click();
  await expect(page.locator("#formView")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#priorYearNote")).toBeVisible({ timeout: 15000 });
}

export const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
