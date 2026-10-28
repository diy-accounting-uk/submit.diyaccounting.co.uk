// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/hmrcFieldTableAssets.js
// Serves the real field-table script, its stylesheet and money-format.js from disk to a page
// whose other scripts are stubbed out. Register it after the "**/*.js" stub: Playwright tries
// the most recently registered route first.

import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");

function serveFile(page, pattern, relativePath, contentType) {
  return page.route(pattern, async (route) => {
    await route.fulfill({ status: 200, contentType, body: fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf-8") });
  });
}

export async function serveHmrcFieldTableAssets(page) {
  await serveFile(page, "**/lib/money-format.js", "lib/money-format.js", "application/javascript");
  await serveFile(page, "**/lib/hmrc-field-table.js", "lib/hmrc-field-table.js", "application/javascript");
  await serveFile(page, "**/lib/hmrc-field-table.css", "lib/hmrc-field-table.css", "text/css");
}

// The real filing result record and the Companies House lane banner, for a Companies House filing page whose other scripts are stubbed out.
export async function serveFilingResultRecord(page) {
  for (const name of ["filing-result-record", "filing-record", "submission-record", "ct600-fields", "companies-house-lane"]) {
    await serveFile(page, `**/lib/${name}.js`, `lib/${name}.js`, "application/javascript");
  }
  await serveFile(page, "**/submission-record.css", "submission-record.css", "text/css");
}

// The real HMRC Assist check, for a page that mounts or reads it.
export function serveHmrcAssistWidget(page) {
  return serveFile(page, "**/widgets/hmrc-assist-messages.js", "widgets/hmrc-assist-messages.js", "application/javascript");
}

// The real money-input.js, for a page whose forms parse pounds amounts.
export function serveMoneyInput(page) {
  return serveFile(page, "**/lib/money-input.js", "lib/money-input.js", "application/javascript");
}

// The site stylesheet, for a screenshot that looks like the deployed page.
export async function serveSiteStyles(page) {
  await serveFile(page, "**/submission-record.css", "submission-record.css", "text/css");
  return serveFile(page, "**/submit.css", "submit.css", "text/css");
}

export function screenshotPath(name) {
  return path.join(process.cwd(), "target/browser-test-results/field-tables", `${name}-1280.png`);
}

// Fails on any sign of an unformatted or raw API figure in the text of a rendered table.
export function expectCleanFigures(expect, text) {
  expect(text).not.toContain("NaN");
  expect(text).not.toContain("undefined");
  expect(text).not.toMatch(/\b[a-z]+[A-Z][A-Za-z]*\b/);
}

// The real error summary and inline message module.
// The real self-employment-expenses.js, for the self-employment period form.
export function serveSelfEmploymentExpenses(page) {
  return serveFile(page, "**/lib/self-employment-expenses.js", "lib/self-employment-expenses.js", "application/javascript");
}

// The real UK property period field module, for the quarterly update and amend pages.
export function serveUkPropertyPeriodFields(page) {
  return serveFile(page, "**/lib/uk-property-period-fields.js", "lib/uk-property-period-fields.js", "application/javascript");
}

export function serveFormErrors(page) {
  return serveFile(page, "**/lib/form-errors.js", "lib/form-errors.js", "application/javascript");
}

export function serveCarriedIdentifiers(page) {
  return serveFile(page, "**/lib/carried-identifiers.js", "lib/carried-identifiers.js", "application/javascript");
}

// The real page script of any page under web/public, for a test that serves the page HTML from disk.
export async function servePageScripts(page) {
  await serveFile(page, "**/lib/hmrc-display-format.js", "lib/hmrc-display-format.js", "application/javascript");
  await serveFile(page, "**/lib/pending-request.js", "lib/pending-request.js", "application/javascript");
  await serveFile(page, "**/lib/accounts-form-sections.js", "lib/accounts-form-sections.js", "application/javascript");
  await serveFile(page, "**/lib/companies-house-labels.js", "lib/companies-house-labels.js", "application/javascript");
  await serveFile(page, "**/lib/stacked-table.js", "lib/stacked-table.js", "application/javascript");
  await serveFormErrors(page);
  return page.route("**/*.page.js", async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const exactPath = path.join(PUBLIC_DIR, pathname);
    const filePath = fs.existsSync(exactPath) ? exactPath : path.join(PUBLIC_DIR, path.basename(pathname));
    await route.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(filePath, "utf-8") });
  });
}

// The real page script of an ITSA page whose other scripts are stubbed out.
export async function serveItsaPageScripts(page) {
  await serveFile(page, "**/lib/pending-request.js", "lib/pending-request.js", "application/javascript");
  await serveFile(page, "**/lib/submission-record.js", "lib/submission-record.js", "application/javascript");
  await serveFile(page, "**/lib/itsa-calculation-record.js", "lib/itsa-calculation-record.js", "application/javascript");
  await serveFile(page, "**/lib/itsa-submission-record.js", "lib/itsa-submission-record.js", "application/javascript");
  await serveSelfEmploymentExpenses(page);
  await serveUkPropertyPeriodFields(page);
  await serveFile(page, "**/submission-record.css", "submission-record.css", "text/css");
  return page.route("**/hmrc/itsa/*.page.js", async (route) => {
    const fileName = path.basename(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: fs.readFileSync(path.join(PUBLIC_DIR, "hmrc/itsa", fileName), "utf-8"),
    });
  });
}

// The real dated/cumulative model helper, for an ITSA period page.
export function serveItsaSubmissionModel(page) {
  return serveFile(page, "**/lib/itsaSubmissionModel.js", "lib/itsaSubmissionModel.js", "application/javascript");
}
