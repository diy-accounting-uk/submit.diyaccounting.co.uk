// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/annualSubmission.import.browser.test.js
// The annual submission page's "Import from a book" control: the JSON that the diya-submit MCP
// tool derive_itsa_annual_submission writes fills the real page's allowance and adjustment
// fields, names the figures the form has no field for, and refuses a file for another tax year.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const PAGE_URL = "http://localhost:3000/hmrc/itsa/annualSubmission.html";

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

// The shape derive_itsa_annual_submission answers for the BrickWork Pro self-employed book.
const DERIVED_2025_26 = {
  taxYear: "2025-26",
  fieldSlots: ["allowances.annualInvestmentAllowance", "adjustments.includedNonTaxableProfits"],
  allowances: {
    annualInvestmentAllowance: 12000,
    capitalAllowanceMainPool: 0,
    zeroEmissionsCarAllowance: 250,
    structuredBuildingAllowance: [{ amount: 100, building: { name: "Yard" } }],
  },
  adjustments: {
    includedNonTaxableProfits: 75.5,
    goodsAndServicesOwnUse: 0,
    overlapReliefUsed: 40,
  },
  omitted: ["adjustments.basisAdjustment"],
  warnings: [],
};

// Serves the real static site from disk so the real page script (populateEditForm,
// updateAllowanceFieldsEnabled and the import handler) runs, and stubs only the API.
async function serveRealSite(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "user@example.com" }));
    } catch {}
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname === "/api/v1/bundle") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles: [], tokensRemaining: 0 }) });
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

// The edit form only shows once HMRC has answered a load; the import control lives there, so the
// test shows the form the way a successful load would and names the loaded tax year.
async function openEditForm(page, taxYear) {
  await serveRealSite(page);
  await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof window.handleImportDerivedFigures === "function" || document.getElementById("importDerivedFigures") !== null,
  );
  await page.evaluate((year) => {
    loadedTaxYear = year;
    document.getElementById("loadCriteriaForm").style.display = "none";
    document.getElementById("annualEditForm").style.display = "block";
  }, taxYear);
}

async function importFile(page, name, content) {
  await page.locator("#importDerivedFigures").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(content) });
}

test.describe("annualSubmission.html imports a book's derived figures", () => {
  test("fills the allowances and adjustments from the derived-figures file and names what the form has no field for", async ({ page }) => {
    await openEditForm(page, "2025-26");

    await importFile(page, "annual.json", JSON.stringify(DERIVED_2025_26));

    await expect(page.locator("#importDerivedFiguresStatus")).toHaveText(
      "Imported 5 figures from annual.json for 2025-26. Not on this form: allowances.structuredBuildingAllowance, adjustments.overlapReliefUsed.",
    );
    await expect(page.locator("#allowanceTypeItemised")).toBeChecked();
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("12000");
    await expect(page.locator("#annualInvestmentAllowance")).toBeEnabled();
    await expect(page.locator("#zeroEmissionsCarAllowance")).toHaveValue("250");
    await expect(page.locator("#capitalAllowanceMainPool")).toHaveValue("0");
    await expect(page.locator("#includedNonTaxableProfits")).toHaveValue("75.5");
    await expect(page.locator("#tradingIncomeAllowance")).toBeDisabled();
    // The file input is cleared so the same file can be picked again after an edit.
    await expect(page.locator("#importDerivedFigures")).toHaveValue("");
  });

  test("a trading-allowance file selects the trading option", async ({ page }) => {
    await openEditForm(page, "2025-26");

    await importFile(page, "trading.json", JSON.stringify({ taxYear: "2025-26", allowances: { tradingIncomeAllowance: 1000 } }));

    await expect(page.locator("#importDerivedFiguresStatus")).toHaveText("Imported 1 figure from trading.json for 2025-26.");
    await expect(page.locator("#allowanceTypeTrading")).toBeChecked();
    await expect(page.locator("#tradingIncomeAllowance")).toHaveValue("1000");
    await expect(page.locator("#annualInvestmentAllowance")).toBeDisabled();
  });

  test("refuses a file for another tax year and leaves the form untouched", async ({ page }) => {
    await openEditForm(page, "2024-25");

    await importFile(page, "annual.json", JSON.stringify(DERIVED_2025_26));

    await expect(page.locator("#importDerivedFiguresStatus")).toHaveText(
      "annual.json is for 2025-26; this form is for 2024-25. Nothing imported.",
    );
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("0");
    await expect(page.locator("#allowanceTypeNone")).toBeChecked();
  });

  test("names a file that is not JSON or carries no figures", async ({ page }) => {
    await openEditForm(page, "2025-26");

    await importFile(page, "notes.json", "not json at all");
    await expect(page.locator("#importDerivedFiguresStatus")).toHaveText("Could not import notes.json: the file is not JSON.");

    await importFile(page, "empty.json", JSON.stringify({ taxYear: "2025-26", omitted: [] }));
    await expect(page.locator("#importDerivedFiguresStatus")).toHaveText(
      "Could not import empty.json: the file carries no allowances and no adjustments.",
    );
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("0");
  });
});
