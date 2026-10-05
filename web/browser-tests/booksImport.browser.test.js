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
import { readBookSource } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { PRODUCTS } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";
import { savePackageZip } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { deriveItsaQuarterlyUpdate, deriveVatReturn } from "@diy-accounting-uk/diya-gl";
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
  test("fills the period summary, itemised expenses included, for the period end on the form", async ({ page }) => {
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#periodEndDate").fill("2025-07-05");

    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText(
      "Filled 16 figures from brickwork-se.diya-gl.zip for the period ending 2025-07-05.",
    );
    await expect(page.locator("#booksImportStatus")).toContainText(
      "The form has no field for these figures from the book: depreciationDisallowable (disallowable) £300.",
    );
    await expect(page.locator("#booksImportStatus")).not.toContainText("adminCosts");
    await expect(page.locator("#depreciation")).toHaveValue("300");
    await expect(page.locator("#adminCosts")).toHaveValue("360");
    await expect(page.locator("#consolidatedExpenses")).toHaveValue("");
    await expect(page.locator("#turnover")).toHaveValue("28050");
    await expect(page.locator("#otherIncome")).toHaveValue("0");
    await expect(page.locator("#costOfGoods")).toHaveValue("6825");
    await expect(page.locator("#otherExpenses")).toHaveValue("1800");
    await expect(page.locator("#periodStartDate")).toHaveValue("2025-04-06");
  });

  test("the period body carries the itemised expenses, or the total alone, never both", async ({ page }) => {
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#periodEndDate").fill("2025-07-05");
    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));
    await expect(page.locator("#adminCosts")).toHaveValue("360");

    const itemised = await page.evaluate(() =>
      readPeriodData(Object.fromEntries([...document.querySelectorAll("input")].map((i) => [i.id, i.value]))),
    );
    expect(itemised.periodExpenses).toMatchObject({ costOfGoods: 6825, adminCosts: 360, depreciation: 300, otherExpenses: 1800 });
    expect(itemised.periodExpenses).not.toHaveProperty("consolidatedExpenses");

    const problem = await page.evaluate(() => {
      document.getElementById("consolidatedExpenses").value = "9000";
      try {
        readPeriodData(Object.fromEntries([...document.querySelectorAll("input")].map((i) => [i.id, i.value])));
        return null;
      } catch (error) {
        return error.message;
      }
    });
    expect(problem).toContain("not both");

    await page.evaluate(() => {
      window.selfEmploymentExpenses.ITEMISED_FIELDS.forEach(({ id }) => (document.getElementById(id).value = "0"));
    });
    const total = await page.evaluate(() =>
      readPeriodData(Object.fromEntries([...document.querySelectorAll("input")].map((i) => [i.id, i.value]))),
    );
    expect(total.periodExpenses).toEqual({ consolidatedExpenses: 9000 });
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

const VAT_BOX_IDS = [
  "vatDueSales",
  "vatDueAcquisitions",
  "vatReclaimedCurrPeriod",
  "totalValueSalesExVAT",
  "totalValuePurchasesExVAT",
  "totalValueGoodsSuppliedExVAT",
  "totalAcquisitionsExVAT",
];

async function readInTestProcess(fileName, bytes) {
  return readBookSource(new Uint8Array(bytes), fileName, { products: PRODUCTS });
}

async function expectVatBoxesEqualDerivation(page, source, periodEnd) {
  const derived = await deriveVatReturn(source.book, source.lines, { periodEnd });
  for (const id of VAT_BOX_IDS) await expect(page.locator(`#${id}`)).toHaveValue(String(derived.hmrc[id]));
  await expect(page.locator("#periodStart")).toHaveValue(derived.periodStart);
}

test.describe("books import fills equal the derivations run on the same book", () => {
  test("a diya-gl zip fills the VAT boxes the derivation answers", async ({ page }) => {
    const bytes = await zippedBook("brickwork-pro-ltd-vat");
    const source = await readInTestProcess("brickwork.diya-gl.zip", bytes);
    await openPage(page, VAT_URL);
    await page.locator("#periodEnd").fill("2026-03-31");

    await chooseFile(page, "brickwork.diya-gl.zip", bytes);

    await expect(page.locator("#booksImportStatus")).toContainText("Filled the nine boxes");
    await expectVatBoxesEqualDerivation(page, source, "2026-03-31");
  });

  test("a complete package zip fills the VAT boxes the derivation answers", async ({ page }) => {
    test.setTimeout(180000);
    const source = await readInTestProcess("brickwork.diya-gl.zip", await zippedBook("brickwork-pro-ltd-vat"));
    const { zip, filename } = await savePackageZip(source.book, source.lines, {});
    const packageSource = await readInTestProcess(filename, Buffer.from(zip));
    expect(packageSource.kind).toBe("package-set");
    await openPage(page, VAT_URL);
    await page.locator("#periodEnd").fill("2026-03-31");

    await chooseFile(page, filename, Buffer.from(zip));

    await expect(page.locator("#booksImportStatus")).toContainText(`Filled the nine boxes from ${filename}`, { timeout: 120000 });
    await expectVatBoxesEqualDerivation(page, packageSource, "2026-03-31");
  });

  test("a diya-gl zip fills the quarterly period summary the derivation answers", async ({ page }) => {
    const bytes = await zippedBook("brickwork-pro-se-vat");
    const source = await readInTestProcess("brickwork-se.diya-gl.zip", bytes);
    const derived = await deriveItsaQuarterlyUpdate(source.book, source.lines, {});
    const period = derived.periods.find((candidate) => candidate.periodDates.periodEndDate === "2025-07-05");
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").fill(derived.taxYear);
    await page.locator("#periodEndDate").fill("2025-07-05");

    await chooseFile(page, "brickwork-se.diya-gl.zip", bytes);

    await expect(page.locator("#booksImportStatus")).toContainText("Filled");
    await expect(page.locator("#turnover")).toHaveValue(String(period.periodIncome.turnover));
    await expect(page.locator("#otherIncome")).toHaveValue(String(period.periodIncome.other ?? 0));
    for (const [name, figure] of Object.entries(period.periodExpenses)) {
      await expect(page.locator(`#${name}`)).toHaveValue(String(figure));
    }
    await expect(page.locator("#periodStartDate")).toHaveValue(period.periodDates.periodStartDate);
  });

  test("an .xlsx workbook of a book the filing derivations do not answer fills nothing and says it could not import it", async ({
    page,
  }) => {
    const workbook = fs.readFileSync(path.join(process.cwd(), "videos/fixtures/diya-gl-taxi-driver.xlsx"));
    const source = await readInTestProcess("taxi-driver.xlsx", workbook);
    expect(source.product).toBe("taxi");
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#periodEndDate").fill("2025-07-05");

    await chooseFile(page, "taxi-driver.xlsx", workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    await expect(page.locator("#booksImportStatus")).toContainText("Could not import taxi-driver.xlsx:");
    await expect(page.locator("#turnover")).toHaveValue("0");
  });
});
