// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/rates.browser.test.js
// rates.html: the calculator loads the engine modules from the site's own origin and recomputes
// as the form changes, and the navigation links to the page.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Serves the real static site from disk; every other host answers with an empty document or script.
async function serveRealSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      const isFrame = route.request().resourceType() === "document";
      await route.fulfill({
        status: 200,
        contentType: isFrame ? "text/html" : "application/javascript",
        body: isFrame ? "<!doctype html><title>embed</title>" : "",
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

async function openRatesPage(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await serveRealSite(page);
  await page.goto("http://localhost:3000/rates.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#ratesOutTaxAndNi")).not.toHaveText("");
  return pageErrors;
}

test.describe("rates.html", () => {
  test("shows every rate table and a result with the default inputs", async ({ page }) => {
    const pageErrors = await openRatesPage(page);
    for (const id of [
      "income-tax",
      "national-insurance",
      "capital-allowances",
      "mileage",
      "cis",
      "vat",
      "corporation-tax",
      "company-capital-allowances",
    ]) {
      await expect(page.locator(`#rates-${id}`)).toBeVisible();
    }
    await expect(page.locator("#ratesOutTaxAndNi")).toHaveText(/^£[\d,]+\.\d{2}$/);
    expect(pageErrors).toEqual([]);
  });

  test("income 45000 and expenses 5000 give 7131.80 of tax and National Insurance", async ({ page }) => {
    const pageErrors = await openRatesPage(page);
    await page.fill("#ratesIncome", "45000");
    await page.fill("#ratesExpenses", "5000");
    await expect(page.locator("#ratesOutTaxAndNi")).toHaveText("£7,131.80");
    expect(pageErrors).toEqual([]);
  });

  test("changing the tax year changes the writing down allowance", async ({ page }) => {
    await openRatesPage(page);
    await page.fill("#ratesPoolBroughtForward", "10000");
    await expect(page.locator("#ratesOutCapitalAllowances")).toHaveText("£1,400.00");
    await page.selectOption("#ratesTaxYear", "2025-26");
    await expect(page.locator("#ratesOutCapitalAllowances")).toHaveText("£1,800.00");
  });

  test("a limited company shows corporation tax with marginal relief and hides the Personal Allowance", async ({ page }) => {
    await openRatesPage(page);
    await page.check("#ratesTypeLimitedCompany");
    await page.fill("#ratesYearEnd", "2027-03-31");
    await page.fill("#ratesIncome", "100000");
    await page.fill("#ratesExpenses", "0");
    await expect(page.locator("#ratesOutCorporationTax")).toHaveText("£22,750.00");
    await expect(page.locator("#ratesOutMarginalRelief")).toHaveText("£2,250.00");
    await expect(page.locator("#ratesPersonalAllowance")).toBeHidden();
  });

  test("CIS labour of 30000 deducts 6000", async ({ page }) => {
    await openRatesPage(page);
    await page.check("#ratesCis");
    await page.fill("#ratesCisLabour", "30000");
    await expect(page.locator("#ratesOutCisDeducted")).toHaveText("£6,000.00");
  });

  test("the flat rate scheme starts at 16.5 percent and gives 8910 of VAT", async ({ page }) => {
    await openRatesPage(page);
    await page.fill("#ratesIncome", "45000");
    await page.fill("#ratesExpenses", "5000");
    await page.check("#ratesVatRegistered");
    await page.check("#ratesVatFlatRate");
    await expect(page.locator("#ratesFlatRatePercent")).toHaveValue("16.5");
    await expect(page.locator("#ratesOutVatDue")).toHaveText("£8,910.00");
  });

  test("the navigation links to the rates page", async ({ page }) => {
    await openRatesPage(page);
    await expect(page.locator("nav.main-nav a:has-text('Rates')")).toHaveAttribute("href", "rates.html");
  });
});
