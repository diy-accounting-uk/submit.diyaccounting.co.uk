// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/foreignPropertyPeriodFields.browser.test.js
// The foreign property quarterly update, amend, list and view pages: every field of every entry
// reaches the request, the 2024-25 furnished holiday letting section, the 2026-27 property
// fieldsets, and the loaded figures. The HMRC calls are stubbed; the pages, their form errors and
// their styles are the real ones.

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

const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/foreign-property-period");

const PROPERTIES = [
  { propertyId: "FP1", propertyName: "Lyon apartment", countryCode: "FRA" },
  { propertyId: "FP2", propertyName: "Malaga villa", countryCode: "ESP" },
];

const CUMULATIVE_SUMMARY = {
  toDate: "2025-07-05",
  foreignProperty: [
    {
      countryCode: "FRA",
      income: { rentIncome: { rentAmount: 440.31 }, foreignTaxCreditRelief: true, premiumsOfLeaseGrant: 950.48 },
      expenses: { repairsAndMaintenance: 54.3, travelCosts: 560.99 },
    },
    { countryCode: "ESP", income: { rentIncome: { rentAmount: 300 } }, expenses: { consolidatedExpenses: 800 } },
  ],
};

const DATED_SUMMARY = {
  fromDate: "2024-04-06",
  toDate: "2024-07-05",
  foreignFhlEea: { income: { rentAmount: 200.22 }, expenses: { consolidatedExpenses: 80 } },
  foreignNonFhlProperty: [{ countryCode: "FRA", income: { rentIncome: { rentAmount: 90 }, foreignTaxCreditRelief: false }, expenses: {} }],
};

const STUBS = `
window.__sent = [];
window.__status = [];
window.__properties = ${JSON.stringify(PROPERTIES)};
window.__summary = null;
window.showStatus = function(message, type){ window.__status.push({ message: message, type: type }); };
window.hideStatus = function(){}; window.showLoading = function(){}; window.hideLoading = function(){};
window.generateRandomState = function(){ return "s"; };
window.getGovClientHeaders = function(){ return Promise.resolve({}); };
window.resolveSyntheticTestScenario = function(explicit, account, fallback){ return explicit || (account === "synthetic" ? fallback : null); };
window.getForeignPropertyDetails = function(nino, businessId, taxYear){
  window.__sent.push({ call: "details", nino: nino, businessId: businessId, taxYear: taxYear });
  return Promise.resolve({ foreignPropertyDetails: window.__properties });
};
window.postForeignPropertyPeriod = function(period){
  window.__sent.push({ call: "post", period: period });
  return Promise.resolve({ submissionId: "2024-04-06_2024-07-05" });
};
window.putForeignPropertyPeriod = function(period){
  window.__sent.push({ call: "put", period: period });
  return Promise.resolve({});
};
window.getForeignPropertyPeriod = function(query, token, headers, fpv, scenario){
  window.__sent.push({ call: "get", query: query, scenario: scenario });
  return window.__summary ? Promise.resolve(window.__summary) : Promise.reject(Object.assign(new Error("not found"), { status: 404 }));
};
window.getPropertyPeriods = function(nino, businessId, taxYear){
  window.__sent.push({ call: "list", nino: nino, businessId: businessId, taxYear: taxYear });
  return Promise.resolve({ periods: [{ submissionId: "2024-04-06_2024-07-05", fromDate: "2024-04-06", toDate: "2024-07-05" }] });
};
`;

