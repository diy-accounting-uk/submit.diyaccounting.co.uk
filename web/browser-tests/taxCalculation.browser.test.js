// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/taxCalculation.browser.test.js
// Browser tests for the ITSA tax calculation page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  serveHmrcAssistWidget,
  serveHmrcFieldTableAssets,
  serveSiteStyles,
  screenshotPath,
  expectCleanFigures,
  serveItsaPageScripts,
  serveCarriedIdentifiers,
} from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Tax Calculation - Form", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/taxCalculation.html"), "utf-8");
  });

  function businessesSection(page) {
    return page.locator('section[aria-label="Your businesses"]');
  }

  function allowancesSection(page) {
    return page.locator('section[aria-label="Allowances and deductions"]');
  }

  async function loadPage(page) {
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });
    await serveItsaPageScripts(page);
    await serveCarriedIdentifiers(page);
    await serveHmrcFieldTableAssets(page);
    await serveHmrcAssistWidget(page);

    const modifiedHtml = htmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">').replace(
      "<body>",
      `<body><script>
window.showStatus = window.showStatus || function(){};
window.hideStatus = window.hideStatus || function(){};
window.showLoading = window.showLoading || function(){};
window.hideLoading = window.hideLoading || function(){};
window.generateRandomState = window.generateRandomState || function(){ return "test-state"; };
window.getGovClientHeaders = window.getGovClientHeaders || function(){ return Promise.resolve({}); };
</script>`,
    );

    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/taxCalculation.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);
  }

  test("displays the trigger form and the calculate button", async ({ page }) => {
    await loadPage(page);

    const form = page.locator("#itsaCalculationTriggerForm");
    await expect(form).toBeVisible();

    const triggerBtn = page.locator("#triggerBtn");
    await expect(triggerBtn).toBeVisible();
    await expect(triggerBtn).toHaveText(/Calculate/);

    const resultsContainer = page.locator("#calculationResults");
    await expect(resultsContainer).toBeHidden();
  });

  test("shows the disclaimer above the figures in document order", async ({ page }) => {
    await loadPage(page);

    const disclaimer = page.locator("#calculationDisclaimer");
    await expect(disclaimer).toContainText(/estimate/i);

    // DOCUMENT_POSITION_FOLLOWING (4) on the comparison target means the disclaimer precedes
    // the figures in source order, so the reader sees it first regardless of layout.
    const disclaimerPrecedesFigures = await page.evaluate(() => {
      const disclaimerEl = document.getElementById("calculationDisclaimer");
      const figuresEl = document.getElementById("calculationFigures");
      return Boolean(disclaimerEl.compareDocumentPosition(figuresEl) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(disclaimerPrecedesFigures).toBe(true);
  });

  test("displays the headline figure and messages, errors first", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => {
      window.displayCalculation(
        {
          metadata: { calculationId: "abc123", calculationType: "in-year" },
          calculation: {
            taxCalculation: {
              totalIncomeTaxAndNicsDue: 1900,
              incomeTax: { totalIncomeTaxDue: 1400 },
              nics: { totalNic: 500 },
              totalTaxDeducted: 0,
            },
            allowancesAndDeductions: { personalAllowance: 12570 },
          },
          messages: { errors: [{ id: "C1", text: "an error" }], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
        "in-year",
      );
    });

    await expect(page.locator("#totalIncomeTaxAndNicsDue")).toHaveText("1,900.00");
    await expect(page.locator("#incomeTaxAmount")).toHaveText("1,400.00");
    await expect(page.locator("#nicsAmount")).toHaveText("500.00");
    const messagesList = page.locator("#calculationMessagesList li").first();
    await expect(messagesList).toContainText("C1");
  });

  test("labels allowances in plain English and never prints raw keys or NaN", async ({ page }) => {
    await loadPage(page);
    await page.evaluate(() => {
      document.getElementById("calculationResults").style.display = "block";
      window.displayCalculation(
        {
          metadata: { calculationId: "calc-5", calculationType: "in-year" },
          calculation: {
            taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 },
            allowancesAndDeductions: {
              personalAllowance: 12570,
              blindPersonsAllowance: 2870,
              qualifyingLoanInterestFromInvestments: 100,
              someNewHmrcAllowance: 5,
              annuityPayments: { grossAnnuityPayments: 300, reliefClaimed: 60 },
              marriageAllowanceTransferOut: { personalAllowanceBeforeTransferOut: 12570, transferredOutAmount: 1260 },
              emptyThing: {},
              textThing: "n/a",
            },
          },
          messages: { errors: [], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
        "in-year",
      );
    });

    const list = allowancesSection(page);
    const row = (label) => list.locator("tbody tr", { has: page.locator("td.label", { hasText: new RegExp(`^${label}$`) }) });
    await expect(row("Blind Person's Allowance").locator("td.figure")).toHaveText("2,870.00");
    await expect(row("Qualifying loan interest")).toHaveCount(1);
    await expect(row("Some new hmrc allowance")).toHaveCount(1);
    await expect(row("Annuity payments: gross annuity payments")).toHaveCount(1);
    await expect(row("Marriage Allowance transferred out").locator("td.figure")).toHaveText("1,260.00");
    await expect(page.locator("#fieldKey dt", { hasText: /^Personal Allowance$/ }).locator("+ dd")).toContainText(
      "The personal allowance available for the tax year.",
    );
    await expect(page.locator("#fieldKey .field-table-source a").first()).toHaveAttribute("href", /developer\.service\.hmrc\.gov\.uk/);
    expectCleanFigures(expect, await list.innerText());
  });

  test("shows the continue-to-final-declaration link only for an intent-to-finalise calculation", async ({ page }) => {
    await loadPage(page);
    // The results live in a container hidden until a calculation has been triggered - show it
    // directly, the way runTrigger does after a successful trigger.
    await page.evaluate(() => {
      document.getElementById("calculationResults").style.display = "block";
    });

    await page.evaluate(() => {
      window.displayCalculation(
        {
          metadata: { calculationId: "calc-1", calculationType: "intent-to-finalise" },
          calculation: {
            taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 },
            allowancesAndDeductions: {},
          },
          messages: { errors: [], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
        "intent-to-finalise",
      );
    });

    await expect(page.locator("#continueToFinalDeclaration")).toBeVisible();
    await expect(page.locator("#continueToFinalDeclarationLink")).toHaveAttribute("href", /calculationId=calc-1/);
  });

  test("hides the continue-to-final-declaration link when the requested type wasn't intent-to-finalise, even if HMRC's response echoes a different type", async ({
    page,
  }) => {
    await loadPage(page);
    await page.evaluate(() => {
      document.getElementById("calculationResults").style.display = "block";
    });

    await page.evaluate(() => {
      // HMRC's sandbox default retrieve response is a fixed example unrelated to the trigger,
      // so its own calculationType can't be trusted to gate this link.
      window.displayCalculation(
        {
          metadata: { calculationId: "calc-4", calculationType: "intent-to-finalise" },
          calculation: {
            taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 },
            allowancesAndDeductions: {},
          },
          messages: { errors: [], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
        "in-year",
      );
    });

    await expect(page.locator("#continueToFinalDeclaration")).toBeHidden();
  });

  // A customer with one business sees one row; a mixed customer sees one row per business, so
  // the loss they claimed on Losses and Claims is visible actually being used.
  test("renders one businessProfitAndLoss row per business, with the loss figures each carries", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => {
      window.displayCalculation(
        {
          metadata: { calculationId: "calc-2", calculationType: "in-year" },
          calculation: {
            taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 },
            allowancesAndDeductions: {},
            businessProfitAndLoss: [
              {
                incomeSourceId: "XAIS12345678901",
                incomeSourceType: "self-employment",
                incomeSourceName: "A Sole Trade",
                taxableProfit: 0,
                totalBroughtForwardIncomeTaxLosses: 500,
                broughtForwardIncomeTaxLossesUsed: 500,
                adjustedIncomeTaxLoss: 0,
                taxableProfitAfterIncomeTaxLossesDeduction: 0,
              },
              {
                incomeSourceId: "XAIS12345678902",
                incomeSourceType: "uk-property",
                incomeSourceName: "A Rental",
                taxableProfit: 1200,
              },
            ],
          },
          messages: { errors: [], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
        "in-year",
      );
    });

    const table = businessesSection(page);
    await expect(table.locator("thead tr").first().locator("th.figure")).toHaveCount(2);
    await expect(table).toContainText("A Sole Trade (XAIS12345678901)");
    await expect(table).toContainText("A Rental (XAIS12345678902)");
    const brokenForward = table.locator("tbody tr", { has: page.locator("td.label", { hasText: /^Brought forward losses$/ }) });
    await expect(brokenForward.locator("td.figure").first()).toHaveText("500.00");
    await expect(brokenForward.locator("td.figure").nth(1)).toHaveText("—");
    expectCleanFigures(expect, await table.innerText());
  });

  test("renders nothing for the business table when the calculation carries no businesses", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => {
      window.displayCalculation(
        {
          metadata: { calculationId: "calc-3", calculationType: "in-year" },
          calculation: {
            taxCalculation: { totalIncomeTaxAndNicsDue: 1900, incomeTax: {}, nics: {}, totalTaxDeducted: 0 },
            allowancesAndDeductions: {},
          },
          messages: { errors: [], warnings: [], info: [] },
        },
        "AB123456C",
        "2023-24",
        "in-year",
      );
    });

    await expect(businessesSection(page)).toHaveCount(0);
  });

  test("shows the calculation as named, defined rows with formatted amounts and no raw keys", async ({ page }) => {
    await serveSiteStyles(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await loadPage(page);
    await page.evaluate(() => {
      document.getElementById("triggerForm").style.display = "none";
      document.getElementById("calculationResults").style.display = "block";
    });

    await page.evaluate(() => {
      window.displayCalculation(
        {
          metadata: { calculationId: "calc-9", calculationType: "in-year" },
          calculation: {
            taxCalculation: {
              totalIncomeTaxAndNicsDue: 7654.32,
              incomeTax: { totalIncomeTaxDue: 6200.12 },
              nics: { totalNic: 1454.2 },
              totalTaxDeducted: -99999999999.99,
            },
            allowancesAndDeductions: {
              personalAllowance: 12570,
              marriageAllowanceTransferOut: { personalAllowanceBeforeTransferOut: 12570, transferredOutAmount: 1260 },
              reducedPersonalAllowance: 10000,
              giftOfInvestmentsAndPropertyToCharity: 1000,
              blindPersonsAllowance: 3130,
              lossesAppliedToGeneralIncome: 250,
              qualifyingLoanInterestFromInvestments: 120.5,
              pensionContributions: 5000.99,
              pensionContributionsDetail: { retirementAnnuityPayments: 5000.99 },
              annuityPayments: { reliefClaimed: 300, rate: 20 },
            },
            businessProfitAndLoss: [
              { incomeSourceId: "XAIS12345678910", incomeSourceType: "self-employment", taxableProfit: 23456, adjustedIncomeTaxLoss: 0 },
            ],
          },
          messages: { errors: [], warnings: [], info: [] },
        },
        "AB123456C",
        "2024-25",
        "in-year",
      );
    });

    await expect(page.locator("#totalIncomeTaxAndNicsDue")).toHaveText("7,654.32");
    await expect(page.locator("#incomeTaxAmount")).toHaveText("6,200.12");
    await expect(page.locator("#totalTaxDeductedAmount")).toHaveText("(99,999,999,999.99)");

    const table = allowancesSection(page).locator("table.statement");
    const row = (label) => table.locator("tbody tr", { has: page.locator("td.label", { hasText: new RegExp(`^${label}$`) }) });
    await expect(row("Pension contributions").locator("td.figure")).toHaveText("5,000.99");
    await expect(row("Marriage Allowance transferred out").locator("td.figure")).toHaveText("1,260.00");
    await expect(row("Annual payments tax rate").locator("td.figure")).toHaveText("20%");
    await expect(table.locator("tbody tr")).toHaveCount(12);
    for (const cells of await table.locator("tbody tr").evaluateAll((rows) => rows.map((r) => r.children.length))) {
      expect(cells).toBe(2);
    }
    const amountAlign = await row("Personal Allowance")
      .locator("td.figure")
      .evaluate((el) => getComputedStyle(el).textAlign);
    expect(amountAlign).toBe("right");

    await expect(businessesSection(page).locator("tbody tr").first().locator("td.figure")).toHaveText("23,456.00");
    expectCleanFigures(expect, await page.locator("#calculationFigures").innerText());
    await expect(page.locator("#fieldKey .field-table-source a").first()).toHaveAttribute("href", /individual-calculations-api\/8\.0/);

    await page.locator("#calculationResults").screenshot({ path: screenshotPath("taxCalculation") });
  });

  test("shows dashes and plain words, never undefined, null, NaN or empty brackets, when HMRC leaves fields out", async ({ page }) => {
    await serveSiteStyles(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await loadPage(page);
    await page.evaluate(() => {
      document.getElementById("triggerForm").style.display = "none";
      document.getElementById("calculationResults").style.display = "block";
      window.displayCalculation(
        {
          metadata: { calculationTimestamp: "not a timestamp", periodFrom: "2024-13-45", calculationType: "in-year" },
          calculation: {
            taxCalculation: { totalIncomeTaxAndNicsDue: null, incomeTax: { totalIncomeTaxDue: "12" }, nics: null },
            allowancesAndDeductions: { personalAllowance: null, giftAidRelief: Number.NaN, odd: { deeper: { deepest: 1 } } },
            businessProfitAndLoss: [null, { taxableProfit: null }, { incomeSourceType: "uk-property", taxableProfit: 10 }],
          },
          messages: { errors: [{ text: "No id on this one" }, null, { id: "C1" }], warnings: "none", info: undefined },
        },
        "AB123456C",
        "2024-25",
        "intent-to-finalise",
      );
    });

    const text = await page.locator("#calculationResults").innerText();
    expect(text).not.toMatch(/undefined|null|NaN|\[object|\(\)|Invalid Date/);
    await expect(page.locator("#totalIncomeTaxAndNicsDue")).toHaveText("—");
    await expect(page.locator("#incomeTaxAmount")).toHaveText("—");
    await expect(page.locator(".customer-copy-status + *, .customer-copy-submission")).toContainText("Not given by HMRC");
    await expect(page.locator("#calculationMessagesList li").first()).toHaveText("No id on this one");
    await expect(page.locator("#calculationMessagesList li")).toHaveCount(2);
    // Without a calculation ID there is nothing for the final declaration to retrieve.
    await expect(page.locator("#continueToFinalDeclaration")).toBeHidden();
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pageOverflow).toBeLessThanOrEqual(0);
  });

  test("shows the record as HMRC returned it, with the id, timestamp and period, at desktop and phone width", async ({ page }) => {
    await serveSiteStyles(page);
    await loadPage(page);
    const calculation = {
      metadata: {
        calculationId: "041f7e4d-87b9-4d4a-a296-3cfbdf92f7e2",
        calculationTimestamp: "2026-10-24T13:03:44.000Z",
        calculationType: "intent-to-finalise",
        periodFrom: "2025-04-06",
        periodTo: "2026-04-05",
        taxYear: "2025-26",
      },
      calculation: {
        taxCalculation: {
          totalIncomeTaxAndNicsDue: 7654.32,
          incomeTax: { totalIncomeTaxDue: 6200.12 },
          nics: { totalNic: 1454.2 },
          totalTaxDeducted: 0,
        },
        allowancesAndDeductions: { personalAllowance: 12570, giftAidRelief: 120, pensionContributions: 1000 },
        businessProfitAndLoss: [
          {
            incomeSourceId: "XAIS12345678910",
            incomeSourceType: "self-employment",
            incomeSourceName: "Hargreaves Joinery",
            taxableProfit: 31200,
            totalBroughtForwardIncomeTaxLosses: 1500,
            broughtForwardIncomeTaxLossesUsed: 1500,
            adjustedIncomeTaxLoss: 0,
            taxableProfitAfterIncomeTaxLossesDeduction: 29700,
          },
          {
            incomeSourceId: "XAIS12345678911",
            incomeSourceType: "uk-property",
            incomeSourceName: "Flat 2, Mill Lane",
            taxableProfit: 4800,
          },
        ],
      },
      messages: { errors: [], warnings: [], info: [] },
    };
    for (const [width, height] of [
      [1280, 1100],
      [390, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((figures) => {
        document.getElementById("triggerForm").style.display = "none";
        document.getElementById("calculationResults").style.display = "block";
        window.displayCalculation(figures, "AB123456C", "2025-26", "intent-to-finalise");
      }, calculation);

      const head = page.locator(".customer-copy-header");
      await expect(head).toContainText("041f7e4d-87b9-4d4a-a296-3cfbdf92f7e2");
      await expect(head).toContainText("24 October 2026");
      await expect(head).toContainText("Calculated by HMRC, not yet declared");
      const record = page.locator("section.customer-copy-section").first();
      await expect(record).toContainText("National Insurance number AB 12 34 56 C");
      await expect(record).toContainText("6 April 2025 to 5 April 2026");
      await expect(page.locator("#continueToFinalDeclarationLink")).toHaveAttribute("href", /calculationId=041f7e4d/);
      const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(pageOverflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: screenshotPath(`taxCalculation-record-${width}`).replace("-1280.png", ".png"), fullPage: true });
    }
  });
});
