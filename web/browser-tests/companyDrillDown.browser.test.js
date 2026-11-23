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
      pscId: "psc-eleanor-1970",
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
  {
    environmentName = "ci",
    bundles = [],
    bundleStatus = 200,
    apiRequests = [],
    filings = FILINGS,
    filedAccounts = FILED_ACCOUNTS,
    pscs = PSCS,
    signedIn = true,
    officers = OFFICERS,
  } = {},
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
        if (bundleStatus !== 200) return json(route, bundleStatus, { message: "The bundles could not be read" });
        return json(route, 200, { bundles: bundles.map((bundleId) => ({ bundleId, allocated: true })), tokensRemaining: 10 });
      }
      if (pathname === "/api/v1/public/company-deadlines") return json(route, 200, { companyNumber: "00000001", accountsOverdue: false });
      if (company && company[1] !== "00000001") return json(route, 404, { message: "Not found for the specified query" });
      if (company && !company[2]) return json(route, 200, PROFILE);
      if (company && company[2] === "/officers") return json(route, 200, officers);
      if (company && company[2] === "/persons-with-significant-control") return json(route, 200, pscs);
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
    await expect(page.locator("#drillOverview .file-this a.btn")).toHaveCount(10, { timeout: 15000 });
    const hrefs = await page
      .locator("#drillOverview .file-this a.btn")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs.sort()).toEqual(
      [
        "/companies-house/allotShares.html?companyNumber=00000001",
        "/companies-house/changeAccountingRefDate.html?companyNumber=00000001&currentPeriodEnd=2099-04-30",
        "/companies-house/changeCompanyName.html?companyNumber=00000001",
        "/companies-house/changeRegisteredEmail.html?companyNumber=00000001",
        "/companies-house/changeRegisteredOffice.html?companyNumber=00000001&addressLine1=1+Example+Street&locality=Cardiff&postalCode=CF14+3UZ&country=Wales",
        "/companies-house/fileCompanyTaxReturn.html?companyNumber=00000001",
        "/companies-house/fileConfirmationStatement.html?companyNumber=00000001",
        "/companies-house/fileMicroEntityAccounts.html?companyNumber=00000001&periodStart=2098-05-01&periodEnd=2099-04-30",
        "/companies-house/fileSmallCompanyAccounts.html?companyNumber=00000001&periodStart=2098-05-01&periodEnd=2099-04-30",
        "/companies-house/recordsLocation.html?companyNumber=00000001",
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

  test("when the bundles cannot be read, the accounts list comes from the filing history", async ({ page }) => {
    const apiRequests = [];
    await serveSite(page, { bundles: ["resident-ltd"], bundleStatus: 500, apiRequests });
    await page.goto(`${BASE}/companies-house/company/00000001/accounts`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Micro entity", { timeout: 15000 });
    expect(apiRequests.some((request) => request.endsWith("/filed-accounts"))).toBe(false);
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

  test("the Welsh PSC table gives each nature of control in Welsh", async ({ page }) => {
    const natures = [
      "ownership-of-shares-50-to-75-percent",
      "voting-rights-25-to-50-percent-as-trust",
      "right-to-appoint-and-remove-directors-as-firm",
      "significant-influence-or-control",
    ];
    await serveSite(page, { bundles: ["resident-ltd"], pscs: { ...PSCS, pscs: [{ ...PSCS.pscs[0], naturesOfControl: natures }] } });
    await page.goto(`${BASE}/cy/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView table")).toContainText(
      "Perchnogaeth cyfranddaliadau 50 i 75 y cant; Hawliau pleidleisio 25 i 50 y cant drwy ymddiriedolaeth; Yr hawl i benodi a diswyddo cyfarwyddwyr drwy ffyrm; Dylanwad neu reolaeth arwyddocaol",
      { timeout: 15000 },
    );
    await expect(page.locator("#drillView table")).not.toContainText("Ownership of shares");
  });

  test("the English PSC table keeps the register's words for each nature of control", async ({ page }) => {
    await serveSite(page, {
      bundles: ["resident-ltd"],
      pscs: {
        ...PSCS,
        pscs: [
          {
            ...PSCS.pscs[0],
            naturesOfControl: ["voting-rights-75-to-100-percent-as-trust", "part-right-to-share-surplus-assets-25-to-50-percent"],
          },
        ],
      },
    });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView table")).toContainText(
      "Voting rights 75 to 100 percent as trust; Part right to share surplus assets 25 to 50 percent",
      { timeout: 15000 },
    );
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
      await expect(page.locator("#drillOverview .file-this a.btn")).toHaveCount(10, { timeout: 15000 });
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

  for (const [language, prefix] of [
    ["English", ""],
    ["Welsh", "/cy"],
  ]) {
    test(`at phone width the link to the watch list is not broken across lines, in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await serveSite(page, { bundles: ["resident-ltd"] });
      await page.goto(`${BASE}${prefix}/companies-house/company/00000001`, { waitUntil: "networkidle" });
      const link = page.locator("#watchSection > a");
      await expect(link).toBeVisible({ timeout: 15000 });
      expect(await link.evaluate((element) => element.getClientRects().length)).toBe(1);
      const [section, box] = [await page.locator("#watchSection").boundingBox(), await link.boundingBox()];
      expect(box.x + box.width).toBeLessThanOrEqual(section.x + section.width + 0.5);
    });
  }

  test("the Welsh overview names the type of the last accounts in Welsh", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/cy/companies-house/company/00000001`, { waitUntil: "networkidle" });
    const accounts = page.locator("#accountsSection");
    await expect(accounts).toContainText("Micro-endid", { timeout: 15000 });
    await expect(accounts).not.toContainText("Micro entity");
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

test.describe("Company lookup drill-down links for two PSCs of one name", () => {
  const NAMESAKES = {
    ...PSCS,
    activeCount: 2,
    pscs: [
      ...PSCS.pscs,
      {
        name: "Eleanor Bramwell",
        kind: "individual-person-with-significant-control",
        naturesOfControl: ["ownership-of-shares-25-to-50-percent"],
        notifiedOn: "2024-05-01",
        dateOfBirth: { month: 8, year: 1996 },
        nationality: "British",
      },
    ],
  };

  for (const [language, prefix, cease, change] of [
    [
      "English",
      "",
      [
        "Tell Companies House Eleanor Bramwell (born January 1970) has ceased to be a PSC",
        "Tell Companies House Eleanor Bramwell (born August 1996) has ceased to be a PSC",
      ],
      [
        "Tell Companies House the details of Eleanor Bramwell (born January 1970) have changed",
        "Tell Companies House the details of Eleanor Bramwell (born August 1996) have changed",
      ],
    ],
    ["Welsh", "/cy", [/\(ganwyd Ionawr 1970\)/, /\(ganwyd Awst 1996\)/], [/\(ganwyd Ionawr 1970\)/, /\(ganwyd Awst 1996\)/]],
  ]) {
    test(`each link names the month and year of birth of its PSC, in ${language}`, async ({ page }) => {
      await serveSite(page, { bundles: ["resident-ltd"], pscs: NAMESAKES });
      await page.goto(`${BASE}${prefix}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
      await expect(page.locator("#drillView .cease-psc-links a")).toHaveText(cease, { timeout: 15000 });
      await expect(page.locator("#drillView .change-psc-details-links a")).toHaveText(change);
    });
  }
});

test.describe("Company lookup drill-down PSC cessation links", () => {
  test("an account holding the cessation form gets a link for each current PSC, and the authority PSC07 states", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });

    const link = page.locator("#drillView .cease-psc-links a");
    await expect(link).toHaveText("Tell Companies House Eleanor Bramwell has ceased to be a PSC", { timeout: 15000 });
    expect(await link.getAttribute("href")).toBe("/companies-house/ceasePsc.html?companyNumber=00000001&pscId=psc-eleanor-1970");
    const control = page.locator('#drillView .file-this[data-activity="cease-psc"]');
    await expect(control.locator("a.btn")).toHaveText("Tell Companies House a PSC has ceased");
    await expect(control.locator(".file-this-authority")).toContainText(
      "“This form may be authenticated by: Director, Secretary, Person authorised, Administrator, Administrative receiver, Receiver, Receiver manager, Charity commission receiver and manager, CIC manager, Judicial factor.”",
    );
    const sources = await control.locator(".file-this-authority a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/69f30d970bb62e692c5d6e87/PSC07_v4.0-Final.pdf");
    await shoot(page, "psc-cease-links");
  });

  test("an account holding the change of details form gets a link for each current PSC, and the authority PSC04 and GOV.UK state", async ({
    page,
  }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });

    const link = page.locator("#drillView .change-psc-details-links a");
    await expect(link).toHaveText("Tell Companies House the details of Eleanor Bramwell have changed", { timeout: 15000 });
    expect(await link.getAttribute("href")).toBe("/companies-house/changePscDetails.html?companyNumber=00000001&pscName=Eleanor+Bramwell");
    const control = page.locator('#drillView .file-this[data-activity="change-psc-details"]');
    await expect(control.locator("a.btn")).toHaveText("Tell Companies House a PSC's details have changed");
    const authority = control.locator(".file-this-authority");
    await expect(authority).toContainText(
      "“You must tell Companies House about any changes to your PSC information, such as a change of personal details or nature of control. You must do this within 14 days of confirming the change.”",
    );
    await expect(authority).toContainText(
      "“You must have obtained confirmation from the individual person with significant control that their particulars are correct before sending this form to Companies House.”",
    );
    const sources = await authority.locator("a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/6a98266bdf4246cf45e467ef/PSC04_v5.0-FINAL.pdf");
    expect(sources).toContain("https://www.gov.uk/guidance/people-with-significant-control-pscs");
  });

  test("on prod, where the change of details form is not offered, the PSC view carries no change link", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Eleanor Bramwell", { timeout: 15000 });
    await expect(page.locator("#drillView .change-psc-details-links")).toHaveCount(0);
    await expect(page.locator('#drillView .file-this[data-activity="change-psc-details"]')).toHaveCount(0);
  });

  test("two current PSCs of one name get links that tell them apart", async ({ page }) => {
    const [eleanor] = PSCS.pscs;
    const namesake = { ...eleanor, notifiedOn: "2021-03-15" };
    await serveSite(page, { bundles: ["resident-ltd"], pscs: { ...PSCS, activeCount: 2, pscs: [eleanor, namesake] } });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });

    await expect(page.locator("#drillView .cease-psc-links a")).toHaveText(
      [
        "Tell Companies House Eleanor Bramwell (born January 1970, notified 6 April 2016) has ceased to be a PSC",
        "Tell Companies House Eleanor Bramwell (born January 1970, notified 15 March 2021) has ceased to be a PSC",
      ],
      { timeout: 15000 },
    );
  });

  test("an account holding the PSC statements form gets its control, with the authority PSC08 and PSC09 state", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    const control = page.locator('#drillView .file-this[data-activity="psc-statements"]');
    await expect(control.locator("a.btn")).toHaveText("Give or withdraw a PSC statement", { timeout: 15000 });
    const authority = control.locator(".file-this-authority");
    await expect(authority).toContainText(
      "“The company must take reasonable steps to find out if there is anyone who is a registrable person or a registrable relevant legal entity (RLE), and if so, to identify them.”",
    );
    await expect(authority).toContainText("“You may use this form to tell us about an update to a PSC statement.”");
    const sources = await authority.locator("a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/69131f505dec0071ce496357/PSC08_v3.0-FINAL.pdf");
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/6915e83a9d50fc2fe816178d/PSC09_v3.0-FINAL.pdf");
  });

  test("on prod, where the PSC statements form is not offered, the PSC view carries no statements control", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Eleanor Bramwell", { timeout: 15000 });
    await expect(page.locator('#drillView .file-this[data-activity="psc-statements"]')).toHaveCount(0);
  });

  test("on prod, where the cessation form is not offered, the PSC view carries no cessation link", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Eleanor Bramwell", { timeout: 15000 });
    await expect(page.locator("#drillView .cease-psc-links")).toHaveCount(0);
    await expect(page.locator('#drillView .file-this[data-activity="cease-psc"]')).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down change of accounting reference date link", () => {
  const CONTROL = '#accountsSection .file-this[data-activity="change-accounting-reference-date"]';

  test("an account holding the form gets a link that names the current period, and the authority AA01 states", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });

    const control = page.locator(CONTROL);
    await expect(control.locator("a.btn")).toHaveText("Change the accounting reference date", { timeout: 15000 });
    expect(await control.locator("a.btn").getAttribute("href")).toBe(
      "/companies-house/changeAccountingRefDate.html?companyNumber=00000001&currentPeriodEnd=2099-04-30",
    );
    await expect(control.locator(".file-this-authority")).toContainText(
      "“You cannot extend a period beyond 18 months unless the company is in administration.”",
    );
    await expect(control.locator(".file-this-authority")).toContainText(
      "“This form may be signed by: Director, Secretary, Person authorised,",
    );
    const sources = await control.locator(".file-this-authority a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/69f9dd2e097169e6a7a76ff4/AA01_V7.0-final.pdf");
    await shoot(page, "change-accounting-reference-date-link");
  });

  test("on prod, where the form is not offered, the accounts section carries no link to it", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#accountsSection")).toContainText("Next accounting period", { timeout: 15000 });
    await expect(page.locator(CONTROL)).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down after a filing", () => {
  test("a page restored from the back-forward cache reads the register again", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    const profileReads = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/v1/companies-house/company/00000001") profileReads.push(request.url());
    });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillOverview")).toContainText("1 Example Street", { timeout: 15000 });
    const readsBefore = profileReads.length;
    expect(readsBefore).toBeGreaterThan(0);

    await Promise.all([
      page.waitForEvent("load"),
      page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))),
    ]);
    await expect(page.locator("#drillOverview")).toContainText("1 Example Street", { timeout: 15000 });
    expect(profileReads.length).toBeGreaterThan(readsBefore);
  });

  test("a page shown on its first load is not loaded twice", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    let loads = 0;
    page.on("load", () => loads++);
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillOverview")).toContainText("1 Example Street", { timeout: 15000 });
    await page.waitForTimeout(500);
    expect(loads).toBe(1);
  });
});

