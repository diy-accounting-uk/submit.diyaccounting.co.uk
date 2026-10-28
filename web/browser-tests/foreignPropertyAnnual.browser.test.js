// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/foreignPropertyAnnual.browser.test.js
// The foreign property annual submission: adjustments and allowances for each country or property,
// the 2024-25 furnished holiday letting section, the loaded figures, and the request body. The HMRC
// calls are stubbed; the page, its form errors and its styles are the real ones.

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

const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/foreign-property-annual");

const PROPERTIES = [
  { propertyId: "FP1", propertyName: "Lyon apartment", countryCode: "FRA" },
  { propertyId: "FP2", propertyName: "Malaga villa", countryCode: "ESP" },
];

const SBA_CLAIM = {
  amount: 3545.12,
  firstYear: { qualifyingDate: "2020-03-29", qualifyingAmountExpenditure: 3453.34 },
  building: { name: "Blue Oaks", number: "12", postcode: "TF3 4GH" },
};

const STUBS = `
window.__sent = [];
window.__annual = null;
window.__properties = ${JSON.stringify(PROPERTIES)};
window.showStatus = function(){}; window.hideStatus = function(){}; window.showLoading = function(){}; window.hideLoading = function(){};
window.generateRandomState = function(){ return "s"; };
window.getGovClientHeaders = function(){ return Promise.resolve({}); };
window.resolveSyntheticTestScenario = function(explicit, account, fallback){ return explicit || (account === "synthetic" ? fallback : null); };
window.getForeignPropertyDetails = function(nino, businessId, taxYear){
  window.__sent.push({ call: "details", taxYear: taxYear });
  return Promise.resolve({ propertyDetails: window.__properties });
};
window.getForeignPropertyAnnual = function(nino, businessId, taxYear, token, headers, fpv, scenario){
  window.__sent.push({ call: "get", nino: nino, businessId: businessId, taxYear: taxYear, scenario: scenario });
  return window.__annual ? Promise.resolve(window.__annual) : Promise.reject(Object.assign(new Error("not found"), { status: 404 }));
};
window.putForeignPropertyAnnual = function(details){
  window.__sent.push({ call: "put", details: details });
  return Promise.resolve({ correlationId: "corr-1" });
};
`;

