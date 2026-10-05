// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/booksImport.browser.test.js
// The "Fill from your books" card on the VAT return, the ITSA quarterly update and the ITSA annual
// submission pages: a DIYA-GL book dropped or chosen is read in the browser and fills the form
// from the figures the package's own derivations answer for the period the form names. The books
// are the example books the diya-gl package's tests use, zipped here the way the diya-gl page
// exports them.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const BOOKS_DIR = path.join(process.cwd(), "mcp/test/fixtures");
const VAT_URL = "http://localhost:3000/hmrc/vat/submitVat.html";
const QUARTERLY_URL = "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html";
const ANNUAL_URL = "http://localhost:3000/hmrc/itsa/annualSubmission.html";

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

async function zippedBook(directory) {
  const zip = new JSZip();
  zip.file("book.toml", fs.readFileSync(path.join(BOOKS_DIR, directory, "book.toml")));
  zip.file("lines.jsonl", fs.readFileSync(path.join(BOOKS_DIR, directory, "lines.jsonl")));
  return zip.generateAsync({ type: "nodebuffer" });
}

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

async function openPage(page, url) {
  await serveRealSite(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#booksImportFile")).toBeAttached();
}

async function chooseFile(page, name, buffer, mimeType = "application/zip") {
  await page.locator("#booksImportFile").setInputFiles({ name, mimeType, buffer });
}

test.describe("books import on the VAT return page", () => {
  test("fills the nine boxes for the period end on the form from a dropped diya-gl zip", async ({ page }) => {
    await openPage(page, VAT_URL);
    await page.locator("#periodEnd").fill("2026-03-31");
    const bytes = [...(await zippedBook("brickwork-pro-ltd-vat"))];

    await page.evaluate(async (zipBytes) => {
      const file = new File([new Uint8Array(zipBytes)], "brickwork.diya-gl.zip", { type: "application/zip" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      document
        .getElementById("booksImportDrop")
        .dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, bytes);

    await expect(page.locator("#booksImportStatus")).toContainText(
      "Filled the nine boxes from brickwork.diya-gl.zip for the period 2026-01-01 to 2026-03-31.",
    );
    await expect(page.locator("#vatDueSales")).toHaveValue("5760");
    await expect(page.locator("#vatDueAcquisitions")).toHaveValue("0");
    await expect(page.locator("#totalVatDue")).toHaveValue("5760.00");
    await expect(page.locator("#vatReclaimedCurrPeriod")).toHaveValue("2679");
    await expect(page.locator("#netVatDue")).toHaveValue("3081.00");
    await expect(page.locator("#totalValueSalesExVAT")).toHaveValue("28800");
    await expect(page.locator("#totalValuePurchasesExVAT")).toHaveValue("13395");
    await expect(page.locator("#totalValueGoodsSuppliedExVAT")).toHaveValue("0");
    await expect(page.locator("#totalAcquisitionsExVAT")).toHaveValue("0");
    await expect(page.locator("#periodStart")).toHaveValue("2026-01-01");
  });

  test("a period end the book does not carry names the periods the book covers and fills nothing", async ({ page }) => {
    await openPage(page, VAT_URL);
    await page.locator("#periodEnd").fill("2024-06-30");

    await chooseFile(page, "brickwork.diya-gl.zip", await zippedBook("brickwork-pro-ltd-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText("The book carries no VAT period ending 2024-06-30");
    await expect(page.locator("#booksImportStatus")).toContainText("2026-03-31");
    await expect(page.locator("#booksImportStatus")).toContainText("Nothing filled.");
    await expect(page.locator("#vatDueSales")).toHaveValue("");
  });

  test("a book chosen before the period asks for the period, then fills once it is entered", async ({ page }) => {
    await openPage(page, VAT_URL);

    await chooseFile(page, "brickwork.diya-gl.zip", await zippedBook("brickwork-pro-ltd-vat"));
    await expect(page.locator("#booksImportStatus")).toContainText("Choose the VAT period first");
    await expect(page.locator("#booksImportStatus")).toContainText("periods ending 2025-02-28");

    await page.locator("#periodEnd").fill("2025-12-31");
    await page.locator("#periodEnd").dispatchEvent("change");

    await expect(page.locator("#booksImportStatus")).toContainText("Filled the nine boxes");
    await expect(page.locator("#vatDueSales")).not.toHaveValue("");
    await expect(page.locator("#periodStart")).toHaveValue("2025-10-01");
  });

  test("a self-employed book is named as the wrong kind of book", async ({ page }) => {
    await openPage(page, VAT_URL);
    await page.locator("#periodEnd").fill("2026-03-31");

    await chooseFile(page, "se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText("Nothing filled.");
    await expect(page.locator("#vatDueSales")).toHaveValue("");
  });

  test("a legacy .xls workbook is refused with the reason", async ({ page }) => {
    await openPage(page, VAT_URL);
    const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

    await chooseFile(page, "old.xls", oleHeader, "application/vnd.ms-excel");

    await expect(page.locator("#booksImportStatus")).toContainText("Could not import old.xls:");
    await expect(page.locator("#booksImportStatus")).toContainText(".xls");
  });

  test("a package zip missing files from the template is refused naming the files", async ({ page }) => {
    await openPage(page, VAT_URL);
    const zip = new JSZip();
    const exampleDirectory = path.join(BOOKS_DIR, "finance/ltd-example");
    for (const name of fs.readdirSync(exampleDirectory)) zip.file(name, fs.readFileSync(path.join(exampleDirectory, name)));

    await chooseFile(page, "package.zip", await zip.generateAsync({ type: "nodebuffer" }));

    await expect(page.locator("#booksImportStatus")).toContainText("Could not import package.zip:");
    await expect(page.locator("#booksImportStatus")).toContainText("Vatreturns.xlsx");
  });
});

test.describe("books import on the ITSA quarterly update page", () => {
  test("fills the period summary for the period end on the form and names the expenses the form has no field for", async ({ page }) => {
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#periodEndDate").fill("2025-07-05");

    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText(
      "Filled 4 figures from brickwork-se.diya-gl.zip for the period ending 2025-07-05.",
    );
    await expect(page.locator("#booksImportStatus")).toContainText("The form has no field for these figures from the book:");
    await expect(page.locator("#booksImportStatus")).toContainText("adminCosts £360");
    await expect(page.locator("#turnover")).toHaveValue("28050");
    await expect(page.locator("#otherIncome")).toHaveValue("0");
    await expect(page.locator("#costOfGoods")).toHaveValue("6825");
    await expect(page.locator("#otherExpenses")).toHaveValue("1800");
    await expect(page.locator("#periodStartDate")).toHaveValue("2025-04-06");
  });

  test("a period end the book does not carry names the period ends the book covers and fills nothing", async ({ page }) => {
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#periodEndDate").fill("2025-08-31");

    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText("No period in brickwork-se.diya-gl.zip ends on 2025-08-31.");
    await expect(page.locator("#booksImportStatus")).toContainText("2025-07-05, 2025-10-05, 2026-01-05");
    await expect(page.locator("#turnover")).toHaveValue("0");
  });

  test("a book for another tax year than the form is refused", async ({ page }) => {
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").fill("2024-25");
    await page.locator("#periodEndDate").fill("2025-07-05");

    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toHaveText(
      "brickwork-se.diya-gl.zip is for 2025-26; this form is for 2024-25. Nothing filled.",
    );
    await expect(page.locator("#turnover")).toHaveValue("0");
  });
});

test.describe("books import on the ITSA annual submission page", () => {
  async function openEditForm(page, taxYear) {
    await openPage(page, ANNUAL_URL);
    await page.evaluate((year) => {
      loadedTaxYear = year;
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("annualEditForm").style.display = "block";
    }, taxYear);
  }

  test("fills the allowances from a book for the loaded tax year", async ({ page }) => {
    await openEditForm(page, "2025-26");

    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText("from brickwork-se.diya-gl.zip for 2025-26.");
    await expect(page.locator("#allowanceTypeItemised")).toBeChecked();
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("12000");
    await expect(page.locator("#annualInvestmentAllowance")).toBeEnabled();
  });

  test("a book for another tax year than the loaded one fills nothing", async ({ page }) => {
    await openEditForm(page, "2024-25");

    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toHaveText(
      "brickwork-se.diya-gl.zip is for 2025-26; this form is for 2024-25. Nothing imported.",
    );
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("0");
  });

  test("a company book is named as the wrong kind of book", async ({ page }) => {
    await openEditForm(page, "2025-26");

    await chooseFile(page, "company.diya-gl.zip", await zippedBook("brickwork-pro-ltd-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText("Could not import company.diya-gl.zip:");
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("0");
  });
});