test.describe("Company lookup drill-down officer resignation links", () => {
  test("an account holding the officer resignation form gets a link for each current director or secretary, and the authority TM01 and TM02 state", async ({
    page,
  }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });

    const link = page.locator("#drillView .remove-officer-links a");
    await expect(link).toHaveText("Remove BRAMWELL, Eleanor (Director)", { timeout: 15000 });
    expect(await link.getAttribute("href")).toBe(
      "/companies-house/removeOfficer.html?companyNumber=00000001&officerName=BRAMWELL%2C+Eleanor&officerRole=director&appointedOn=2015-01-01",
    );
    const control = page.locator('#drillView .file-this[data-activity="remove-officer"]');
    await expect(control.locator("a.btn")).toHaveText("Remove a director or secretary");
    const authority = control.locator(".file-this-authority");
    await expect(authority).toContainText(
      "“This form may be authenticated by: Director, Secretary, Person authorised, Liquidator, Administrator, Administrative receiver, Receiver, Receiver manager, Charity Commission receiver and manager, CIC manager, Judicial factor.”",
    );
    await expect(authority).toContainText("“Only one director appointment can be terminated per form.”");
    await expect(authority).toContainText("“Only one secretary appointment can be terminated per form.”");
    const sources = await control.locator(".file-this-authority a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/6911ece9e9348ac8fb54f483/TM01_v7.0-FINAL.pdf");
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/6911eb9b663088df8f54f482/TM02_v6.0-FINAL.pdf");
    await shoot(page, "officer-remove-links");
  });

  test("the PSC table tells two PSCs of one name apart by month and year of birth, in English and Welsh", async ({ page }) => {
    const namesakes = {
      ...PSCS,
      activeCount: 2,
      pscs: [{ ...PSCS.pscs[0] }, { ...PSCS.pscs[0], notifiedOn: "2024-05-01", dateOfBirth: { month: 8, year: 1996 } }],
    };
    await serveSite(page, { pscs: namesakes });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    const nameCells = page.locator("#drillView table tbody tr td:first-child");
    await expect(nameCells).toHaveText(["Eleanor Bramwell (born January 1970)", "Eleanor Bramwell (born August 1996)"], { timeout: 15000 });

    await page.goto(`${BASE}/cy/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(nameCells).toHaveText(["Eleanor Bramwell (ganwyd Ionawr 1970)", "Eleanor Bramwell (ganwyd Awst 1996)"], {
      timeout: 15000,
    });
  });

  test("the PSC table names a PSC with no namesake by name alone", async ({ page }) => {
    await serveSite(page, {});
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView table tbody tr td:first-child")).toHaveText(["Eleanor Bramwell"], { timeout: 15000 });
  });

  test("two current officers of one name get links told apart by birth month", async ({ page }) => {
    const namesakes = {
      ...OFFICERS,
      activeCount: 2,
      officers: [
        { ...OFFICERS.officers[0] },
        { ...OFFICERS.officers[0], appointedOn: "2022-03-01", dateOfBirth: { month: 4, year: 1998 } },
      ],
    };
    await serveSite(page, { bundles: ["resident-ltd"], officers: namesakes });
    await page.goto(`${BASE}/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });

    await expect(page.locator("#drillView .remove-officer-links a")).toHaveText(
      ["Remove BRAMWELL, Eleanor (Director, born January 1970)", "Remove BRAMWELL, Eleanor (Director, born April 1998)"],
      { timeout: 15000 },
    );
  });

  test("the Welsh officers table and removal links give each company officer's role in Welsh", async ({ page }) => {
    const officers = {
      ...OFFICERS,
      activeCount: 3,
      officers: [
        { ...OFFICERS.officers[0] },
        { name: "ACME SECRETARIES LIMITED", officerRole: "corporate-secretary", appointedOn: "2016-02-01" },
        { name: "JONES, Bryn", officerRole: "llp-member", appointedOn: "2017-03-01" },
      ],
    };
    await serveSite(page, { bundles: ["resident-ltd"], officers });
    await page.goto(`${BASE}/cy/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });

    const table = page.locator("#drillView table");
    await expect(table).toContainText("Cyfarwyddwr", { timeout: 15000 });
    await expect(table).toContainText("Ysgrifennydd corfforaethol");
    await expect(table).toContainText("Llp member");
    await expect(table).not.toContainText("Director");
    await expect(table).not.toContainText("Corporate secretary");
    await expect(page.locator("#drillView .remove-officer-links a").first()).toHaveText("Tynnu BRAMWELL, Eleanor (Cyfarwyddwr)");
    await shootAtWidths(page, "cy-officer-roles");
  });

  test("the English officers table keeps the register's role words", async ({ page }) => {
    const officers = {
      ...OFFICERS,
      activeCount: 2,
      officers: [
        { ...OFFICERS.officers[0] },
        { name: "ACME SECRETARIES LIMITED", officerRole: "corporate-secretary", appointedOn: "2016-02-01" },
      ],
    };
    await serveSite(page, { bundles: ["resident-ltd"], officers });
    await page.goto(`${BASE}/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });

    const table = page.locator("#drillView table");
    await expect(table).toContainText("Director", { timeout: 15000 });
    await expect(table).toContainText("Corporate secretary");
    await expect(page.locator("#drillView .remove-officer-links a").first()).toHaveText("Remove BRAMWELL, Eleanor (Director)");
  });

  test("on prod, where the officer resignation form is not offered, the officers view carries no removal link", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("BRAMWELL, Eleanor", { timeout: 15000 });
    await expect(page.locator("#drillView .remove-officer-links")).toHaveCount(0);
    await expect(page.locator('#drillView .file-this[data-activity="remove-officer"]')).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down records location", () => {
  const SAIL_FILINGS = {
    ...FILINGS,
    filings: [
      {
        transactionId: "SIMTX00000001AD042099",
        date: "2099-02-01",
        category: "address",
        type: "AD04",
        description: "move-registers-to-registered-office-company-with-new-address",
        descriptionValues: { new_address: "1 Test Street London EC1A 1AA" },
      },
      {
        transactionId: "SIMTX00000001AD032098",
        date: "2098-11-20",
        category: "address",
        type: "AD03",
        description: "move-registers-to-sail-company-with-new-address",
        descriptionValues: { new_address: "Unit 4, Harbour House 12 Quay Street Bristol BS1 4DJ" },
      },
      {
        transactionId: "SIMTX00000001AD022098",
        date: "2098-11-20",
        category: "address",
        type: "AD02",
        description: "change-sail-address-company-with-new-address",
        descriptionValues: { new_address: "Unit 4, Harbour House 12 Quay Street Bristol BS1 4DJ" },
      },
      ...FILINGS.filings,
    ],
  };

  test("the overview states the inspection location and the last moves from the filing history, with the form's link and its authority", async ({
    page,
  }) => {
    await serveSite(page, { bundles: ["resident-ltd"], filings: SAIL_FILINGS });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });

    const section = page.locator("#recordsSection");
    await expect(section.locator("h4")).toHaveText("Where the company keeps its records", { timeout: 15000 });
    await expect(section.locator("dl")).toContainText("Inspection location (SAIL)");
    await expect(section.locator("dl")).toContainText("Unit 4, Harbour House 12 Quay Street Bristol BS1 4DJ, filed 20 November 2098");
    await expect(section.locator("dl")).toContainText("Records last moved to the inspection location");
    await expect(section.locator("dl")).toContainText("Records last moved to the registered office");
    await expect(section.locator("dl")).toContainText("1 February 2099");
    const control = section.locator('.file-this[data-activity="change-records-location"]');
    await expect(control.locator("a.btn")).toHaveText("Tell Companies House where the records are kept");
    expect(await control.locator("a.btn").getAttribute("href")).toBe("/companies-house/recordsLocation.html?companyNumber=00000001");
    await expect(control.locator(".file-this-authority")).toContainText(
      "“You cannot use this form to tell us the address of a location outside of the part of the United Kingdom where the company is registered.”",
    );
    const sources = await control.locator(".file-this-authority a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toEqual(
      expect.arrayContaining([
        "https://assets.publishing.service.gov.uk/media/691206b6e9348ac8fb54f4b8/AD02_v6.0-FINAL.pdf",
        "https://assets.publishing.service.gov.uk/media/69130d692017198896ad7f3c/AD03_v8.0-FINAL.pdf",
        "https://assets.publishing.service.gov.uk/media/69120af9ece74c08fbaa6456/AD04_v8.0-FINAL.pdf",
      ]),
    );
    await section.scrollIntoViewIfNeeded();
    await shoot(page, "records-location");
  });

  test("a company with no such notice says the register holds none", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#recordsSection")).toContainText(
      "The register holds no notice of an inspection location (SAIL) for this company.",
      { timeout: 15000 },
    );
    await expect(page.locator("#recordsSection dl")).toHaveCount(0);
  });

  test("a company with more filings than were read says only what the newest filings hold", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"], filings: { ...FILINGS, truncated: true, totalCount: 620 } });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#recordsSection")).toContainText(
      `The company’s newest ${FILINGS.filings.length} filings hold no notice of an inspection location (SAIL).`,
      { timeout: 15000 },
    );
  });

  test("a filing history Companies House does not answer says so, and the form's link still shows", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.route("**/api/v1/companies-house/company/00000001/filing-history*", (route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ message: "Bad gateway" }) }),
    );
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    const section = page.locator("#recordsSection");
    await expect(section).toContainText("Could not read the company’s filing history from Companies House.", { timeout: 15000 });
    await expect(section.locator("dl")).toHaveCount(0);
    await expect(section.locator('.file-this[data-activity="change-records-location"] a.btn')).toHaveText(
      "Tell Companies House where the records are kept",
    );
  });

  test("the Welsh overview states the section in Welsh and marks the form's words as English", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"], filings: SAIL_FILINGS });
    await page.goto(`${BASE}/cy/companies-house/company/00000001`, { waitUntil: "networkidle" });
    const section = page.locator("#recordsSection");
    await expect(section.locator("h4")).toHaveText("Ble mae’r cwmni’n cadw ei gofnodion", { timeout: 15000 });
    await expect(section.locator("dl")).toContainText("Lleoliad arolygu amgen (SAIL)");
    await expect(section.locator('.file-this a.btn[href^="/cy/companies-house/recordsLocation.html"]')).toHaveText(
      "Dweud wrth Dŷ’r Cwmnïau ble mae’r cofnodion yn cael eu cadw",
    );
    await expect(section.locator('.file-this-authority span[lang="en"]').first()).toContainText("You may use this form");
  });

  test("on prod, where the form is not offered, the section states the fact and carries no link", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"], filings: SAIL_FILINGS });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#recordsSection dl")).toContainText("Inspection location (SAIL)", { timeout: 15000 });
    await expect(page.locator('#recordsSection .file-this[data-activity="change-records-location"]')).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down change of company name link", () => {
  const CONTROL = '#nameSection .file-this[data-activity="change-company-name"]';

  test("an account holding the form gets a link under the company's name, and the authority NM01 states", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });

    const control = page.locator(CONTROL);
    await expect(control.locator("a.btn")).toHaveText("Change the company name", { timeout: 15000 });
    expect(await control.locator("a.btn").getAttribute("href")).toBe("/companies-house/changeCompanyName.html?companyNumber=00000001");
    await expect(page.locator("#nameSection")).toContainText("Company name");
    await expect(control.locator(".file-this-authority")).toContainText(
      "“Your company name will not officially change until Companies House registers it.”",
    );
    await expect(control.locator(".file-this-authority")).toContainText(
      "“You may use this form to give notice of an unconditional change of name by the company members.”",
    );
    await expect(control.locator(".file-this-authority li").first()).toHaveText(
      /^“I am authenticating this form on behalf of the company\. … Director, Secretary, Person authorised, .*, CIC manager\.”/,
    );
    const sources = await control.locator(".file-this-authority a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/6912090f663088df8f54f4b7/NM01_v7.0-FINAL.pdf");
    expect(sources).toContain("https://www.gov.uk/make-changes-to-your-limited-company/company-name");
    await shoot(page, "change-company-name-link");
  });

  test("on prod, where the form is not offered, the name section carries no link to it", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#nameSection")).toContainText("Company name", { timeout: 15000 });
    await expect(page.locator(CONTROL)).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down officer appointment control", () => {
  test("an account holding the officer appointment form gets its File this control and the authority AP04 and GOV.UK's AP01 page state", async ({
    page,
  }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });

    const control = page.locator('#drillView .file-this[data-activity="appoint-officer"]');
    await expect(control.locator("a.btn")).toHaveText("Appoint a director or secretary", { timeout: 15000 });
    expect(await control.locator("a.btn").getAttribute("href")).toBe("/companies-house/appointOfficer.html?companyNumber=00000001");
    const authority = control.locator(".file-this-authority");
    await expect(authority).toContainText(
      "“This form may be authenticated by: Director, Secretary, Person authorised, Administrator, Administrative receiver, Receiver, Receiver manager, Charity commission receiver and manager, CIC manager, Judicial factor.”",
    );
    await expect(authority).toContainText(
      "“All directors must verify their identity to prove who they are. You’ll need to give the Companies House personal code for the director and confirm they have verified their identity.”",
    );
    const sources = await control.locator(".file-this-authority a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/6911f0e0663088df8f54f486/AP04_v8.0-FINAL.pdf");
    expect(sources).toContain("https://www.gov.uk/government/publications/appoint-a-director-ap01");
    await shoot(page, "officer-appoint-control");
  });

  test("on prod, where the officer appointment form is not offered, the officers view carries no appointment control", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("BRAMWELL, Eleanor", { timeout: 15000 });
    await expect(page.locator('#drillView .file-this[data-activity="appoint-officer"]')).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down officer change of details links", () => {
  test("an account holding the officer change form gets a link for each current director or secretary, and the authority CH01 and GOV.UK's CH03 page state", async ({
    page,
  }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });

    const link = page.locator("#drillView .change-officer-links a");
    await expect(link).toHaveText("Change the details of BRAMWELL, Eleanor (Director)", { timeout: 15000 });
    expect(await link.getAttribute("href")).toBe(
      "/companies-house/changeOfficer.html?companyNumber=00000001&officerName=BRAMWELL%2C+Eleanor&officerRole=director&appointedOn=2015-01-01",
    );
    const control = page.locator('#drillView .file-this[data-activity="change-officer"]');
    await expect(control.locator("a.btn")).toHaveText("Change a director's or secretary's details");
    expect(await control.locator("a.btn").getAttribute("href")).toBe("/companies-house/changeOfficer.html?companyNumber=00000001");
    const authority = control.locator(".file-this-authority");
    await expect(authority).toContainText(
      "“This form may be authenticated by: Director, Secretary, Person authorised, Administrator, Administrative receiver, Receiver, Receiver manager, Charity commission receiver and manager, CIC manager, Judicial factor.”",
    );
    await expect(authority).toContainText(
      "“Please note that all information on this form will appear on the public record, apart from information relating to usual residential addresses.”",
    );
    await expect(authority).toContainText("“This form is not to be used for making new appointments.”");
    const sources = await control.locator(".file-this-authority a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toContain("https://assets.publishing.service.gov.uk/media/6913439e1fcc92b3f349638c/CH01_v8.0-FINAL.pdf");
    expect(sources).toContain("https://www.gov.uk/government/publications/change-the-details-of-a-secretary-ch03");
    await shoot(page, "officer-change-links");
  });

  test("on prod, where the officer change form is not offered, the officers view carries no change link or control", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/officers`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("BRAMWELL, Eleanor", { timeout: 15000 });
    await expect(page.locator("#drillView .change-officer-links")).toHaveCount(0);
    await expect(page.locator('#drillView .file-this[data-activity="change-officer"]')).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down shares", () => {
  const ALLOTMENT_FILINGS = {
    ...FILINGS,
    filings: [
      {
        transactionId: "SIMTX00000001SH012099",
        date: "2099-01-20",
        category: "capital",
        type: "SH01",
        description: "capital-allotment-shares",
        descriptionValues: { date: "2099-01-05", capital: [{ currency: "GBP", figure: "150" }] },
      },
      ...FILINGS.filings,
    ],
  };

  test("the overview states the last return of allotment and its capital, with the form's link and its authority", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"], filings: ALLOTMENT_FILINGS });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });

    const section = page.locator("#sharesSection");
    await expect(section.locator("h4")).toHaveText("Shares", { timeout: 15000 });
    await expect(section.locator("dl")).toContainText("Last return of allotment of shares");
    await expect(section.locator("dl")).toContainText("Allotment of 5 January 2099, filed 20 January 2099");
    await expect(section.locator("dl")).toContainText("GBP 150");
    const control = section.locator('.file-this[data-activity="allot-shares"]');
    await expect(control.locator("a.btn")).toHaveText("Return an allotment of shares");
    expect(await control.locator("a.btn").getAttribute("href")).toBe("/companies-house/allotShares.html?companyNumber=00000001");
    await expect(control.locator(".file-this-authority")).toContainText(
      "“Within one month of the allotment of shares, a limited company must deliver a return of allotment, on form SH01, to Companies House. You must complete a statement of capital as part of this form.”",
    );
    const sources = await control.locator(".file-this-authority a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toEqual(
      expect.arrayContaining([
        "https://assets.publishing.service.gov.uk/media/69bbea434c478213a823ce3a/SH01_V8.0.pdf",
        "https://www.gov.uk/government/publications/life-of-a-company-event-driven-filings/life-of-a-company-part-2-event-driven-filings",
      ]),
    );
    await section.scrollIntoViewIfNeeded();
    await shoot(page, "shares");
  });

  test("a company with no return of allotment says the register holds none, in Welsh on the Welsh page", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#sharesSection")).toContainText("The register holds no return of allotment of shares for this company.", {
      timeout: 15000,
    });
    await page.goto(`${BASE}/cy/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#sharesSection h4")).toHaveText("Cyfrannau", { timeout: 15000 });
    await expect(page.locator('#sharesSection .file-this a.btn[href^="/cy/companies-house/allotShares.html"]')).toHaveText(
      "Dychwelyd cyfrannau a glustnodwyd",
    );
  });

  test("on prod, where the form is not offered, the section carries no link", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"], filings: ALLOTMENT_FILINGS });
    await page.goto(`${BASE}/companies-house/company/00000001`, { waitUntil: "networkidle" });
    await expect(page.locator("#sharesSection dl")).toContainText("Last return of allotment of shares", { timeout: 15000 });
    await expect(page.locator('#sharesSection .file-this[data-activity="allot-shares"]')).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down notice of a new PSC", () => {
  test("a company whose register lists no PSC is offered the notice of a new one, with the authority PSC01 states", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"], pscs: { pscs: [] } });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });

    await expect(page.locator("#drillView")).toContainText("The register lists no persons with significant control.", { timeout: 15000 });
    const control = page.locator('#drillView .file-this[data-activity="notify-psc"]');
    await expect(control.locator("a.btn")).toHaveText("Tell Companies House about a new PSC");
    expect(await control.locator("a.btn").getAttribute("href")).toContain("/companies-house/notifyPsc.html?companyNumber=00000001");
    await expect(control.locator(".file-this-authority")).toContainText(
      "“You must have obtained confirmation from the individual person with significant control that their particulars are correct before sending this form to Companies House.”",
    );
  });

  test("a company with PSCs on its register is offered the notice too", async ({ page }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("Eleanor Bramwell", { timeout: 15000 });
    await expect(page.locator('#drillView .file-this[data-activity="notify-psc"] a.btn')).toHaveText(
      "Tell Companies House about a new PSC",
    );
  });

  test("on prod, where the notice is not offered, a company with no PSC gets no control for it", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", bundles: ["resident-ltd"], pscs: { pscs: [] } });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillView")).toContainText("The register lists no persons with significant control.", { timeout: 15000 });
    await expect(page.locator('#drillView .file-this[data-activity="notify-psc"]')).toHaveCount(0);
  });
});