async function openPage(page, fileName, { summary = null, synthetic = false } = {}) {
  const url = `http://localhost:3000/hmrc/itsa/${fileName}`;
  await page.addInitScript(
    ({ summary, synthetic }) => {
      sessionStorage.setItem("hmrcAccessToken", "token");
      if (synthetic) sessionStorage.setItem("hmrcAccount", "synthetic");
      window.__initialSummary = summary;
    },
    { summary, synthetic },
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
    .replace("<body>", `<body><script>${STUBS}\nwindow.__summary = window.__initialSummary;</script>`);
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(url, { waitUntil: "load" });
}

async function chooseTaxYear(page, taxYear) {
  await page.locator("#taxYear").selectOption(taxYear);
  await page.locator("#taxYear").dispatchEvent("input");
}

async function fillIdentity(page, taxYear, extra = {}) {
  await page.locator("#nino").fill("QQ123456C");
  await page.locator("#businessId").fill("XAIS12345678910");
  await chooseTaxYear(page, taxYear);
  for (const [id, value] of Object.entries(extra)) await page.locator(`#${id}`).fill(value);
}

async function addCountry(page, prefix, code) {
  await page.locator("#fp-add").click();
  await page.locator(`#${prefix}-country`).selectOption(code);
}

async function fillEntry(page, prefix, values) {
  await page.locator(`#${prefix}-moreIncome`).evaluate((node) => (node.open = true));
  await page.locator(`#${prefix}-moreExpenses`).evaluate((node) => (node.open = true));
  for (const [id, value] of Object.entries(values)) await page.locator(`#${prefix}-${id}`).fill(value);
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

const ITEMISED_FIELDS = {
  rentAmount: "1000",
  otherPropertyIncome: "10.5",
  premiumsOfLeaseGrant: "20",
  foreignTaxPaidOrDeducted: "30",
  specialWithholdingTaxOrUkTaxPaid: "40",
  premisesRunningCosts: "50",
  repairsAndMaintenance: "60",
  financialCosts: "70",
  professionalFees: "80",
  costOfServices: "90",
  travelCosts: "100",
  other: "110",
  residentialFinancialCost: "120",
  broughtFwdResidentialFinancialCost: "130",
};

const ITEMISED_ENTRY = {
  income: {
    rentIncome: { rentAmount: 1000 },
    otherPropertyIncome: 10.5,
    premiumsOfLeaseGrant: 20,
    foreignTaxPaidOrDeducted: 30,
    specialWithholdingTaxOrUkTaxPaid: 40,
    foreignTaxCreditRelief: true,
  },
  expenses: {
    premisesRunningCosts: 50,
    repairsAndMaintenance: 60,
    financialCosts: 70,
    professionalFees: 80,
    costOfServices: 90,
    travelCosts: 100,
    other: 110,
    residentialFinancialCost: 120,
    broughtFwdResidentialFinancialCost: 130,
  },
};

test.describe("foreign property quarterly update: countries", () => {
  test("sends every field of each country in a cumulative year", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html");
    await fillIdentity(page, "2025-26");
    await expect(page.locator("#loadCurrentTotalGroup")).toBeVisible();
    await expect(page.locator("#loadPropertiesGroup")).toBeHidden();
    await expect(page.locator("#fhlEea")).toHaveCount(0);

    await addCountry(page, "fp-1", "FRA");
    await fillEntry(page, "fp-1", ITEMISED_FIELDS);
    await page.locator("#fp-1-foreignTaxCreditRelief").check();
    await addCountry(page, "fp-2", "ESP");
    await page.locator("#fp-2-expenseBasisTotal").check();
    await page.locator("#fp-2-rentAmount").fill("300");
    await page.locator("#fp-2-consolidatedExpenses").fill("250.25");
    await shoot(page, "period-countries");
    await page.locator("#submitBtn").click();

    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { period } = (await sentCalls(page, "put"))[0];
    expect(period).toEqual({
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      taxYear: "2025-26",
      foreignProperty: [
        { countryCode: "FRA", ...ITEMISED_ENTRY },
        { countryCode: "ESP", income: { rentIncome: { rentAmount: 300 } }, expenses: { consolidatedExpenses: 250.25 } },
      ],
    });
    await expect(page.locator("#submissionIdLabel")).toHaveText("Reporting");
    await expect(page.locator("#submissionIdResult")).toHaveText("Year to date");
  });

  test("sends the FHL section and the dated countries with dates in a 2024-25 period", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html");
    await fillIdentity(page, "2024-25", { fromDate: "2024-04-06", toDate: "2024-07-05" });
    await expect(page.locator("#fhlEea")).toBeVisible();
    await expect(page.locator("#loadCurrentTotalGroup")).toBeHidden();

    await page.locator("#fhl-rentAmount").fill("200.22");
    await page.locator("#fhl-premisesRunningCosts").fill("11");
    await page.locator("#fhl-other").fill("12");
    await addCountry(page, "fp-1", "FRA");
    await page.locator("#fp-1-rentAmount").fill("750");
    await shoot(page, "period-dated");
    await page.locator("#submitBtn").click();

    await expect.poll(async () => (await sentCalls(page, "post")).length).toBe(1);
    const { period } = (await sentCalls(page, "post"))[0];
    expect(period).toEqual({
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      taxYear: "2024-25",
      fromDate: "2024-04-06",
      toDate: "2024-07-05",
      foreignFhlEea: { income: { rentAmount: 200.22 }, expenses: { premisesRunningCosts: 11, other: 12 } },
      foreignNonFhlProperty: [
        { countryCode: "FRA", income: { rentIncome: { rentAmount: 750 }, foreignTaxCreditRelief: false }, expenses: {} },
      ],
    });
    await expect(page.locator("#submissionIdResult")).toHaveText("2024-04-06_2024-07-05");
  });

  test("sends the FHL total expenses alone when the total is chosen", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html");
    await fillIdentity(page, "2024-25", { fromDate: "2024-04-06", toDate: "2024-07-05" });
    await page.locator("#fhl-repairsAndMaintenance").fill("5");
    await page.locator("#fhl-expenseBasisTotal").check();
    await expect(page.locator("#fhl-repairsAndMaintenance")).toBeDisabled();
    await page.locator("#fhl-consolidatedExpenses").fill("99");
    await page.locator("#submitBtn").click();

    await expect.poll(async () => (await sentCalls(page, "post")).length).toBe(1);
    const { period } = (await sentCalls(page, "post"))[0];
    expect(period.foreignFhlEea).toEqual({ income: {}, expenses: { consolidatedExpenses: 99 } });
    expect(period.foreignNonFhlProperty).toBeUndefined();
  });

  test("asks for the dates, a country and a figure, and links each error to its field", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html");
    await fillIdentity(page, "2024-25");
    await page.locator("#submitBtn").click();
    await expect(page.locator(".error-summary")).toContainText("Enter the period start date");
    await page.locator("#fromDate").fill("2024-04-06");
    await page.locator("#toDate").fill("2024-07-05");
    await page.locator("#submitBtn").click();
    await expect(page.locator(".error-summary a")).toHaveText("Add a country and enter its figures");
    await page.locator("#fp-add").click();
    await page.locator("#submitBtn").click();
    await expect(page.locator(".error-summary a")).toHaveText("Country 1: choose the country or territory");
    await page.locator(".error-summary a").click();
    await expect(page.locator("#fp-1-country")).toBeFocused();
    expect(await sentCalls(page, "post")).toHaveLength(0);
  });

  test("refuses a bad amount in a country and names the field", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html");
    await fillIdentity(page, "2025-26");
    await addCountry(page, "fp-1", "FRA");
    await page.locator("#fp-1-rentAmount").fill("about a thousand");
    await page.locator("#submitBtn").click();
    await expect(page.locator(".error-summary")).toContainText("Enter an amount in pounds and pence");
    expect(await sentCalls(page, "put")).toHaveLength(0);
  });

  test("loads the current total into one fieldset for each country", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html", { summary: CUMULATIVE_SUMMARY, synthetic: true });
    await fillIdentity(page, "2025-26");
    await page.locator("#loadCurrentTotalBtn").click();
    await expect(page.locator("fieldset.foreign-property-entry")).toHaveCount(2);
    await expect(page.locator("#fp-1-country")).toHaveValue("FRA");
    await expect(page.locator("#fp-1-rentAmount")).toHaveValue("440.31");
    await expect(page.locator("#fp-1-foreignTaxCreditRelief")).toBeChecked();
    await expect(page.locator("#fp-1-premiumsOfLeaseGrant")).toHaveValue("950.48");
    await expect(page.locator("#fp-1-travelCosts")).toHaveValue("560.99");
    await expect(page.locator("#fp-2-country")).toHaveValue("ESP");
    await expect(page.locator("#fp-2-expenseBasisTotal")).toBeChecked();
    await expect(page.locator("#fp-2-consolidatedExpenses")).toHaveValue("800");
    const [get] = await sentCalls(page, "get");
    expect(get.scenario).toBe("FOREIGN_PROPERTY_FULL_EXPENSES");
    expect(get.query).toMatchObject({ nino: "QQ123456C", businessId: "XAIS12345678910", taxYear: "2025-26" });
    await shoot(page, "period-loaded");
  });

  test("says HMRC has no total when it holds none", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html");
    await fillIdentity(page, "2025-26");
    await page.locator("#loadCurrentTotalBtn").click();
    await expect
      .poll(() => page.evaluate(() => window.__status.map((status) => status.message)))
      .toContain("HMRC has no total on file yet for this tax year. Enter the figures for the year so far.");
  });
});

