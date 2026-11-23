// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companyReports.browser.test.js
//
// The company reports on the lookup's drill-down, over the real page, scripts and catalogue: the
// reports index and a report's view, opened from their addresses in English and in Welsh at desktop
// and phone width, with the read time, the definitions and the source line, and the states when the
// report is not ready, when Companies House is rate limiting and when the answer is partial. The API
// answers come from fixtures.

import { test, expect } from "@playwright/test";
import { bannedWordsIn } from "../../app/lib/companyReports/wording.js";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/cr3");
const BASE = "http://localhost:3000";
const COMPANY = "/companies-house/company/04512345";

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
  companyNumber: "04512345",
  companyName: "HARBOUR LANE JOINERY LIMITED",
  companyStatus: "active",
  companyType: "ltd",
  dateOfCreation: "2002-08-14",
  jurisdiction: "england-wales",
  registeredOffice: { addressLine1: "12 Harbour Lane", cityOrTown: "Swansea", postalCode: "SA1 1AA", country: "Wales" },
  sicCodes: ["16230"],
  accountsNextDue: "2026-12-31",
  accountsLastPeriodEnd: "2025-03-31",
  confirmationStatementNextDue: "2027-08-28",
};

// 14:05 London time on 22 November 2026, when London is on GMT.
const READ_AT = "2026-11-22T14:05:00.000Z";

