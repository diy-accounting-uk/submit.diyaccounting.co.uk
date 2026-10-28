// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/foreignPropertyAdjustments.browser.test.js
// The foreign property year-end page: the trigger, the summary for each country or property, and
// the adjustment request. The HMRC calls are stubbed; the page, its field tables and its styles
// are the real ones.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  serveCarriedIdentifiers,
  serveFormErrors,
  serveHmrcFieldTableAssets,
  serveItsaPageScripts,
  serveMoneyInput,
  serveSiteStyles,
} from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/foreign-property-adjustments");

const FIGURES = {
  totalIncome: 10000,
  income: { totalRentsReceived: 9000, premiumsOfLeaseGrant: 0, otherPropertyIncome: 1000 },
  totalExpenses: 1000,
  expenses: { premisesRunningCosts: 500, repairsAndMaintenance: 500 },
  netProfit: 9000,
  totalDeductions: 4000,
  deductions: { costOfReplacingDomesticItems: 1000, otherCapitalAllowance: 3000 },
  taxableProfit: 5000,
};

const COUNTRY_SUMMARY = {
  metadata: { calculationId: "c1", summaryStatus: "valid" },
  adjustableSummaryCalculation: {
    ...FIGURES,
    countryLevelDetail: [
      { countryCode: "FRA", ...FIGURES },
      { countryCode: "ESP", ...FIGURES, totalIncome: 2000, income: { totalRentsReceived: 2000 }, expenses: { consolidatedExpenses: 300 } },
    ],
  },
};

const PROPERTY_SUMMARY = {
  metadata: { calculationId: "c1", summaryStatus: "valid" },
  adjustableSummaryCalculation: {
    ...FIGURES,
    countryLevelDetail: [{ countryCode: "FRA", ...FIGURES, propertyLevelDetail: [{ propertyId: "FP1", ...FIGURES }] }],
  },
};

const STUBS = `
window.__sent = [];
window.__summary = null;
window.__obligations = [];
window.showStatus = function(){}; window.hideStatus = function(){}; window.showLoading = function(){}; window.hideLoading = function(){};
window.generateRandomState = function(){ return "s"; };
window.getGovClientHeaders = function(){ return Promise.resolve({}); };
window.resolveSyntheticTestScenario = function(explicit, account, fallback){ return explicit || (account === "synthetic" ? fallback : null); };
window.getObligations = function(nino, token, headers, fpv, scenario, query){
  window.__sent.push({ call: "obligations", query: query });
  return Promise.resolve({ obligations: window.__obligations });
};
window.triggerBsas = function(details){
  window.__sent.push({ call: "trigger", details: details });
  return Promise.resolve({ calculationId: "c1" });
};
window.getBsasForeignProperty = function(nino, calculationId, taxYear, token, headers, fpv, scenario){
  window.__sent.push({ call: "retrieve", calculationId: calculationId, taxYear: taxYear, scenario: scenario });
  return Promise.resolve(window.__summary);
};
window.adjustBsasForeignProperty = function(details){
  window.__sent.push({ call: "adjust", details: details });
  return Promise.resolve({});
};
`;

async function openPage(page, { summary, obligations = [], synthetic = false }) {
  const fileName = "foreignPropertyAdjustments.html";
  const url = `http://localhost:3000/hmrc/itsa/${fileName}`;
  await page.addInitScript(
    ({ synthetic }) => {
      sessionStorage.setItem("hmrcAccessToken", "token");
      if (synthetic) sessionStorage.setItem("hmrcAccount", "synthetic");
    },
    { synthetic },
  );
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveCarriedIdentifiers(page);
  await serveItsaPageScripts(page);
  await serveHmrcFieldTableAssets(page);
  await serveMoneyInput(page);
  await serveFormErrors(page);
  await serveSiteStyles(page);
  const html = fs
    .readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa", fileName), "utf-8")
    .replace("<head>", `<head><base href="${new URL(".", url)}">`)
    .replace(
      "<body>",
      `<body><script>${STUBS}\nwindow.__summary = ${JSON.stringify(summary)}; window.__obligations = ${JSON.stringify(obligations)};</script>`,
    );
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(url, { waitUntil: "load" });
}

async function trigger(page, taxYear) {
  await page.locator("#nino").fill("QQ123456C");
  await page.locator("#businessId").fill("XAIS12345678910");
  await page.locator("#taxYear").selectOption(taxYear);
  await page.locator("#accountingPeriodStartDate").fill(`${taxYear.slice(0, 4)}-04-06`);
  await page.locator("#accountingPeriodEndDate").fill(`${Number(taxYear.slice(0, 4)) + 1}-04-05`);
  await page.locator("#triggerBtn").click();
  await expect(page.locator("#summaryContainer")).toBeVisible();
}