test.describe("foreign property quarterly update: properties", () => {
  test("shows one fieldset for each property HMRC holds and sends only the entries with figures", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html");
    await fillIdentity(page, "2026-27");
    await expect(page.locator("#loadPropertiesGroup")).toBeVisible();
    await expect(page.locator("#loadCurrentTotalGroup")).toBeVisible();
    await expect(page.locator("#fp-add")).toHaveCount(0);

    await page.locator("#loadPropertiesBtn").click();
    await expect(page.locator("fieldset.foreign-property-entry > legend").allTextContents()).resolves.toEqual([
      "Lyon apartment (France)",
      "Malaga villa (Spain)",
    ]);
    await expect(page.locator("fieldset.foreign-property-entry select")).toHaveCount(0);
    await page.locator("#fp-2-rentAmount").fill("640");
    await shoot(page, "period-properties");
    await page.locator("#submitBtn").click();

    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { period } = (await sentCalls(page, "put"))[0];
    expect(period.foreignProperty).toEqual([{ propertyId: "FP2", income: { rentIncome: { rentAmount: 640 } }, expenses: {} }]);
    expect(period.foreignProperty[0].countryCode).toBeUndefined();
  });

  test("asks the person to load the properties before a figure is entered", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriod.html");
    await fillIdentity(page, "2026-27");
    await page.locator("#submitBtn").click();
    await expect(page.locator(".error-summary")).toContainText("Load your properties from HMRC");
    expect(await sentCalls(page, "put")).toHaveLength(0);
  });

  test("loads the current total into the property fieldsets by property id", async ({ page }) => {
    const summary = {
      toDate: "2026-07-05",
      foreignProperty: [{ propertyId: "FP2", income: { rentIncome: { rentAmount: 12.5 } }, expenses: { other: 3 } }],
    };
    await openPage(page, "foreignPropertyPeriod.html", { summary });
    await fillIdentity(page, "2026-27");
    await page.locator("#loadCurrentTotalBtn").click();
    await expect(page.locator("fieldset.foreign-property-entry")).toHaveCount(2);
    await expect(page.locator("#fp-2-rentAmount")).toHaveValue("12.5");
    await expect(page.locator("#fp-2-other")).toHaveValue("3");
    await expect(page.locator("#fp-1-rentAmount")).toHaveValue("");
    expect((await sentCalls(page, "details")).length).toBe(1);
  });
});