async function openPage(page, { annual = null, synthetic = false } = {}) {
  const fileName = "foreignPropertyAnnualSubmission.html";
  const url = `http://localhost:3000/hmrc/itsa/${fileName}`;
  await page.addInitScript(
    ({ annual, synthetic }) => {
      sessionStorage.setItem("hmrcAccessToken", "token");
      if (synthetic) sessionStorage.setItem("hmrcAccount", "synthetic");
      window.__initialAnnual = annual;
    },
    { annual, synthetic },
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
    .replace("<body>", `<body><script>${STUBS}\nwindow.__annual = window.__initialAnnual;</script>`);
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(url, { waitUntil: "load" });
}

async function loadSubmission(page, taxYear) {
  await page.locator("#nino").fill("QQ123456C");
  await page.locator("#businessId").fill("XAIS12345678910");
  await page.locator("#taxYear").selectOption(taxYear);
  await page.locator("#loadBtn").click();
  await expect(page.locator("#annualEditForm")).toBeVisible();
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

async function addCountry(page, prefix, code) {
  await page.locator("#fa-add").click();
  await page.locator(`#${prefix}-country`).selectOption(code);
}

test.describe("foreign property annual submission: countries", () => {
  test("sends the adjustments, the itemised allowances and a building claim for each country", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");
    await expect(page.locator("#fhlEea")).toHaveCount(0);

    await addCountry(page, "fa-1", "FRA");
    await page.locator("#fa-1-balancingCharge").fill("120.5");
    await page.locator("#fa-1-privateUseAdjustment").fill("30");
    await page.locator("#fa-1-allowanceTypeItemised").check();
    await page.locator("#fa-1-annualInvestmentAllowance").fill("500");
    await page.locator("#fa-1-costOfReplacingDomesticItems").fill("41.25");
    await page.locator("#fa-1-otherCapitalAllowance").fill("60");
    await page.locator("#fa-1-zeroEmissionsCarAllowance").fill("70");
    await page.locator("#fa-1-sba-add").click();
    await page.locator("#fa-1-sba-1-amount").fill("3545.12");
    await page.locator("#fa-1-sba-1-qualifyingDate").fill("2020-03-29");
    await page.locator("#fa-1-sba-1-qualifyingAmountExpenditure").fill("3453.34");
    await page.locator("#fa-1-sba-1-buildingName").fill("Blue Oaks");
    await page.locator("#fa-1-sba-1-buildingNumber").fill("12");
    await page.locator("#fa-1-sba-1-postcode").fill("TF3 4GH");
    await addCountry(page, "fa-2", "ESP");
    await page.locator("#fa-2-allowanceTypePropertyIncome").check();
    await page.locator("#fa-2-propertyIncomeAllowance").fill("1000");
    await shoot(page, "annual-countries");
    await page.locator("#saveBtn").click();

    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { details } = (await sentCalls(page, "put"))[0];
    expect(details).toEqual({
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      taxYear: "2025-26",
      foreignProperty: [
        {
          countryCode: "FRA",
          adjustments: { balancingCharge: 120.5, privateUseAdjustment: 30 },
          allowances: {
            annualInvestmentAllowance: 500,
            costOfReplacingDomesticItems: 41.25,
            otherCapitalAllowance: 60,
            zeroEmissionsCarAllowance: 70,
            structuredBuildingAllowance: [SBA_CLAIM],
          },
        },
        { countryCode: "ESP", adjustments: {}, allowances: { propertyIncomeAllowance: 1000 } },
      ],
    });
    await expect(page.locator("#annualSubmissionResults")).toBeVisible();
    await expect(page.locator("#annualSubmissionCopy")).toContainText("France: adjustments");
    await expect(page.locator("#annualSubmissionCopy")).toContainText("Spain: allowances");
    await expect(page.locator("#annual-1-allowances-structuredBuildingAllowance-Claim\\ 1-amount")).toBeVisible();
    await expect(page.locator("#annual-1-allowances-structuredBuildingAllowance-Claim\\ 1-building-postcode")).toHaveText("TF3 4GH");
    await shoot(page, "annual-saved");
  });

  test("offers the allowances of 2025-26 and not the two that end with 2024-25", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");
    await addCountry(page, "fa-1", "FRA");
    await expect(page.locator("#fa-1-zeroEmissionsCarAllowance")).toHaveCount(1);
    await expect(page.locator("#fa-1-electricChargePointAllowance")).toHaveCount(0);
    await expect(page.locator("#fa-1-zeroEmissionsGoodsVehicleAllowance")).toHaveCount(0);
  });

  test("enables only the chosen set of allowances", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");
    await addCountry(page, "fa-1", "FRA");
    await expect(page.locator("#fa-1-propertyIncomeAllowance")).toBeDisabled();
    await expect(page.locator("#fa-1-annualInvestmentAllowance")).toBeDisabled();
    await expect(page.locator("#fa-1-sba-add")).toBeDisabled();
    await page.locator("#fa-1-allowanceTypeItemised").check();
    await expect(page.locator("#fa-1-annualInvestmentAllowance")).toBeEnabled();
    await expect(page.locator("#fa-1-sba-add")).toBeEnabled();
    await expect(page.locator("#fa-1-propertyIncomeAllowance")).toBeDisabled();
    await page.locator("#fa-1-allowanceTypePropertyIncome").check();
    await expect(page.locator("#fa-1-propertyIncomeAllowance")).toBeEnabled();
    await expect(page.locator("#fa-1-sba-add")).toBeDisabled();
  });

  test("keeps the building claims of each country apart", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");
    await addCountry(page, "fa-1", "FRA");
    await addCountry(page, "fa-2", "ESP");
    await page.locator("#fa-1-allowanceTypeItemised").check();
    await page.locator("#fa-2-allowanceTypeItemised").check();
    await page.locator("#fa-1-sba-add").click();
    await page.locator("#fa-1-sba-1-amount").fill("10");
    await page.locator("#fa-1-sba-1-postcode").fill("AB1 2CD");
    await page.locator("#fa-2-sba-add").click();
    await page.locator("#fa-2-sba-add").click();
    await page.locator("#fa-2-sba-1-amount").fill("20");
    await page.locator("#fa-2-sba-1-postcode").fill("EF3 4GH");
    await page.locator("#fa-2-sba-2-amount").fill("30");
    await page.locator("#fa-2-sba-2-postcode").fill("IJ5 6KL");
    await page.locator("#saveBtn").click();

    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { details } = (await sentCalls(page, "put"))[0];
    expect(details.foreignProperty.map((entry) => entry.allowances.structuredBuildingAllowance.map((claim) => claim.amount))).toEqual([
      [10],
      [20, 30],
    ]);
  });

  test("refuses an incomplete building claim and a missing country, and sends nothing", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");
    await page.locator("#fa-add").click();
    await page.locator("#fa-add").click();
    await page.locator("#fa-1-country").selectOption("FRA");
    await page.locator("#fa-1-allowanceTypeItemised").check();
    await page.locator("#fa-1-sba-add").click();
    await page.locator("#saveBtn").click();

    const summary = page.locator("#form-error-summary");
    await expect(summary).toContainText("Country 2: choose the country or territory");
    await expect(summary).toContainText("Claim 1: enter the allowance claimed");
    await expect(summary).toContainText("Claim 1: enter the building postcode");
    expect((await sentCalls(page, "put")).length).toBe(0);
  });

  test("refuses a save with no figure to send", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");
    await addCountry(page, "fa-1", "FRA");
    await page.locator("#saveBtn").click();

    await expect(page.locator("#form-error-summary")).toContainText("Enter at least one adjustment or allowance");
    expect((await sentCalls(page, "put")).length).toBe(0);
  });

  test("refuses an adjustment that HMRC would refuse for a money field", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");
    await addCountry(page, "fa-1", "FRA");
    await page.locator("#fa-1-balancingCharge").fill("12abc");
    await page.locator("#saveBtn").click();

    await expect(page.locator("#form-error-summary")).toBeVisible();
    expect((await sentCalls(page, "put")).length).toBe(0);
  });

  test("fills each country from the submission HMRC holds", async ({ page }) => {
    await openPage(page, {
      synthetic: true,
      annual: {
        submittedOn: "2020-06-17T10:59:47.544Z",
        foreignProperty: [
          {
            countryCode: "FRA",
            adjustments: { privateUseAdjustment: 4553.34, balancingCharge: 3453.34 },
            allowances: { annualInvestmentAllowance: 500, otherCapitalAllowance: 100, structuredBuildingAllowance: [SBA_CLAIM] },
          },
          { countryCode: "ESP", allowances: { propertyIncomeAllowance: 100.25 } },
        ],
      },
    });
    await loadSubmission(page, "2025-26");

    expect((await sentCalls(page, "get"))[0]).toMatchObject({ taxYear: "2025-26", scenario: "FOREIGN_PROPERTY" });
    await expect(page.locator("#fa-1-country")).toHaveValue("FRA");
    await expect(page.locator("#fa-1-privateUseAdjustment")).toHaveValue("4553.34");
    await expect(page.locator("#fa-1-allowanceTypeItemised")).toBeChecked();
    await expect(page.locator("#fa-1-annualInvestmentAllowance")).toHaveValue("500");
    await expect(page.locator("#fa-1-sba-1-buildingName")).toHaveValue("Blue Oaks");
    await expect(page.locator("#fa-1-sba-1-amount")).toBeEnabled();
    await expect(page.locator("#fa-2-country")).toHaveValue("ESP");
    await expect(page.locator("#fa-2-allowanceTypePropertyIncome")).toBeChecked();
    await expect(page.locator("#fa-2-propertyIncomeAllowance")).toHaveValue("100.25");
    await shoot(page, "annual-loaded");
  });

  test("starts with an empty form and a note when HMRC holds no submission yet", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");

    await expect(page.locator("#loadNotes")).toContainText("HMRC holds no annual submission yet");
    await expect(page.locator("#fa-add")).toHaveText("Add a country");
  });

  test("sends no sandbox scenario for a live account", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2025-26");

    expect((await sentCalls(page, "get"))[0].scenario).toBeNull();
  });
});

