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

// The real HMRC Assist check, for a page that mounts or reads it.
export function serveHmrcAssistWidget(page) {
  return serveFile(page, "**/widgets/hmrc-assist-messages.js", "widgets/hmrc-assist-messages.js", "application/javascript");
}

// The real money-input.js, for a page whose forms parse pounds amounts.
export function serveMoneyInput(page) {
  return serveFile(page, "**/lib/money-input.js", "lib/money-input.js", "application/javascript");
}

// The site stylesheet, for a screenshot that looks like the deployed page.
export function serveSiteStyles(page) {
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

export function serveFormErrors(page) {
  return serveFile(page, "**/lib/form-errors.js", "lib/form-errors.js", "application/javascript");
}

export function serveCarriedIdentifiers(page) {
  return serveFile(page, "**/lib/carried-identifiers.js", "lib/carried-identifiers.js", "application/javascript");
}
