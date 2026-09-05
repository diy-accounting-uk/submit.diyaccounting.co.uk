// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/steps/behaviour-companies-house-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-companies-house-steps";

export async function goToCompanySearch(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "Company Lookup (Companies House)";
  await test.step(`The user navigates to ${activityButtonText} and sees the search form`, async () => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-search.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting Company Lookup", { screenshotPath, timeout: 60000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-company-search.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-company-search.png` });
    await expect(page.locator("#companySearchForm")).toBeVisible();
  });
}

export async function fillInCompanySearch(page, query, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user fills in the company search with "${query}"`, async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-search-fill-in.png` });
    await loggedFill(page, "#companyQuery", query, "Company name or number", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-company-search-fill-in.png` });
  });
}

export async function submitCompanySearch(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the company search form", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-search-submit.png` });
    await loggedClick(page, "#searchBtn", "Submitting company search", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-company-search-submit.png` });
  });
}

export async function verifyCompanySearchResults(page, expectedName, expectedNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees ${expectedName} (${expectedNumber}) in the search results`, async () => {
    const resultsContainer = page.locator("#searchResults");
    await expect(resultsContainer).toBeVisible({ timeout: 15000 });
    await expect(resultsContainer).toContainText(expectedName, { timeout: 15000 });
    await expect(resultsContainer).toContainText(expectedNumber, { timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-search-results.png` });
  });
}

export async function openCompanyProfile(page, companyName, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user opens the profile for ${companyName}`, async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-open-company-profile.png` });
    await loggedClick(page, `#searchResults button:has-text('${companyName}')`, `Opening ${companyName} profile`, { screenshotPath });
    await expect(page.locator("#profileView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-open-company-profile.png` });
  });
}

export async function verifyCompanyProfile(page, expectedName, expectedStatus, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees ${expectedName} with status ${expectedStatus} in the profile`, async () => {
    const profile = page.locator("#companyProfile");
    await expect(profile).toContainText(expectedName, { timeout: 15000 });
    await expect(profile).toContainText(expectedStatus, { timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-profile.png` });
  });
}
