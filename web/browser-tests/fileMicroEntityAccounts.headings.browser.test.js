// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.headings.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput, servePageScripts } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PAGE_PATH = "companies-house/fileMicroEntityAccounts.html";

async function openFormView(page) {
  const url = `http://localhost:3000/${PAGE_PATH}`;
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await servePageScripts(page);
  await serveMoneyInput(page);
  const html = fs.readFileSync(path.join(process.cwd(), "web/public", PAGE_PATH), "utf-8");
  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    company = { companyNumber: "00000001", companyName: "TEST MICRO LTD" };
    showView("formView");
  });
}

const REQUIRED = {
  FixedAssets: ["1000", "900"],
  CurrentAssets: ["5000", "3500"],
  CreditorsWithinOneYear: ["2000", "1500"],
  CreditorsAfterOneYear: ["0", "0"],
  CalledUpShareCapital: ["100", "100"],
  ProfitAndLossAccount: ["4060", "2800"],
  CapitalAndReserves: ["4160", "2900"],
};

async function fillRequired(page) {
  for (const [field, [current, prior]] of Object.entries(REQUIRED)) {
    await page.fill(`#current${field}`, current);
    await page.fill(`#prior${field}`, prior);
  }
}

test.describe("File micro-entity accounts page - optional balance sheet headings", () => {
  test("the four statutory headings are optional and absent from the request when blank", async ({ page }) => {
    await openFormView(page);
    for (const field of ["CalledUpShareCapitalNotPaid", "PrepaymentsAccruedIncome", "ProvisionsForLiabilities", "AccrualsDeferredIncome"]) {
      await expect(page.locator(`#current${field}`)).not.toHaveAttribute("required", "");
      await expect(page.locator(`#prior${field}`)).toBeVisible();
    }
    await fillRequired(page);
    const payload = await page.evaluate(() => buildAccountsPayload());
    expect(payload.balanceSheet.currentYear.accrualsDeferredIncome).toBeUndefined();
    expect(payload.balanceSheet.priorYear.calledUpShareCapitalNotPaid).toBeUndefined();
  });

  test("the headings reach the request and the net assets total", async ({ page }) => {
    await openFormView(page);
    await fillRequired(page);
    await page.fill("#currentCalledUpShareCapitalNotPaid", "10");
    await page.fill("#currentPrepaymentsAccruedIncome", "300");
    await page.fill("#currentProvisionsForLiabilities", "50");
    await page.fill("#currentAccrualsDeferredIncome", "100");
    await expect(page.locator("#yearTotals")).toContainText("Net assets: 4160 this year, 2900 last year. Matches capital and reserves.");
    const current = await page.evaluate(() => buildAccountsPayload().balanceSheet.currentYear);
    expect(current).toMatchObject({
      calledUpShareCapitalNotPaid: 10,
      prepaymentsAccruedIncome: 300,
      provisionsForLiabilities: 50,
      accrualsDeferredIncome: 100,
    });
  });

  for (const width of [390, 1280]) {
    test(`the balance sheet section at ${width} wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/submit.css", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/css",
          body: fs.readFileSync(path.join(process.cwd(), "web/public/submit.css"), "utf-8"),
        }),
      );
      await openFormView(page);
      await fillRequired(page);
      await page.fill("#currentPrepaymentsAccruedIncome", "300");
      await page.fill("#currentAccrualsDeferredIncome", "100");
      await page.locator("#currentFixedAssets").scrollIntoViewIfNeeded();
      await page.locator("section.form-section", { has: page.locator("table.ledger") }).screenshot({
        path: `target/micro-headings/balance-sheet-${width}.png`,
      });
    });
  }
});
