// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.firstAccounts.browser.test.js
//
// A company's first micro-entity accounts have no prior year: the form leaves out the prior year
// column, says why, and sends the date of incorporation. An established company's form keeps both
// years.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { registerCompany } from "@app/http-simulator/fixtures/register.js";
import { serveMoneyInput, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const PAGE_PATH = "companies-house/fileMicroEntityAccounts.html";
const COMPANY = registerCompany("00000001");
const FIRST_ACCOUNTS_COMPANY = { companyNumber: COMPANY.number, companyName: COMPANY.name, dateOfCreation: "2025-01-01" };
const ESTABLISHED_COMPANY = { ...FIRST_ACCOUNTS_COMPANY, dateOfCreation: "2019-01-01", accountsLastPeriodStart: "2024-01-01" };
const CURRENT_YEAR = {
  fixedAssets: 1000,
  currentAssets: 5000,
  creditorsWithinOneYear: 2000,
  creditorsAfterOneYear: 0,
  calledUpShareCapital: 100,
  profitAndLossAccount: 3900,
  capitalAndReserves: 4000,
};

function serveFile(page, pattern, file) {
  return page.route(pattern, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(PUBLIC_DIR, file), "utf-8") }),
  );
}

async function openFormView(page, { company = FIRST_ACCOUNTS_COMPANY, welsh = false, width = 1280 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    window.rendered = [];
    window.showLoading = () => {};
    window.hideLoading = () => {};
    window.hideStatus = () => document.getElementById("statusMessagesContainer")?.replaceChildren();
    window.showStatus = (text, type) => {
      const message = document.createElement("div");
      message.className = `status-message status-${type}`;
      message.textContent = text;
      document.getElementById("statusMessagesContainer").replaceChildren(message);
    };
    window.renderMicroEntityAccounts = async (accounts) => {
      window.rendered.push(accounts);
      return { ixbrl: "<html></html>" };
    };
  });
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    else await route.continue();
  });
  await servePageScripts(page);
  await serveMoneyInput(page);
  await serveSiteStyles(page);
  for (const lib of ["balance-sheet-check.js", "accounts-notes-check.js", "approval-date-check.js"]) {
    await serveFile(page, `**/lib/${lib}`, `lib/${lib}`);
  }
  if (welsh) {
    await serveFile(page, "**/lib/welsh-text.js", "lib/welsh-text.js");
    await serveFile(page, "**/widgets/page-chrome.js", "widgets/page-chrome.js");
  }
  const pagePath = welsh ? `cy/${PAGE_PATH}` : PAGE_PATH;
  const url = `http://localhost:3000/${pagePath}`;
  const html = fs.readFileSync(path.join(PUBLIC_DIR, pagePath), "utf-8");
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((openedCompany) => {
    company = openedCompany;
    showView("formView");
  }, company);
  await page.fill("#periodStart", "2025-01-01");
  await page.fill("#periodEnd", "2025-12-31");
}

async function fillCurrentYearAndApprove(page) {
  for (const [field, value] of Object.entries(CURRENT_YEAR)) {
    await page.fill(`#current${field.charAt(0).toUpperCase()}${field.slice(1)}`, String(value));
  }
  await page.fill("#averageEmployees", "2");
  await page.fill("#directorName", "Jo Director");
  await page.fill("#directorDateApproved", "2026-01-15");
  for (const id of [
    "statementSection477Exemption",
    "statementMembersNotRequiredAudit",
    "statementDirectorsResponsibilities",
    "statementMicroEntityProvisions",
  ]) {
    await page.check(`#${id}`);
  }
}

test.describe("File micro-entity accounts page - first accounts", () => {
  for (const width of [1280, 390]) {
    test(`first accounts leave out the prior year column and say why, at ${width} px`, async ({ page }) => {
      await openFormView(page, { width });
      await expect(page.locator("#firstAccountsLine")).toHaveText(
        "These are the company's first accounts: the period starts on the day it was incorporated, 1 January 2025, so there is no prior year.",
      );
      await expect(page.locator("#currentFixedAssets")).toBeVisible();
      await expect(page.locator("#priorFixedAssets")).toBeHidden();
      await expect(page.locator("#priorFixedAssets")).toBeDisabled();
      await fillCurrentYearAndApprove(page);
      await expect(page.locator("#yearTotals")).toHaveText("Net assets: £4,000 this year. Matches capital and reserves.");
      await page.screenshot({ path: `target/screenshots/first-accounts/micro-first-accounts-${width}.png`, fullPage: true });
    });

    test(`the Welsh form says the accounts are the company's first, at ${width} px`, async ({ page }) => {
      await openFormView(page, { welsh: true, width });
      await expect(page.locator("#firstAccountsLine")).toHaveText(
        "Dyma gyfrifon cyntaf y cwmni: mae’r cyfnod yn dechrau ar y diwrnod y cafodd ei gorffori, 1 Ionawr 2025, felly nid oes blwyddyn flaenorol.",
      );
      await expect(page.locator("#priorFixedAssets")).toBeHidden();
      await page.screenshot({ path: `target/screenshots/first-accounts/micro-first-accounts-cy-${width}.png`, fullPage: true });
    });
  }

  test("first accounts preview with one year, sending the date of incorporation and no prior year", async ({ page }) => {
    await openFormView(page);
    await fillCurrentYearAndApprove(page);
    await page.click("#previewBtn");
    await expect.poll(() => page.evaluate(() => window.rendered.length)).toBe(1);
    const [accounts] = await page.evaluate(() => window.rendered);
    expect(accounts.dateOfIncorporation).toBe("2025-01-01");
    expect(accounts.balanceSheet.priorYear).toBeUndefined();
    expect(accounts.balanceSheet.currentYear.capitalAndReserves).toBe(4000);
  });

  test("an established company's form keeps both years and asks for the prior year", async ({ page }) => {
    await openFormView(page, { company: ESTABLISHED_COMPANY });
    await expect(page.locator("#firstAccountsLine")).toHaveText(
      "These are not the company's first accounts, so the balance sheet shows the prior year beside this year.",
    );
    await expect(page.locator("#priorFixedAssets")).toBeVisible();
    await expect(page.locator("#priorFixedAssets")).toBeEnabled();
    const payload = await page.evaluate(() => buildAccountsPayload());
    expect(payload.dateOfIncorporation).toBeUndefined();
    expect(payload.balanceSheet.priorYear).toBeDefined();
  });
});
