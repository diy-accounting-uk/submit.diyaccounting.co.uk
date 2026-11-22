// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companyDrillDown.browser.test.js
//
// The company lookup's drill-down over the real page, scripts and catalogue: each view's address
// opened cold, in English and in Welsh, the moves between views, the not-found state and the file
// buttons. The API answers come from fixtures. Each view is shot at desktop and phone width into
// target/screenshots/company-drill-down/.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/company-drill-down");

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

const PROFILE = {
  companyNumber: "00000001",
  companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
  companyStatus: "active",
  companyType: "ltd",
  dateOfCreation: "2009-04-16",
  jurisdiction: "england-wales",
  registeredOfficeAddress: { address_line_1: "1 Example Street", locality: "Cardiff", postal_code: "CF14 3UZ", country: "Wales" },
  registeredOffice: { addressLine1: "1 Example Street", cityOrTown: "Cardiff", postalCode: "CF14 3UZ", country: "Wales" },
  sicCodes: ["62012"],
  accountsNextDue: "2099-01-31",
  accountsNextPeriodStart: "2098-05-01",
  accountsNextPeriodEnd: "2099-04-30",
  accountingReferenceDate: { day: "30", month: "04" },
  accountsLastPeriodStart: "2097-05-01",
  accountsLastPeriodEnd: "2098-04-30",
  accountsLastType: "micro-entity",
  confirmationStatementNextDue: "2099-04-30",
  confirmationStatementNextMadeUpTo: "2099-04-16",
};

const OFFICERS = {
  companyNumber: "00000001",
  activeCount: 1,
  resignedCount: 0,
  officers: [
    {
      name: "BRAMWELL, Eleanor",
      officerRole: "director",
      appointedOn: "2015-01-01",
      dateOfBirth: { month: 1, year: 1970 },
      nationality: "British",
      countryOfResidence: "England",
    },
  ],
};

const PSCS = {
  companyNumber: "00000001",
  activeCount: 1,
  ceasedCount: 0,
  pscs: [
    {
      name: "Eleanor Bramwell",
      kind: "individual-person-with-significant-control",
      naturesOfControl: ["ownership-of-shares-50-to-75-percent"],
      notifiedOn: "2016-04-06",
      dateOfBirth: { month: 1, year: 1970 },
      nationality: "British",
    },
  ],
};

const FILINGS = {
  companyNumber: "00000001",
  totalCount: 3,
  filings: [
    {
      transactionId: "SIMTX00000001AA2098",
      date: "2098-11-02",
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-micro-entity",
      descriptionValues: { made_up_date: "2098-04-30" },
      pages: 4,
      paperFiled: false,
      hasDocument: true,
    },
    {
      transactionId: "SIMTX00000001CS2098",
      date: "2098-04-20",
      category: "confirmation-statement",
      type: "CS01",
      description: "confirmation-statement-with-no-updates",
      descriptionValues: { made_up_date: "2098-04-16" },
      pages: 3,
      paperFiled: false,
      hasDocument: true,
    },
    {
      transactionId: "SIMTX00000001AA2097",
      date: "2097-12-15",
      category: "accounts",
      type: "AA",
      description: "accounts-with-accounts-type-total-exemption-full",
      descriptionValues: { made_up_date: "2097-04-30" },
      pages: 6,
      paperFiled: true,
      hasDocument: true,
    },
  ],
};

const FILED_ACCOUNTS = {
  companyNumber: "00000001",
  filedAccounts: [
    {
      transactionId: "SIMTX00000001AA2098",
      madeUpDate: "2098-04-30",
      filedOn: "2098-11-02",
      accountsType: "micro-entity",
      amended: false,
      paperFiled: false,
      pages: 4,
      ixbrl: true,
    },
    {
      transactionId: "SIMTX00000001AA2097",
      madeUpDate: "2097-04-30",
      filedOn: "2097-12-15",
      accountsType: "total-exemption-full",
      amended: false,
      paperFiled: true,
      pages: 6,
      ixbrl: false,
    },
  ],
};

function json(route, status, body) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

