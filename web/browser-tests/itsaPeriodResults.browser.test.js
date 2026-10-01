// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaPeriodResults.browser.test.js
// Browser tests for the figures on the ITSA period view and period list pages

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveHmrcFieldTableAssets, expectCleanFigures } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

async function loadPage(page, fileName) {
  const html = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa", fileName), "utf-8");
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveHmrcFieldTableAssets(page);
  const stubs = `<body><script>
window.showStatus = function(){}; window.hideStatus = function(){}; window.showLoading = function(){}; window.hideLoading = function(){};
window.generateRandomState = function(){ return "s"; }; window.getGovClientHeaders = function(){ return Promise.resolve({}); };
</script>`;
  await page.setContent(html.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">').replace("<body>", stubs), {
    url: `http://localhost:3000/hmrc/itsa/${fileName}`,
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.HmrcFieldTable && window.formatGbp);
}

function amountOf(page, container, field) {
  return page.locator(`${container} tr[data-hmrc-field="${field}"] td.field-amount`);
}

test.describe("ITSA period results", () => {
  test("self-employment period view shows sterling amounts and dashes for absent figures", async ({ page }) => {
    await loadPage(page, "selfEmploymentPeriodView.html");
    await page.evaluate(() =>
      window.displayPeriod({
        periodDates: { periodStartDate: "2023-04-06", periodEndDate: "2023-07-05" },
        periodIncome: { turnover: 12430.43 },
        periodExpenses: { costOfGoods: 430 },
      }),
    );
    await expect(amountOf(page, "#periodDetails", "turnover")).toHaveText("£12,430.43");
    await expect(amountOf(page, "#periodDetails", "costOfGoods")).toHaveText("£430.00");
    await expect(amountOf(page, "#periodDetails", "other")).toHaveText("—");
    await expect(amountOf(page, "#periodDetails", "periodStartDate")).toHaveText("6 April 2023");
    expectCleanFigures(expect, (await page.locator("#periodDetails th, #periodDetails td").allInnerTexts()).join(" "));
    expect(await amountOf(page, "#periodDetails", "turnover").evaluate((el) => getComputedStyle(el).textAlign)).toBe("right");
  });

  test("UK property period view shows sterling amounts for a period and for a cumulative total", async ({ page }) => {
    await loadPage(page, "ukPropertyPeriodView.html");
    await page.evaluate(() =>
      window.displayPeriod({
        fromDate: "2023-04-06",
        toDate: "2023-07-05",
        ukNonFhlProperty: { income: { periodAmount: 5000.5, otherIncome: 250 }, expenses: { repairsAndMaintenance: 1200 } },
      }),
    );
    await expect(amountOf(page, "#periodDetails", "periodAmount")).toHaveText("£5,000.50");
    await expect(amountOf(page, "#periodDetails", "repairsAndMaintenance")).toHaveText("£1,200.00");
    await expect(amountOf(page, "#periodDetails", "other")).toHaveText("—");
    await expect(amountOf(page, "#periodDetails", "propertyType")).toHaveText("UK property");
    expectCleanFigures(expect, (await page.locator("#periodDetails th, #periodDetails td").allInnerTexts()).join(" "));

    await page.evaluate(() =>
      window.displayPeriod({
        toDate: "2026-01-05",
        ukProperty: { income: { periodAmount: 9000 }, expenses: { consolidatedExpenses: 100 } },
      }),
    );
    await expect(amountOf(page, "#periodDetails", "toDate")).toHaveText("5 January 2026");
    await expect(amountOf(page, "#periodDetails", "periodAmount")).toHaveText("£9,000.00");
    await expect(amountOf(page, "#periodDetails", "other")).toHaveText("£100.00");
    await expect(amountOf(page, "#periodDetails", "otherIncome")).toHaveText("—");
  });

  test("self-employment period list right-aligns money columns in the current total", async ({ page }) => {
    await loadPage(page, "selfEmploymentPeriods.html");
    await page.evaluate(() => {
      window.displayCurrentTotal({ periodDates: { periodEndDate: "2026-01-05" }, periodIncome: { turnover: 1234.5 }, periodExpenses: {} });
    });
    const cells = page.locator("#periodsTable tbody td");
    await expect(cells.nth(0)).toHaveText("5 January 2026");
    await expect(cells.nth(1)).toHaveText("£1,234.50");
    await expect(cells.nth(2)).toHaveText("—");
    await expect(cells.nth(3)).toHaveText("—");
    expect(await cells.nth(1).evaluate((el) => getComputedStyle(el).textAlign)).toBe("right");
    expect(
      await page
        .locator("#periodsTable thead th")
        .nth(1)
        .evaluate((el) => getComputedStyle(el).textAlign),
    ).toBe("right");

    await page.evaluate(() =>
      window.displayPeriods([{ periodId: "2023-04-06_2023-07-05", periodStartDate: "2023-04-06", periodEndDate: "2023-07-05" }]),
    );
    await expect(page.locator("#periodsTable tbody td").nth(1)).toHaveText("6 April 2023");
  });

  test("UK property period list right-aligns money columns in the current total", async ({ page }) => {
    await loadPage(page, "ukPropertyPeriods.html");
    await page.evaluate(() => {
      window.displayCurrentTotal({
        toDate: "2026-01-05",
        ukProperty: { income: { periodAmount: 7000 }, expenses: { repairsAndMaintenance: 80.25 } },
      });
    });
    const cells = page.locator("#periodsTable tbody td");
    await expect(cells.nth(0)).toHaveText("5 January 2026");
    await expect(cells.nth(1)).toHaveText("£7,000.00");
    await expect(cells.nth(2)).toHaveText("—");
    await expect(cells.nth(3)).toHaveText("£80.25");
    expect(await cells.nth(3).evaluate((el) => getComputedStyle(el).textAlign)).toBe("right");
  });
});
