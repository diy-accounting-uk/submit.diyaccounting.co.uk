// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.lineDetail.browser.test.js
// Each line of the micro-entity accounts leads with its format item and carries its note and the
// "In DIY Accounting's spreadsheets" disclosure; last year's column says where it came from.

import { test, expect } from "@playwright/test";
import { DATES, longDate, lookUpCompany, serveAccountsSite } from "./accountsLinesSite.js";

const lineRow = (page, field) => page.locator("tr", { has: page.locator(`#current${field}`) });

test.describe("File micro-entity accounts page - each line's format item, note and spreadsheet cells", () => {
  test("a line leads with its format item, its note links the Regulations, and its cells open from a closed disclosure", async ({
    page,
  }) => {
    await serveAccountsSite(page);
    await lookUpCompany(page, "fileMicroEntityAccounts", "00000001");
    const heading = lineRow(page, "CreditorsWithinOneYear").locator("th");
    await expect(heading.locator(".line-label")).toHaveText("Balance sheet item E: Creditors: amounts falling due within one year");
    await expect(heading.locator("#lineCreditorsWithinOneYear-hint a")).toHaveAttribute(
      "href",
      "https://www.legislation.gov.uk/uksi/2008/409/schedule/1/part/1",
    );
    const disclosure = heading.locator("#lineCreditorsWithinOneYear-source");
    await expect(disclosure.locator("summary")).toHaveText("In DIY Accounting's spreadsheets");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await disclosure.locator("summary").click();
    await expect(disclosure.locator("dl")).toContainText("PubBalSht");
    await expect(disclosure.locator("dl")).toContainText("E20");
    await expect(disclosure.locator("dl")).toContainText("A20");
    await expect(disclosure.locator("img").first()).toHaveAttribute("src", "/images/ct600-sources/PubBalSht-E20.webp");
    await expect
      .poll(
        () =>
          disclosure
            .locator("img")
            .first()
            .evaluate((image) => image.complete && image.naturalWidth),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    await expect(lineRow(page, "CreditorsWithinOneYear").locator("details")).toHaveCount(1);
  });

  test("a line only this page has keeps its optional mark and has no workbook place to show", async ({ page }) => {
    await serveAccountsSite(page);
    await lookUpCompany(page, "fileMicroEntityAccounts", "00000001");
    const heading = lineRow(page, "PrepaymentsAccruedIncome").locator("th");
    await expect(heading.locator(".line-label")).toHaveText("Balance sheet item D: Prepayments and accrued income (optional)");
    await expect(heading.locator("#linePrepaymentsAccruedIncome-source")).toContainText("The spreadsheets have no cell for this.");
    await expect(lineRow(page, "CapitalAndReserves").locator(".line-label")).toHaveText("Balance sheet item K: Capital and reserves");
  });

  test("last year's column says it came from the accounts filed at Companies House, and the lines left at 0 keep their names", async ({
    page,
  }) => {
    await serveAccountsSite(page);
    await lookUpCompany(page, "fileMicroEntityAccounts", "00000001");
    await expect(page.locator("#priorFixedAssets")).toHaveValue("10000");
    await expect(page.locator(".prior-year-source")).toHaveText(
      `Last year's figures: from the accounts filed at Companies House for the year to ${longDate(DATES.filed.end)}.`,
    );
    await expect(page.locator("#priorYearNote")).toContainText(
      "Left at 0, with no figure in those accounts: Called up share capital not paid,",
    );
  });

  test("the Welsh page leads each line with its format item in Welsh", async ({ page }) => {
    await serveAccountsSite(page);
    await lookUpCompany(page, "fileMicroEntityAccounts", "00000001", { welsh: true });
    await expect(lineRow(page, "CapitalAndReserves").locator(".line-label")).toHaveText(
      "Eitem K y fantolen: Cyfalaf a chronfeydd wrth gefn",
    );
    await expect(lineRow(page, "FixedAssets").locator("summary")).toHaveText("Yn nhaenlenni DIY Accounting");
  });
});