// The site from web/public with the drill-down rewrite the page router makes, and the API answered
// from the fixtures. bundles is what /api/v1/bundle says the account holds.
async function serveSite(
  page,
  { environmentName = "ci", bundles = [], apiRequests = [], filings = FILINGS, filedAccounts = FILED_ACCOUNTS, signedIn = true } = {},
) {
  await page.addInitScript((withSignIn) => {
    localStorage.setItem("consent.analytics", "declined");
    if (!withSignIn) return;
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("cognitoAccessToken", "access-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "resident@test.diyaccounting.co.uk", given_name: "Alex" }));
  }, signedIn);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) {
      apiRequests.push(pathname + url.search);
      const company = pathname.match(/^\/api\/v1\/companies-house\/company\/([^/]+)(\/.*)?$/);
      if (pathname === "/api/v1/bundle") {
        return json(route, 200, { bundles: bundles.map((bundleId) => ({ bundleId, allocated: true })), tokensRemaining: 10 });
      }
      if (pathname === "/api/v1/public/company-deadlines") return json(route, 200, { companyNumber: "00000001", accountsOverdue: false });
      if (company && company[1] !== "00000001") return json(route, 404, { message: "Not found for the specified query" });
      if (company && !company[2]) return json(route, 200, PROFILE);
      if (company && company[2] === "/officers") return json(route, 200, OFFICERS);
      if (company && company[2] === "/persons-with-significant-control") return json(route, 200, PSCS);
      if (company && company[2] === "/filing-history") return json(route, 200, filings);
      if (company && company[2] === "/filed-accounts") return json(route, 200, filedAccounts);
      if (company && company[2] === "/registered-email-address/eligibility")
        return json(route, 200, { eligibilityStatusCode: "COMPANY_VALID_FOR_SERVICE" });
      return json(route, 200, {});
    }
    if (pathname === "/submit.environment-name.txt")
      return route.fulfill({ status: 200, contentType: "text/plain", body: environmentName });
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

// The view at desktop width and at a phone's, for a test that opens it once.
async function shootAtWidths(page, name) {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await shoot(page, name);
  }
}

const BASE = "http://localhost:3000";

const VIEWS = [
  { name: "overview", address: "/companies-house/company/00000001", shows: "#drillOverview", text: "1 Example Street" },
  { name: "officers", address: "/companies-house/company/00000001/officers", shows: "#drillView", text: "BRAMWELL, Eleanor" },
  { name: "psc", address: "/companies-house/company/00000001/psc", shows: "#drillView", text: "Ownership of shares 50 to 75 percent" },
  {
    name: "filing-history",
    address: "/companies-house/company/00000001/filing-history",
    shows: "#drillView",
    text: "Confirmation statement made on 16 April 2098 with no updates",
  },
  { name: "accounts", address: "/companies-house/company/00000001/accounts", shows: "#drillView", text: "Total exemption full" },
  { name: "accounts-period", address: "/companies-house/company/00000001/accounts/2098-04-30", shows: "#drillView", text: "30 April 2098" },
  {
    name: "accounts-set",
    address: "/companies-house/company/00000001/accounts/2098-04-30/SIMTX00000001AA2098",
    shows: "#drillView",
    text: "SIMTX00000001AA2098",
  },
  {
    name: "confirmation-statement",
    address: "/companies-house/company/00000001/confirmation-statement/2098-04-16",
    shows: "#drillView",
    text: "SIMTX00000001CS2098",
  },
];

