// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaSubmissionRecords.browser.test.js
// Browser tests for the Income Tax annual submissions and period summaries shown as submission
// records: the two annual pages after a save, and the two period views.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveSiteStyles, screenshotPath, serveItsaPageScripts, serveCarriedIdentifiers } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

async function loadPage(page, fileName) {
  const html = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa", fileName), "utf-8");
  const url = `http://localhost:3000/hmrc/itsa/${fileName}`;
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveItsaPageScripts(page);
  await serveCarriedIdentifiers(page);
  await serveSiteStyles(page);
  const stubs = `<body><script>
window.showStatus = function(){}; window.hideStatus = function(){}; window.showLoading = function(){}; window.hideLoading = function(){};
window.generateRandomState = function(){ return "s"; }; window.getGovClientHeaders = function(){ return Promise.resolve({}); };
</script>`;
  await page.route(url, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: html.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">').replace("<body>", stubs),
    });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.CarriedIdentifiers !== "undefined");
}

function recordShot(name, width) {
  return screenshotPath(`itsa-record-${name}-${width}`).replace("-1280.png", ".png");
}

async function expectNoPageOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const SE_SENT = {
  nino: "AB123456C",
  businessId: "XAIS12345678910",
  taxYear: "2024-25",
  adjustments: { basisAdjustment: 250.5, balancingChargeOther: 1234 },
  allowances: { tradingIncomeAllowance: 1000 },
  nonFinancials: { class4NicsExemptionReason: "over-state-pension-age" },
};

const UK_SENT = {
  nino: "AB123456C",
  businessId: "XAIS12345678911",
  taxYear: "2024-25",
  adjustments: { balancingCharge: 500, nonResidentLandlord: false, rentARoom: { jointlyLet: true } },
  allowances: { annualInvestmentAllowance: 3000, zeroEmissionsCarAllowance: 750.25 },
};

const FOREIGN_PERIOD = {
  fromDate: "2024-04-06",
  toDate: "2024-07-05",
  foreignFhlEea: { income: { rentAmount: 200.22 }, expenses: { consolidatedExpenses: 80 } },
  foreignNonFhlProperty: [
    {
      countryCode: "FRA",
      income: { rentIncome: { rentAmount: 440.31 }, foreignTaxCreditRelief: false, otherPropertyIncome: 12 },
      expenses: { premisesRunningCosts: 100.25, other: 3 },
    },
    {
      countryCode: "JEY",
      income: { rentIncome: { rentAmount: 90 }, foreignTaxCreditRelief: true },
      expenses: { consolidatedExpenses: 800 },
    },
  ],
};

test.describe("ITSA annual submission saved as a record", () => {
  for (const [fileName, kind, sent, expected] of [
    [
      "annualSubmission.html",
      "self-employment",
      SE_SENT,
      ["Self-employment annual submission", "Basis period adjustment", "Over State Pension age"],
    ],
    ["ukPropertyAnnualSubmission.html", "uk-property", UK_SENT, ["UK property annual submission", "Rent a room: jointly let", "Yes"]],
  ]) {
    test(`${fileName} shows what was sent, the business and the date`, async ({ page }) => {
      await loadPage(page, fileName);
      for (const [width, height] of [
        [1280, 1000],
        [390, 900],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          async ([k, details]) => {
            document.getElementById("annualEditForm").style.display = "none";
            await window.showSavedRecord(k, details);
          },
          [kind, sent],
        );
        const results = page.locator("#annualSubmissionResults");
        await expect(results).toBeVisible();
        const head = page.locator(".customer-copy-header");
        await expect(head).toContainText(sent.businessId);
        await expect(head).toContainText("Accepted by HMRC");
        await expect(head).toContainText(/\d{1,2} \w+ \d{4} at \d{2}:\d{2}/);
        const text = await results.innerText();
        for (const fragment of expected) expect(text).toContain(fragment);
        expect(text).toContain("National Insurance number AB 12 34 56 C");
        expect(text).toContain("Tax year 2024-25");
        expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
        await expectNoPageOverflow(page);
        await page.screenshot({ path: recordShot(fileName.replace(".html", ""), width), fullPage: true });
      }
      await expect(page.locator("#newSearchBtn")).toBeVisible();
    });
  }

  test("figures print with pence and thousands separators and a deduction-free layout", async ({ page }) => {
    await loadPage(page, "annualSubmission.html");
    await page.evaluate((details) => window.showSavedRecord("self-employment", details), SE_SENT);
    await expect(page.locator("#annual-adjustments-basisAdjustment")).toHaveText("250.50");
    await expect(page.locator("#annual-adjustments-balancingChargeOther")).toHaveText("1,234.00");
    await expect(page.locator("#annual-allowances-tradingIncomeAllowance")).toHaveText("1,000.00");
  });

  test("a value HMRC accepted in an unexpected shape prints a dash and the page prints no raw text", async ({ page }) => {
    await loadPage(page, "annualSubmission.html");
    await page.evaluate(() =>
      window.showSavedRecord("self-employment", {
        nino: null,
        businessId: undefined,
        taxYear: "2024-25",
        adjustments: { basisAdjustment: "12", accountingAdjustment: NaN, outstandingBusinessIncome: null },
        allowances: undefined,
        nonFinancials: {},
      }),
    );
    for (const field of ["basisAdjustment", "accountingAdjustment", "outstandingBusinessIncome"]) {
      await expect(page.locator(`#annual-adjustments-${field}`)).toHaveText(/^(12|—)$/);
    }
    await expect(page.locator("#annual-adjustments-accountingAdjustment")).toHaveText("—");
    await expect(page.locator("#annual-adjustments-outstandingBusinessIncome")).toHaveText("—");
    const text = await page.locator("#annualSubmissionResults").innerText();
    expect(text).toContain("You sent no allowances for this year.");
    expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
  });
});