test.describe("foreign property annual submission: 2024-25 and before", () => {
  test("sends the furnished holiday lettings in the EEA beside the countries, with the two older allowances", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2024-25");
    await expect(page.locator("#fhlEea")).toBeVisible();

    await page.locator("#fhl-balancingCharge").fill("53.5");
    await page.locator("#fhl-periodOfGraceAdjustment").check();
    await page.locator("#fhl-allowanceTypeItemised").check();
    await page.locator("#fhl-electricChargePointAllowance").fill("100");
    await addCountry(page, "fa-1", "FRA");
    await page.locator("#fa-1-allowanceTypeItemised").check();
    await page.locator("#fa-1-zeroEmissionsGoodsVehicleAllowance").fill("11");
    await page.locator("#fa-1-electricChargePointAllowance").fill("22");
    await shoot(page, "annual-dated");
    await page.locator("#saveBtn").click();

    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { details } = (await sentCalls(page, "put"))[0];
    expect(details).toEqual({
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      taxYear: "2024-25",
      foreignFhlEea: {
        adjustments: { balancingCharge: 53.5, periodOfGraceAdjustment: true },
        allowances: { electricChargePointAllowance: 100 },
      },
      foreignProperty: [
        { countryCode: "FRA", adjustments: {}, allowances: { zeroEmissionsGoodsVehicleAllowance: 11, electricChargePointAllowance: 22 } },
      ],
    });
    await expect(page.locator("#annualSubmissionCopy")).toContainText("Furnished holiday lettings in the EEA: adjustments");
  });

  test("sends the furnished holiday lettings alone", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2024-25");
    await page.locator("#fhl-allowanceTypePropertyIncome").check();
    await page.locator("#fhl-propertyIncomeAllowance").fill("500");
    await page.locator("#saveBtn").click();

    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { details } = (await sentCalls(page, "put"))[0];
    expect(details.foreignFhlEea).toEqual({ adjustments: {}, allowances: { propertyIncomeAllowance: 500 } });
    expect(details.foreignProperty).toEqual([]);
  });

  test("fills the furnished holiday lettings from the submission HMRC holds", async ({ page }) => {
    await openPage(page, {
      synthetic: true,
      annual: {
        foreignFhlEea: {
          adjustments: { balancingCharge: 53543.23, periodOfGraceAdjustment: true },
          allowances: { propertyIncomeAllowance: 100.25 },
        },
        foreignProperty: [{ countryCode: "LBN", adjustments: { balancingCharge: 5 } }],
      },
    });
    await loadSubmission(page, "2024-25");

    await expect(page.locator("#fhl-balancingCharge")).toHaveValue("53543.23");
    await expect(page.locator("#fhl-periodOfGraceAdjustment")).toBeChecked();
    await expect(page.locator("#fhl-allowanceTypePropertyIncome")).toBeChecked();
    await expect(page.locator("#fa-1-country")).toHaveValue("LBN");
  });
});

