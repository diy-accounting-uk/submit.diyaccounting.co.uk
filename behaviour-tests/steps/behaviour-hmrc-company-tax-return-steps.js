// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-hmrc-company-tax-return-steps.js
// Steps for the Company Tax Return journey. The company lookup steps are shared with the
// Companies House accounts journeys in behaviour-companies-house-accounts-steps.js.

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp, takeScreenshot } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-hmrc-company-tax-return-steps";

export async function goToFileCompanyTaxReturn(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "File Company Tax Return (HMRC, preview)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company lookup form`, async () => {
    await page.waitForTimeout(500);
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting File Company Tax Return", {
      screenshotPath,
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#companyForm")).toBeVisible();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-form.png` });
  });
}

export async function fillInCompanyTaxReturnForm(page, { utr, bookExport, declarantName }, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters the UTR, the book export, the declarant, the statements and the declaration", async () => {
    await loggedFill(page, "#utr", utr, "UTR");
    await loggedFill(page, "#bookExport", JSON.stringify(bookExport), "Book export");
    await loggedFill(page, "#declarantName", declarantName, "Declarant name");
    await page.check("#statementSection477Exemption");
    await page.check("#statementMembersNotRequiredAudit");
    await page.check("#statementDirectorsResponsibilities");
    await page.check("#statementSmallCompaniesRegime");
    await page.check("#declarationAccepted");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-return-form-filled.png` });
  });
}

export async function previewCompanyTaxReturn(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user previews the return and sees the CT600 and computations tables", async () => {
    await loggedClick(page, "#previewBtn", "Previewing the return", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#previewView")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#ct600Table tbody tr").first()).toBeVisible();
    await expect(page.locator("#computationsTable tbody tr").first()).toBeVisible();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-preview.png`, readerView: true });
  });
}

export async function setCtGovTestScenario(page, scenario, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sets the Gov-Test-Scenario header to ${scenario}`, async () => {
    await page.evaluate(() => {
      sessionStorage.setItem("showDeveloperOptions", "true");
      window.dispatchEvent(new Event("developer-mode-changed"));
    });
    await loggedFill(page, "#govTestScenario", scenario, "Gov-Test-Scenario", { screenshotPath });
  });
}

export async function enterGatewayCredentialsAndSubmit(page, { userId, password }, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters the Government Gateway credentials and submits the return", async () => {
    await loggedFill(page, "#gatewayUserId", userId, "Government Gateway user ID", { screenshotPath });
    await loggedFill(page, "#gatewayPassword", password, "Government Gateway password", { screenshotPath });
    await loggedClick(page, "#submitReturnBtn", "Submitting the Company Tax Return", { screenshotPath });
    await expect(page.locator("#resultView")).toBeVisible({ timeout: 30000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-submitted.png` });
  });
}

export async function verifyReturnAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the return accepted with its IRmark", async () => {
    await expect(page.locator("#returnResult")).toContainText("ACCEPTED", { timeout: 60000 });
    await expect(page.locator("#returnIrmark")).toContainText(/IRmark: [A-Z2-7]{32}/);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-accepted.png` });
  });
}

export async function verifyReturnRejectedAndRetryable(page, expectedErrorNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees the return rejected with error ${expectedErrorNumber} and can try again`, async () => {
    await expect(page.locator("#returnResult")).toContainText("REJECTED", { timeout: 60000 });
    await expect(page.locator("#returnErrors")).toContainText(expectedErrorNumber);
    await expect(page.locator("#tryAgainBtn")).toBeVisible();
    await loggedClick(page, "#tryAgainBtn", "Returning to the review to try again", { screenshotPath });
    await expect(page.locator("#submitReturnBtn")).toBeVisible();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-rejected.png` });
  });
}
