// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/structuredBuildingAllowanceRows.browser.test.js
// The repeatable Structures and Buildings Allowance claims on the self-employment annual
// submission: add, fill, remove, load from HMRC, disable with the trading income allowance, send.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  serveCarriedIdentifiers,
  serveFormErrors,
  serveItsaPageScripts,
  serveMoneyInput,
  serveSiteStyles,
} from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/structured-building-allowance");

async function openAnnualPage(page, fileName, stubs) {
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
  await serveMoneyInput(page);
  await serveFormErrors(page);
  await serveSiteStyles(page);
  const html = fs
    .readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa", fileName), "utf-8")
    .replace("<head>", `<head><base href="${new URL(".", url)}">`)
    .replace(
      "<body>",
      `<body><script>
window.showStatus = function(){}; window.hideStatus = function(){}; window.showLoading = function(){}; window.hideLoading = function(){};
window.generateRandomState = function(){ return "s"; };
window.getGovClientHeaders = function(){ return Promise.resolve({}); };
${stubs}
</script>`,
    );
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(url, { waitUntil: "load" });
}

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${width}.png`), fullPage: true });
  }
}

const SELF_EMPLOYMENT_STUBS = `
window.putSelfEmploymentAnnual = function(details){ window.__sent.push(details); return Promise.resolve({}); };
window.showSavedRecord = function(){ return Promise.resolve(); };
`;

async function showEditForm(page) {
  await page.evaluate(() => {
    loadedNino = "QQ123456C";
    loadedBusinessId = "XAIS12345678910";
    loadedTaxYear = "2025-26";
    document.getElementById("loadCriteriaForm").style.display = "none";
    document.getElementById("annualEditForm").style.display = "block";
  });
}

test.describe("self-employment annual: Structures and Buildings Allowance claims", () => {
  test.beforeEach(async ({ page }) => {
    await openAnnualPage(page, "annualSubmission.html", SELF_EMPLOYMENT_STUBS);
    await showEditForm(page);
  });

  test("sends each claim in HMRC's shape with the itemised allowances", async ({ page }) => {
    await page.locator("#allowanceTypeItemised").check();
    await page.locator("#sba-add").click();
    await page.locator("#sba-1-amount").fill("1200");
    await page.locator("#sba-1-qualifyingDate").fill("2024-06-01");
    await page.locator("#sba-1-qualifyingAmountExpenditure").fill("30000");
    await page.locator("#sba-1-buildingName").fill("Workshop");
    await page.locator("#sba-1-postcode").fill("SW1A 2AA");
    await page.locator("#sba-add").click();
    await page.locator("#sba-2-amount").fill("50");
    await page.locator("#sba-2-buildingNumber").fill("12");
    await page.locator("#sba-2-postcode").fill("EC1A 1BB");
    await page.locator("#esba-add").click();
    await page.locator("#esba-1-amount").fill("75.5");
    await page.locator("#esba-1-buildingName").fill("Freeport unit");
    await page.locator("#esba-1-postcode").fill("PL1 1AA");
    await shoot(page, "annual-claims");
    await page.locator("#saveBtn").click();

    await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
    const { allowances } = await page.evaluate(() => window.__sent[0]);
    expect(allowances.structuredBuildingAllowance).toEqual([
      {
        amount: 1200,
        firstYear: { qualifyingDate: "2024-06-01", qualifyingAmountExpenditure: 30000 },
        building: { name: "Workshop", postcode: "SW1A 2AA" },
      },
      { amount: 50, building: { number: "12", postcode: "EC1A 1BB" } },
    ]);
    expect(allowances.enhancedStructuredBuildingAllowance).toEqual([
      { amount: 75.5, building: { name: "Freeport unit", postcode: "PL1 1AA" } },
    ]);
    expect(allowances).not.toHaveProperty("tradingIncomeAllowance");
  });

  test("a claim without a postcode or amount is refused and nothing is sent", async ({ page }) => {
    await page.locator("#allowanceTypeItemised").check();
    await page.locator("#sba-add").click();
    await page.locator("#saveBtn").click();

    await expect(page.locator("#form-error-summary")).toContainText("Claim 1: enter the allowance claimed");
    await expect(page.locator("#form-error-summary")).toContainText("Claim 1: enter the building postcode");
    expect(await page.evaluate(() => window.__sent.length)).toBe(0);
  });

  test("a first-year date without its expenditure is refused", async ({ page }) => {
    await page.locator("#allowanceTypeItemised").check();
    await page.locator("#sba-add").click();
    await page.locator("#sba-1-amount").fill("10");
    await page.locator("#sba-1-postcode").fill("SW1A 2AA");
    await page.locator("#sba-1-qualifyingDate").fill("2024-06-01");
    await page.locator("#saveBtn").click();

    await expect(page.locator("#form-error-summary")).toContainText("Claim 1: enter the qualifying expenditure");
  });

  test("removing a claim renumbers the rest", async ({ page }) => {
    await page.locator("#allowanceTypeItemised").check();
    await page.locator("#sba-add").click();
    await page.locator("#sba-add").click();
    await page.locator("#sba-2-amount").fill("7");
    await page.locator("#sba-claims .sba-claim").first().getByRole("button", { name: "Remove claim" }).click();

    await expect(page.locator("#sba-claims .sba-claim")).toHaveCount(1);
    await expect(page.locator("#sba-claims legend").nth(1)).toHaveText("Claim 1");
    await expect(page.locator("#sba-2-amount")).toHaveValue("7");
  });

  test("the claims are disabled with the trading income allowance and sent only with the itemised allowances", async ({ page }) => {
    await page.locator("#allowanceTypeItemised").check();
    await page.locator("#sba-add").click();
    await page.locator("#sba-1-amount").fill("10");
    await page.locator("#sba-1-postcode").fill("SW1A 2AA");
    await page.locator("#allowanceTypeTrading").check();
    await expect(page.locator("#sba-1-amount")).toBeDisabled();
    await expect(page.locator("#sba-add")).toBeDisabled();
    await page.locator("#tradingIncomeAllowance").fill("1000");
    await page.locator("#saveBtn").click();

    await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
    const { allowances } = await page.evaluate(() => window.__sent[0]);
    expect(allowances).toEqual({ tradingIncomeAllowance: 1000 });
  });

  test("loads the claims HMRC holds and selects the itemised allowances", async ({ page }) => {
    await page.evaluate(() =>
      populateEditForm({
        allowances: {
          annualInvestmentAllowance: 500,
          structuredBuildingAllowance: [
            {
              amount: 20,
              firstYear: { qualifyingDate: "2023-05-01", qualifyingAmountExpenditure: 900 },
              building: { name: "Shed", postcode: "AB1 2CD" },
            },
          ],
          enhancedStructuredBuildingAllowance: [{ amount: 30, building: { number: "3", postcode: "EF3 4GH" } }],
        },
      }),
    );

    await expect(page.locator("#allowanceTypeItemised")).toBeChecked();
    await expect(page.locator("#sba-1-amount")).toHaveValue("20");
    await expect(page.locator("#sba-1-qualifyingDate")).toHaveValue("2023-05-01");
    await expect(page.locator("#sba-1-qualifyingAmountExpenditure")).toHaveValue("900");
    await expect(page.locator("#sba-1-buildingName")).toHaveValue("Shed");
    await expect(page.locator("#sba-1-amount")).toBeEnabled();
    await expect(page.locator("#esba-1-buildingNumber")).toHaveValue("3");
    await expect(page.locator("#esba-1-postcode")).toHaveValue("EF3 4GH");
  });
});
