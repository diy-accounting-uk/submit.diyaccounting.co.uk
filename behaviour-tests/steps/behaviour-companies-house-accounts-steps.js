// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-companies-house-accounts-steps.js
// Steps for the micro-entity and small company accounts filing journeys. No Companies House OAuth token round trip:
// the filing goes through the XML Gateway with the operator's presenter credentials, so this
// steps file only needs the Cognito sign-in already covered by behaviour-login-steps.js.

import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { expect, test } from "@playwright/test";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";
import { loggedClick, loggedFill, timestamp, takeScreenshot } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-companies-house-accounts-steps";

export async function goToFileMicroEntityAccounts(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "File Micro-entity Accounts (Companies House, sandbox)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company lookup form`, async () => {
    await page.waitForTimeout(500);
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting File Micro-entity Accounts", {
      screenshotPath,
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#companyForm")).toBeVisible();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-form.png`, readerView: true });
  });
}

export async function enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user enters company number ${companyNumber} and looks it up`, async () => {
    await loggedFill(page, "#companyNumber", companyNumber, "Company number", { screenshotPath });
    await loggedClick(page, "#companyLookupBtn", "Looking up the company", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#formView")).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-looked-up.png`, readerView: true });
  });
}

export async function verifyCompanyLookedUp(page, expectedName, expectedNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees ${expectedName} (${expectedNumber}) as the company being filed for`, async () => {
    await expect(page.locator("#formCompanyName")).toContainText(expectedName);
    await expect(page.locator("#formCompanyNumber")).toContainText(expectedNumber);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-company-confirmed.png`, readerView: true });
  });
}

async function fillYear(page, prefix, year) {
  await loggedFill(page, `#${prefix}FixedAssets`, String(year.fixedAssets), `${prefix} fixed assets`);
  await loggedFill(page, `#${prefix}CurrentAssets`, String(year.currentAssets), `${prefix} current assets`);
  await loggedFill(page, `#${prefix}CreditorsWithinOneYear`, String(year.creditorsWithinOneYear), `${prefix} creditors within one year`);
  await loggedFill(page, `#${prefix}CreditorsAfterOneYear`, String(year.creditorsAfterOneYear), `${prefix} creditors after one year`);
  await loggedFill(page, `#${prefix}CalledUpShareCapital`, String(year.calledUpShareCapital), `${prefix} called up share capital`);
  await loggedFill(page, `#${prefix}ProfitAndLossAccount`, String(year.profitAndLossAccount), `${prefix} profit and loss account`);
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
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-accounts-form-filled.png`, readerView: true });
  });
}

export async function previewAccounts(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user previews the accounts", async () => {
    await loggedClick(page, "#previewBtn", "Previewing the accounts", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#previewView")).toBeVisible({ timeout: 15000 });
    const preview = await page.locator("#previewIxbrl").textContent();
    expect(preview).toContain("<?xml");
    const rendered = page.frameLocator("#previewRendered");
    await expect(rendered.locator("h2", { hasText: "Balance sheet" })).toBeVisible({ timeout: 15000 });
    const renderedText = await rendered.locator("body").innerText();
    expect(renderedText).toContain("Shareholders' funds");
    expect(renderedText).not.toMatch(/xbrli|iso4217|\b(core|bus|direp):|\d{4}-\d{2}-\d{2}/);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-preview.png`, readerView: true });
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
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-submitted.png`, readerView: true });
  });
}

export async function verifyFilingAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the filing accepted", async () => {
    await expect(page.locator("#filingResult")).toContainText("ACCEPT", { timeout: 30000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-accepted.png`, readerView: true });
  });
}

export async function openFilingCustomerCopy(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user opens the customer copy of the filing and sees the accounts as filed with the receipt", async () => {
    await loggedClick(page, "#filingCopyLink", "Opening the customer copy of the filing", { screenshotPath });
    const copy = page.locator(".customer-copy");
    await expect(copy).toBeVisible({ timeout: 30000 });
    await expect(copy.locator(".customer-copy-status")).toHaveText("Accepted by Companies House");
    await expect(page.frameLocator("iframe.filed-document").locator("body")).toContainText("Balance sheet", { timeout: 30000 });
    await expect(copy.locator(".customer-copy-links a")).toHaveCount(3);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-03-customer-copy.png`, fullPage: true, readerView: true });
  });
}

export async function verifyFilingRejected(page, expectedRejectCode, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees the filing rejected with reject code ${expectedRejectCode}`, async () => {
    await expect(page.locator("#filingResult")).toContainText("REJECT", { timeout: 30000 });
    await expect(page.locator("#rejections")).toContainText(expectedRejectCode);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-rejected.png`, readerView: true });
  });
}

export async function goToFileSmallCompanyAccounts(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "File Small Company Accounts (Companies House, sandbox)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company lookup form`, async () => {
    await page.waitForTimeout(500);
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting File Small Company Accounts", {
      screenshotPath,
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#companyForm")).toBeVisible();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-company-form.png`, readerView: true });
  });
}

