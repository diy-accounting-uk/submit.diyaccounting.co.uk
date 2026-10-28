// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/ukPropertyPeriodFields.browser.test.js
// The UK property quarterly update and amend pages take every cumulative income and expense
// field, with the choice between itemised expenses and one total.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  serveCarriedIdentifiers,
  serveFormErrors,
  serveItsaPageScripts,
  serveItsaSubmissionModel,
  serveMoneyInput,
  serveSiteStyles,
} from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/uk-property-period");

const ITEMISED_VALUES = {
  periodAmount: "1000",
  otherIncome: "10.5",
  premiumsOfLeaseGrant: "20",
  reversePremiums: "30",
  taxDeducted: "40",
  rentARoomRentsReceived: "50",
  repairsAndMaintenance: "60",
  otherExpenses: "70",
  premisesRunningCosts: "80",
  financialCosts: "90",
  professionalFees: "100",
  costOfServices: "110",
  travelCosts: "120",
  residentialFinancialCost: "130",
  rentARoomAmountClaimed: "140",
  residentialFinancialCostsCarriedForward: "150",
};

const ITEMISED_BODY = {
  income: {
    periodAmount: 1000,
    otherIncome: 10.5,
    premiumsOfLeaseGrant: 20,
    reversePremiums: 30,
    taxDeducted: 40,
    rentARoom: { rentsReceived: 50 },
  },
  expenses: {
    repairsAndMaintenance: 60,
    other: 70,
    premisesRunningCosts: 80,
    financialCosts: 90,
    professionalFees: 100,
    costOfServices: 110,
    travelCosts: 120,
    residentialFinancialCost: 130,
    rentARoom: { amountClaimed: 140 },
    residentialFinancialCostsCarriedForward: 150,
  },
};

async function openPage(page, fileName) {
  const url = `http://localhost:3000/hmrc/itsa/${fileName}`;
  await page.addInitScript(() => {
    sessionStorage.setItem("hmrcAccessToken", "token");
    window.__sent = [];
  });
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveCarriedIdentifiers(page);
  await serveItsaPageScripts(page);
  await serveItsaSubmissionModel(page);
  await serveMoneyInput(page);
  await serveFormErrors(page);
  await serveSiteStyles(page);
  const stubs = `<script>
window.showStatus = function(){}; window.hideStatus = function(){}; window.showLoading = function(){}; window.hideLoading = function(){};
window.generateRandomState = function(){ return "s"; };
window.getGovClientHeaders = function(){ return Promise.resolve({}); };
window.authorizedFetch = function(url, options){ window.__sent.push({ url: url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
  return Promise.resolve({ ok: true, json: function(){ return Promise.resolve({}); }}); };
</script>`;
  const html = fs
    .readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa", fileName), "utf-8")
    .replace("<head>", `<head><base href="${new URL(".", url)}">`)
    .replace("<body>", `<body>${stubs}`);
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.route("**/lib/self-employment-expenses.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: fs.readFileSync(path.join(process.cwd(), "web/public/lib/self-employment-expenses.js"), "utf-8"),
    }),
  );
  await page.route("**/lib/uk-property-period-fields.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: fs.readFileSync(path.join(process.cwd(), "web/public/lib/uk-property-period-fields.js"), "utf-8"),
    }),
  );
  await page.goto(url, { waitUntil: "load" });
}

async function fillIdentity(page, taxYear, extra = {}) {
  await page.locator("#nino").fill("QQ123456C");
  await page.locator("#businessId").fill("XAIS12345678910");
  await page.locator("#taxYear").selectOption(taxYear);
  await page.locator("#taxYear").dispatchEvent("input");
  for (const [id, value] of Object.entries(extra)) await page.locator(`#${id}`).fill(value);
}

