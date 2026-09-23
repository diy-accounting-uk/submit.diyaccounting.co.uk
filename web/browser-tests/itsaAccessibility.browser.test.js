// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaAccessibility.browser.test.js
// axe-core scans of the 19 ITSA pages in a populated state (form loaded, results rendered),
// reusing the route/stub pattern itsaDashboard.browser.test.js uses for the empty state and the
// per-page display functions the other ITSA browser tests already exercise.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const axeCorePath = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function readItsaPage(fileName) {
  return fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa", fileName), "utf-8");
}

// Mirrors the loadPage() helper every other ITSA browser test file carries: stub the globals
// inline scripts call, block external script files (their network calls have nothing to answer
// them here), and navigate to the exact URL so the page keeps a real origin - some pages
// (dashboard.html) touch sessionStorage on load, which throws under page.setContent's synthetic
// document.
async function loadItsaPage(page, fileName) {
  const html = readItsaPage(fileName);
  const url = `http://localhost:3000/hmrc/itsa/${fileName}`;

  await page.route("**/*.js", async (route) => {
    const request = route.request();
    if (request.resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });

  const modifiedHtml = html.replace(
    "<body>",
    `<body><script>
window.showStatus = window.showStatus || function(){};
window.hideStatus = window.hideStatus || function(){};
window.showLoading = window.showLoading || function(){};
window.hideLoading = window.hideLoading || function(){};
window.generateRandomState = window.generateRandomState || function(){ return "test-state"; };
window.getGovClientHeaders = window.getGovClientHeaders || function(){ return Promise.resolve({}); };
window.authorizedFetch = window.authorizedFetch || function(){ return Promise.resolve({ ok: true, json: function(){ return Promise.resolve({}); }}); };
window.hmrcScopeCheck = window.hmrcScopeCheck || {
  isTokenSufficient: function(){ return Promise.resolve(true); },
  getOAuthScopeString: function(){ return Promise.resolve("read:self-assessment"); },
  clearHmrcToken: function(){},
};
</script>`,
  );

  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await delay(200);
}

function showContainer(page, id) {
  return page.evaluate((elementId) => {
    const el = document.getElementById(elementId);
    if (el) el.style.display = "block";
  }, id);
}

async function runAxe(page) {
  await page.addScriptTag({ path: axeCorePath });
  return page.evaluate(async (tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags } }), wcagTags);
}

function expectNoViolations(results, pageName) {
  if (results.violations.length) {
    console.log(
      `[AXE VIOLATIONS] ${pageName}:`,
      JSON.stringify(
        results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        null,
        2,
      ),
    );
  }
  expect(results.violations).toEqual([]);
}

