// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/filingPages.browser.test.js
// The filing landing pages: one h1, screenshots that load, a due date with its source, the action,
// and the footer links to every page.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

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

async function serveRealSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      const isFrame = route.request().resourceType() === "document";
      await route.fulfill({
        status: 200,
        contentType: isFrame ? "text/html" : "application/javascript",
        body: isFrame ? "<!doctype html><title>embed</title>" : "",
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

const FILING_PAGES = [
  ["vat-return-from-a-spreadsheet.html", "How to file a VAT return from a spreadsheet"],
  ["micro-entity-accounts.html", "How to file micro-entity accounts at Companies House"],
  ["small-company-accounts.html", "How to file small company accounts at Companies House"],
  ["dormant-company-accounts.html", "How to file dormant company accounts at Companies House"],
  ["confirmation-statement.html", "How to file a confirmation statement (CS01)"],
];

for (const [file, heading] of FILING_PAGES) {
  test.describe(file, () => {
    test("shows its h1, its first screenshot, a due date with a source and the action", async ({ page }) => {
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${file}`, { waitUntil: "load" });
      await expect(page.locator("h1")).toHaveText(heading);
      await expect(page.locator("h1")).toHaveCount(1);

      const firstImage = page.locator(".guide-step img").first();
      await firstImage.scrollIntoViewIfNeeded();
      await expect.poll(() => firstImage.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);

      await expect(page.locator("blockquote.source-quote a[href^='https://www.gov.uk/']")).toHaveCount(1);
      await expect(page.locator("main a.btn").first()).toBeVisible();
    });

    test("the footer holds a link to each filing page", async ({ page }) => {
      await serveRealSite(page);
      await page.goto(`http://localhost:3000/${file}`, { waitUntil: "load" });
      await expect(page.locator("body > footer .footer-links")).toHaveCount(1);
      for (const [target] of FILING_PAGES) await expect(page.locator(`body > footer .footer-links a[href="${target}"]`)).toHaveCount(1);
    });
  });
}

test("the home page links to each filing page", async ({ page }) => {
  await serveRealSite(page);
  await page.goto("http://localhost:3000/index.html", { waitUntil: "domcontentloaded" });
  for (const [target] of FILING_PAGES) await expect(page.locator(`nav.filing-guides a[href="${target}"]`)).toHaveCount(1);
});

const ARTICLE_PAGES = [
  [
    "hmrc-company-tax-return-service-closed.html",
    "HMRC's Company Tax Return service closed on 31 March 2026: what a small company does now",
  ],
  ["company-accounts-by-software-from-april-2028.html", "Company accounts by software from April 2028"],
  ["making-tax-digital-income-tax-over-30000.html", "Making Tax Digital for Income Tax from 6 April 2027: incomes over £30,000"],
];

for (const [file, heading] of ARTICLE_PAGES) {
  test(`${file} shows its h1, a gov.uk source quote, the calendar link and the action`, async ({ page }) => {
    await serveRealSite(page);
    await page.goto(`http://localhost:3000/${file}`, { waitUntil: "load" });
    await expect(page.locator("h1")).toHaveText(heading);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("blockquote.source-quote a[href^='https://www.gov.uk/']").first()).toBeVisible();
    await expect(page.locator("main a[href='mtd-calendar.html']").first()).toBeVisible();
    await expect(page.locator("main a.btn").first()).toBeVisible();
  });
}

test("the VAT penalty calculator shows the due date, the points, the threshold and what removes them", async ({ page }) => {
  await serveRealSite(page);
  await page.goto("http://localhost:3000/vat-return-due-date-and-penalty-points.html", { waitUntil: "load" });
  await expect(page.locator("h1")).toHaveText("VAT return due date and penalty points calculator");
  await page.locator("#vatFrequency").selectOption("quarterly");
  await page.locator("#vatPeriodEnd").fill("2026-09-30");
  await expect(page.locator("#vatDueDate")).toHaveText("7 November 2026");
  await expect(page.locator("#vatReturnTicks input")).toHaveCount(8);
  for (let index = 0; index < 4; index += 1) await page.locator("#vatReturnTicks input").nth(index).check();
  await expect(page.locator("#vatPoints")).toHaveText("4 of 4");
  await expect(page.locator("#vatThreshold")).toContainText("4 points");
  await expect(page.locator("#vatPenalties")).toContainText("£200");
  await expect(page.locator("#vatRemoval")).toContainText("12 months");
  await expect(page.locator("main a[href='vat-return-from-a-spreadsheet.html']").first()).toBeVisible();
});

test("the VAT penalty page holds the rules as text without a script", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await serveRealSite(page);
  await page.goto("http://localhost:3000/vat-return-due-date-and-penalty-points.html", { waitUntil: "load" });
  await expect(page.locator("#vatCalculator")).toBeHidden();
  await expect(page.locator("main")).toContainText("one calendar month and 7 days");
  await expect(page.locator("table.deadline-table")).toContainText("Quarterly");
  await context.close();
});