test.describe("Company lookup drill-down", () => {
  for (const view of VIEWS) {
    for (const width of [1280, 390]) {
      test(`the ${view.name} view opens from its address at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await serveSite(page, { bundles: ["resident-ltd"] });
        await page.goto(`${BASE}${view.address}`, { waitUntil: "networkidle" });
        await expect(page.locator("#profileView")).toBeVisible({ timeout: 15000 });
        await expect(page.locator(view.shows)).toBeVisible();
        await expect(page.locator(view.shows)).toContainText(view.text);
        await expect(page.locator("#drillHeading")).toHaveText("SIMULATOR EXAMPLE COMPANY LIMITED (00000001)");
        expect(new URL(page.url()).pathname).toBe(view.address);
        const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(scrollsSideways).toBe(false);
        await shoot(page, view.name);
      });
    }
  }

  for (const view of [VIEWS[0], VIEWS[1], VIEWS[4]]) {
    test(`the Welsh ${view.name} view opens from its address under /cy/`, async ({ page }) => {
      await serveSite(page, { bundles: ["resident-ltd"] });
      await page.goto(`${BASE}/cy${view.address}`, { waitUntil: "networkidle" });
      await expect(page.locator(view.shows)).toBeVisible({ timeout: 15000 });
      await expect(page.locator("#drillNav")).toContainText("Trosolwg");
      expect(new URL(page.url()).pathname).toBe(`/cy${view.address}`);
      await shootAtWidths(page, `cy-${view.name}`);
    });
  }

  test("the address moves with the reader and the back button returns to the view before", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await page.locator("#drillNav a", { hasText: "Filing history" }).click();
    await expect(page.locator("#drillView")).toContainText("Confirmation statement made on 16 April 2098 with no updates");
    expect(new URL(page.url()).pathname).toBe("/companies-house/company/00000001/filing-history");
    await page.locator("#drillView a", { hasText: "Confirmation statement made on 16 April 2098 with no updates" }).click();
    await expect(page.locator("#drillView")).toContainText("SIMTX00000001CS2098");
    expect(new URL(page.url()).pathname).toBe("/companies-house/company/00000001/confirmation-statement/2098-04-16");
    await page.goBack();
    await expect(page.locator("#drillView")).toContainText("Confirmation statement made on 16 April 2098 with no updates");
    expect(new URL(page.url()).pathname).toBe("/companies-house/company/00000001/filing-history");
  });

  test("the older ?companyNumber= address moves to the company's path", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/companySearch.html?companyNumber=1`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillOverview")).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe("/companies-house/company/00000001");
  });

  test("an unknown company shows the page's own not-found state", async ({ page }) => {
    await serveSite(page);
    await page.goto(`${BASE}/companies-house/company/99999999`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillNotFound")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#drillNotFoundText")).toHaveText("No company with the number 99999999 is on the register.");
    await expect(page.locator("#profileView")).toBeHidden();
    await shoot(page, "not-found-company");
  });

  test("a period with no filing shows the page's own not-found state", async ({ page }) => {
    await serveSite(page);
    await page.goto(`${BASE}/companies-house/company/00000001/accounts/2050-04-30`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillNotFound")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#drillNotFoundText")).toContainText("No accounts made up to 30 April 2050");
    await shoot(page, "not-found-period");
  });

  test("never shows a person's month and year of birth, nationality or country of residence", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    for (const address of ["/companies-house/company/00000001/officers", "/companies-house/company/00000001/psc"]) {
      await page.goto(`${BASE}${address}`, { waitUntil: "networkidle" });
      await expect(page.locator("#drillView table")).toBeVisible({ timeout: 15000 });
      const text = await page.locator("main").innerText();
      expect(text).not.toContain("British");
      expect(text).not.toContain("1970");
      expect(text).not.toContain("England");
      expect(page.url()).not.toContain("1970");
    }
  });

  test("without a Companies House sign-in for the company, the email section does not ask Companies House", async ({ page }) => {
    const apiRequests = [];
    await serveSite(page, { bundles: ["resident-ltd"], apiRequests });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#emailSection")).toContainText("Companies House checks whether a change can be filed when you start it.", {
      timeout: 15000,
    });
    expect(apiRequests.some((request) => request.endsWith("/registered-email-address/eligibility"))).toBe(false);
    expect(new URL(page.url()).pathname).toBe("/companies-house/company/00000001");
  });

  test("with a Companies House sign-in for the company's email address, the email section says whether a change can be filed", async ({
    page,
  }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      sessionStorage.setItem("companiesHouseGrantId", "grant-1");
      sessionStorage.setItem("companiesHouseTokenExpiresAt", String(Date.now() + 3600000));
      sessionStorage.setItem("companiesHouseTokenScope", window.companiesHouseScope("00000001", "registered-email-address"));
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#emailSection")).toContainText("A change of registered email address can be filed for this company.", {
      timeout: 15000,
    });
  });

  test("an account holding the forms' activities gets a file button for each, opening the form with the company", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillOverview .file-this a.btn")).toHaveCount(6, { timeout: 15000 });
    const hrefs = await page
      .locator("#drillOverview .file-this a.btn")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs.sort()).toEqual(
      [
        "/companies-house/changeRegisteredEmail.html?companyNumber=00000001",
        "/companies-house/changeRegisteredOffice.html?companyNumber=00000001&addressLine1=1+Example+Street&locality=Cardiff&postalCode=CF14+3UZ&country=Wales",
        "/companies-house/fileConfirmationStatement.html?companyNumber=00000001",
        "/companies-house/fileMicroEntityAccounts.html?companyNumber=00000001&periodStart=2098-05-01&periodEnd=2099-04-30",
        "/companies-house/fileSmallCompanyAccounts.html?companyNumber=00000001&periodStart=2098-05-01&periodEnd=2099-04-30",
        "/companies-house/fileCompanyTaxReturn.html?companyNumber=00000001",
      ].sort(),
    );
  });

  test("an account with the default bundle alone is told which bundle files the accounts and the statement", async ({ page }) => {
    const apiRequests = [];
    await serveSite(page, { bundles: [], apiRequests });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#officeSection .file-this a.btn")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#accountsSection .file-this").first()).toContainText(
      "File micro-entity accounts needs the Resident Ltd bundle.",
    );
    await expect(page.locator("#accountsSection .file-this a.file-this-form").first()).toHaveAttribute(
      "href",
      "/companies-house/fileMicroEntityAccounts.html?companyNumber=00000001&periodStart=2098-05-01&periodEnd=2099-04-30",
    );
    await shootAtWidths(page, "overview-default-bundle");
    await expect(page.locator("#confirmationSection .file-this")).toContainText("needs the Resident Ltd bundle");
    await page.goto(`${BASE}/companies-house/company/00000001/accounts`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Total exemption full");
    expect(apiRequests.some((request) => request.endsWith("/filed-accounts"))).toBe(false);
    await shootAtWidths(page, "accounts-default-bundle");
  });

  test("the accounts list reads the filed accounts and their iXBRL mark where the account holds the revision activity", async ({
    page,
  }) => {
    const apiRequests = [];
    await serveSite(page, { bundles: ["resident-ltd"], apiRequests });
    await page.goto(`${BASE}/companies-house/company/00000001/accounts/2098-04-30/SIMTX00000001AA2098`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Held by Companies House", { timeout: 15000 });
    expect(apiRequests.some((request) => request.endsWith("/filed-accounts"))).toBe(true);
  });

  test("on prod, where the revision activity is not offered, the accounts come from the filing history", async ({ page }) => {
    const apiRequests = [];
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"], apiRequests });
    await page.goto(`${BASE}/companies-house/company/00000001/accounts`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Micro entity", { timeout: 15000 });
    expect(apiRequests.some((request) => request.endsWith("/filed-accounts"))).toBe(false);
  });
});

