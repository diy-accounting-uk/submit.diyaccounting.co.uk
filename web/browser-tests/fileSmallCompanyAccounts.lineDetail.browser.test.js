// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileSmallCompanyAccounts.lineDetail.browser.test.js
// Each line of the small company accounts leads with its format item and carries its note and the
// "In DIY Accounting's spreadsheets" disclosure; a profit and loss line both formats share takes the
// item of the format chosen.

import { test, expect } from "@playwright/test";
import { DATES, longDate, lookUpCompany, serveAccountsSite } from "./accountsLinesSite.js";

const lineHeading = (page, id) => page.locator("tr", { has: page.locator(`#${id}`) }).locator("th");

test.describe("File small company accounts page - each line's format item, note and spreadsheet cells", () => {
  test("a balance sheet line leads with its item and opens its cells; a part of a line keeps its Of which", async ({ page }) => {
    await serveAccountsSite(page);
    await lookUpCompany(page, "fileSmallCompanyAccounts", "SC000001");
    const stocks = lineHeading(page, "currentStocks");
    await expect(stocks.locator(".line-label")).toHaveText("Balance sheet item C.I: Stocks");
    await expect(page.locator("#lineStocks-hint")).toContainText("Goods held for sale");
    const disclosure = page.locator("#lineStocks-source");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await disclosure.locator("summary").click();
    await expect(disclosure.locator("dl")).toContainText("E10");
    await expect(disclosure).toContainText('The spreadsheet calls this "Stock at cost".');
    await expect(disclosure.locator("img").first()).toHaveAttribute("src", "/images/ct600-sources/PubBalSht-E10.webp");
    await expect(lineHeading(page, "currentTradeDebtors").locator(".line-label")).toHaveText(
      "Balance sheet item C.II.1: Of which, trade debtors",
    );
    await expect(page.locator("#lineOtherCreditors-source")).toContainText("The spreadsheets have no cell for this.");
  });

  test("last year's table names its lines without a second disclosure and says where its figures came from", async ({ page }) => {
    await serveAccountsSite(page);
    await lookUpCompany(page, "fileSmallCompanyAccounts", "SC000001");
    await expect(page.locator("#priorStocks")).toHaveValue("600");
    await expect(lineHeading(page, "priorStocks").locator(".line-label")).toHaveText("Balance sheet item C.I: Stocks");
    await expect(page.locator("tr", { has: page.locator("#priorStocks") }).locator("+ tr.ledger__detail")).toHaveCount(0);
    await expect(page.locator(".prior-year-source").first()).toHaveText(
      `Last year's figures: from the accounts filed at Companies House for the year to ${longDate(DATES.filed.end)}.`,
    );
  });

  test("a profit and loss line both formats share takes the item of the format chosen", async ({ page }) => {
    await serveAccountsSite(page);
    await lookUpCompany(page, "fileSmallCompanyAccounts", "SC000001");
    const interest = lineHeading(page, "currentInterestReceivable").locator(".line-label");
    await expect(interest).toHaveText("Profit and loss item 10: Other interest receivable and similar income");
    await expect(page.locator("tr.ledger__detail", { has: page.locator("#lineOtherExternalCharges-hint") })).toBeHidden();
    await page.locator("#profitAndLossFormat2").check();
    await expect(interest).toHaveText("Profit and loss item 12: Other interest receivable and similar income");
    await expect(page.locator("tr.ledger__detail", { has: page.locator("#lineOtherExternalCharges-hint") })).toBeVisible();
    await expect(lineHeading(page, "currentOtherExternalCharges").locator(".line-label")).toHaveText(
      "Profit and loss item 5(b): Other external charges",
    );
  });
});
