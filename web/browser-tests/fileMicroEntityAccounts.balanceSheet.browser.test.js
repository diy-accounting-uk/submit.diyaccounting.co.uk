// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.balanceSheet.browser.test.js
// The micro-entity form checks the balance sheet's own arithmetic before the preview: capital and
// reserves equal called up share capital plus the profit and loss account in each year.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput, servePageScripts } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const PAGE_PATH = "companies-house/fileMicroEntityAccounts.html";

const CONSISTENT_YEARS = {
  current: {
    fixedAssets: 1000,
    currentAssets: 5000,
    creditorsWithinOneYear: 2000,
    creditorsAfterOneYear: 0,
    calledUpShareCapital: 100,
    profitAndLossAccount: 3900,
    capitalAndReserves: 4000,
  },
  prior: {
    fixedAssets: 900,
    currentAssets: 3500,
    creditorsWithinOneYear: 1500,
    creditorsAfterOneYear: 0,
    calledUpShareCapital: 100,
    profitAndLossAccount: 2800,
    capitalAndReserves: 2900,
  },
};

async function openFormView(page) {
  const url = `http://localhost:3000/${PAGE_PATH}`;
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
  await page.route("**/lib/balance-sheet-check.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: fs.readFileSync(path.join(PUBLIC_DIR, "lib/balance-sheet-check.js"), "utf-8"),
    }),
  );
  const html = fs.readFileSync(path.join(PUBLIC_DIR, PAGE_PATH), "utf-8");
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    company = { companyNumber: "00000001", companyName: "EXAMPLE TRADING LIMITED" };
    showView("formView");
  });
}

function upperFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function fillForm(page, years) {
  await page.fill("#periodStart", "2025-01-01");
  await page.fill("#periodEnd", "2025-12-31");
  for (const [prefix, figures] of Object.entries(years)) {
    for (const [field, value] of Object.entries(figures)) await page.fill(`#${prefix}${upperFirst(field)}`, String(value));
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

test.describe("File micro-entity accounts page - the balance sheet adds up", () => {
  test("shows a prior year whose capital and reserves differ from the lines under them, and renders nothing", async ({ page }) => {
    await openFormView(page);
    await fillForm(page, {
      ...CONSISTENT_YEARS,
      prior: { ...CONSISTENT_YEARS.prior, profitAndLossAccount: 1900, capitalAndReserves: 2900 },
    });
    await page.click("#previewBtn");

    await expect(page.locator("#statusMessagesContainer .status-error")).toHaveText(
      "Capital and reserves of 2900 for the prior year do not equal called up share capital plus the profit and loss account, which add up to 2000.",
    );
    expect(await page.evaluate(() => window.rendered.length)).toBe(0);
  });

  test("shows a current year whose capital and reserves differ from the lines under them", async ({ page }) => {
    await openFormView(page);
    await fillForm(page, { ...CONSISTENT_YEARS, current: { ...CONSISTENT_YEARS.current, profitAndLossAccount: 3800 } });
    await page.click("#previewBtn");
    await expect(page.locator("#statusMessagesContainer .status-error")).toContainText("for the current year");
    expect(await page.evaluate(() => window.rendered.length)).toBe(0);
  });

  test("renders accounts that add up", async ({ page }) => {
    await openFormView(page);
    await fillForm(page, CONSISTENT_YEARS);
    await page.click("#previewBtn");
    await expect(page.locator("#previewView")).toBeVisible();
    expect(await page.evaluate(() => window.rendered.length)).toBe(1);
  });
});