async function fillFigures(page, values) {
  await page.locator("details#moreIncome").evaluate((node) => (node.open = true));
  await page.locator("details#moreExpenses").evaluate((node) => (node.open = true));
  for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).fill(value);
}

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${width}.png`), fullPage: true });
  }
}

test.describe("UK property quarterly update fields", () => {
  test("sends every income and expense field in a cumulative year", async ({ page }) => {
    await openPage(page, "ukPropertyPeriod.html");
    await fillIdentity(page, "2025-26");
    await fillFigures(page, ITEMISED_VALUES);
    await shoot(page, "period-itemised");
    await page.locator("#submitBtn").click();

    await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
    const sent = await page.evaluate(() => window.__sent[0]);
    expect(sent.url).toBe("/api/v1/hmrc/itsa/uk-property/period");
    expect(sent.body).toMatchObject({ taxYear: "2025-26", ...ITEMISED_BODY });
    expect(sent.body.expenses).not.toHaveProperty("consolidatedExpenses");
  });

  test("sends the total expenses alone when the total is chosen", async ({ page }) => {
    await openPage(page, "ukPropertyPeriod.html");
    await fillIdentity(page, "2025-26", { periodAmount: "500" });
    await fillFigures(page, { repairsAndMaintenance: "60", professionalFees: "100" });
    await page.locator("#expenseBasisTotal").check();
    await expect(page.locator("#repairsAndMaintenance")).toBeDisabled();
    await page.locator("#consolidatedExpenses").fill("250");
    await shoot(page, "period-total");
    await page.locator("#submitBtn").click();

    await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
    const sent = await page.evaluate(() => window.__sent[0]);
    expect(sent.body.expenses).toEqual({ consolidatedExpenses: 250 });
    expect(sent.body.income).toEqual({ periodAmount: 500, otherIncome: 0 });
  });

  test("sends the fields under the property type in a dated year", async ({ page }) => {
    await openPage(page, "ukPropertyPeriod.html");
    await fillIdentity(page, "2024-25", { fromDate: "2024-04-06", toDate: "2024-07-05" });
    await fillFigures(page, ITEMISED_VALUES);
    await page.locator("#submitBtn").click();

    await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
    const sent = await page.evaluate(() => window.__sent[0]);
    expect(sent.body.ukNonFhlProperty).toEqual(ITEMISED_BODY);
  });

  test("sends only the zero defaults for a form with just the rental income", async ({ page }) => {
    await openPage(page, "ukPropertyPeriod.html");
    await fillIdentity(page, "2025-26", { periodAmount: "800" });
    await page.locator("#submitBtn").click();

    await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
    const sent = await page.evaluate(() => window.__sent[0]);
    expect(sent.body.income).toEqual({ periodAmount: 800, otherIncome: 0 });
    expect(sent.body.expenses).toEqual({ repairsAndMaintenance: 0, other: 0 });
  });
});

test.describe("UK property period amend fields", () => {
  test("sends only the fields that are filled", async ({ page }) => {
    await openPage(page, "ukPropertyPeriodAmend.html");
    await fillIdentity(page, "2025-26");
    await fillFigures(page, { rentARoomRentsReceived: "50", travelCosts: "120", residentialFinancialCostsCarriedForward: "150" });
    await shoot(page, "amend-itemised");
    await page.locator("#submitBtn").click();

    await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
    const sent = await page.evaluate(() => window.__sent[0]);
    expect(sent.method).toBe("PUT");
    expect(sent.body.income).toEqual({ rentARoom: { rentsReceived: 50 } });
    expect(sent.body.expenses).toEqual({ travelCosts: 120, residentialFinancialCostsCarriedForward: 150 });
  });

  test("sends the total expenses alone when the total is chosen", async ({ page }) => {
    await openPage(page, "ukPropertyPeriodAmend.html");
    await fillIdentity(page, "2025-26");
    await page.locator("#expenseBasisTotal").check();
    await page.locator("#consolidatedExpenses").fill("999.99");
    await page.locator("#submitBtn").click();

    await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
    const sent = await page.evaluate(() => window.__sent[0]);
    expect(sent.body.expenses).toEqual({ consolidatedExpenses: 999.99 });
  });

  test("loads a total that carries every field and selects the total expenses", async ({ page }) => {
    await openPage(page, "ukPropertyPeriodAmend.html");
    await page.evaluate(() =>
      window.applyCurrentTotal({
        ukProperty: {
          income: { periodAmount: 1, taxDeducted: 2, rentARoom: { rentsReceived: 3 } },
          expenses: { consolidatedExpenses: 4, residentialFinancialCostsCarriedForward: 5 },
        },
      }),
    );
    await expect(page.locator("#taxDeducted")).toHaveValue("2");
    await expect(page.locator("#rentARoomRentsReceived")).toHaveValue("3");
    await expect(page.locator("#expenseBasisTotal")).toBeChecked();
    await expect(page.locator("#consolidatedExpenses")).toHaveValue("4");
    await expect(page.locator("#residentialFinancialCostsCarriedForward")).toHaveValue("5");
    await expect(page.locator("details#moreIncome")).toHaveAttribute("open", "");
  });
});