// A company with more filings than the routes read: the newest of them, and the total on the register.
const TRUNCATED_FILINGS = { ...FILINGS, totalCount: 612, truncated: true };
const OLDER_SET = {
  transactionId: "SIMTX00000001AA2085",
  madeUpDate: "2085-04-30",
  filedOn: "2085-12-01",
  accountsType: "micro-entity",
  amended: false,
  paperFiled: false,
  pages: 4,
};
const TRUNCATED_FILED_ACCOUNTS = { ...FILED_ACCOUNTS, filedAccounts: [...FILED_ACCOUNTS.filedAccounts, OLDER_SET], truncated: true };

test.describe("Company lookup drill-down past the newest filings", () => {
  for (const width of [1280, 390]) {
    test(`the filing history says it shows the newest filings of the total and names Companies House's service at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page, { bundles: ["resident-ltd"], filings: TRUNCATED_FILINGS });
      await page.goto(`${BASE}/companies-house/company/00000001/filing-history`, { waitUntil: "networkidle" });
      const note = page.locator("#drillView .drill-truncated");
      await expect(note).toContainText("This shows the newest 3 of the company's 612 filings.", { timeout: 15000 });
      await expect(note.locator("a")).toHaveText("Find and update company information");
      await expect(note.locator("a")).toHaveAttribute(
        "href",
        "https://find-and-update.company-information.service.gov.uk/company/00000001/filing-history",
      );
      const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(scrollsSideways).toBe(false);
      await shoot(page, "filing-history-truncated");
    });
  }

  test("the filing history words each filing as Companies House does, and words a description it has not published from its key", async ({
    page,
  }) => {
    const filings = {
      ...FILINGS,
      totalCount: 4,
      filings: [
        ...FILINGS.filings,
        {
          transactionId: "SIMTX00000001XX2096",
          date: "2096-05-01",
          category: "miscellaneous",
          type: "XX01",
          description: "a-description-companies-house-has-not-published",
          paperFiled: false,
          hasDocument: true,
        },
      ],
    };
    await serveSite(page, { bundles: ["resident-ltd"], filings });
    await page.goto(`${BASE}/companies-house/company/00000001/filing-history`, { waitUntil: "networkidle" });
    const view = page.locator("#drillView");
    await expect(view).toContainText("Micro company accounts made up to 30 April 2098", { timeout: 15000 });
    await expect(view).toContainText("Total exemption full accounts made up to 30 April 2097");
    await expect(view).toContainText("A description companies house has not published");
    await expect(view).not.toContainText("Accounts with accounts type");
  });

  test("the Welsh filing history marks Companies House's English words as English", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/cy/companies-house/company/00000001/filing-history`, { waitUntil: "networkidle" });
    const description = page.locator("#drillView a", { hasText: "Micro company accounts made up to" });
    await expect(description).toHaveAttribute("lang", "en", { timeout: 15000 });
    await shootAtWidths(page, "cy-filing-history");
  });

  test("a whole filing history carries no note", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/filing-history`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Confirmation statement made on 16 April 2098 with no updates", {
      timeout: 15000,
    });
    await expect(page.locator("#drillView .drill-truncated")).toHaveCount(0);
  });

  test("the accounts list says it shows the accounts among the newest filings", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"], filedAccounts: TRUNCATED_FILED_ACCOUNTS });
    await page.goto(`${BASE}/companies-house/company/00000001/accounts`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView .drill-truncated")).toContainText("This shows the accounts among the company's newest filings.", {
      timeout: 15000,
    });
    await expect(page.locator("#drillView")).toContainText("30 April 2085");
    await shoot(page, "accounts-truncated");
  });

  test("a set older than the newest ten whose iXBRL mark was not read is not called PDF only or not held", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"], filedAccounts: TRUNCATED_FILED_ACCOUNTS });
    await page.goto(`${BASE}/companies-house/company/00000001/accounts/2085-04-30/SIMTX00000001AA2085`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("SIMTX00000001AA2085", { timeout: 15000 });
    const text = await page.locator("#drillView").innerText();
    expect(text).not.toContain("iXBRL document");
    expect(text).not.toContain("Not held");
    expect(text).not.toMatch(/PDF only/i);
    await page.goto(`${BASE}/companies-house/company/00000001/accounts`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("30 April 2085", { timeout: 15000 });
    expect(await page.locator("#drillView").innerText()).not.toMatch(/PDF only/i);
  });

  test("a set among the newest ten without an iXBRL document says Companies House does not hold one", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"], filedAccounts: TRUNCATED_FILED_ACCOUNTS });
    await page.goto(`${BASE}/companies-house/company/00000001/accounts/2097-04-30/SIMTX00000001AA2097`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Not held", { timeout: 15000 });
  });

  test("the Welsh filing history carries the note in Welsh", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"], filings: TRUNCATED_FILINGS });
    await page.goto(`${BASE}/cy/companies-house/company/00000001/filing-history`, { waitUntil: "networkidle" });
    const note = page.locator("#drillView .drill-truncated");
    await expect(note).toBeVisible({ timeout: 15000 });
    await expect(note).toContainText("612");
    await expect(note).not.toContainText("This shows the newest");
    await shootAtWidths(page, "cy-filing-history-truncated");
  });
});

test.describe("Company lookup drill-down edit links", () => {
  const AUTHORITY = [
    {
      section: "#officeSection",
      quotes: [
        "You’ll need your company authentication code.",
        "The code is used to authorise information filed online and is the equivalent of a company officer’s signature.",
      ],
      sources: [
        "https://www.gov.uk/government/publications/change-a-registered-office-address-ad01",
        "https://www.gov.uk/guidance/company-authentication-codes-for-online-filing",
      ],
    },
    {
      section: "#emailSection",
      quotes: ["You’ll need a company authentication code to file your information online or file using commercial software."],
      sources: ["https://www.gov.uk/guidance/company-authentication-codes-for-online-filing"],
    },
    {
      section: "#confirmationSection",
      quotes: [
        "You’ll need a Companies House password and authentication code.",
        "This form may be authenticated by: Director, Secretary, Person authorised, Charity commission receiver and manager, CIC manager, Judicial factor.",
        "Before filing your confirmation statement, you may need to verify your identity using GOV.UK One Login.",
        "If your company has more than one director, you must have each director’s personal code.",
      ],
      sources: [
        "https://www.gov.uk/file-your-confirmation-statement-with-companies-house",
        "https://assets.publishing.service.gov.uk/media/696f5ef05b6060ca6736a07e/CS01_v7.0-FINAL.pdf",
      ],
    },
    {
      section: "#accountsSection",
      quotes: [
        "You must get your accounts approved by your company directors before you file them.",
        "Your company or association must file a Company Tax Return if you get a ‘notice to deliver a Company Tax Return’ from HM Revenue and Customs (HMRC).",
      ],
      sources: ["https://www.gov.uk/file-your-company-annual-accounts", "https://www.gov.uk/company-tax-returns"],
    },
  ];

  for (const width of [1280, 390]) {
    test(`each edit link carries the authority its filing needs with the source at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page, { bundles: ["resident-ltd"] });
      await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
      await expect(page.locator("#drillOverview .file-this a.btn")).toHaveCount(6, { timeout: 15000 });
      for (const { section, quotes, sources } of AUTHORITY) {
        await expect(page.locator(`${section} .file-this-authority`).first()).toBeAttached();
        const text = await page.locator(`${section} .file-this-authority`).allInnerTexts();
        for (const quote of quotes) expect(text.join("\n")).toContain(`“${quote}”`);
        const hrefs = await page.locator(`${section} .file-this-authority a`).evaluateAll((links) => links.map((link) => link.href));
        for (const source of sources) expect(hrefs).toContain(source);
      }
      const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(scrollsSideways).toBe(false);
      await shoot(page, "overview-edit-links");
    });
  }

  test("a reader who is signed out is asked to sign in, and the authority is still shown", async ({ page }) => {
    await serveSite(page, { signedIn: false });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#officeSection .file-this-sign-in")).toContainText("Sign in to change the registered office.", {
      timeout: 15000,
    });
    await expect(page.locator("#drillOverview .file-this a.btn")).toHaveCount(0);
    const signIn = await page.locator("#officeSection .file-this-sign-in a").getAttribute("href");
    expect(signIn).toBe(`/auth/login.html?next=${encodeURIComponent("/companies-house/company/00000001")}`);
    await expect(page.locator("#officeSection .file-this-authority")).toContainText("company authentication code");
    await expect(page.locator("#watchSection .watch-list-add")).toHaveCount(0);
    await expect(page.locator("#watchSection .watch-list-sign-in")).toHaveText("Sign in to add to your watch list");
    await shootAtWidths(page, "overview-signed-out");
  });

  test("the company's status names Companies House's route for closing a company and carries no edit link", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    const note = page.locator("#statusChangeNote");
    await expect(note).toContainText("To close the company, Companies House takes form DS01:", { timeout: 15000 });
    await expect(note.locator("a")).toHaveAttribute("href", "https://www.gov.uk/strike-off-your-company-from-companies-register");
  });

  test("on prod, where the Company Tax Return form is not offered, the accounts section has no link to it", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#accountsSection .file-this a.btn")).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('#accountsSection .file-this[data-activity="file-company-tax-return"]')).toHaveCount(0);
  });

  test("the Welsh overview carries the edit links and the authority in Welsh", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/cy/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#officeSection .file-this a.btn")).toHaveAttribute(
      "href",
      /^\/cy\/companies-house\/changeRegisteredOffice\.html\?/,
      {
        timeout: 15000,
      },
    );
    const office = page.locator("#officeSection .file-this-authority li");
    await expect(office.nth(1)).toContainText(
      "“Defnyddir y cod i awdurdodi gwybodaeth a ffeiliwyd ar-lein ac mae’n gyfatebol i lofnod swyddog cwmni.”",
    );
    await expect(office.nth(1).locator("a")).toHaveAttribute(
      "href",
      "https://www.gov.uk/guidance/company-authentication-codes-for-online-filing.cy",
    );
    await expect(office.nth(1).locator("a")).toHaveText("Codau dilysu cwmni ar gyfer ffeilio ar lein");
    await shootAtWidths(page, "cy-overview-edit-links");
  });

  test("on the Welsh overview a quotation GOV.UK publishes in English only stays in English, marked as English", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/cy/companies-house/company/00000001`, { waitUntil: "networkidle" });
    const office = page.locator("#officeSection .file-this-authority li").first();
    await expect(office.locator('span[lang="en"]')).toHaveText("“You’ll need your company authentication code.”", { timeout: 15000 });
    await expect(office.locator('a[lang="en"]')).toHaveAttribute(
      "href",
      "https://www.gov.uk/government/publications/change-a-registered-office-address-ad01",
    );
    await expect(office).toContainText("(yn Saesneg)");
    await expect(office).toContainText("Mae GOV.UK yn cyhoeddi hwn yn Saesneg yn unig.");
    const confirmation = page.locator("#confirmationSection .file-this-authority li");
    await expect(confirmation.first()).toContainText("“Bydd arnoch angen cyfrinair a chod dilysu gan Dŷ’r Cwmnïau.”");
    await expect(confirmation.first().locator("a")).toHaveAttribute(
      "href",
      "https://www.gov.uk/ffeilio-datganiad-cadarnhau-gyda-thyr-cwmniau",
    );
    await expect(confirmation.nth(2).locator('span[lang="en"]')).toContainText("GOV.UK One Login");
    await expect(page.locator("#statusChangeNote a")).toHaveAttribute("lang", "en");
    await expect(page.locator("#statusChangeNote")).toContainText("(yn Saesneg)");
  });

  for (const width of [1280, 390]) {
    test(`the registered office link opens the form with the current address in the new address fields at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveSite(page, { bundles: ["resident-ltd"] });
      await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
      await page.locator("#officeSection .file-this a.btn").click();
      await expect(page.locator("#companyNumber")).toHaveValue("00000001", { timeout: 15000 });
      await expect(page.locator("#addressLine1")).toHaveValue("1 Example Street");
      await expect(page.locator("#locality")).toHaveValue("Cardiff");
      await expect(page.locator("#postalCode")).toHaveValue("CF14 3UZ");
      await expect(page.locator("#country")).toHaveValue("Wales");
      await shoot(page, "change-office-from-link");
    });
  }

  test("the accounts links open the forms with the next accounting period filled in", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    for (const form of ["fileMicroEntityAccounts", "fileSmallCompanyAccounts"]) {
      await page.goto(`${BASE}/companies-house/${form}.html?companyNumber=00000001&periodStart=2098-05-01&periodEnd=2099-04-30`, {
        waitUntil: "networkidle",
      });
      await expect(page.locator("#companyNumber")).toHaveValue("00000001", { timeout: 15000 });
      await expect(page.locator("#periodStart")).toHaveValue("2098-05-01");
      await expect(page.locator("#periodEnd")).toHaveValue("2099-04-30");
    }
  });
});

test.describe("Companies House forms opened with a company number", () => {
  for (const form of [
    "fileCompanyTaxReturn",
    "changeRegisteredOffice",
    "changeRegisteredEmail",
    "fileConfirmationStatement",
    "fileMicroEntityAccounts",
    "fileSmallCompanyAccounts",
  ]) {
    test(`${form} starts with the company number from its address`, async ({ page }) => {
      await serveSite(page, { bundles: ["resident-ltd"] });
      await page.goto(`${BASE}/companies-house/${form}.html?companyNumber=1`, { waitUntil: "networkidle" });
      await expect(page.locator("#companyNumber")).toHaveValue("00000001", { timeout: 15000 });
    });

    test(`${form} leaves out a value that is not a company number`, async ({ page }) => {
      await serveSite(page, { bundles: ["resident-ltd"] });
      await page.goto(`${BASE}/companies-house/${form}.html?companyNumber=%3Cscript%3E`, { waitUntil: "networkidle" });
      await expect(page.locator("#companyNumber")).toHaveValue("");
    });
  }
});