test.describe("foreign property period amend", () => {
  test("sends the submission ID and the changed entries for a dated period", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriodAmend.html", { summary: DATED_SUMMARY, synthetic: true });
    await fillIdentity(page, "2024-25", { submissionId: "2024-04-06_2024-07-05" });
    await expect(page.locator("#submissionIdGroup")).toBeVisible();
    await page.locator("#loadBtn").click();
    await expect(page.locator("#fhl-rentAmount")).toHaveValue("200.22");
    await expect(page.locator("#fhl-expenseBasisTotal")).toBeChecked();
    await expect(page.locator("#fhl-consolidatedExpenses")).toHaveValue("80");
    await expect(page.locator("#fp-1-country")).toHaveValue("FRA");
    const [get] = await sentCalls(page, "get");
    expect(get.scenario).toBe("FOREIGN_PROPERTY");
    expect(get.query.submissionId).toBe("2024-04-06_2024-07-05");

    await page.locator("#fp-1-rentAmount").fill("95");
    await shoot(page, "amend-dated");
    await page.locator("#submitBtn").click();
    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { period } = (await sentCalls(page, "put"))[0];
    expect(period).toEqual({
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      taxYear: "2024-25",
      submissionId: "2024-04-06_2024-07-05",
      foreignFhlEea: { income: { rentAmount: 200.22 }, expenses: { consolidatedExpenses: 80 } },
      foreignNonFhlProperty: [
        { countryCode: "FRA", income: { rentIncome: { rentAmount: 95 }, foreignTaxCreditRelief: false }, expenses: {} },
      ],
    });
  });

  test("asks for the submission ID in a dated year and not in a cumulative year", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriodAmend.html");
    await fillIdentity(page, "2024-25");
    await page.locator("#submitBtn").click();
    await expect(page.locator(".error-summary")).toContainText("Enter the submission ID");
    await chooseTaxYear(page, "2025-26");
    await expect(page.locator("#submissionIdGroup")).toBeHidden();
    await addCountry(page, "fp-1", "DEU");
    await page.locator("#fp-1-rentAmount").fill("10");
    await page.locator("#submitBtn").click();
    await expect.poll(async () => (await sentCalls(page, "put")).length).toBe(1);
    const { period } = (await sentCalls(page, "put"))[0];
    expect(period.submissionId).toBeUndefined();
    expect(period.foreignProperty).toEqual([{ countryCode: "DEU", income: { rentIncome: { rentAmount: 10 } }, expenses: {} }]);
    await expect(page.locator("#periodAmendResults")).toBeVisible();
  });
});

