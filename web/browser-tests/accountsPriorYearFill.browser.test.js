// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/accountsPriorYearFill.browser.test.js
//
// The micro-entity and small company accounts forms over the real pages, scripts and catalogue,
// filling the prior year from the company's last filed accounts once the company is looked up. The
// API answers come from fixtures. Each state is shot at desktop and phone width into
// target/screenshots/accounts-prior-year/.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/accounts-prior-year");
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

// accountsNextPeriodStart is the day after the last accounts' made-up date, as the register states it,
// unless a test gives the company a gap.
function profile(companyNumber, companyName, accountsNextPeriodStart) {
  return {
    companyNumber,
    companyName,
    ...(accountsNextPeriodStart ? { accountsNextPeriodStart } : {}),
    companyStatus: "active",
    companyType: "ltd",
    jurisdiction: "england-wales",
    registeredOffice: { addressLine1: "1 Example Street", cityOrTown: "Cardiff", postalCode: "CF14 3UZ", country: "Wales" },
  };
}

const MICRO_ACCOUNTS = {
  regime: "micro",
  period: { start: "2097-05-01", end: "2098-04-30" },
  approvalDate: "2098-10-20",
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
  period: { start: "2097-10-01", end: "2098-09-30" },
  approvalDate: "2099-02-20",
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

// Another software's accounts that hold a revaluation reserve the micro-entity form has no line for.
const RESERVES_ACCOUNTS = {
  ...MICRO_ACCOUNTS,
  balanceSheet: { ...MICRO_ACCOUNTS.balanceSheet, profitAndLossAccount: 7900 },
};

const COMPANIES = {
  "00000001": {
    profile: profile("00000001", "SIMULATOR EXAMPLE COMPANY LIMITED", "2098-05-01"),
    lastAccounts: { outcome: "mapped", accounts: MICRO_ACCOUNTS, madeUpDate: "2098-04-30" },
  },
  "SC000000": {
    profile: profile("SC000000", "SIMULATOR TEST COMPANY (SCOTLAND) LIMITED", "2098-10-01"),
    lastAccounts: { outcome: "mapped", accounts: SMALL_ACCOUNTS, madeUpDate: "2098-09-30" },
  },
  "00000003": {
    profile: profile("00000003", "EXAMPLE TRADING LIMITED"),
    lastAccounts: { outcome: "paper", madeUpDate: "2098-03-31", paperFiled: true },
  },
  "00000007": { profile: profile("00000007", "PRECISION CODE LTD"), lastAccounts: { outcome: "none" } },
  "00000006": {
    profile: profile("00000006", "RESERVES EXAMPLE LIMITED", "2098-05-01"),
    lastAccounts: { outcome: "mapped", accounts: RESERVES_ACCOUNTS, madeUpDate: "2098-04-30" },
  },
  "00000005": {
    profile: profile("00000005", "MISSED YEAR LIMITED", "2099-05-01"),
    lastAccounts: { outcome: "mapped", accounts: MICRO_ACCOUNTS, madeUpDate: "2098-04-30" },
  },
};

function lastAccountsAnswer(companyNumber) {
  const { outcome, accounts, madeUpDate, paperFiled = false } = COMPANIES[companyNumber].lastAccounts;
  return {
    companyNumber,
    outcome,
    ...(madeUpDate ? { set: { transactionId: `TX${companyNumber}`, madeUpDate, filedOn: "2099-01-10", paperFiled } } : {}),
    ...(accounts ? { accounts } : {}),
  };
}

function json(route, status, body) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function serveSite(page, { bundles = ["resident-ltd"], apiRequests = [] } = {}) {
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
    if (pathname.startsWith("/api/")) {
      apiRequests.push(pathname + url.search);
      if (pathname === "/api/v1/bundle") {
        return json(route, 200, { bundles: bundles.map((bundleId) => ({ bundleId, allocated: true })), tokensRemaining: 10 });
      }
      const company = pathname.match(/^\/api\/v1\/companies-house\/company\/([^/]+)(\/.*)?$/);
      if (company && !COMPANIES[company[1]]) return json(route, 404, { message: "Not found for the specified query" });
      if (company && !company[2]) return json(route, 200, COMPANIES[company[1]].profile);
      if (company && company[2] === "/last-accounts") return json(route, 200, lastAccountsAnswer(company[1]));
      return json(route, 200, {});
    }
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

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

async function lookUp(page, form, companyNumber, { welsh = false } = {}) {
  await page.goto(`${BASE}${welsh ? "/cy" : ""}/companies-house/${form}.html`, { waitUntil: "networkidle" });
  await page.fill("#companyNumber", companyNumber);
  await page.locator("#companyForm button[type=submit]").click();
  await expect(page.locator("#formView")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#priorYearNote")).toBeVisible({ timeout: 15000 });
}

const scrollsSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

test.describe("Accounts forms' prior year from the last filed accounts", () => {
  for (const width of [1280, 390]) {
    test(`the micro-entity form fills last year's figures into the prior year at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page);
      await lookUp(page, "fileMicroEntityAccounts", "00000001");
      await expect(page.locator("#priorFixedAssets")).toHaveValue("10000");
      await expect(page.locator("#priorCurrentAssets")).toHaveValue("5000");
      await expect(page.locator("#priorCreditorsWithinOneYear")).toHaveValue("3000");
      await expect(page.locator("#priorCreditorsAfterOneYear")).toHaveValue("2000");
      await expect(page.locator("#priorCalledUpShareCapital")).toHaveValue("100");
      await expect(page.locator("#priorProfitAndLossAccount")).toHaveValue("9900");
      await expect(page.locator("#priorCapitalAndReserves")).toHaveValue("10000");
      await expect(page.locator("#currentFixedAssets")).toHaveValue("");
      await expect(page.locator("#priorYearNote")).toContainText(
        "7 prior-year figures are filled in from the company's last accounts, made up to 30 April 2098 and approved on 20 October 2098.",
      );
      await expect(page.locator("#priorYearNote")).toContainText(
        "Left empty, with no figure in those accounts: Called up share capital not paid",
      );
      expect(await scrollsSideways(page)).toBe(false);
      await shoot(page, "micro-entity-filled");
    });

    test(`the small company form shows its comparatives and fills the prior year at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page);
      await lookUp(page, "fileSmallCompanyAccounts", "SC000000");
      await expect(page.locator("#includeComparatives")).toBeChecked();
      await expect(page.locator("#priorStocks")).toHaveValue("600");
      await expect(page.locator("#priorCashAtBank")).toHaveValue("9000");
      await expect(page.locator("#priorTurnover")).toHaveValue("60000");
      await expect(page.locator("#priorTax")).toHaveValue("1000");
      await expect(page.locator("#priorYearNote")).toContainText("made up to 30 September 2098 and approved on 20 February 2099");
      expect(await scrollsSideways(page)).toBe(false);
      await shoot(page, "small-company-filled");
    });

    test(`the micro-entity form names the small company form for a company whose last accounts were small at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page);
      await lookUp(page, "fileMicroEntityAccounts", "SC000000");
      const note = page.locator("#priorYearNote");
      await expect(note).toContainText(
        "The company's last accounts were small company accounts: file this year's on the small company accounts form.",
      );
      await expect(note.locator("a")).toHaveAttribute("href", "/companies-house/fileSmallCompanyAccounts.html?companyNumber=SC000000");
      await expect(page.locator("#priorFixedAssets")).toHaveValue("8000");
      await expect(page.locator("#priorCurrentAssets")).toHaveValue("13000");
      await shoot(page, "other-form-note");
    });

    test(`accounts filed on paper open the form empty with a note that says why at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page);
      await lookUp(page, "fileMicroEntityAccounts", "00000003");
      await expect(page.locator("#priorYearNote")).toHaveText(
        "The company's last accounts, made up to 31 March 2098, were filed on paper. Companies House holds them as a scanned document only, so the prior year is left empty: type it from those accounts.",
      );
      await expect(page.locator("#priorFixedAssets")).toHaveValue("");
      await shoot(page, "paper-note");
    });
  }

  test("a company with no accounts opens the form empty with a note that says why", async ({ page }) => {
    await serveSite(page);
    await lookUp(page, "fileSmallCompanyAccounts", "00000007");
    await expect(page.locator("#priorYearNote")).toHaveText(
      "Companies House holds no accounts for this company, so the prior year is left empty.",
    );
    await expect(page.locator("#priorFixedAssets")).toHaveValue("");
  });

  test("a company whose last accounts end a year before this period opens the form empty, naming both dates and the filing history", async ({
    page,
  }) => {
    await serveSite(page);
    await lookUp(page, "fileMicroEntityAccounts", "00000005");
    await expect(page.locator("#priorYearNote")).toContainText(
      "The last accounts filed were made up to 30 April 2098, and this period starts on 1 May 2099, so the year between is not on the register and the prior year is left empty. See the company's filing history.",
    );
    await expect(page.locator("#priorYearNote a")).toHaveAttribute("href", "/companies-house/company/00000005/filing-history");
    await expect(page.locator("#priorFixedAssets")).toHaveValue("");
  });

  test("a prior year with reserves the micro-entity form lacks names the line to correct, and the balance rule refuses it", async ({
    page,
  }) => {
    await serveSite(page);
    await lookUp(page, "fileMicroEntityAccounts", "00000006");
    await expect(page.locator("#priorYearNote")).toContainText(
      "Those accounts hold capital and reserves of £10,000, but called up share capital and the profit and loss account add up to £8,000: the difference sits in reserves this form has no line for. Correct the prior year's profit and loss account so the two agree before you preview.",
    );
    const message = await page.evaluate(() => capitalAndReservesProblem(readYear("prior"), readYear("prior")));
    expect(message).toBe(
      "Capital and reserves of £10,000 for the current year do not equal called up share capital plus the profit and loss account, which add up to £8,000.",
    );
    const priorOnly = await page.evaluate(() =>
      capitalAndReservesProblem({ calledUpShareCapital: 100, profitAndLossAccount: 900, capitalAndReserves: 1000 }, readYear("prior")),
    );
    expect(priorOnly).toBe(
      "Capital and reserves of £10,000 for the prior year do not equal called up share capital plus the profit and loss account, which add up to £8,000.",
    );
    await page.fill("#priorProfitAndLossAccount", "9900");
    const corrected = await page.evaluate(() =>
      capitalAndReservesProblem({ calledUpShareCapital: 100, profitAndLossAccount: 900, capitalAndReserves: 1000 }, readYear("prior")),
    );
    expect(corrected).toBeNull();
    await shoot(page, "reserves-note");
  });

  test("the Welsh micro-entity form says what it filled in Welsh", async ({ page }) => {
    await serveSite(page);
    await lookUp(page, "fileMicroEntityAccounts", "00000001", { welsh: true });
    await expect(page.locator("#priorYearNote")).toContainText("ffigur ar gyfer y flwyddyn flaenorol");
    await expect(page.locator("#priorFixedAssets")).toHaveValue("10000");
    await shoot(page, "cy-micro-entity-filled");
  });

  test("each form reads the company's profile once, and the fill uses that profile", async ({ page }) => {
    for (const [form, companyNumber] of [
      ["fileMicroEntityAccounts", "00000001"],
      ["fileSmallCompanyAccounts", "SC000000"],
    ]) {
      const apiRequests = [];
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await serveSite(page, { apiRequests });
      await lookUp(page, form, companyNumber);
      await expect(page.locator("#priorYearNote")).toContainText("prior-year figures are filled in");
      expect(apiRequests.filter((request) => request === `/api/v1/companies-house/company/${companyNumber}`)).toHaveLength(1);
    }
  });

  test("an account without either filing activity asks for no last accounts it may not read", async ({ page }) => {
    const apiRequests = [];
    await serveSite(page, { bundles: [], apiRequests });
    await page.goto(`${BASE}/companies-house/fileMicroEntityAccounts.html`, { waitUntil: "networkidle" });
    expect(apiRequests.some((request) => request.endsWith("/last-accounts"))).toBe(false);
  });
});