const SE_PERIOD = {
  periodDates: { periodStartDate: "2023-04-06", periodEndDate: "2023-07-05" },
  periodIncome: { turnover: 12430.43 },
  periodExpenses: { costOfGoods: 430, adminCosts: 25.5 },
};

const UK_PERIOD = {
  fromDate: "2023-04-06",
  toDate: "2023-07-05",
  ukNonFhlProperty: { income: { periodAmount: 5000.5, otherIncome: 250 }, expenses: { repairsAndMaintenance: 1200, other: 3 } },
};

const UK_CUMULATIVE = {
  toDate: "2026-01-05",
  ukProperty: { income: { periodAmount: 9000 }, expenses: { consolidatedExpenses: 100 } },
};

test.describe("ITSA period views shown as records", () => {
  test("self-employment period view shows the period, its figures and a dash for an absent one", async ({ page }) => {
    await loadPage(page, "selfEmploymentPeriodView.html");
    for (const [width, height] of [
      [1280, 1000],
      [390, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((period) => {
        document.getElementById("periodViewResults").style.display = "block";
        return window.displayPeriod(period, {
          nino: "AB123456C",
          businessId: "XAIS12345678910",
          taxYear: "2023-24",
          periodId: "2023-04-06_2023-07-05",
        });
      }, SE_PERIOD);
      await expect(page.locator("#period-income-turnover")).toHaveText("12,430.43");
      await expect(page.locator("#period-income-other")).toHaveText("—");
      await expect(page.locator("#period-expenses-costOfGoods")).toHaveText("430.00");
      await expect(page.locator("#period-expenses-adminCosts")).toHaveText("25.50");
      const head = page.locator(".customer-copy-header");
      await expect(head).toContainText("2023-04-06_2023-07-05");
      await expect(head).toContainText("Held by HMRC");
      const text = await page.locator("#periodDetails").innerText();
      expect(text).toContain("6 April 2023 to 5 July 2023");
      expect(text).toContain("Phone, fax, stationery and other office costs");
      expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
      await expectNoPageOverflow(page);
      await page.screenshot({ path: recordShot("selfEmploymentPeriodView", width), fullPage: true });
    }
  });

  test("a date or figure HMRC gives in an unexpected shape prints a dash, never a raw value", async ({ page }) => {
    await loadPage(page, "selfEmploymentPeriodView.html");
    await page.evaluate(() =>
      window.displayPeriod({
        periodDates: { periodStartDate: "2023-13-45", periodEndDate: { nested: true } },
        periodIncome: { turnover: "12" },
        periodExpenses: { costOfGoods: null },
      }),
    );
    await expect(page.locator("#period-income-turnover")).toHaveText("—");
    await expect(page.locator("#period-expenses-costOfGoods")).toHaveText("—");
    await page.evaluate(() => window.displayPeriod(null));
    const text = await page.locator("#periodDetails").innerText();
    expect(text).toContain("HMRC holds no expenses for this period.");
    expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
  });

  test("UK property period view shows a dated period and a cumulative total", async ({ page }) => {
    await loadPage(page, "ukPropertyPeriodView.html");
    for (const [width, height] of [
      [1280, 1000],
      [390, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((period) => {
        document.getElementById("periodViewResults").style.display = "block";
        return window.displayPeriod(period, {
          nino: "AB123456C",
          businessId: "XAIS12345678911",
          taxYear: "2023-24",
          submissionId: "4557ecb5-fd32-48cc-81f5-e6acd1099f3c",
        });
      }, UK_PERIOD);
      await expect(page.locator("#period-income-periodAmount")).toHaveText("5,000.50");
      await expect(page.locator("#period-expenses-repairsAndMaintenance")).toHaveText("1,200.00");
      await expect(page.locator("#period-expenses-other")).toHaveText("3.00");
      await expect(page.locator(".customer-copy-header")).toContainText("4557ecb5-fd32-48cc-81f5-e6acd1099f3c");
      await expect(page.locator("#periodDetails")).toContainText("Submission ID");
      await expectNoPageOverflow(page);
      await page.screenshot({ path: recordShot("ukPropertyPeriodView", width), fullPage: true });
    }

    await page.evaluate((period) => window.displayPeriod(period, { taxYear: "2025-26" }), UK_CUMULATIVE);
    const text = await page.locator("#periodDetails").innerText();
    expect(text).toContain("Year to 5 January 2026");
    expect(text).toContain("Year to date");
    await expect(page.locator("#period-income-periodAmount")).toHaveText("9,000.00");
    await expect(page.locator("#period-income-otherIncome")).toHaveText("—");
    await expect(page.locator("#period-expenses-consolidatedExpenses")).toHaveText("100.00");
    expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
  });

  test("foreign property period view shows one income and one expenses table for each entry", async ({ page }) => {
    await loadPage(page, "foreignPropertyPeriodView.html");
    for (const [width, height] of [
      [1280, 1000],
      [390, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((period) => {
        document.getElementById("periodViewResults").style.display = "block";
        return window.displayPeriod(period, {
          nino: "AB123456C",
          businessId: "XFIS12345678911",
          taxYear: "2024-25",
          submissionId: "2024-04-06_2024-07-05",
        });
      }, FOREIGN_PERIOD);
      const text = await page.locator("#periodDetails").innerText();
      expect(text).toContain("Foreign property quarterly update");
      expect(text).toContain("Furnished holiday lettings in the EEA: income");
      expect(text).toContain("France: income");
      expect(text).toContain("Jersey: expenses");
      await expect(page.locator("#period-fhl-income-rentAmount")).toHaveText("200.22");
      await expect(page.locator("#period-1-income-rentIncome-rentAmount")).toHaveText("440.31");
      await expect(page.locator("#period-1-income-foreignTaxCreditRelief")).toHaveText("No");
      await expect(page.locator("#period-1-expenses-premisesRunningCosts")).toHaveText("100.25");
      await expect(page.locator("#period-2-expenses-consolidatedExpenses")).toHaveText("800.00");
      expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
      await expectNoPageOverflow(page);
      await page.screenshot({ path: recordShot("foreignPropertyPeriodView", width), fullPage: true });
    }
  });

  test("UK property period view prints a dash for an income HMRC returns as text", async ({ page }) => {
    await loadPage(page, "ukPropertyPeriodView.html");
    await page.evaluate(() => window.displayPeriod({ fromDate: "yesterday", toDate: 20230705, ukNonFhlProperty: { income: "5000" } }));
    await expect(page.locator("#period-income-periodAmount")).toHaveText("—");
    expect(await page.locator("#periodDetails").innerText()).not.toMatch(/undefined|NaN|null|\[object/);
  });
});

const LOSSES_SENT = {
  nino: "AB123456C",
  businessId: "XBIS00000000001",
  taxYear: "2026-27",
  typeOfBusiness: "self-employment",
  losses: { broughtForwardLosses: 1500 },
  claims: {
    carrySideways: { currentYearGeneralIncome: 300 },
    carryBack: { previousYearGeneralIncome: 150.5 },
    preferenceOrder: { applyFirst: "carry-sideways" },
  },
};

test.describe("ITSA losses and claims saved as a record", () => {
  test("shows what was sent, the business, HMRC's reference and the date", async ({ page }) => {
    await loadPage(page, "lossesAndClaims.html");
    for (const [width, height] of [
      [1280, 1000],
      [390, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((details) => window.showSavedRecord(details, "7a1c-0042"), LOSSES_SENT);
      const results = page.locator("#lossesResults");
      await expect(results).toBeVisible();
      const head = page.locator(".customer-copy-header");
      await expect(head).toContainText("XBIS00000000001");
      await expect(results).toContainText("HMRC correlation ID 7a1c-0042");
      await expect(head).toContainText("Accepted by HMRC");
      await expect(head).toContainText(/\d{1,2} \w+ \d{4} at \d{2}:\d{2}/);
      const text = await results.innerText();
      for (const fragment of ["Self-employment losses and claims", "Tax year 2026-27", "Losses brought forward", "Carry sideways first"]) {
        expect(text).toContain(fragment);
      }
      expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
      await expectNoPageOverflow(page);
      await page.screenshot({ path: recordShot("lossesAndClaims", width), fullPage: true });
    }
    await expect(page.locator("#losses-losses-broughtForwardLosses")).toHaveText("1,500.00");
    await expect(page.locator("#losses-claims-carryBack-previousYearGeneralIncome")).toHaveText("150.50");
    await expect(page.locator("#newSearchBtn")).toBeVisible();
  });

  test("a property loss names the business type and leaves the correlation line out when HMRC sent none", async ({ page }) => {
    await loadPage(page, "lossesAndClaims.html");
    await page.evaluate((details) => window.showSavedRecord(details, null), {
      ...LOSSES_SENT,
      typeOfBusiness: "foreign-property",
      claims: { carryForward: { currentYearLosses: 800 } },
    });
    const text = await page.locator("#lossesResults").innerText();
    expect(text).toContain("Foreign property losses and claims");
    expect(text).toContain("This year's loss carried forward");
    expect(text).not.toContain("HMRC correlation ID");
    expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
  });
});

test.describe("ITSA tax liability adjustments saved as a record", () => {
  test("shows the decrease sent, the year, HMRC's reference and the date", async ({ page }) => {
    await loadPage(page, "taxLiabilityAdjustments.html");
    for (const [width, height] of [
      [1280, 1000],
      [390, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((details) => window.showSavedRecord(details, "9b2d-0007"), {
        nino: "AB123456C",
        taxYear: "2025-26",
        carryBackLossesDecrease: { incomeTax: 100, class4: 25.5 },
      });
      const results = page.locator("#adjustmentsResults");
      await expect(results).toBeVisible();
      const head = page.locator(".customer-copy-header");
      await expect(results).toContainText("HMRC correlation ID 9b2d-0007");
      await expect(head).toContainText("Accepted by HMRC");
      const text = await results.innerText();
      for (const fragment of [
        "Tax liability adjustments",
        "Tax year 2025-26",
        "Income tax decreased",
        "National Insurance number AB 12 34 56 C",
      ]) {
        expect(text).toContain(fragment);
      }
      expect(text).not.toMatch(/undefined|NaN|null|\[object|Invalid/);
      await expectNoPageOverflow(page);
      await page.screenshot({ path: recordShot("taxLiabilityAdjustments", width), fullPage: true });
    }
    await expect(page.locator("#adjustments-carryBackLossesDecrease-incomeTax")).toHaveText("100.00");
    await expect(page.locator("#adjustments-carryBackLossesDecrease-class4")).toHaveText("25.50");
    await expect(page.locator("#newSearchBtn")).toBeVisible();
  });

  test("an empty decrease says nothing was sent", async ({ page }) => {
    await loadPage(page, "taxLiabilityAdjustments.html");
    await page.evaluate(() => window.showSavedRecord({ nino: "AB123456C", taxYear: "2025-26", carryBackLossesDecrease: {} }, null));
    await expect(page.locator("#adjustmentsResults")).toContainText("You sent no carry-back decrease for this year.");
  });
});