test.describe("foreign property annual submission: properties", () => {
  test("shows one fieldset for each property and sends the figures under its property id", async ({ page }) => {
    await openPage(page);
    await loadSubmission(page, "2026-27");
    await expect(page.locator("#fa-add")).toHaveCount(0);
    await expect(page.locator("fieldset.foreign-property-entry > legend").allTextContents()).resolves.toEqual([
      "Lyon apartment (France)",
      "Malaga villa (Spain)",
    ]);

    await page.locator("#fa-2-balancingCharge").fill("75");
    await page.locator("#fa-2-allowanceTypeItemised").check();
    await page.locator("#fa-2-sba-add").click();
    await page.locator("#fa-2-sba-1-amount").fill("40");
    await page.locator("#fa-2-sba-1-postcode").fill("AB1 2CD");
    await shoot(page, "annual-properties");
    await page.locator("#saveBtn").click();

    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { details } = (await sentCalls(page, "put"))[0];
    expect(details.foreignProperty).toEqual([
      {
        propertyId: "FP2",
        adjustments: { balancingCharge: 75 },
        allowances: { structuredBuildingAllowance: [{ amount: 40, building: { postcode: "AB1 2CD" } }] },
      },
    ]);
    await expect(page.locator("#annualSubmissionCopy")).toContainText("Malaga villa (Spain): adjustments");
  });

  test("fills a property from the submission HMRC holds and names a property that is not in the list", async ({ page }) => {
    await openPage(page, {
      annual: {
        foreignProperty: [
          { propertyId: "FP1", allowances: { propertyIncomeAllowance: 250 } },
          { propertyId: "GONE", adjustments: { balancingCharge: 9 } },
        ],
      },
    });
    await loadSubmission(page, "2026-27");

    await expect(page.locator("#fa-1-allowanceTypePropertyIncome")).toBeChecked();
    await expect(page.locator("#fa-1-propertyIncomeAllowance")).toHaveValue("250");
    await expect(page.locator("#loadNotes")).toContainText("not in your list");
  });

  test("tells the person to add a property when HMRC holds none", async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => {
      window.__properties = [];
    });
    await loadSubmission(page, "2026-27");

    await expect(page.locator("#loadNotes")).toContainText("HMRC holds no foreign properties for this tax year");
    await expect(page.locator("#loadNotes a")).toHaveAttribute("href", "foreignPropertyDetails.html");
  });
});
