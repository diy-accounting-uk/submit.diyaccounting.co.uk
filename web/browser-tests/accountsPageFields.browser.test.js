// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/accountsPageFields.browser.test.js
// The micro-entity and small company accounts pages' fields that are not ledger lines lead their
// label with the section or paragraph that asks for the answer, and their note links to it. A note
// the page writes keeps its words and gains the link.

import path from "path";
import { test, expect } from "@playwright/test";
import { lookUpCompany, serveAccountsSite } from "./accountsLinesSite.js";

const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/accounts-page-fields");

async function openPage(page, name, { welsh = false } = {}) {
  await serveAccountsSite(page);
  await lookUpCompany(page, name, "00000001", { welsh });
  await expect(page.locator('label[for="directorsAdvanceTerms"]')).toContainText(
    welsh ? "Deddf Cwmnïau adran 413" : "Companies Act section 413",
  );
}

async function shoot(page, locator, name) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await locator.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${width}.png`), fullPage: false });
  }
}

test("the micro-entity page's dormant, share, office and advance fields carry their reference and its link", async ({ page }) => {
  await openPage(page, "fileMicroEntityAccounts");
  await expect(page.locator('label[for="dormant"]')).toHaveText(
    "Companies Act section 1169: The company was dormant throughout the period",
  );
  await expect(page.locator("#dormant-hint")).toContainText("no significant accounting transaction");
  await expect(page.locator("#dormant-hint a")).toHaveAttribute("href", "https://www.legislation.gov.uk/ukpga/2006/46/section/1169");
  await expect(page.locator("#dormant-hint a")).toHaveText("Companies Act 2006, section 1169");

  await page.locator("#dormant").check();
  await expect(page.locator('label[for="shareClass"]')).toHaveText("Companies Act section 629: Share class");
  await expect(page.locator("#shareClass-hint")).toContainText("the same in every respect");
  await expect(page.locator("#shareClass")).toHaveAttribute("aria-describedby", /shareClass-hint/);
  await expect(page.locator('label[for="nominalValue"]')).toHaveText("Companies Act section 542: Nominal value of each share, in pounds");
  await expect(page.locator("#nominalValue-hint")).toContainText("For example, 1 or 0.01.");
  await expect(page.locator("#nominalValue-hint a")).toHaveAttribute("href", "https://www.legislation.gov.uk/ukpga/2006/46/section/542");

  const office = page.locator("#officeHint").locator("xpath=preceding-sibling::h3[1]");
  await expect(office).toHaveText("Companies Act section 86: Registered office");
  await expect(page.locator("#registeredOffice-hint a")).toHaveAttribute("href", "https://www.legislation.gov.uk/ukpga/2006/46/section/86");

  await expect(page.locator("#directorsAdvanceTerms-hint a")).toHaveCount(1);
  await expect(page.locator('label[for="directorsAdvanceAtEnd"]')).toHaveText(
    "Companies Act section 413: Owed by the director at the end of the year",
  );
  await expect(page.locator('label[for="averageEmployees"]')).toContainText("Companies Act section 411");
  await expect(page.locator('label[for="directorName"]')).toContainText("Companies Act section 414");
  await expect(page.locator("#statementSection477ExemptionLabel")).toHaveText(/^The company is entitled to exemption from audit/);
  await shoot(page, page.locator("#dormant"), "micro-dormant");
});

test("the small company page's policies, share capital note and advances carry their reference and its link", async ({ page }) => {
  await openPage(page, "fileSmallCompanyAccounts");
  await expect(page.locator('label[for="accountingPolicies"]')).toHaveText("Schedule 1 paragraph 44: Accounting policies");
  await expect(page.locator("#accountingPolicies-hint a")).toHaveAttribute(
    "href",
    "https://www.legislation.gov.uk/uksi/2008/409/schedule/1/paragraph/44",
  );
  await expect(page.locator('label[for="goingConcernStatement"]')).toHaveText("Schedule 1 paragraph 44: Going concern");
  await expect(page.locator("#goingConcernStatement-hint")).toHaveCount(0);
  await expect(page.locator("#morePolicies > p.hint a")).toHaveText("The accounts regulations, Schedule 1, paragraph 44");
  await expect(page.locator("#morePolicies > p.hint")).toContainText("under its own heading");

  await expect(page.locator('label[for="includeShareCapitalNote"]')).toHaveText(
    "Schedule 1 paragraph 47: Add a note on the shares allotted",
  );
  await expect(page.locator("#includeShareCapitalNote-hint")).toContainText("The note states the number of shares");
  await expect(page.locator("#includeShareCapitalNote-hint a")).toHaveAttribute(
    "href",
    "https://www.legislation.gov.uk/uksi/2008/409/schedule/1/paragraph/47",
  );
  await page.locator("#includeShareCapitalNote").check();
  await expect(page.locator('label[for="shareCapitalClass"]')).toHaveText("Companies Act section 629: Share class");
  await expect(page.locator('label[for="shareCapitalNominalValue"]')).toContainText("Companies Act section 542");

  await expect(page.locator('label[for="directorsAdvanceName"]')).toHaveText(
    "Companies Act section 413: Director who owes the company money",
  );
  await expect(page.locator("#directorsAdvanceName-hint a")).toHaveAttribute(
    "href",
    "https://www.legislation.gov.uk/ukpga/2006/46/section/413",
  );
  await shoot(page, page.locator("#includeShareCapitalNote"), "small-share-capital");
  await page.locator("#morePolicies summary").click();
  await shoot(page, page.locator("#goingConcernStatement"), "small-policies");
});

test("an advance row added on the small company page carries the reference and the note with its own ids", async ({ page }) => {
  await openPage(page, "fileSmallCompanyAccounts");
  await page.evaluate(() => {
    // eslint-disable-next-line no-undef -- the page's own step
    addDirectorsAdvanceRow();
  });
  await expect(page.locator('label[for="directorsAdvanceName-2"]')).toHaveText(
    "Companies Act section 413: Director who owes the company money",
  );
  await expect(page.locator("#directorsAdvanceName-2")).toHaveAttribute("aria-describedby", /directorsAdvanceName-hint-2/);
  await expect(page.locator("#directorsAdvanceName-hint-2 a")).toHaveCount(1);
});

test("the Welsh pages lead the labels with the reference in Welsh and mark the links as English", async ({ page }) => {
  await openPage(page, "fileMicroEntityAccounts", { welsh: true });
  await expect(page.locator('label[for="dormant"]')).toHaveText(/^Deddf Cwmnïau adran 1169: /);
  await expect(page.locator("#dormant-hint .lang-mark")).toHaveText("(yn Saesneg)");
  await page.locator("#dormant").check();
  await expect(page.locator("#shareClass-hint")).toContainText("yr un fath ym mhob ffordd");
  await shoot(page, page.locator("#dormant"), "micro-dormant-cy");
});
