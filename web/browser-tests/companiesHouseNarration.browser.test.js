// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companiesHouseNarration.browser.test.js
// Each Companies House filing page says what it is doing when it starts to send: the request is held
// open here, so the first stage's message is what the reader sees.

import { test, expect } from "@playwright/test";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

const HELPER_FORMS = [
  "allotShares",
  "appointOfficer",
  "ceasePsc",
  "changeAccountingRefDate",
  "changeCompanyName",
  "changeOfficer",
  "changePscDetails",
  "notifyPsc",
  "pscStatements",
  "recordsLocation",
  "removeOfficer",
];

async function openPage(page, name) {
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/companies-house/${name}.html`, { waitUntil: "networkidle" });
}

for (const form of HELPER_FORMS) {
  test(`${form}: sending the form says so before Companies House answers`, async ({ page }) => {
    await openPage(page, form);
    await page.evaluate(() => {
      window.submitCompaniesHouseForm = () => new Promise(() => {});
      window.companiesHouseFormPage.fileAndShowOutcome({ kind: "form", form: {}, result: document.createElement("div") });
    });
    await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the form to Companies House...");
  });
}

for (const form of ["changeRegisteredOffice", "changeRegisteredEmail"]) {
  test(`${form}: sending the change says so before Companies House answers`, async ({ page }) => {
    await openPage(page, form);
    await page.evaluate(() => {
      // eslint-disable-next-line no-undef -- the page's own filing state
      filing = { companyNumber: "00000001" };
      window.hasUsableCompaniesHouseToken = () => true;
      window.openCompaniesHouseTransaction = () => new Promise(() => {});
      // eslint-disable-next-line no-undef -- the page's own filing step
      runFilingSequence();
    });
    await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the change to Companies House...");
  });
}

test("fileConfirmationStatement: sending the statement says so before Companies House answers", async ({ page }) => {
  await openPage(page, "fileConfirmationStatement");
  await page.evaluate(() => {
    window.buildStatementPayload = () => ({});
    window.submitConfirmationStatement = () => new Promise(() => {});
    // eslint-disable-next-line no-undef -- the page's own filing step
    handleSubmitFiling();
  });
  await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the confirmation statement to Companies House...");
});
