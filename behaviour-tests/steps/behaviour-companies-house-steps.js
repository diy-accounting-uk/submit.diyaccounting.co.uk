// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-companies-house-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp, takeScreenshot } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-companies-house-steps";

export async function goToCompanySearch(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "Company Lookup (Companies House)";
  await test.step(`The user navigates to ${activityButtonText} and sees the search form`, async () => {
    await page.waitForTimeout(500);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-search.png`, readerView: true });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting Company Lookup", { screenshotPath, timeout: 60000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-company-search.png`, readerView: true });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-03-company-search.png`, readerView: true });
    await expect(page.locator("#companySearchForm")).toBeVisible();
  });
}

export async function fillInCompanySearch(page, query, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user fills in the company search with "${query}"`, async () => {
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-search-fill-in.png`, readerView: true });
    await loggedFill(page, "#companyQuery", query, "Company name or number", { screenshotPath });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-company-search-fill-in.png`, readerView: true });
  });
}

export async function submitCompanySearch(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the company search form", async () => {
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-search-submit.png`, readerView: true });
    await loggedClick(page, "#searchBtn", "Submitting company search", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-company-search-submit.png`, readerView: true });
  });
}

export async function verifyCompanySearchResults(page, expectedName, expectedNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees ${expectedName} (${expectedNumber}) in the search results`, async () => {
    const resultsContainer = page.locator("#searchResults");
    await expect(resultsContainer).toBeVisible({ timeout: 15000 });
    await expect(resultsContainer).toContainText(expectedName, { timeout: 15000 });
    await expect(resultsContainer).toContainText(expectedNumber, { timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-search-results.png`, readerView: true });
  });
}

export async function openCompanyProfile(page, companyName, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user opens the profile for ${companyName}`, async () => {
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-open-company-profile.png`, readerView: true });
    await loggedClick(page, `#searchResults button:has-text('${companyName}')`, `Opening ${companyName} profile`, { screenshotPath });
    await expect(page.locator("#profileView")).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-open-company-profile.png`, readerView: true });
  });
}

export async function verifyCompanyProfile(page, expectedName, expectedStatus, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees ${expectedName} with status ${expectedStatus} in the profile`, async () => {
    const profile = page.locator("#companyProfile");
    await expect(profile).toContainText(expectedName, { timeout: 15000 });
    await expect(profile).toContainText(expectedStatus, { timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-profile.png`, readerView: true });
  });
}

// The company's books in DIYA-GL: the accounts section offers the last accounts, the next year and
// its spreadsheet package as DIYA-GL addresses where the environment lists the company books, which
// prod does not yet.
export async function verifyCompanyBooksOffered(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The accounts section offers the company's books in DIYA-GL", async () => {
    const environmentName = (await (await page.request.get(new URL("/submit.environment-name.txt", page.url()).href)).text()).trim();
    if (environmentName === "prod") return;
    const books = page.locator("#companyBooks");
    await expect(books.locator("#companyBooksStartNextYear")).toHaveAttribute("href", /ltd\.html#book=[A-Za-z0-9_-]+$/, { timeout: 60000 });
    await expect(books.locator("#companyBooksDownloadPackage")).toHaveAttribute("href", /ltd\.html\?download=package#book=/);
    await books.scrollIntoViewIfNeeded();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-books.png`, readerView: true });
  });
}

// The company's drill-down: each view has its own address, which the page moves to as the reader
// clicks through.
export async function verifyCompanyAddress(page, companyNumber, view, screenshotPath = defaultScreenshotPath) {
  const suffix = view ? `/${view}` : "";
  await test.step(`The address names the ${view || "profile"} view of ${companyNumber}`, async () => {
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15000 })
      .toMatch(new RegExp(`/companies-house/company/${companyNumber}${suffix}$`));
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-address.png`, readerView: true });
  });
}

export async function openCompanyView(page, linkText, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user opens the company's ${linkText} view`, async () => {
    await loggedClick(page, `#drillNav a:has-text('${linkText}')`, `Opening the ${linkText} view`, { screenshotPath });
    await expect(page.locator("#drillNav a[aria-current='page']")).toHaveText(linkText, { timeout: 15000 });
    await expect(page.locator("#drillView h4")).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-view.png`, readerView: true });
  });
}

// The officers and PSC views name each person, their role or control and the date; never a month
// and year of birth or a nationality.
export async function verifyNoPersonalDetailsShown(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The view shows no month and year of birth and no nationality", async () => {
    const text = await page.locator("#drillView").innerText();
    expect(text).not.toMatch(/nationality|date of birth|born/i);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-no-personal-details.png`, readerView: true });
  });
}

// From the filing history, the first filing that opens a view of its own: a set of accounts or a
// confirmation statement.
export async function openFirstFilingWithAView(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user opens the first filing in the history that has a view of its own", async () => {
    const link = page.locator("#drillView table a").first();
    if ((await link.count()) === 0) {
      await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-no-filing-view.png`, readerView: true });
      return;
    }
    const href = await link.getAttribute("href");
    await loggedClick(page, "#drillView table a >> nth=0", "Opening a filing", { screenshotPath });
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 15000 }).toBe(href);
    await expect(page.locator("#drillView dl")).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-filing-view.png`, readerView: true });
  });
}