function json(route, status, body, headers = {}) {
  return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

// The site from web/public with the drill-down rewrite, and the API answered from fixtures.
// reportAnswer is { status, body, headers } for every report request; catalogue rewrites the
// catalogue's text.
async function serveSite(
  page,
  {
    reportAnswer = { status: 200, body: { readAt: READ_AT } },
    catalogue = (text) => text,
    reportRequests = [],
    reportDelays = {},
    bundleAnswer = { status: 200, body: { bundles: [], tokensRemaining: 10 } },
  } = {},
) {
  await page.addInitScript(() => {
    localStorage.setItem("consent.analytics", "declined");
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("cognitoAccessToken", "access-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "reader@test.diyaccounting.co.uk", given_name: "Rhian" }));
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/v1/bundle") return json(route, bundleAnswer.status, bundleAnswer.body);
      const report = pathname.match(/^\/api\/v1\/companies-house\/company\/04512345\/reports\/([^/]+)$/);
      if (report) {
        reportRequests.push(report[1]);
        if (reportDelays[report[1]]) await new Promise((resolve) => setTimeout(resolve, reportDelays[report[1]]));
        return json(
          route,
          reportAnswer.status,
          { companyNumber: "04512345", report: report[1], ...reportAnswer.body },
          reportAnswer.headers,
        );
      }
      if (pathname === "/api/v1/companies-house/company/04512345") return json(route, 200, PROFILE);
      return json(route, 200, {});
    }
    if (pathname === "/submit.environment-name.txt") return route.fulfill({ status: 200, contentType: "text/plain", body: "ci" });
    if (pathname === "/submit.catalogue.toml") {
      const text = fs.readFileSync(path.join(PUBLIC_ROOT, "submit.catalogue.toml"), "utf-8");
      return route.fulfill({ status: 200, contentType: "text/x-toml", body: catalogue(text) });
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

async function scrollsSideways(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

const LANGUAGES = [
  {
    name: "English",
    prefix: "",
    indexTitle: "Reports on this company",
    firstReport: "Filing record and timeliness",
    nav: "Reports",
    read: "Read from Companies House at 14:05 on 22 November 2026.",
    terms: "What these words mean",
    term: "Made-up date",
    source:
      "Source: the Companies House register, read at 14:05 on 22 November 2026. Companies House does not check the information companies send it.",
  },
  {
    name: "Welsh",
    prefix: "/cy",
    indexTitle: "Adroddiadau ar y cwmni hwn",
    firstReport: "Cofnod ffeilio ac amseroldeb",
    nav: "Adroddiadau",
    read: "Darllenwyd o Dŷ’r Cwmnïau am 14:05 ar 22 Tachwedd 2026.",
    terms: "Beth mae’r geiriau hyn yn ei olygu",
    term: "Dyddiad llunio",
    source: "Ffynhonnell: cofrestr Tŷ’r Cwmnïau, a ddarllenwyd am 14:05 ar 22 Tachwedd 2026.",
  },
];

test.describe("The company reports index", () => {
  for (const language of LANGUAGES) {
    for (const width of [1280, 390]) {
      test(`lists the six reports in ${language.name} at ${width}px, each linking to its own address`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await serveSite(page);
        await page.goto(`${BASE}${language.prefix}${COMPANY}/reports`, { waitUntil: "networkidle" });
        const view = page.locator("#drillView");
        await expect(view).toBeVisible({ timeout: 15000 });
        await expect(view.locator("h4")).toHaveText(language.indexTitle);
        const links = view.locator(".company-reports-list li a");
        await expect(links).toHaveCount(6);
        await expect(links.first()).toHaveText(language.firstReport);
        const hrefs = await links.evaluateAll((anchors) => anchors.map((anchor) => new URL(anchor.href).pathname));
        expect(hrefs).toEqual(
          ["filings", "people", "capital", "charges", "history", "accounts"].map(
            (report) => `${language.prefix}${COMPANY}/reports/${report}`,
          ),
        );
        await expect(page.locator('#drillNav a[aria-current="page"]')).toHaveText(language.nav);
        await expect(view.locator(".company-reports-access")).toHaveCount(0);
        const [linkBox, summaryBox] = await Promise.all([
          links.first().boundingBox(),
          view.locator(".company-reports-summary").first().boundingBox(),
        ]);
        expect(summaryBox.y).toBeGreaterThanOrEqual(linkBox.y + linkBox.height - 1);
        expect(await scrollsSideways(page)).toBe(false);
        if (width === 1280) {
          fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, `reports-index-${language.name.toLowerCase()}.png`), fullPage: true });
        }
      });
    }
  }

  test("moves to a report's view without reloading the page", async ({ page }) => {
    const reportRequests = [];
    await serveSite(page, { reportRequests });
    await page.goto(`${BASE}${COMPANY}/reports`, { waitUntil: "networkidle" });
    await page.evaluate(() => (window.__samePage = true));
    await page.locator(".company-reports-list a", { hasText: "People over time" }).click();
    await expect(page.locator("#drillView h4")).toHaveText("People over time");
    expect(new URL(page.url()).pathname).toBe(`${COMPANY}/reports/people`);
    expect(await page.evaluate(() => window.__samePage)).toBe(true);
    expect(reportRequests).toEqual(["people"]);
  });

  test("names the bundle that has the reports for an account without them", async ({ page }) => {
    await serveSite(page, {
      catalogue: (text) => text.replace(/(id = "company-reports"[\s\S]*?bundles = )\["default"\]/, '$1["resident-ltd"]'),
    });
    await page.goto(`${BASE}${COMPANY}/reports`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-reports-access")).toHaveText("These reports come with Resident Ltd.");
  });
});

test.describe("The note on the reports for an account without them", () => {
  const withReportBundles = (bundles) => (text) =>
    text.replace(/(id = "company-reports"[\s\S]*?bundles = )\["default"\]/, `$1${JSON.stringify(bundles)}`);

  test("names only a bundle a reader of this deployment can get, never a hidden one", async ({ page }) => {
    await serveSite(page, { catalogue: withReportBundles(["resident-ltd", "resident-ltd-comp"]) });
    await page.goto(`${BASE}${COMPANY}/reports`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-reports-access")).toHaveText("These reports come with Resident Ltd.");
  });

  test("names no bundle that the deployment does not list", async ({ page }) => {
    await serveSite(page, {
      catalogue: (text) =>
        withReportBundles(["resident-ltd", "resident-vat"])(text).replace(
          /(id = "resident-ltd"[\s\S]*?listedInEnvironments = )\[[^\]]*\]/,
          '$1["prod"]',
        ),
    });
    await page.goto(`${BASE}${COMPANY}/reports`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-reports-access")).toHaveText("These reports come with Resident VAT.");
  });

  test("says the reports are not offered when only a hidden bundle has them", async ({ page }) => {
    await serveSite(page, { catalogue: withReportBundles(["resident-ltd-comp"]) });
    await page.goto(`${BASE}${COMPANY}/reports`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-reports-access")).toHaveText("These reports are not offered here yet.");
  });

  test("names no bundle on a deployment that hides the activity, where the page is not open", async ({ page }) => {
    await serveSite(page, {
      reportAnswer: { status: 403, body: { message: "Forbidden" } },
      catalogue: (text) =>
        withReportBundles(["resident-ltd"])(text).replace(/(id = "company-reports"[\s\S]*?environments = )\[[^\]]*\]/, '$1["prod"]'),
    });
    for (const address of [`${COMPANY}/reports`, `${COMPANY}/reports/people`]) {
      await page.goto(`${BASE}${address}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Not available here yet" })).toBeVisible();
      await expect(page.getByText("Resident Ltd").filter({ visible: true })).toHaveCount(0);
    }
  });
});

test.describe("A failed read of the account's bundles", () => {
  const unreadable = { status: 500, body: { message: "The bundles could not be read" } };

  test("says on a view that Submit could not check access, and not that the reports are not offered", async ({ page }) => {
    await serveSite(page, { bundleAnswer: unreadable, reportAnswer: { status: 403, body: { message: "Forbidden" } } });
    await page.goto(`${BASE}${COMPANY}/reports/people`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText("Submit could not check your access to these reports. Try again.");
  });

  test("says on the index that Submit could not check access", async ({ page }) => {
    await serveSite(page, { bundleAnswer: unreadable });
    await page.goto(`${BASE}${COMPANY}/reports`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-reports-access")).toHaveText("Submit could not check your access to these reports. Try again.");
    await expect(page.locator(".company-reports-list a")).toHaveCount(6);
  });

  test("says so in Welsh", async ({ page }) => {
    await serveSite(page, { bundleAnswer: unreadable, reportAnswer: { status: 403, body: { message: "Forbidden" } } });
    await page.goto(`${BASE}/cy${COMPANY}/reports/people`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText(
      "Nid oedd Submit yn gallu gwirio a oes gennych fynediad i’r adroddiadau hyn. Rhowch gynnig arall arni.",
    );
  });
});

test.describe("A deployment that does not show the reports", () => {
  test("asks the report route nothing behind the page's not-available panel", async ({ page }) => {
    const reportRequests = [];
    await serveSite(page, {
      reportRequests,
      reportAnswer: { status: 403, body: { message: "Forbidden" } },
      catalogue: (text) => text.replace(/(id = "company-reports"[\s\S]*?environments = )\[[^\]]*\]/, '$1["prod"]'),
    });
    await page.goto(`${BASE}${COMPANY}/reports/people`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Not available here yet" })).toBeVisible();
    expect(reportRequests).toEqual([]);
  });
});

test.describe("A company report's view", () => {
  for (const language of LANGUAGES) {
    for (const width of [1280, 390]) {
      test(`shows the read time, what the words mean and the source line in ${language.name} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await serveSite(page);
        await page.goto(`${BASE}${language.prefix}${COMPANY}/reports/filings`, { waitUntil: "networkidle" });
        const view = page.locator("#drillView");
        await expect(view).toBeVisible({ timeout: 15000 });
        await expect(view.locator("h4")).toHaveText(language.firstReport);
        await expect(view.locator(".company-report-read")).toHaveText(language.read);
        await expect(view.locator(".company-report-terms-heading")).toHaveText(language.terms);
        await expect(view.locator(".company-report-terms dt")).toHaveCount(3);
        await expect(view.locator(".company-report-terms dt").first()).toHaveText(language.term);
        await expect(view.locator(".company-report-source")).toContainText(language.source);
        await expect(view.locator(".company-report-state")).toHaveCount(0);
        await expect(page.locator('#drillNav a[aria-current="page"]')).toHaveText(language.nav);
        expect(await scrollsSideways(page)).toBe(false);
      });
    }
  }

  test("says the report is not ready when the route has no module for it", async ({ page }) => {
    await serveSite(page, {
      reportAnswer: { status: 404, body: { message: "No company report named filings", reason: "unknown_report" } },
    });
    await page.goto(`${BASE}${COMPANY}/reports/filings`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText("This report is not ready yet.");
    await expect(page.locator(".company-report-terms dt")).toHaveCount(3);
    await expect(page.locator(".company-report-source")).toHaveCount(0);
  });

  test("gives the lookup's rate-limit message when the route answers 429", async ({ page }) => {
    await serveSite(page, {
      reportAnswer: { status: 429, body: { message: "Too many Companies House lookups just now." }, headers: { "Retry-After": "120" } },
    });
    await page.goto(`${BASE}${COMPANY}/reports/charges`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText(
      "Companies House is rate limiting our lookups. Try again in 120 seconds.",
    );
    await expect(page.locator(".company-report-state")).toHaveAttribute("role", "status");
  });

  test("says a partial report shows only what was already read, with the time to try again", async ({ page }) => {
    await serveSite(page, { reportAnswer: { status: 200, body: { readAt: READ_AT, partial: true, retryAfterSeconds: 90 } } });
    await page.goto(`${BASE}${COMPANY}/reports/people`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText(
      "Companies House is rate limiting our lookups. Try again in 90 seconds. This report shows only the parts Submit had already read.",
    );
    await expect(page.locator(".company-report-source")).toBeVisible();
  });

  test("says a report cut short at its call limit shows only what was read", async ({ page }) => {
    await serveSite(page, { reportAnswer: { status: 200, body: { readAt: READ_AT, callLimitReached: true } } });
    await page.goto(`${BASE}${COMPANY}/reports/accounts`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText(
      "Submit stopped reading this company's record at its limit of calls to Companies House for one report. This report shows only the parts Submit had already read.",
    );
    await expect(page.locator(".company-report-terms dt")).toHaveCount(8);
    await expect(page.locator(".company-report-source")).toBeVisible();
  });

  test("says a report with a part too large to keep shows only what was read", async ({ page }) => {
    await serveSite(page, { reportAnswer: { status: 200, body: { readAt: READ_AT, tooLarge: true } } });
    await page.goto(`${BASE}${COMPANY}/reports/filings`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText(
      "This company's record is too large for Submit to show in this report. This report shows only the parts Submit had already read.",
    );
    await expect(page.locator("#drillHeading")).toContainText("HARBOUR LANE JOINERY LIMITED");
  });

  test("names both the call limit and a part too large when a report meets both", async ({ page }) => {
    await serveSite(page, { reportAnswer: { status: 200, body: { readAt: READ_AT, callLimitReached: true, tooLarge: true } } });
    await page.goto(`${BASE}${COMPANY}/reports/filings`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText(
      "Submit stopped reading this company's record at its limit of calls to Companies House for one report. This company's record is too large for Submit to show in this report. This report shows only the parts Submit had already read.",
    );
  });

  test("gives the call-limit and too-large sentences in Welsh", async ({ page }) => {
    await serveSite(page, { reportAnswer: { status: 200, body: { readAt: READ_AT, tooLarge: true } } });
    await page.goto(`${BASE}/cy${COMPANY}/reports/filings`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toContainText(
      "Mae cofnod y cwmni hwn yn rhy fawr i Submit ei ddangos yn yr adroddiad hwn.",
    );
    expect(await page.evaluate(() => window.siteText("ch.reports.call-limit", "English"))).toContain("derfyn o alwadau");
  });

  test("names the bundle on a report's view when the route answers 403", async ({ page }) => {
    await serveSite(page, {
      reportAnswer: { status: 403, body: { message: "Forbidden - missing or insufficient bundle entitlement" } },
      catalogue: (text) => text.replace(/(id = "company-reports"[\s\S]*?bundles = )\["default"\]/, '$1["resident-ltd"]'),
    });
    await page.goto(`${BASE}${COMPANY}/reports/people`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-state")).toHaveText("These reports come with Resident Ltd.");
  });

  test("shows the read time in London time in summer, on London's date", async ({ page }) => {
    await serveSite(page, { reportAnswer: { status: 200, body: { readAt: "2026-10-24T23:30:00.000Z" } } });
    await page.goto(`${BASE}${COMPANY}/reports/history`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-read")).toHaveText("Read from Companies House at 00:30 on 25 October 2026.");
  });

  test("shows the read time in London time in the hour after the clocks go back", async ({ page }) => {
    await serveSite(page, { reportAnswer: { status: 200, body: { readAt: "2026-10-25T01:30:00.000Z" } } });
    await page.goto(`${BASE}${COMPANY}/reports/history`, { waitUntil: "networkidle" });
    await expect(page.locator(".company-report-read")).toHaveText("Read from Companies House at 01:30 on 25 October 2026.");
  });

  test("moves from a view back to the index and on to another view without reloading or losing the company", async ({ page }) => {
    const reportRequests = [];
    await serveSite(page, { reportRequests });
    await page.goto(`${BASE}${COMPANY}/reports/filings`, { waitUntil: "networkidle" });
    await page.evaluate(() => (window.__samePage = true));
    await page.locator("#drillView a", { hasText: "All reports on this company" }).click();
    await expect(page.locator("#drillView h4")).toHaveText("Reports on this company");
    await page.locator(".company-reports-list a", { hasText: "Share capital" }).click();
    await expect(page.locator("#drillView h4")).toHaveText("Share capital");
    await page.goBack();
    await expect(page.locator("#drillView h4")).toHaveText("Reports on this company");
    expect(new URL(page.url()).pathname).toBe(`${COMPANY}/reports`);
    await expect(page.locator("#drillHeading")).toContainText("04512345");
    expect(await page.evaluate(() => window.__samePage)).toBe(true);
    expect(reportRequests).toEqual(["filings", "capital"]);
  });

  test("drops a report's answer that arrives after the reader moved to another view", async ({ page }) => {
    const reportRequests = [];
    await serveSite(page, {
      reportRequests,
      reportDelays: { filings: 1500 },
      reportAnswer: { status: 404, body: { message: "No module", reason: "unknown_report" } },
    });
    await page.goto(`${BASE}${COMPANY}/reports`, { waitUntil: "networkidle" });
    await page.locator(".company-reports-list a", { hasText: "Filing record and timeliness" }).click();
    await expect.poll(() => reportRequests).toEqual(["filings"]);
    await page.locator("#drillNav a", { hasText: "Officers" }).click();
    await expect(page).toHaveURL(`${BASE}${COMPANY}/officers`);
    await page.waitForTimeout(2000);
    await expect(page.locator("#drillView .company-report-state")).toHaveCount(0);
    await expect(page.locator("#drillView h4", { hasText: "Filing record and timeliness" })).toHaveCount(0);
    await expect(page.locator("#drillView .company-report-terms")).toHaveCount(0);
  });

  test("drops a slow report's answer when the reader opens another report", async ({ page }) => {
    await serveSite(page, { reportDelays: { filings: 1500 } });
    await page.goto(`${BASE}${COMPANY}/reports`, { waitUntil: "networkidle" });
    await page.locator(".company-reports-list a", { hasText: "Filing record and timeliness" }).click();
    await page.goBack();
    await page.locator(".company-reports-list a", { hasText: "Share capital" }).click();
    await expect(page.locator("#drillView h4")).toHaveText("Share capital");
    await page.waitForTimeout(2000);
    await expect(page.locator("#drillView h4")).toHaveText("Share capital");
    await expect(page.locator("#drillView .company-report-read")).toHaveCount(1);
  });

  test("names an address with a report this page does not have as not found", async ({ page }) => {
    await serveSite(page);
    await page.goto(`${BASE}${COMPANY}/reports/forecast`, { waitUntil: "networkidle" });
    await expect(page.locator("#drillNotFound")).toBeVisible();
  });
});

test.describe("The words a reader of the reports sees", () => {
  const reports = ["filings", "people", "capital", "charges", "history", "accounts"];
  const answers = [
    { status: 200, body: { readAt: READ_AT, partial: true, retryAfterSeconds: 90, callLimitReached: true, tooLarge: true } },
    { status: 404, body: { message: "No company report named it", reason: "unknown_report" } },
    { status: 403, body: { message: "Forbidden" } },
  ];
  for (const [language, prefix] of [
    ["en", ""],
    ["cy", "/cy"],
  ]) {
    test(`hold no banned word on the index and on every report's view in ${language === "en" ? "English" : "Welsh"}`, async ({ page }) => {
      test.setTimeout(120000);
      const seen = [];
      for (const reportAnswer of answers) {
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await serveSite(page, { reportAnswer });
        await page.goto(`${BASE}${prefix}${COMPANY}/reports`, { waitUntil: "networkidle" });
        seen.push({ report: undefined, text: await page.locator("#drillNav").innerText() });
        seen.push({ report: undefined, text: await page.locator("#drillView").innerText() });
        for (const report of reports) {
          await page.goto(`${BASE}${prefix}${COMPANY}/reports/${report}`, { waitUntil: "networkidle" });
          await expect(page.locator("#drillView h4")).toBeVisible();
          seen.push({ report, text: await page.locator("#drillView").innerText() });
        }
      }
      for (const { report, text } of seen) {
        expect(bannedWordsIn([text], report, language), `${report || "index"}: ${text}`).toEqual([]);
      }
    });
  }
});
