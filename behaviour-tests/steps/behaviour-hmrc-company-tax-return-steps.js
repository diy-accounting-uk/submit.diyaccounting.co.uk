// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-hmrc-company-tax-return-steps.js
// Steps for the Company Tax Return journey. The company lookup steps are shared with the
// Companies House accounts journeys in behaviour-companies-house-accounts-steps.js.

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp, takeScreenshot } from "../helpers/behaviour-helpers.js";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { FIXTURE_BOOK_DIRECTORY } from "@app/test-helpers/ctReturnFixture.js";

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
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-form.png`, readerView: true });
  });
}

async function zippedFixtureBook() {
  const zip = new JSZip();
  zip.file("book.toml", fs.readFileSync(path.join(FIXTURE_BOOK_DIRECTORY, "book.toml")));
  zip.file("lines.jsonl", fs.readFileSync(path.join(FIXTURE_BOOK_DIRECTORY, "lines.jsonl")));
  return zip.generateAsync({ type: "nodebuffer" });
}

// The fixture book is a micro-entity by size, so the card opens the form on the micro-entity
// accounts; regime "small" files the small company accounts the same book also gives.
export async function fillInCompanyTaxReturnForm(page, { utr, declarantName, regime = "small" }, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user enters the UTR, drops the company's book, keeps the ${regime} accounts, and enters the declarant, the statements and the declaration`, async () => {
    await loggedFill(page, "#utr", utr, "UTR");
    await expect(page.locator("#booksImportFile")).toBeAttached();
    await page.locator("#booksImportFile").setInputFiles({
      name: "precision-code.diya-gl.zip",
      mimeType: "application/zip",
      buffer: await zippedFixtureBook(),
    });
    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60000 });
    await expect(page.locator("#regimeMicro")).toBeChecked();
    await page.check(regime === "micro" ? "#regimeMicro" : "#regimeSmall");
    await loggedFill(page, "#declarantName", declarantName, "Declarant name");
    await page.check("#statementSection477Exemption");
    await page.check("#statementMembersNotRequiredAudit");
    await page.check("#statementDirectorsResponsibilities");
    await page.check(regime === "micro" ? "#statementMicroEntityProvisions" : "#statementSmallCompaniesRegime");
    await page.check("#declarationAccepted");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-return-form-filled-${regime}.png`, readerView: true });
  });
}

const MICRO_PROFIT_AND_LOSS_ANSWERS = {
  microCurrentTurnover: "20000",
  microCurrentOtherIncome: "0",
  microCurrentRawMaterials: "5000",
  microCurrentStaffCosts: "0",
  microCurrentDepreciation: "0",
  microCurrentOtherCharges: "12000",
  microCurrentTax: "600",
};

// A micro-entity's iXBRL accounts tag no profit and loss account, so the customer types the micro profit and loss lines
// the document leaves blank beside the balance sheets it fills.
export async function fillInCompanyTaxReturnFormFromIxbrl(
  page,
  { ixbrlFile, expectedStatus, utr, declarantName },
  screenshotPath = defaultScreenshotPath,
) {
  await test.step("The user enters the UTR, drops the company's iXBRL accounts, types the profit and loss the document leaves blank, and enters the statements and the declaration", async () => {
    await loggedFill(page, "#utr", utr, "UTR");
    await expect(page.locator("#booksImportFile")).toBeAttached();
    await page.locator("#booksImportFile").setInputFiles(ixbrlFile);
    await expect(page.locator("#booksImportStatus")).toContainText(expectedStatus, { timeout: 60000 });
    await expect(page.locator("#regimeMicro")).toBeChecked();
    await expect(page.locator("#microCurrentFixedAssets")).toHaveValue("800");
    await expect(page.locator("#declarantName")).toHaveValue(declarantName);
    for (const [id, value] of Object.entries(MICRO_PROFIT_AND_LOSS_ANSWERS)) {
      await loggedFill(page, `#${id}`, value, id);
    }
    await page.check("#statementSection477Exemption");
    await page.check("#statementMembersNotRequiredAudit");
    await page.check("#statementDirectorsResponsibilities");
    await page.check("#statementMicroEntityProvisions");
    await page.check("#declarationAccepted");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-return-form-filled-ixbrl.png`, readerView: true });
  });
}

const TYPED_ANSWERS = {
  utr: "8596148860",
  periodStart: "2025-04-01",
  periodEnd: "2026-03-31",
  currentTurnover: "100000",
  currentCostOfSales: "40000",
  currentAdministrativeExpenses: "30000",
  currentInterestReceivable: "0",
  currentTax: "0",
  currentCashAtBank: "30100",
  currentCalledUpShareCapital: "100",
  currentProfitAndLossAccount: "30000",
  principalActivity: "Software consultancy",
  accountingPolicies: "The accounts are prepared under FRS 102 section 1A.",
  directors: "Carol Smith",
  averageEmployees: "2",
  directorName: "Carol Smith",
  directorDateApproved: "2026-06-01",
  declarantName: "Carol Smith",
};

export async function typeInCompanyTaxReturnForm(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user types every figure, the statements and the declaration into the form", async () => {
    for (const [id, value] of Object.entries(TYPED_ANSWERS)) {
      await loggedFill(page, `#${id}`, value, id);
    }
    await page.check("#statementSection477Exemption");
    await page.check("#statementMembersNotRequiredAudit");
    await page.check("#statementDirectorsResponsibilities");
    await page.check("#statementSmallCompaniesRegime");
    await page.check("#declarationAccepted");
    await expect(page.locator("[aria-invalid=true]")).toHaveCount(0);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-return-form-typed.png`, readerView: true });
  });
}

export async function changeAnAnswerFromTheReview(page, { fieldId, value }, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user changes ${fieldId} from the review and returns to the review with that answer focused`, async () => {
    await expect(page.locator("#previewView")).toContainText("Your answers");
    await page
      .locator(`#review-row-${fieldId}`)
      .getByRole("link", { name: /Change/ })
      .click();
    await expect(page.locator("#formView")).toBeVisible();
    await expect(page.locator(`#${fieldId}`)).toBeFocused();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-change-answer.png`, readerView: true });
    await loggedFill(page, `#${fieldId}`, value, fieldId);
    await loggedClick(page, "#previewBtn", "Returning to the review", { screenshotPath });
    await expect(page.locator("#previewView")).toBeVisible({ timeout: 30000 });
    await expect(page.locator(`#review-row-${fieldId}`)).toBeFocused();
    await expect(page.locator(`#review-row-${fieldId}`)).toContainText(value);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-review-changed.png`, readerView: true });
  });
}

export async function verifyMicroEntityReview(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the micro-entity accounts and statement in the review", async () => {
    await expect(page.locator("#review-row-accountsRegime")).toContainText("Micro-entity accounts (FRS 105)");
    await expect(page.locator("#review-row-microCurrentOtherCharges")).toBeVisible();
    await expect(page.locator("#review-row-statementMicroEntityProvisions")).toContainText("Yes");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-review-micro.png`, readerView: true });
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
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-submitted.png`, readerView: true });
  });
}

export async function verifyReturnAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the return accepted with its IRmark", async () => {
    await expect(page.locator("#returnResult")).toContainText("HMRC accepted", { timeout: 60000 });
    await expect(page.locator("#returnIrmark")).toContainText(/IRmark: [A-Z2-7]{32}/);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-accepted.png`, readerView: true });
  });
}

export async function verifyReturnRejectedAndRetryable(page, expectedErrorNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees the return rejected with error ${expectedErrorNumber} and can try again`, async () => {
    await expect(page.locator("#returnResult")).toContainText("HMRC rejected", { timeout: 60000 });
    await expect(page.locator("#returnErrors")).toContainText(expectedErrorNumber);
    await expect(page.locator("#tryAgainBtn")).toBeVisible();
    await loggedClick(page, "#tryAgainBtn", "Returning to the review to try again", { screenshotPath });
    await expect(page.locator("#submitReturnBtn")).toBeVisible();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-rejected.png`, readerView: true });
  });
}