const SMALL_COMPANY_INPUT_FIELDS = {
  profitAndLoss: {
    1: ["turnover", "costOfSales", "administrativeExpenses", "interestReceivable", "tax"],
    2: [
      "turnover",
      "changeInStocks",
      "ownWorkCapitalised",
      "otherOperatingIncome",
      "rawMaterialsConsumables",
      "otherExternalCharges",
      "staffCosts",
      "depreciation",
      "otherOperatingExpenses",
      "interestReceivable",
      "interestPayable",
      "tax",
    ],
  },
  balanceSheet: [
    "fixedAssets",
    "stocks",
    "debtors",
    "cashAtBank",
    "tradeCreditors",
    "corporationTax",
    "otherCreditors",
    "creditorsAfterOneYear",
    "calledUpShareCapital",
    "profitAndLossAccount",
  ],
};

function upperFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function fillSmallCompanyYear(page, prefix, year, profitAndLossFormat) {
  for (const field of SMALL_COMPANY_INPUT_FIELDS.profitAndLoss[profitAndLossFormat]) {
    await loggedFill(page, `#${prefix}${upperFirst(field)}`, String(year.profitAndLoss[field]), `${prefix} ${field}`);
  }
  for (const field of SMALL_COMPANY_INPUT_FIELDS.balanceSheet) {
    await loggedFill(page, `#${prefix}${upperFirst(field)}`, String(year.balanceSheet[field]), `${prefix} ${field}`);
  }
}

