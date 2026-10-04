// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileSmallCompanyAccounts.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PAGE_PATH = "companies-house/fileSmallCompanyAccounts.html";

async function openFormView(page) {
  const url = `http://localhost:3000/${PAGE_PATH}`;
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveMoneyInput(page);
  const html = fs.readFileSync(path.join(process.cwd(), "web/public", PAGE_PATH), "utf-8");
  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    company = { companyNumber: "00000001", companyName: "TEST SMALL LTD" };
    showView("formView");
  });
}

const CURRENT_BALANCE_SHEET = {
  FixedAssets: "1000",
  Stocks: "500",
  Debtors: "2500",
  CashAtBank: "2000",
  TradeCreditors: "1000",
  CorporationTax: "700",
  OtherCreditors: "300",
  CreditorsAfterOneYear: "0",
  CalledUpShareCapital: "100",
  ProfitAndLossAccount: "3900",
};

const CURRENT_PROFIT_AND_LOSS = {
  Turnover: "20000",
  CostOfSales: "5000",
  AdministrativeExpenses: "12000",
  InterestReceivable: "0",
  Tax: "600",
};

async function fillCurrentYear(page) {
  for (const [field, value] of Object.entries({ ...CURRENT_BALANCE_SHEET, ...CURRENT_PROFIT_AND_LOSS })) {
    await page.fill(`#current${field}`, value);
  }
}

test.describe("File small company accounts page", () => {
  test("the comparative and fixed asset note sections stay hidden until chosen", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#comparativeFields")).toBeHidden();
    await expect(page.locator("#fixedAssetNoteFields")).toBeHidden();
    await page.check("#includeComparatives");
    await expect(page.locator("#comparativeFields")).toBeVisible();
    await page.check("#includeFixedAssetNote");
    await expect(page.locator("#fixedAssetNoteFields")).toBeVisible();
    await page.uncheck("#includeComparatives");
    await expect(page.locator("#comparativeFields")).toBeHidden();
  });

  test("the profit and loss subtotals and the balance sheet check follow what is typed", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await expect(page.locator("#currentProfitAndLossTotals")).toContainText("Gross profit: 15000");
    await expect(page.locator("#currentProfitAndLossTotals")).toContainText("Operating profit: 3000");
    await expect(page.locator("#currentProfitAndLossTotals")).toContainText("Profit for the year: 2400");
    await expect(page.locator("#currentBalanceSheetTotals")).toContainText("Net assets: 4000. Matches");
    await page.fill("#currentProfitAndLossAccount", "3000");
    await expect(page.locator("#currentBalanceSheetTotals")).toContainText("Does not match");
  });

  test("the request is full accounts with no comparatives and no fixed asset note by default", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.fill("#principalActivity", "Software consultancy");
    await page.fill("#accountingPolicies", "Historical cost convention.");
    await page.fill("#directors", "Jo Director\nAlex Jones\n");
    const payload = await page.evaluate(() => buildAccountsPayload());
    expect(payload.smallCompany.filleted).toBe(false);
    expect(payload.smallCompany.directors).toEqual(["Jo Director", "Alex Jones"]);
    expect(payload.smallCompany.balanceSheet.priorYear).toBeUndefined();
    expect(payload.smallCompany.profitAndLoss.priorYear).toBeUndefined();
    expect(payload.smallCompany.fixedAssetNote).toBeUndefined();
    expect(payload.smallCompany.profitAndLoss.currentYear).toMatchObject({ grossProfit: 15000, operatingProfit: 3000, profit: 2400 });
    expect(payload.smallCompany.balanceSheet.currentYear.capitalAndReserves).toBe(4000);
  });

  test("choosing the filleted copy, comparatives and a fixed asset class changes the request", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.check("#copyFilleted");
    await page.check("#includeComparatives");
    await page.fill("#priorTurnover", "10000");
    await page.fill("#priorCostOfSales", "4000");
    await page.fill("#priorAdministrativeExpenses", "5000");
    await page.check("#includeFixedAssetNote");
    await page.fill("#noteComputerEquipmentCostAtStart", "1500");
    await page.fill("#noteComputerEquipmentDepreciationAtStart", "500");
    const payload = await page.evaluate(() => buildAccountsPayload());
    expect(payload.smallCompany.filleted).toBe(true);
    expect(payload.smallCompany.profitAndLoss.priorYear).toMatchObject({ turnover: 10000, grossProfit: 6000, operatingProfit: 1000 });
    expect(payload.smallCompany.balanceSheet.priorYear).toBeDefined();
    expect(Object.keys(payload.smallCompany.fixedAssetNote)).toEqual(["computerEquipment"]);
    await expect(page.locator("#fixedAssetNoteTotals")).toContainText("Net book value: 1000. Matches fixed assets");
  });

  test("the form refuses a fixed asset note that does not match the fixed assets", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYear(page);
    await page.check("#includeFixedAssetNote");
    await page.fill("#noteLandBuildingsCostAtStart", "999");
    const problem = await page.evaluate(() => formProblem());
    expect(problem).toContain("net book value must equal the fixed assets");
  });

  test("the pounds boxes carry the money markup", async ({ page }) => {
    await openFormView(page);
    const report = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input[data-money]")).map((input) => ({
        id: input.id,
        prefix: input.parentElement.querySelector(".prefix")?.textContent,
        hint: document.getElementById(input.getAttribute("aria-describedby"))?.textContent,
      })),
    );
    expect(report.length).toBeGreaterThan(50);
    for (const entry of report) {
      expect(entry.prefix, entry.id).toBe("£");
      expect(entry.hint, entry.id).toContain("For example");
    }
  });
});