const COMPARISON_PAGES = [
  ["mtd-vat-bridging-software-compared.html", "MTD VAT bridging software compared by price"],
  ["company-accounts-filing-software-compared.html", "Company accounts filing software compared by price"],
];

for (const [file, heading] of COMPARISON_PAGES) {
  test(`${file} shows its table inside the screen with our row marked and the action`, async ({ page }) => {
    await serveRealSite(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://localhost:3000/${file}`, { waitUntil: "load" });
    await expect(page.locator("h1")).toHaveText(heading);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("table.compare-table tbody tr").first()).toBeVisible();
    await expect(page.locator("table.compare-table tbody tr", { hasText: "our own product" })).toHaveCount(1);
    await expect(page.locator("main a.btn").first()).toBeVisible();
    const pageOverflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(pageOverflows).toBe(false);
  });
}

const DEADLINES_PAGE = "http://localhost:3000/company-filing-deadlines.html";
const LOOKUP_PATTERN = "**/api/v1/public/company-deadlines*";
const ACTIVE_COMPANY = {
  companyNumber: "00000006",
  companyName: "EXAMPLE LIMITED",
  companyStatus: "active",
  companyType: "ltd",
  accountsNextDue: "2099-03-31",
  accountsNextPeriodEnd: "2098-06-30",
  confirmationStatementNextDue: "2020-04-30",
  lastAccountsType: "micro-entity",
};

async function stubLookup(page, status, body, headers = {}) {
  await page.route(LOOKUP_PATTERN, (route) =>
    route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) }),
  );
}

test("the company deadlines page reads with JavaScript off and links the Companies House search", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await serveRealSite(page);
  await page.goto(DEADLINES_PAGE, { waitUntil: "load" });
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("main a[href='https://find-and-update.company-information.service.gov.uk/']").first()).toBeVisible();
  await expect(page.locator("#companyLookup")).toBeHidden();
  await expect(page.locator("main", { hasText: "Open Government Licence v3.0" })).toBeVisible();
  await context.close();
});

test("a company number shows both dates, the days left, the last accounts type and the filing for each", async ({ page }) => {
  await serveRealSite(page);
  await stubLookup(page, 200, ACTIVE_COMPANY);
  await page.goto(DEADLINES_PAGE, { waitUntil: "load" });
  await page.locator("#companyQuery").fill("00000006");
  await page.getByRole("button", { name: "Look up" }).click();
  const result = page.locator("#companyResult");
  await expect(result).toContainText("EXAMPLE LIMITED (00000006)");
  await expect(result).toContainText("31 March 2099");
  await expect(result).toContainText("days left");
  await expect(result).toContainText("30 April 2020");
  await expect(result).toContainText("overdue by");
  await expect(result).toContainText("micro entity");
  await expect(result.locator("a[href='micro-entity-accounts.html']")).toBeVisible();
  await expect(result.locator("a[href='confirmation-statement.html']")).toBeVisible();
});

test("a dissolved company shows its status and no filing action", async ({ page }) => {
  await serveRealSite(page);
  await stubLookup(page, 200, { ...ACTIVE_COMPANY, companyStatus: "dissolved" });
  await page.goto(DEADLINES_PAGE, { waitUntil: "load" });
  await page.locator("#companyQuery").fill("00000006");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.locator("#companyResult")).toContainText("dissolved");
  await expect(page.locator("#companyResult a")).toHaveCount(0);
});

test("a name shows matches and choosing one looks the company up", async ({ page }) => {
  await serveRealSite(page);
  await page.route(LOOKUP_PATTERN, (route) => {
    const isNumber = new URL(route.request().url()).searchParams.has("number");
    const body = isNumber
      ? ACTIVE_COMPANY
      : { items: [{ companyNumber: "00000006", companyName: "EXAMPLE LIMITED", companyStatus: "active" }] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(DEADLINES_PAGE, { waitUntil: "load" });
  await page.locator("#companyQuery").fill("example");
  await page.getByRole("button", { name: "Look up" }).click();
  await page.locator("#companyMatches button").first().click();
  await expect(page.locator("#companyResult")).toContainText("EXAMPLE LIMITED (00000006)");
});

test("a 429 from the lookup tells the reader to try again in a few minutes", async ({ page }) => {
  await serveRealSite(page);
  await stubLookup(page, 429, { message: "busy" }, { "Retry-After": "120" });
  await page.goto(DEADLINES_PAGE, { waitUntil: "load" });
  await page.locator("#companyQuery").fill("00000006");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.locator("#companyError")).toContainText("Try again in a few minutes");
});

test("each accounts landing page links the company deadlines page", async ({ page }) => {
  await serveRealSite(page);
  for (const file of ["micro-entity-accounts.html", "small-company-accounts.html", "dormant-company-accounts.html"]) {
    await page.goto(`http://localhost:3000/${file}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main a[href='company-filing-deadlines.html']")).toHaveCount(1);
  }
});