const sentCalls = (page, call) => page.evaluate((name) => window.__sent.filter((sent) => sent.call === name), call);

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${scheme}-${width}.png`), fullPage: true });
    }
  }
}

test.describe("foreign property year-end adjustments", () => {
  test("triggers a foreign-property summary and shows the figures for each country", async ({ page }) => {
    await openPage(page, { summary: COUNTRY_SUMMARY, synthetic: true });
    await trigger(page, "2025-26");

    const [{ details }] = await sentCalls(page, "trigger");
    expect(details).toEqual({
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      accountingPeriodStartDate: "2025-04-06",
      accountingPeriodEndDate: "2026-04-05",
      typeOfBusiness: "foreign-property",
    });
    expect((await sentCalls(page, "retrieve"))[0].scenario).toBe("FOREIGN_PROPERTY_PROFIT");
    await expect(page.locator(".foreign-summary-entry h4")).toHaveText(["France", "Spain"]);
    await expect(page.locator("#summary-entry-1 [data-hmrc-field='income.totalRentsReceived'] .field-amount")).toHaveText("£9,000.00");
    await expect(page.locator("#summary-entry-2 [data-hmrc-field='expenses.consolidatedExpenses']")).toBeVisible();
    await expect(page.locator("#summary-entry-2 [data-hmrc-field='expenses.repairsAndMaintenance']")).toHaveCount(0);
    expect(await page.locator("#summaryContainer").innerText()).not.toMatch(/NaN|undefined/);
    await shoot(page, "adjustments-summary");
  });

  test("sends the figures typed for each country under its country code", async ({ page }) => {
    await openPage(page, { summary: COUNTRY_SUMMARY });
    await trigger(page, "2025-26");
    await page.locator("#adjust-1-totalRentsReceived").fill("8500");
    await page.locator("#adjust-1-expenses").evaluate((node) => (node.open = true));
    await page.locator("#adjust-1-repairsAndMaintenance").fill("450.5");
    await page.locator("#adjust-2-expenses").evaluate((node) => (node.open = true));
    await page.locator("#adjust-2-consolidatedExpenses").fill("320");
    await shoot(page, "adjustments-form");
    await page.locator("#submitAdjustmentBtn").click();

    await expect.poll(async () => (await sentCalls(page, "adjust")).length).toBe(1);
    const [{ details }] = await sentCalls(page, "adjust");
    expect(details).toEqual({
      nino: "QQ123456C",
      calculationId: "c1",
      taxYear: "2025-26",
      zeroAdjustments: false,
      foreignProperty: [
        { countryCode: "FRA", income: { totalRentsReceived: 8500 }, expenses: { repairsAndMaintenance: 450.5 } },
        { countryCode: "ESP", expenses: { consolidatedExpenses: 320 } },
      ],
    });
    await expect(page.locator("#adjustmentResults")).toBeVisible();
  });

  test("sends zero adjustments alone", async ({ page }) => {
    await openPage(page, { summary: COUNTRY_SUMMARY });
    await trigger(page, "2025-26");
    await page.locator("#zeroAdjustmentsBtn").click();

    await expect.poll(async () => (await sentCalls(page, "adjust")).length).toBe(1);
    const [{ details }] = await sentCalls(page, "adjust");
    expect(details).toEqual({ nino: "QQ123456C", calculationId: "c1", taxYear: "2025-26", zeroAdjustments: true });
  });

  test("refuses an entry with one total and itemised expenses together, and an empty adjustment", async ({ page }) => {
    await openPage(page, { summary: COUNTRY_SUMMARY });
    await trigger(page, "2025-26");
    await page.locator("#submitAdjustmentBtn").click();
    await expect(page.locator("#form-error-summary")).toContainText("Enter at least one adjustment, or choose Nothing to adjust");

    await page.locator("#adjust-1-expenses").evaluate((node) => (node.open = true));
    await page.locator("#adjust-1-travelCosts").fill("10");
    await page.locator("#adjust-1-consolidatedExpenses").fill("20");
    await page.locator("#submitAdjustmentBtn").click();
    await expect(page.locator("#form-error-summary")).toContainText(
      "France: enter either the total expenses or the itemised expenses, not both",
    );
    expect((await sentCalls(page, "adjust")).length).toBe(0);
  });

  test("adjusts each property from 2026-27 under its property id", async ({ page }) => {
    await openPage(page, { summary: PROPERTY_SUMMARY });
    await trigger(page, "2026-27");
    await expect(page.locator(".foreign-summary-entry h4")).toHaveText(["Property FP1 (France)"]);
    await page.locator("#adjust-1-otherPropertyIncome").fill("5");
    await page.locator("#submitAdjustmentBtn").click();

    await expect.poll(async () => (await sentCalls(page, "adjust")).length).toBe(1);
    const [{ details }] = await sentCalls(page, "adjust");
    expect(details.foreignProperty).toEqual([{ propertyId: "FP1", income: { otherPropertyIncome: 5 } }]);
  });

  test("does not trigger while a quarterly obligation is open", async ({ page }) => {
    await openPage(page, { summary: COUNTRY_SUMMARY, obligations: [{ status: "open" }] });
    await page.locator("#nino").fill("QQ123456C");
    await page.locator("#businessId").fill("XAIS12345678910");
    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#accountingPeriodStartDate").fill("2025-04-06");
    await page.locator("#accountingPeriodEndDate").fill("2026-04-05");
    await page.locator("#triggerBtn").click();

    await expect(page.locator("#obligationsWarning")).toContainText("1 quarterly obligation(s)");
    expect((await sentCalls(page, "obligations"))[0].query.typeOfBusiness).toBe("foreign-property");
    expect((await sentCalls(page, "trigger")).length).toBe(0);
  });

  test("says so when HMRC returns no entry to adjust", async ({ page }) => {
    await openPage(page, { summary: { adjustableSummaryCalculation: { totalIncome: 0 } } });
    await trigger(page, "2025-26");
    await expect(page.locator("#adjustEntries")).toContainText("HMRC returned no country or property to adjust");
  });
});
