// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-companies-house-accounts-steps.js
// Steps for the micro-entity accounts filing journey. No Companies House OAuth token round trip:
// the filing goes through the XML Gateway with the operator's presenter credentials, so this
// steps file only needs the Cognito sign-in already covered by behaviour-login-steps.js.

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-companies-house-accounts-steps";

export async function goToFileMicroEntityAccounts(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "File Micro-entity Accounts (Companies House)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company lookup form`, async () => {
    await page.waitForTimeout(500);
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting File Micro-entity Accounts", {
      screenshotPath,
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#companyForm")).toBeVisible();
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-form.png` });
  });
}

export async function enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user enters company number ${companyNumber} and looks it up`, async () => {
    await loggedFill(page, "#companyNumber", companyNumber, "Company number", { screenshotPath });
    await loggedClick(page, "#companyLookupBtn", "Looking up the company", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#formView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-looked-up.png` });
  });
}

export async function verifyCompanyLookedUp(page, expectedName, expectedNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees ${expectedName} (${expectedNumber}) as the company being filed for`, async () => {
    await expect(page.locator("#formCompanyName")).toContainText(expectedName);
    await expect(page.locator("#formCompanyNumber")).toContainText(expectedNumber);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-confirmed.png` });
  });
}

async function fillYear(page, prefix, year) {
  await loggedFill(page, `#${prefix}FixedAssets`, String(year.fixedAssets), `${prefix} fixed assets`);
  await loggedFill(page, `#${prefix}CurrentAssets`, String(year.currentAssets), `${prefix} current assets`);
  await loggedFill(
    page,
    `#${prefix}CreditorsWithinOneYear`,
    String(year.creditorsWithinOneYear),
    `${prefix} creditors within one year`,
  );
  await loggedFill(
    page,
    `#${prefix}CreditorsAfterOneYear`,
    String(year.creditorsAfterOneYear),
    `${prefix} creditors after one year`,
  );
  await loggedFill(
    page,
    `#${prefix}CalledUpShareCapital`,
    String(year.calledUpShareCapital),
    `${prefix} called up share capital`,
  );
  await loggedFill(
    page,
    `#${prefix}ProfitAndLossAccount`,
    String(year.profitAndLossAccount),
    `${prefix} profit and loss account`,
  );
  await loggedFill(page, `#${prefix}CapitalAndReserves`, String(year.capitalAndReserves), `${prefix} capital and reserves`);
}

export async function fillInAccountsForm(page, accounts, screenshotPath = defaultScreenshotPath) {
  await test.step("The user fills in the period, balance sheet, employees and director", async () => {
    await loggedFill(page, "#periodStart", accounts.periodStart, "Period start");
    await loggedFill(page, "#periodEnd", accounts.periodEnd, "Period end");
    await fillYear(page, "current", accounts.balanceSheet.currentYear);
    await fillYear(page, "prior", accounts.balanceSheet.priorYear);
    await loggedFill(page, "#averageEmployees", String(accounts.averageEmployees), "Average employees");
    await loggedFill(page, "#directorName", accounts.director.name, "Director name");
    await loggedFill(page, "#directorDateApproved", accounts.director.dateApproved, "Date approved");
    await page.check("#statementSection477Exemption");
    await page.check("#statementMembersNotRequiredAudit");
    await page.check("#statementDirectorsResponsibilities");
    await page.check("#statementMicroEntityProvisions");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-accounts-form-filled.png` });
  });
}

export async function previewAccounts(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user previews the accounts", async () => {
    await loggedClick(page, "#previewBtn", "Previewing the accounts", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#previewView")).toBeVisible({ timeout: 15000 });
    const preview = await page.locator("#previewIxbrl").textContent();
    expect(preview).toContain("<?xml");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-preview.png` });
  });
}

export async function setGovTestScenario(page, scenario, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sets the Gov-Test-Scenario header to ${scenario}`, async () => {
    await page.evaluate(() => {
      sessionStorage.setItem("showDeveloperOptions", "true");
      window.dispatchEvent(new Event("developer-mode-changed"));
    });
    await loggedFill(page, "#govTestScenario", scenario, "Gov-Test-Scenario", { screenshotPath });
  });
}

export async function enterCompanyAuthCodeAndSubmit(page, companyAuthCode, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters the company authentication code and submits the filing", async () => {
    await loggedFill(page, "#companyAuthCode", companyAuthCode, "Company authentication code", { screenshotPath });
    await loggedClick(page, "#submitFilingBtn", "Submitting the accounts filing", { screenshotPath });
    await expect(page.locator("#resultView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submitted.png` });
  });
}

export async function verifyFilingAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the filing accepted", async () => {
    await expect(page.locator("#filingResult")).toContainText("ACCEPT", { timeout: 30000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-accepted.png` });
  });
}

export async function verifyFilingRejected(page, expectedRejectCode, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees the filing rejected with reject code ${expectedRejectCode}`, async () => {
    await expect(page.locator("#filingResult")).toContainText("REJECT", { timeout: 30000 });
    await expect(page.locator("#rejections")).toContainText(expectedRejectCode);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-rejected.png` });
  });
}
