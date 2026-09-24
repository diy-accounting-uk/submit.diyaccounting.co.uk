// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-companies-house-confirmation-steps.js
// Steps for the confirmation statement filing journey: which company, company authentication
// code, review and change, preview, submit and poll to a terminal state. No Companies House
// OAuth token: the filing goes through the XML Gateway with the operator's presenter
// credentials, matching the micro-entity accounts journey.

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp } from "../helpers/behaviour-helpers.js";
import { isCompaniesHouseSimulatorLane } from "./behaviour-companies-house-filing-steps.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-companies-house-confirmation-steps";

// The one company the http-simulator's confirmation statement scenario answers CompanyDataRequest
// and PaymentPeriodsRequest for (see app/http-simulator/scenarios/confirmation-statement.js).
// Its public register lookup fixture (app/http-simulator/scenarios/companies.js) answers the same
// company number, deliberately reusing DIY Accounting Limited's own number so the simulator and
// real lanes look up the same company.
const SIMULATOR_COMPANY_NUMBER = "06846849";
const SIMULATOR_COMPANY_NAME = "EXAMPLE CONFIRMATION STATEMENT LIMITED";
const SIMULATOR_COMPANY_AUTH_CODE = "SIMCS01";

/** An 11-character personal code, the length the review form checks for and nothing more. */
export const TEST_DIRECTOR_PERSONAL_CODE = "AAAAAAAAAAA";

/** The other forenames value the review form requires per director row before it will preview. */
export const TEST_DIRECTOR_OTHER_FORENAMES = "MIDDLENAME";

/**
 * The company the confirmation statement journey looks up. The simulator answers for its fixture
 * company under 06846849; every other lane reads the live public data API, where the record
 * looked up is DIY Accounting Limited's own, at the same number.
 */
export function confirmationStatementCompanyFixture(envFilePath) {
  if (isCompaniesHouseSimulatorLane(envFilePath)) {
    return { companyNumber: SIMULATOR_COMPANY_NUMBER, companyName: SIMULATOR_COMPANY_NAME };
  }
  return { companyNumber: "06846849", companyName: "DIY ACCOUNTING LIMITED" };
}

/**
 * The company authentication code the suite submits with. Real credentials in the environment
 * always win. Outside the simulator lane, with no real code set, this throws rather than trying
 * the canned simulator code against a real gateway, where it cannot work.
 */
export function resolveConfirmationStatementCompanyAuthCode(envFilePath) {
  const companyAuthCode = process.env.TEST_COMPANIES_HOUSE_CONFIRMATION_STATEMENT_AUTH_CODE;
  if (companyAuthCode) {
    return companyAuthCode;
  }
  if (isCompaniesHouseSimulatorLane(envFilePath)) {
    return SIMULATOR_COMPANY_AUTH_CODE;
  }
  throw new Error(
    "TEST_COMPANIES_HOUSE_CONFIRMATION_STATEMENT_AUTH_CODE must be set to file a confirmation statement outside the simulator lane.",
  );
}

export async function goToFileConfirmationStatement(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "File Confirmation Statement (Companies House)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company lookup form`, async () => {
    await page.waitForTimeout(500);
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting File Confirmation Statement", {
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
    await expect(page.locator("#authView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-looked-up.png` });
  });
}

export async function verifyCompanyLookedUp(page, expectedName, expectedNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees ${expectedName} (${expectedNumber}) as the company being filed for, with its current directors`, async () => {
    await expect(page.locator("#authCompanyName")).toContainText(expectedName);
    await expect(page.locator("#authCompanyNumber")).toContainText(expectedNumber);
    await expect(page.locator("#publicOfficersBody")).not.toBeEmpty({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-company-confirmed.png` });
  });
}

export async function enterCompanyAuthCodeAndReadRegister(page, companyAuthCode, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters the company authentication code and reads the register data", async () => {
    await loggedFill(page, "#companyAuthCode", companyAuthCode, "Company authentication code", { screenshotPath });
    await loggedClick(page, "#authSubmitBtn", "Reading register data", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#reviewView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-register-data-read.png` });
  });
}

export async function verifyReviewFormPopulated(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the review date and current directors pre-filled from the register", async () => {
    await expect(page.locator("#reviewDate")).not.toHaveValue("");
    await expect(page.locator("[data-director-row]").first()).toBeVisible();
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-review-form-populated.png` });
  });
}

/**
 * Leaves every director's personal code blank, accepts the lawful purpose statement and tries to
 * preview. The review form must block this rather than let an unverified director through.
 */
export async function tryPreviewWithBlankPersonalCodes(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user accepts the lawful purpose statement but leaves the director personal codes blank, and tries to preview", async () => {
    await page.check("#lawfulPurposeStatement");
    await loggedClick(page, "#previewBtn", "Trying to preview with no personal codes entered", { screenshotPath });
    await expect(page.locator("#statusMessagesContainer")).toContainText("personal code", { timeout: 15000 });
    await expect(page.locator("#previewView")).toBeHidden();
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-blank-personal-code-blocked.png` });
  });
}

export async function fillInDirectorPersonalCodes(
  page,
  personalCode = TEST_DIRECTOR_PERSONAL_CODE,
  screenshotPath = defaultScreenshotPath,
) {
  await test.step("The user enters each current director's other forenames and Companies House personal code", async () => {
    const directorRows = await page.locator("[data-director-row]").all();
    for (let index = 0; index < directorRows.length; index++) {
      await loggedFill(page, `#directorOtherForenames-${index}`, TEST_DIRECTOR_OTHER_FORENAMES, `Director ${index + 1} other forenames`, {
        screenshotPath,
      });
      await loggedFill(page, `#directorPersonalCode-${index}`, personalCode, `Director ${index + 1} personal code`, { screenshotPath });
    }
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-personal-codes-entered.png` });
  });
}

export async function acceptLawfulPurposeStatement(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user confirms the intended future activities of the company are lawful", async () => {
    await page.check("#lawfulPurposeStatement");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-lawful-purpose-accepted.png` });
  });
}

export async function previewConfirmationStatement(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user previews the confirmation statement", async () => {
    await loggedClick(page, "#previewBtn", "Previewing the confirmation statement", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#previewView")).toBeVisible({ timeout: 15000 });
    const preview = await page.locator("#previewXml").textContent();
    expect(preview).toContain("ConfirmationAndVerificationStatement");
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

export async function submitConfirmationStatementFiling(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the confirmation statement to Companies House", async () => {
    await loggedClick(page, "#submitFilingBtn", "Submitting the confirmation statement filing", { screenshotPath });
    await expect(page.locator("#resultView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submitted.png` });
  });
}

export async function verifyFilingAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the filing accepted after polling to a terminal state", async () => {
    await expect(page.locator("#filingResult")).toContainText("ACCEPT", { timeout: 30000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-accepted.png` });
  });
}

export async function verifyFilingRejected(page, expectedRejectCode, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees the filing rejected with reject code ${expectedRejectCode} after polling to a terminal state`, async () => {
    await expect(page.locator("#filingResult")).toContainText("REJECT", { timeout: 30000 });
    await expect(page.locator("#rejections")).toContainText(expectedRejectCode);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-rejected.png` });
  });
}