test.describe("ITSA pages - WCAG 2.1 AA (populated state)", () => {
  test("dashboard.html: business picker with two businesses", async ({ page }) => {
    await loadItsaPage(page, "dashboard.html");
    await page.evaluate(() => {
      window.displayBusinessPicker([
        { businessId: "XAIS12345678901", typeOfBusiness: "self-employment", tradingName: "A Sole Trade" },
        { businessId: "XAIS12345678902", typeOfBusiness: "uk-property", tradingName: "A Rental" },
      ]);
    });
    expectNoViolations(await runAxe(page), "dashboard.html");
  });

  test("businessDetails.html: a business result row", async ({ page }) => {
    await loadItsaPage(page, "businessDetails.html");
    await showContainer(page, "businessDetailsResults");
    await page.evaluate(() => {
      window.displayBusinesses([
        { typeOfBusiness: "self-employment", businessId: "XBIS12345678901", tradingName: "Company X" },
        { typeOfBusiness: "uk-property", businessId: "XPRO00000000001" },
      ]);
    });
    expectNoViolations(await runAxe(page), "businessDetails.html");
  });

  test("obligations.html: obligations grouped by business", async ({ page }) => {
    await loadItsaPage(page, "obligations.html");
    await showContainer(page, "obligationsResults");
    await page.evaluate(() => {
      window.displayObligations([
        {
          typeOfBusiness: "self-employment",
          businessId: "XAIS12345678901",
          obligationDetails: [
            {
              periodStartDate: "2024-04-06",
              periodEndDate: "2024-07-05",
              dueDate: "2024-08-05",
              status: "fulfilled",
              receivedDate: "2024-08-01",
            },
            { periodStartDate: "2024-07-06", periodEndDate: "2024-10-05", dueDate: "2024-11-05", status: "open" },
          ],
        },
      ]);
    });
    expectNoViolations(await runAxe(page), "obligations.html");
  });

  test("selfEmploymentPeriod.html: a filed period result", async ({ page }) => {
    await loadItsaPage(page, "selfEmploymentPeriod.html");
    await showContainer(page, "selfEmploymentPeriodResults");
    await page.evaluate(() => {
      window.displayResult({ periodId: "2024-04-06_2024-07-05" });
    });
    expectNoViolations(await runAxe(page), "selfEmploymentPeriod.html");
  });

  test("selfEmploymentPeriodAmend.html: the current total loaded into the form", async ({ page }) => {
    await loadItsaPage(page, "selfEmploymentPeriodAmend.html");
    await page.evaluate(() => {
      window.applyCurrentTotal({
        periodIncome: { turnover: 5000, other: 100 },
        periodExpenses: { costOfGoods: 200, otherExpenses: 50 },
      });
    });
    expectNoViolations(await runAxe(page), "selfEmploymentPeriodAmend.html");
  });

  test("selfEmploymentPeriods.html: a period summary table", async ({ page }) => {
    await loadItsaPage(page, "selfEmploymentPeriods.html");
    await showContainer(page, "periodsResults");
    await page.evaluate(() => {
      window.displayPeriods([
        { periodId: "2024-04-06_2024-07-05", periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
        { periodId: "2024-07-06_2024-10-05", periodStartDate: "2024-07-06", periodEndDate: "2024-10-05" },
      ]);
    });
    expectNoViolations(await runAxe(page), "selfEmploymentPeriods.html");
  });

  test("selfEmploymentPeriodView.html: a single period's detail", async ({ page }) => {
    await loadItsaPage(page, "selfEmploymentPeriodView.html");
    await showContainer(page, "periodViewResults");
    await page.evaluate(() => {
      window.displayPeriod({
        periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
        periodIncome: { turnover: 5000, other: 100 },
        periodExpenses: { costOfGoods: 200, otherExpenses: 50 },
      });
    });
    expectNoViolations(await runAxe(page), "selfEmploymentPeriodView.html");
  });

  test("annualSubmission.html: a loaded annual submission in the edit form", async ({ page }) => {
    await loadItsaPage(page, "annualSubmission.html");
    await showContainer(page, "annualEditForm");
    await page.evaluate(() => {
      window.populateEditForm({
        adjustments: { basisAdjustment: 250 },
        allowances: { tradingIncomeAllowance: 1000 },
        nonFinancials: { class4NicsExemptionReason: "trustee" },
      });
    });
    expectNoViolations(await runAxe(page), "annualSubmission.html");
  });

  test("adjustments.html: a year-end summary", async ({ page }) => {
    await loadItsaPage(page, "adjustments.html");
    await showContainer(page, "summaryContainer");
    await page.evaluate(() => {
      window.displaySummary({
        adjustableSummaryCalculation: {
          totalIncome: 10000,
          income: { turnover: 10000 },
          totalExpenses: 4000,
          expenses: { costOfGoods: 2000 },
          totalAdditions: 0,
          netProfit: 6000,
        },
      });
    });
    expectNoViolations(await runAxe(page), "adjustments.html");
  });

  test("lossesAndClaims.html: a loaded claim in the edit form", async ({ page }) => {
    await loadItsaPage(page, "lossesAndClaims.html");
    await page.locator("#typeOfBusiness").selectOption("self-employment");
    await page.evaluate(() => {
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("lossesEditForm").style.display = "block";
      window.updateCarryBackVisibility();
      window.populateEditForm({
        losses: { broughtForwardLosses: 500 },
        claims: { carryForward: { currentYearLosses: 500 } },
      });
    });
    expectNoViolations(await runAxe(page), "lossesAndClaims.html");
  });

  test("taxLiabilityAdjustments.html: a loaded adjustment in the edit form", async ({ page }) => {
    await loadItsaPage(page, "taxLiabilityAdjustments.html");
    await showContainer(page, "adjustmentsEditForm");
    await page.evaluate(() => {
      window.populateEditForm({ carryBackLossesDecrease: { incomeTax: 100, class4: 50, capitalGainsTax: 0 } });
    });
    expectNoViolations(await runAxe(page), "taxLiabilityAdjustments.html");
  });

  test("taxCalculation.html: a calculation with a business breakdown", async ({ page }) => {
    await loadItsaPage(page, "taxCalculation.html");
    await showContainer(page, "calculationResults");
    await page.evaluate(() => {
      window.displayCalculation(
        {
          metadata: { calculationId: "calc-2", calculationType: "in-year" },
          calculation: {
            taxCalculation: {
              totalIncomeTaxAndNicsDue: 1900,
              incomeTax: { totalIncomeTax: 1400 },
              nics: { totalNic: 500 },
              totalTaxDeducted: 0,
            },
            allowancesAndDeductions: { personalAllowance: 12570 },
            businessProfitAndLoss: [
              {
                incomeSourceId: "XAIS12345678901",
                incomeSourceType: "self-employment",
                incomeSourceName: "A Sole Trade",
                taxableProfit: 0,
              },
              { incomeSourceId: "XAIS12345678902", incomeSourceType: "uk-property", incomeSourceName: "A Rental", taxableProfit: 1200 },
            ],
          },
          messages: { errors: [], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
      );
    });
    expectNoViolations(await runAxe(page), "taxCalculation.html");
  });

  test("finalDeclaration.html: businesses and loss positions listed", async ({ page }) => {
    await loadItsaPage(page, "finalDeclaration.html");
    await page.evaluate(() => {
      document.getElementById("declarationContainer").style.display = "block";
      window.getLossesAndClaims = (nino, businessId) => {
        const claims = { XAIS12345678901: { carryForward: { currentYearLosses: 500 } } }[businessId];
        return claims ? Promise.resolve({ claims }) : Promise.reject(new Error("Not found"));
      };
      window.getTaxLiabilityAdjustments = () => Promise.resolve({});
    });
    await page.evaluate(() => {
      const calculation = {
        metadata: { calculationId: "calc-3", calculationType: "intent-to-finalise" },
        calculation: {
          taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 },
          allowancesAndDeductions: {},
          businessProfitAndLoss: [
            { incomeSourceId: "XAIS12345678901", incomeSourceType: "self-employment", netLoss: 500 },
            { incomeSourceId: "XAIS12345678902", incomeSourceType: "uk-property", netProfit: 1000 },
          ],
        },
        inputs: {
          incomeSources: {
            businessIncomeSources: [
              { incomeSourceId: "XAIS12345678901", incomeSourceType: "self-employment", latestPeriodEndDate: "2024-04-05" },
              { incomeSourceId: "XAIS12345678902", incomeSourceType: "uk-property", latestPeriodEndDate: "2024-04-05" },
            ],
          },
        },
      };
      return window.displayBusinessesAndLossPositions(calculation, "AB123456C", "2023-24", "test-token");
    });
    await delay(100);
    expectNoViolations(await runAxe(page), "finalDeclaration.html");
  });

  test("ukPropertyAdjustments.html: a year-end summary", async ({ page }) => {
    await loadItsaPage(page, "ukPropertyAdjustments.html");
    await showContainer(page, "summaryContainer");
    await page.evaluate(() => {
      window.displaySummary({
        adjustableSummaryCalculation: {
          totalIncome: 12000,
          income: { totalRentsReceived: 12000, otherPropertyIncome: 0 },
          totalDeductions: 3000,
          deductions: { costOfReplacingDomesticItems: 500 },
          netProfit: 9000,
        },
      });
    });
    expectNoViolations(await runAxe(page), "ukPropertyAdjustments.html");
  });

  test("ukPropertyAnnualSubmission.html: a loaded annual submission in the edit form", async ({ page }) => {
    await loadItsaPage(page, "ukPropertyAnnualSubmission.html");
    await showContainer(page, "annualEditForm");
    await page.evaluate(() => {
      window.populateEditForm({
        ukProperty: {
          adjustments: {
            balancingCharge: 100,
            privateUseAdjustment: 50,
            businessPremisesRenovationAllowanceBalancingCharges: 0,
            nonResidentLandlord: true,
            rentARoom: { jointlyLet: true },
          },
          allowances: {},
        },
      });
    });
    expectNoViolations(await runAxe(page), "ukPropertyAnnualSubmission.html");
  });

  test("ukPropertyPeriod.html: a filed period result", async ({ page }) => {
    await loadItsaPage(page, "ukPropertyPeriod.html");
    await showContainer(page, "ukPropertyPeriodResults");
    await page.evaluate(() => {
      window.displayResult({ submissionId: "2024-04-06_2024-07-05" });
    });
    expectNoViolations(await runAxe(page), "ukPropertyPeriod.html");
  });

  test("ukPropertyPeriodAmend.html: the current total loaded into the form", async ({ page }) => {
    await loadItsaPage(page, "ukPropertyPeriodAmend.html");
    await page.evaluate(() => {
      window.applyCurrentTotal({
        ukProperty: {
          income: { periodAmount: 1000, otherIncome: 50 },
          expenses: { repairsAndMaintenance: 100, other: 20 },
        },
      });
    });
    expectNoViolations(await runAxe(page), "ukPropertyPeriodAmend.html");
  });

  test("ukPropertyPeriods.html: a period summary table", async ({ page }) => {
    await loadItsaPage(page, "ukPropertyPeriods.html");
    await showContainer(page, "periodsResults");
    await page.evaluate(() => {
      window.displayPeriods([
        { submissionId: "2024-04-06_2024-07-05", fromDate: "2024-04-06", toDate: "2024-07-05" },
        { submissionId: "2024-07-06_2024-10-05", fromDate: "2024-07-06", toDate: "2024-10-05" },
      ]);
    });
    expectNoViolations(await runAxe(page), "ukPropertyPeriods.html");
  });

  test("ukPropertyPeriodView.html: a single period's detail", async ({ page }) => {
    await loadItsaPage(page, "ukPropertyPeriodView.html");
    await showContainer(page, "periodViewResults");
    await page.evaluate(() => {
      window.displayPeriod({
        toDate: "2024-07-05",
        ukProperty: { income: { periodAmount: 1000, otherIncome: 50 }, expenses: { repairsAndMaintenance: 100, other: 20 } },
      });
    });
    expectNoViolations(await runAxe(page), "ukPropertyPeriodView.html");
  });
});