export async function fillInSmallCompanyAccountsForm(
  page,
  accounts,
  { filleted = false, profitAndLossFormat = 1 } = {},
  screenshotPath = defaultScreenshotPath,
) {
  await test.step(`The user fills in the small company accounts (${filleted ? "filleted" : "full"} copy, profit and loss Format ${profitAndLossFormat})`, async () => {
    await loggedFill(page, "#periodStart", accounts.periodStart, "Period start");
    await loggedFill(page, "#periodEnd", accounts.periodEnd, "Period end");
    if (filleted) await page.check("#copyFilleted");
    if (profitAndLossFormat === 2) await page.check("#profitAndLossFormat2");
    await fillSmallCompanyYear(page, "current", accounts.currentYear, profitAndLossFormat);
    if (accounts.priorYear) {
      await page.check("#includeComparatives");
      await fillSmallCompanyYear(page, "prior", accounts.priorYear, profitAndLossFormat);
    }
    await loggedFill(page, "#principalActivity", accounts.principalActivity, "Principal activity");
    await loggedFill(page, "#accountingPolicies", accounts.accountingPolicies, "Accounting policies");
    await loggedFill(page, "#averageEmployees", String(accounts.averageEmployees), "Average employees");
    await loggedFill(page, "#directors", accounts.directors.join("\n"), "Directors");
    await loggedFill(page, "#directorName", accounts.directors[0], "Director name");
    await loggedFill(page, "#directorDateApproved", accounts.dateApproved, "Date approved");
    await page.check("#statementSection477Exemption");
    await page.check("#statementMembersNotRequiredAudit");
    await page.check("#statementDirectorsResponsibilities");
    await page.check("#statementSmallCompaniesRegime");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-accounts-form-filled.png`, readerView: true });
  });
}

export async function showPreviewPage(page, heading, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user scrolls the preview to the ${heading} page`, async () => {
    const title = page.frameLocator("#previewRendered").locator("h2", { hasText: heading });
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeVisible();
    await takeScreenshot(page, {
      path: `${screenshotPath}/${timestamp()}-02-preview-${heading.toLowerCase().replaceAll(" ", "-")}.png`,
      readerView: true,
    });
  });
}

export async function verifyPreviewContains(
  page,
  { source = [], rendered = [], notRendered = [], notInSource = [] },
  screenshotPath = defaultScreenshotPath,
) {
  await test.step("The user sees the preview carry the expected accounts content", async () => {
    const preview = await page.locator("#previewIxbrl").textContent();
    for (const text of source) expect(preview).toContain(text);
    for (const text of notInSource) expect(preview).not.toContain(text);
    const renderedText = await page.frameLocator("#previewRendered").locator("body").innerText();
    for (const text of rendered) expect(renderedText).toContain(text);
    for (const text of notRendered) expect(renderedText).not.toContain(text);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-preview-checked.png`, readerView: true });
  });
}

const bookFixturesDirectory = path.resolve(process.cwd(), "fixtures/diya-gl");

/**
 * Zip a fixture book (book.toml and lines.jsonl) for the "Fill from your books" card, with the
 * company number the sandbox looks up in place of the fixture's own, and return the file's path.
 */
export async function writeFixtureBookZip(fixtureName, companyNumber, outputDirectory) {
  const directory = path.join(bookFixturesDirectory, fixtureName);
  const bookToml = fs
    .readFileSync(path.join(directory, "book.toml"), "utf8")
    .replace(/("diya-gl:companyNumber" = ")\d+(")/, `$1${companyNumber}$2`);
  const zip = new JSZip();
  zip.file("book.toml", bookToml);
  zip.file("lines.jsonl", fs.readFileSync(path.join(directory, "lines.jsonl")));
  fs.mkdirSync(outputDirectory, { recursive: true });
  const zipFile = path.join(outputDirectory, `${fixtureName}.diya-gl.zip`);
  fs.writeFileSync(zipFile, await zip.generateAsync({ type: "nodebuffer" }));
  return zipFile;
}

/**
 * Build an iXBRL accounts document from one of the Companies House test service accounts cases, for the
 * company the sandbox looks up in place of the case's own, and return the file's path.
 */
export function writeBuiltIxbrlFile(caseName, company, outputDirectory) {
  const casesFile = path.join(process.cwd(), "scripts", "fixtures", "companies-house-test-service-cases.json");
  const { name, type, govTestScenario, expectedOutcome, ...requestBody } = JSON.parse(fs.readFileSync(casesFile, "utf8")).find(
    (testCase) => testCase.name === caseName,
  );
  const errors = [];
  const accounts = extractAndValidateAccountsParameters(
    { body: JSON.stringify({ ...requestBody, companyNumber: company.companyNumber, companyName: company.companyName }) },
    errors,
  );
  if (errors.length > 0) throw new Error(`The ${caseName} case is not a valid accounts request: ${errors.join("; ")}`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const file = path.join(outputDirectory, `${caseName}.xhtml`);
  fs.writeFileSync(file, buildAccountsIxbrl(accounts));
  return file;
}

/**
 * Drop a book on the accounts form's "Fill from your books" card and check the fields it fills.
 * expectedFields maps an input id to the value the book supplies.
 */
export async function fillAccountsFormFromBook(page, bookZipFile, expectedStatus, expectedFields, screenshotPath = defaultScreenshotPath) {
  await test.step("The user drops a book on Fill from your books and the accounts form fills", async () => {
    await expect(page.locator("#booksImportDrop")).toBeVisible();
    await page.locator("#booksImportFile").setInputFiles(bookZipFile);
    await expect(page.locator("#booksImportStatus")).toContainText(expectedStatus, { timeout: 60_000 });
    for (const [id, value] of Object.entries(expectedFields)) {
      await expect(page.locator(`#${id}`)).toHaveValue(value);
    }
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-accounts-form-filled-from-book.png`, readerView: true });
  });
}

/**
 * The answers a book leaves to the user on the micro-entity form: the date the director approved
 * the accounts and the four statements.
 */
export async function completeMicroEntityAnswersTheBookLeaves(page, dateApproved, screenshotPath = defaultScreenshotPath) {
  await test.step("The user adds the approval date and the statements the book does not hold", async () => {
    await loggedFill(page, "#directorDateApproved", dateApproved, "Date approved");
    await page.check("#statementSection477Exemption");
    await page.check("#statementMembersNotRequiredAudit");
    await page.check("#statementDirectorsResponsibilities");
    await page.check("#statementMicroEntityProvisions");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-accounts-form-completed.png`, readerView: true });
  });
}

/**
 * The answers a book leaves to the user on the small company form: the principal activity, the
 * accounting policies, the date approved and the statements.
 */
export async function completeSmallCompanyAnswersTheBookLeaves(page, answers, screenshotPath = defaultScreenshotPath) {
  await test.step("The user adds the activity, the policies, the approval date and the statements the book does not hold", async () => {
    await loggedFill(page, "#principalActivity", answers.principalActivity, "Principal activity");
    await loggedFill(page, "#accountingPolicies", answers.accountingPolicies, "Accounting policies");
    await loggedFill(page, "#directorDateApproved", answers.dateApproved, "Date approved");
    await page.check("#statementSection477Exemption");
    await page.check("#statementMembersNotRequiredAudit");
    await page.check("#statementDirectorsResponsibilities");
    await page.check("#statementSmallCompaniesRegime");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-accounts-form-completed.png`, readerView: true });
  });
}