test.describe("foreign property period list", () => {
  test("lists the dated periods and remembers the chosen one", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriods.html");
    await fillIdentity(page, "2024-25");
    await page.locator("#retrieveBtn").click();
    const rows = page.locator("#periodsTable tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("2024-04-06_2024-07-05");
    await rows.first().getByRole("button", { name: "Use this period" }).click();
    await expect(page.locator("#periodNextSteps")).toBeVisible();
    await expect(page.locator("#periodNextSteps a")).toHaveText(["View the chosen period", "Amend the chosen period"]);
    await shoot(page, "periods-dated");
  });

  test("shows the current total for each country in a cumulative year", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriods.html", { summary: CUMULATIVE_SUMMARY, synthetic: true });
    await fillIdentity(page, "2025-26");
    await expect(page.locator("#retrieveBtn")).toHaveText("Show current total");
    await page.locator("#retrieveBtn").click();
    const rows = page.locator("#periodsTable tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("France");
    await expect(rows.nth(0)).toContainText("440.31");
    await expect(rows.nth(0)).toContainText("615.29");
    await expect(rows.nth(1)).toContainText("Spain");
    await expect(rows.nth(1)).toContainText("800.00");
    await shoot(page, "periods-cumulative");
  });

  test("says HMRC has no total when it holds none", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriods.html");
    await fillIdentity(page, "2025-26");
    await page.locator("#retrieveBtn").click();
    await expect(page.locator("#periodsTable")).toContainText("HMRC has no total on file yet for this tax year.");
  });
});

test.describe("foreign property period view", () => {
  test("shows one table for each entry of a cumulative total", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriodView.html", { summary: CUMULATIVE_SUMMARY, synthetic: true });
    await fillIdentity(page, "2025-26");
    await expect(page.locator("#submissionIdGroup")).toBeHidden();
    await page.locator("#retrieveBtn").click();
    await expect(page.locator("#periodViewResults")).toBeVisible();
    const text = await page.locator("#periodDetails").innerText();
    expect(text).toContain("France: income");
    expect(text).toContain("Spain: expenses");
    await expect(page.locator("#period-1-income-rentIncome-rentAmount")).toHaveText("440.31");
    await expect(page.locator("#period-1-income-foreignTaxCreditRelief")).toHaveText("Yes");
    await expect(page.locator("#period-2-expenses-consolidatedExpenses")).toHaveText("800.00");
    expect(text).not.toMatch(/undefined|NaN|null|\[object/);
    await shoot(page, "view-cumulative");
  });

  test("shows the FHL section and the countries of a dated period", async ({ page }) => {
    await openPage(page, "foreignPropertyPeriodView.html", { summary: DATED_SUMMARY });
    await fillIdentity(page, "2024-25", { submissionId: "2024-04-06_2024-07-05" });
    await page.locator("#retrieveBtn").click();
    await expect(page.locator("#periodViewResults")).toBeVisible();
    await expect(page.locator("#periodDetails")).toContainText("Furnished holiday lettings in the EEA: income");
    await expect(page.locator("#period-fhl-income-rentAmount")).toHaveText("200.22");
    await expect(page.locator("#period-fhl-expenses-consolidatedExpenses")).toHaveText("80.00");
    await expect(page.locator("#period-1-income-rentIncome-rentAmount")).toHaveText("90.00");
    await expect(page.locator(".customer-copy-header")).toContainText("2024-04-06_2024-07-05");
  });
});