test.describe("Company lookup drill-down PSC change of details authority", () => {
  test("the change of a PSC's details quotes PSC04 for an individual, PSC05 for a relevant legal entity and PSC06 for another registrable person", async ({
    page,
  }) => {
    await serveSite(page, { bundles: ["resident-ltd"] });
    await page.goto(`${BASE}/companies-house/company/00000001/psc`, { waitUntil: "networkidle" });
    const control = page.locator('#drillView .file-this[data-activity="change-psc-details"]');
    await expect(control.locator("a.btn")).toHaveText("Tell Companies House a PSC's details have changed", { timeout: 15000 });
    const authority = control.locator(".file-this-authority");
    await expect(authority).toContainText(
      "“You may use this form to give notice of a change to the details of a relevant legal entity (RLE).”",
    );
    await expect(authority).toContainText(
      "“This form may be signed by: Director, Secretary, Person authorised, Administrator, Administrative receiver, Receiver, Receiver manager, Charity commission receiver and manager, CIC manager, Judicial factor.”",
    );
    await expect(authority).toContainText(
      "“You may use this form to change the details of an other registrable person (ORP) if you have elected to keep PSC register information on the public register.”",
    );
    const sources = await authority.locator("a").evaluateAll((links) => links.map((anchor) => anchor.href));
    expect(sources).toEqual(
      expect.arrayContaining([
        "https://assets.publishing.service.gov.uk/media/6a98266bdf4246cf45e467ef/PSC04_v5.0-FINAL.pdf",
        "https://assets.publishing.service.gov.uk/media/5eac135f86650c435efc5cc4/PSC05_V3.0.pdf",
        "https://assets.publishing.service.gov.uk/media/6911ea90ece74c08fbaa6422/PSC06_v4.0-FINAL.pdf",
      ]),
    );
  });
});
