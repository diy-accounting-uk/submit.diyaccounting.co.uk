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
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "@app/functions/companies-house/companiesHouseAccountsPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const BOOKS_DIR = path.join(process.cwd(), "mcp/test/fixtures");
const VAT_URL = "http://localhost:3000/hmrc/vat/submitVat.html";
const QUARTERLY_URL = "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html";
const ANNUAL_URL = "http://localhost:3000/hmrc/itsa/annualSubmission.html";
const UK_PROPERTY_PERIOD_URL = "http://localhost:3000/hmrc/itsa/ukPropertyPeriod.html";
const UK_PROPERTY_ANNUAL_URL = "http://localhost:3000/hmrc/itsa/ukPropertyAnnualSubmission.html";

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
    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#periodEndDate").fill("2025-07-05");

    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText(
      "Filled 17 figures from brickwork-se.diya-gl.zip for the period ending 2025-07-05.",
    );
    await expect(page.locator("#booksImportStatus")).not.toContainText("The form has no field");
    await expect(page.locator("#booksImportStatus")).not.toContainText("Disallowable");
    await expect(page.locator("#booksImportStatus")).not.toContainText("adminCosts");
    await expect(page.locator("#depreciationDisallowable")).toHaveValue("300");
    await expect(page.locator("#adminCostsDisallowable")).toHaveValue("");
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
    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#periodEndDate").fill("2025-07-05");
    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));
    await expect(page.locator("#adminCosts")).toHaveValue("360");

    const itemised = await page.evaluate(() =>
      readPeriodData(Object.fromEntries([...document.querySelectorAll("input")].map((i) => [i.id, i.value]))),
    );
    expect(itemised.periodExpenses).toMatchObject({ costOfGoods: 6825, adminCosts: 360, depreciation: 300, otherExpenses: 1800 });
    expect(itemised.periodExpenses).not.toHaveProperty("consolidatedExpenses");
    expect(itemised.periodDisallowableExpenses).toEqual({ depreciationDisallowable: 300 });

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
    const disallowableProblem = await page.evaluate(() => {
      try {
        readPeriodData(Object.fromEntries([...document.querySelectorAll("input")].map((i) => [i.id, i.value])));
        return null;
      } catch (error) {
        return error.message;
      }
    });
    expect(disallowableProblem).toContain("disallowable expenses go with the itemised expenses");

    await page.evaluate(() => {
      window.selfEmploymentExpenses.DISALLOWABLE_IDS.forEach((id) => (document.getElementById(id).value = ""));
    });
    const total = await page.evaluate(() =>
      readPeriodData(Object.fromEntries([...document.querySelectorAll("input")].map((i) => [i.id, i.value]))),
    );
    expect(total.periodExpenses).toEqual({ consolidatedExpenses: 9000 });
    expect(total.periodDisallowableExpenses).toEqual({});
  });

  test("a period end the book does not carry names the period ends the book covers and fills nothing", async ({ page }) => {
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#periodEndDate").fill("2025-08-31");

    await chooseFile(page, "brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText("No period in brickwork-se.diya-gl.zip ends on 2025-08-31.");
    await expect(page.locator("#booksImportStatus")).toContainText("2025-07-05, 2025-10-05, 2026-01-05");
    await expect(page.locator("#turnover")).toHaveValue("0");
  });

  test("a book for another tax year than the form is refused", async ({ page }) => {
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").selectOption("2024-25");
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

test.describe("books import on the UK property period page", () => {
  test("fills the rental income and expense fields for the period dates and names the figures the form has no field for", async ({
    page,
  }) => {
    await openPage(page, UK_PROPERTY_PERIOD_URL);
    await page.locator("#fromDate").fill("2025-04-06");
    await page.locator("#toDate").fill("2025-07-05");

    await chooseFile(page, "landlord.diya-gl.zip", await zippedBook("landlord-uk-property"));

    await expect(page.locator("#booksImportStatus")).toHaveText(
      "Filled 4 figures from landlord.diya-gl.zip for the period 2025-04-06 to 2025-07-05. Check them, then submit. " +
        "The form has no field for these figures from the book: income.premiumsOfLeaseGrant £500, expenses.professionalFees £120.",
    );
    await expect(page.locator("#periodAmount")).toHaveValue("2000");
    await expect(page.locator("#otherIncome")).toHaveValue("75.50");
    await expect(page.locator("#repairsAndMaintenance")).toHaveValue("450.25");
    await expect(page.locator("#otherExpenses")).toHaveValue("15");
  });

  test("a book chosen before the dates asks for them, then fills once they are entered", async ({ page }) => {
    await openPage(page, UK_PROPERTY_PERIOD_URL);

    await chooseFile(page, "landlord.diya-gl.zip", await zippedBook("landlord-uk-property"));
    await expect(page.locator("#booksImportStatus")).toHaveText(
      "Enter the period start and end dates and the figures fill from landlord.diya-gl.zip.",
    );

    await page.locator("#fromDate").fill("2025-04-06");
    await page.locator("#toDate").fill("2025-07-05");
    await expect(page.locator("#periodAmount")).toHaveValue("2000");
  });

  test("a company book is refused and nothing fills", async ({ page }) => {
    await openPage(page, UK_PROPERTY_PERIOD_URL);
    await page.locator("#fromDate").fill("2025-04-06");
    await page.locator("#toDate").fill("2025-07-05");

    await chooseFile(page, "company.diya-gl.zip", await zippedBook("brickwork-pro-ltd-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText("Nothing filled.");
    await expect(page.locator("#periodAmount")).toHaveValue("");
  });
});

test.describe("books import on the UK property annual submission page", () => {
  async function openEditForm(page, taxYear) {
    await openPage(page, UK_PROPERTY_ANNUAL_URL);
    await page.evaluate((year) => {
      loadedTaxYear = year;
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("annualEditForm").style.display = "block";
    }, taxYear);
  }

  test("fills the adjustments and itemised allowances and leaves the elections alone", async ({ page }) => {
    await openEditForm(page, "2025-26");
    await page.locator("#nonResidentLandlord").check();

    await chooseFile(page, "landlord.diya-gl.zip", await zippedBook("landlord-uk-property"));

    await expect(page.locator("#booksImportStatus")).toHaveText("Imported 4 figures from landlord.diya-gl.zip for 2025-26.");
    await expect(page.locator("#balancingCharge")).toHaveValue("40");
    await expect(page.locator("#privateUseAdjustment")).toHaveValue("120");
    await expect(page.locator("#allowanceTypeItemised")).toBeChecked();
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("1800");
    await expect(page.locator("#annualInvestmentAllowance")).toBeEnabled();
    await expect(page.locator("#costOfReplacingDomesticItems")).toHaveValue("640");
    await expect(page.locator("#nonResidentLandlord")).toBeChecked();
    await expect(page.locator("#rentARoomJointlyLet")).not.toBeChecked();
  });

  test("allowances do not fill over a property income allowance election", async ({ page }) => {
    await openEditForm(page, "2025-26");
    await page.locator("#allowanceTypePropertyIncome").check();

    await chooseFile(page, "landlord.diya-gl.zip", await zippedBook("landlord-uk-property"));

    await expect(page.locator("#booksImportStatus")).toHaveText(
      "Imported 2 figures from landlord.diya-gl.zip for 2025-26. Some fields were not on this form.",
    );
    await expect(page.locator("#allowanceTypePropertyIncome")).toBeChecked();
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("0");
  });

  test("a company book is refused and nothing fills", async ({ page }) => {
    await openEditForm(page, "2025-26");

    await chooseFile(page, "company.diya-gl.zip", await zippedBook("brickwork-pro-ltd-vat"));

    await expect(page.locator("#booksImportStatus")).toContainText("Nothing imported.");
    await expect(page.locator("#balancingCharge")).toHaveValue("0");
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

  test("a complete self-employed package zip fills the quarterly period summary the derivation answers", async ({ page }) => {
    test.setTimeout(180000);
    const source = await readInTestProcess("brickwork-se.diya-gl.zip", await zippedBook("brickwork-pro-se-vat"));
    const { zip, filename } = await savePackageZip(source.book, source.lines, {});
    const packageSource = await readInTestProcess(filename, Buffer.from(zip));
    expect(packageSource.kind).toBe("package-set");
    const derived = await deriveItsaQuarterlyUpdate(packageSource.book, packageSource.lines, {});
    const period = derived.periods.find((candidate) => candidate.periodDates.periodEndDate === "2025-07-05");
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").selectOption(derived.taxYear);
    await page.locator("#periodEndDate").fill("2025-07-05");

    await chooseFile(page, filename, Buffer.from(zip));

    await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 120000 });
    await expect(page.locator("#turnover")).toHaveValue(String(period.periodIncome.turnover));
    await expect(page.locator("#otherIncome")).toHaveValue(String(period.periodIncome.other ?? 0));
    for (const [name, figure] of Object.entries(period.periodExpenses)) {
      await expect(page.locator(`#${name}`)).toHaveValue(String(figure));
    }
    await expect(page.locator("#periodStartDate")).toHaveValue(period.periodDates.periodStartDate);
  });

  test("a diya-gl zip fills the quarterly period summary the derivation answers", async ({ page }) => {
    const bytes = await zippedBook("brickwork-pro-se-vat");
    const source = await readInTestProcess("brickwork-se.diya-gl.zip", bytes);
    const derived = await deriveItsaQuarterlyUpdate(source.book, source.lines, {});
    const period = derived.periods.find((candidate) => candidate.periodDates.periodEndDate === "2025-07-05");
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").selectOption(derived.taxYear);
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

  test("an .xlsx workbook of a taxi book is read in the browser, fills nothing and says the ITSA derivations take self-employed books", async ({
    page,
  }) => {
    const workbook = fs.readFileSync(path.join(process.cwd(), "videos/fixtures/diya-gl-taxi-driver.xlsx"));
    const source = await readInTestProcess("taxi-driver.xlsx", workbook);
    expect(source.product).toBe("taxi");
    await openPage(page, QUARTERLY_URL);
    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#periodEndDate").fill("2025-07-05");

    await chooseFile(page, "taxi-driver.xlsx", workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    await expect(page.locator("#booksImportStatus")).toHaveText(
      'Could not import taxi-driver.xlsx: The book is a "taxi" book; the ITSA derivations read a self-employed (se) book.',
    );
    await expect(page.locator("#turnover")).toHaveValue("0");
  });
});

const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "node_modules/@diy-accounting-uk/diya-gl/package.json"), "utf8"),
).version;

function toFragment(handoff) {
  return "#books=" + Buffer.from(typeof handoff === "string" ? handoff : JSON.stringify(handoff), "utf8").toString("base64url");
}

async function vatHandoffFor(directory, periodEnd) {
  const source = await readInTestProcess("book.diya-gl.zip", await zippedBook(directory));
  const derived = await deriveVatReturn(source.book, source.lines, { periodEnd });
  const figures = Object.fromEntries(VAT_BOX_IDS.map((id) => [id, derived.hmrc[id]]));
  return {
    derived,
    handoff: {
      kind: "vat",
      sourceFileName: "brickwork.diya-gl.zip",
      packageVersion: PACKAGE_VERSION,
      period: { periodStart: derived.periodStart, periodEnd: derived.periodEnd },
      figures,
    },
  };
}

async function quarterlyHandoffFor(directory, periodEnd) {
  const source = await readInTestProcess("book.diya-gl.zip", await zippedBook(directory));
  const derived = await deriveItsaQuarterlyUpdate(source.book, source.lines, {});
  const period = derived.periods.find((candidate) => candidate.periodDates.periodEndDate === periodEnd);
  return {
    period,
    handoff: {
      kind: "itsa-quarterly",
      sourceFileName: "brickwork-se.diya-gl.zip",
      packageVersion: PACKAGE_VERSION,
      period: { taxYear: derived.taxYear, ...period.periodDates },
      figures: {
        periodIncome: period.periodIncome,
        periodExpenses: period.periodExpenses,
        periodDisallowableExpenses: period.periodDisallowableExpenses,
      },
    },
  };
}

// The address bar keeps no fragment after the first load, so a fragment on arrival marks the
// load that happens before sign-in: that load has no sign-in token.
async function arriveSignedOutWhenFragmentPresent(page) {
  await page.addInitScript(() => {
    if (location.hash.startsWith("#books=")) localStorage.removeItem("cognitoIdToken");
  });
}

test.describe("figures sent from a DIYA-GL page in the URL fragment", () => {
  test("the VAT figures wait through sign-in, fill after it, and leave neither fragment nor stored copy", async ({ page }) => {
    const { derived, handoff } = await vatHandoffFor("brickwork-pro-ltd-vat", "2026-03-31");
    await serveRealSite(page);
    await arriveSignedOutWhenFragmentPresent(page);

    await page.goto(VAT_URL + toFragment(handoff), { waitUntil: "domcontentloaded" });
    await expect(page.locator("#booksImportStatus")).toContainText("Sign in and the figures from brickwork.diya-gl.zip fill this form.");
    expect(await page.evaluate(() => location.hash)).toBe("");
    expect(await page.evaluate(() => sessionStorage.getItem("booksHandoff"))).not.toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem("postLoginRedirect"))).toBe("/hmrc/vat/submitVat.html");
    await expect(page.locator("#vatDueSales")).toHaveValue("");

    await page.goto(VAT_URL, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#booksImportStatus")).toContainText(
      `Filled the nine boxes from brickwork.diya-gl.zip for the period ${derived.periodStart} to ${derived.periodEnd}.`,
    );
    for (const id of VAT_BOX_IDS) await expect(page.locator(`#${id}`)).toHaveValue(String(derived.hmrc[id]));
    await expect(page.locator("#periodStart")).toHaveValue(derived.periodStart);
    await expect(page.locator("#periodEnd")).toHaveValue(derived.periodEnd);
    expect(await page.evaluate(() => sessionStorage.getItem("booksHandoff"))).toBeNull();
    expect(await page.evaluate(() => location.hash)).toBe("");
  });

  test("a signed-in customer has the quarterly figures filled on arrival and a reload does not fill again", async ({ page }) => {
    const { period, handoff } = await quarterlyHandoffFor("brickwork-pro-se-vat", "2025-07-05");
    await serveRealSite(page);

    await page.goto(QUARTERLY_URL + toFragment(handoff), { waitUntil: "domcontentloaded" });

    await expect(page.locator("#booksImportStatus")).toContainText("from brickwork-se.diya-gl.zip for the period ending 2025-07-05.");
    await expect(page.locator("#taxYear")).toHaveValue(handoff.period.taxYear);
    await expect(page.locator("#periodStartDate")).toHaveValue(period.periodDates.periodStartDate);
    await expect(page.locator("#periodEndDate")).toHaveValue("2025-07-05");
    await expect(page.locator("#turnover")).toHaveValue(String(period.periodIncome.turnover));
    for (const [name, figure] of Object.entries(period.periodExpenses)) {
      await expect(page.locator(`#${name}`)).toHaveValue(String(figure));
    }
    expect(await page.evaluate(() => sessionStorage.getItem("booksHandoff"))).toBeNull();
    expect(await page.evaluate(() => location.hash)).toBe("");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#booksImportStatus")).toHaveText("");
    await expect(page.locator("#turnover")).toHaveValue("0");
  });

  test("a fragment carrying a figure that is not a number is refused and nothing fills", async ({ page }) => {
    const { handoff } = await vatHandoffFor("brickwork-pro-ltd-vat", "2026-03-31");
    handoff.figures.vatDueSales = "5760; drop table";
    await serveRealSite(page);

    await page.goto(VAT_URL + toFragment(handoff), { waitUntil: "domcontentloaded" });

    await expect(page.locator("#booksImportStatus")).toContainText(
      "The figures sent from your books could not be used: the VAT figures vatDueSales is not a number. Nothing filled.",
    );
    await expect(page.locator("#vatDueSales")).toHaveValue("");
    expect(await page.evaluate(() => sessionStorage.getItem("booksHandoff"))).toBeNull();
  });

  test("a fragment that is not valid base64url is refused and cleared", async ({ page }) => {
    await serveRealSite(page);

    await page.goto(VAT_URL + "#books=not%20encoded!", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#booksImportStatus")).toContainText("The figures sent from your books could not be used:");
    expect(await page.evaluate(() => location.hash)).toBe("");
    expect(await page.evaluate(() => sessionStorage.getItem("booksHandoff"))).toBeNull();
  });

  test("annual figures wait for the loaded tax year, then fill", async ({ page }) => {
    const handoff = {
      kind: "itsa-annual",
      sourceFileName: "brickwork-se.diya-gl.zip",
      packageVersion: PACKAGE_VERSION,
      period: { taxYear: "2025-26" },
      figures: { allowances: { annualInvestmentAllowance: 12000 }, adjustments: {} },
    };
    await serveRealSite(page);

    await page.goto(ANNUAL_URL + toFragment(handoff), { waitUntil: "domcontentloaded" });
    await expect(page.locator("#booksImportStatus")).toContainText("Load the annual submission for 2025-26");
    expect(await page.evaluate(() => sessionStorage.getItem("booksHandoff"))).not.toBeNull();

    await page.evaluate(() => {
      loadedTaxYear = "2025-26";
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("annualEditForm").style.display = "block";
      window.booksImport.applyPendingHandoff();
    });

    await expect(page.locator("#booksImportStatus")).toContainText("Imported 1 figure from brickwork-se.diya-gl.zip for 2025-26.");
    await expect(page.locator("#annualInvestmentAllowance")).toHaveValue("12000");
    expect(await page.evaluate(() => sessionStorage.getItem("booksHandoff"))).toBeNull();
  });
});

const GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const DRIVE_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization",
};

async function withFakeGoogleIdentity(page) {
  await page.addInitScript(() => {
    window.__tokenRequests = [];
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            return {
              requestAccessToken(options) {
                window.__tokenRequests.push({ clientId: config.client_id, scope: config.scope, prompt: options.prompt });
                setTimeout(() => config.callback({ access_token: "fake-drive-token", expires_in: 3600 }), 0);
              },
            };
          },
          hasGrantedAllScopes: () => true,
        },
      },
    };
  });
}

async function withFakeGooglePicker(page, pickedFile) {
  await page.addInitScript((file) => {
    window.__pickerBuilds = [];
    window.google.picker = {
      ViewId: { DOCS: "docs" },
      Response: { ACTION: "action", DOCUMENTS: "docs" },
      Action: { PICKED: "picked", CANCEL: "cancel" },
      Document: { ID: "id", NAME: "name", MIME_TYPE: "mimeType" },
      DocsView: function () {
        this.setMimeTypes = (mimeTypes) => {
          this.mimeTypes = mimeTypes;
          return this;
        };
      },
      PickerBuilder: function () {
        const record = {};
        window.__pickerBuilds.push(record);
        const builder = this;
        builder.addView = (view) => ((record.mimeTypes = view.mimeTypes), builder);
        builder.setOAuthToken = (token) => ((record.token = token), builder);
        builder.setDeveloperKey = (key) => ((record.developerKey = key), builder);
        builder.setAppId = (appId) => ((record.appId = appId), builder);
        builder.setCallback = (callback) => ((record.callback = callback), builder);
        builder.build = () => ({
          setVisible() {
            setTimeout(() => record.callback({ action: "picked", docs: [file] }), 0);
          },
        });
      },
    };
  }, pickedFile);
}

async function openPageWithDriveConfig(page, url, driveEnv, download) {
  await serveRealSite(page);
  await page.route("**/submit.env", async (route) => {
    const placeholder = fs.readFileSync(path.join(PUBLIC_ROOT, "submit.env"), "utf-8");
    await route.fulfill({ status: 200, contentType: "text/plain", body: `${placeholder}\n${driveEnv}\n` });
  });
  const downloads = [];
  await page.route("https://www.googleapis.com/drive/v3/files/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: DRIVE_CORS_HEADERS });
      return;
    }
    downloads.push({ url: request.url(), authorization: request.headers().authorization });
    await route.fulfill({ status: 200, headers: DRIVE_CORS_HEADERS, contentType: "application/zip", body: download });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#booksImportFile")).toBeAttached();
  return downloads;
}

const DRIVE_ENV = [
  "GOOGLE_DRIVE_CLIENT_ID=670010122633-56q89d0h9c4skb9cpj4h9j2gr3kq06vd.apps.googleusercontent.com",
  "GOOGLE_DRIVE_PICKER_API_KEY=test-picker-key",
].join("\n");

test.describe("books import from Google Drive", () => {
  test("the Drive button is absent when the page has no Drive client id", async ({ page }) => {
    await openPageWithDriveConfig(page, VAT_URL, "GOOGLE_DRIVE_CLIENT_ID=\nGOOGLE_DRIVE_PICKER_API_KEY=", Buffer.from(""));
    await page.waitForFunction(() => window.envReady.then(() => true));

    await expect(page.locator("#booksImportChoose")).toBeVisible();
    await expect(page.locator("#booksImportDrive")).toHaveCount(0);
  });

  test("the Drive button is absent when the page has a client id and no Picker key", async ({ page }) => {
    await openPageWithDriveConfig(
      page,
      VAT_URL,
      "GOOGLE_DRIVE_CLIENT_ID=670010122633-56q89d0h9c4skb9cpj4h9j2gr3kq06vd.apps.googleusercontent.com\nGOOGLE_DRIVE_PICKER_API_KEY=",
      Buffer.from(""),
    );
    await page.waitForFunction(() => window.envReady.then(() => true));

    await expect(page.locator("#booksImportDrive")).toHaveCount(0);
  });

  test("the Drive button sits beside the file dialog when the page has a client id and a Picker key", async ({ page }) => {
    await openPageWithDriveConfig(page, VAT_URL, DRIVE_ENV, Buffer.from(""));

    await expect(page.locator("#booksImportDrop #booksImportChoose")).toBeVisible();
    await expect(page.locator("#booksImportDrop #booksImportDrive")).toBeVisible();
  });

  test("a diya-gl zip picked from Drive is downloaded with the token and fills the form", async ({ page }) => {
    await withFakeGoogleIdentity(page);
    await withFakeGooglePicker(page, { id: "picked-1", name: "brickwork.diya-gl.zip", mimeType: "application/zip" });
    const downloads = await openPageWithDriveConfig(page, VAT_URL, DRIVE_ENV, await zippedBook("brickwork-pro-ltd-vat"));
    await page.locator("#periodEnd").fill("2026-03-31");

    await page.locator("#booksImportDrive").click();

    await expect(page.locator("#booksImportStatus")).toContainText(
      "Filled the nine boxes from brickwork.diya-gl.zip for the period 2026-01-01 to 2026-03-31.",
    );
    await expect(page.locator("#vatDueSales")).toHaveValue("5760");
    expect(downloads).toEqual([
      { url: "https://www.googleapis.com/drive/v3/files/picked-1?alt=media", authorization: "Bearer fake-drive-token" },
    ]);
    const tokenRequests = await page.evaluate(() => window.__tokenRequests);
    expect(tokenRequests).toEqual([
      {
        clientId: "670010122633-56q89d0h9c4skb9cpj4h9j2gr3kq06vd.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/drive.file",
        prompt: "consent",
      },
    ]);
    const pickerBuild = await page.evaluate(() => window.__pickerBuilds[0]);
    expect(pickerBuild).toMatchObject({ token: "fake-drive-token", developerKey: "test-picker-key", appId: "670010122633" });
    expect(pickerBuild.mimeTypes).toContain("application/zip");
  });

  test("a native Google Sheet picked from Drive is refused and nothing is downloaded or filled", async ({ page }) => {
    await withFakeGoogleIdentity(page);
    await withFakeGooglePicker(page, { id: "sheet-1", name: "My books", mimeType: GOOGLE_SHEET_MIME_TYPE });
    const downloads = await openPageWithDriveConfig(page, VAT_URL, DRIVE_ENV, await zippedBook("brickwork-pro-ltd-vat"));
    await page.locator("#periodEnd").fill("2026-03-31");

    await page.locator("#booksImportDrive").click();

    await expect(page.locator("#booksImportStatus")).toContainText("Could not import My books: it is a Google Sheet.");
    await expect(page.locator("#vatDueSales")).toHaveValue("");
    expect(downloads).toEqual([]);
  });
});

const MICRO_URL = "http://localhost:3000/companies-house/fileMicroEntityAccounts.html";
const SMALL_URL = "http://localhost:3000/companies-house/fileSmallCompanyAccounts.html";

async function zippedFixtureBook(directory) {
  const zip = new JSZip();
  zip.file("book.toml", fs.readFileSync(path.join(process.cwd(), "fixtures/diya-gl", directory, "book.toml")));
  zip.file("lines.jsonl", fs.readFileSync(path.join(process.cwd(), "fixtures/diya-gl", directory, "lines.jsonl")));
  return zip.generateAsync({ type: "nodebuffer" });
}

async function openAccountsPage(page, url, companyNumber) {
  await openPage(page, url);
  await page.route(`**/api/v1/companies-house/company/${companyNumber}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ companyNumber, companyName: "Example Ltd" }) }),
  );
  await page.locator("#companyNumber").fill(companyNumber);
  await page.locator("#companyLookupBtn").click();
  await expect(page.locator("#formView")).toBeVisible();
}

test.describe("books import on the micro-entity accounts page", () => {
  test("fills the period, both balance sheets, the employees and the director from a dropped zip", async ({ page }) => {
    await openAccountsPage(page, MICRO_URL, "12345678");
    await chooseFile(page, "precision-code.diya-gl.zip", await zippedFixtureBook("precision-code-ltd"));

    await expect(page.locator("#booksImportStatus")).toContainText(
      "from precision-code.diya-gl.zip for the period 2025-04-01 to 2026-03-31.",
      { timeout: 60_000 },
    );
    await expect(page.locator("#periodStart")).toHaveValue("2025-04-01");
    await expect(page.locator("#periodEnd")).toHaveValue("2026-03-31");
    await expect(page.locator("#currentFixedAssets")).toHaveValue("208990");
    await expect(page.locator("#currentCurrentAssets")).toHaveValue("206175");
    await expect(page.locator("#currentCreditorsWithinOneYear")).toHaveValue("49137");
    await expect(page.locator("#currentCreditorsAfterOneYear")).toHaveValue("58000");
    await expect(page.locator("#currentCalledUpShareCapital")).toHaveValue("100");
    await expect(page.locator("#currentProfitAndLossAccount")).toHaveValue("307928");
    await expect(page.locator("#currentCapitalAndReserves")).toHaveValue("308028");
    await expect(page.locator("#priorFixedAssets")).toHaveValue("182902");
    await expect(page.locator("#priorCapitalAndReserves")).toHaveValue("180802");
    await expect(page.locator("#averageEmployees")).toHaveValue("3");
    await expect(page.locator("#directorName")).toHaveValue("Carol Smith");
    await expect(page.locator("#currentYearTotals")).toContainText("Matches capital and reserves.");
    await expect(page.locator("#priorYearTotals")).toContainText("Matches capital and reserves.");
    await expect(page.locator("#dormant")).not.toBeChecked();
    await expect(page.locator("#directorDateApproved")).toHaveValue("");
  });

  test("a book for another company fills nothing", async ({ page }) => {
    await openAccountsPage(page, MICRO_URL, "99999999");
    await chooseFile(page, "precision-code.diya-gl.zip", await zippedFixtureBook("precision-code-ltd"));

    await expect(page.locator("#booksImportStatus")).toContainText(
      "precision-code.diya-gl.zip is for company 12345678; this form is for company 99999999. Nothing filled.",
      { timeout: 60_000 },
    );
    await expect(page.locator("#currentFixedAssets")).toHaveValue("");
  });

  test("a book with no turnover, no costs and no change in reserves ticks the dormant box", async ({ page }) => {
    await openAccountsPage(page, MICRO_URL, "87654321");
    await chooseFile(page, "dormant.diya-gl.zip", await zippedFixtureBook("dormant-ltd"));

    await expect(page.locator("#booksImportStatus")).toContainText("so the dormant box is ticked", { timeout: 60_000 });
    await expect(page.locator("#dormant")).toBeChecked();
    await expect(page.locator("#dormantFields")).toBeVisible();
    await expect(page.locator("#currentCalledUpShareCapital")).toHaveValue("100");
    await expect(page.locator("#currentProfitAndLossAccount")).toHaveValue("0");
    await expect(page.locator("#priorProfitAndLossAccount")).toHaveValue("0");
    await expect(page.locator("#averageEmployees")).toHaveValue("0");
  });
});

test.describe("books import on the small company accounts page", () => {
  test("fills the profit and loss account, the balance sheet, the fixed asset note, the employees and the directors", async ({ page }) => {
    await openAccountsPage(page, SMALL_URL, "12345678");
    await chooseFile(page, "precision-code.diya-gl.zip", await zippedFixtureBook("precision-code-ltd"));

    await expect(page.locator("#booksImportStatus")).toContainText(
      "from precision-code.diya-gl.zip for the period 2025-04-01 to 2026-03-31.",
      { timeout: 60_000 },
    );
    await expect(page.locator("#currentTurnover")).toHaveValue("341283");
    await expect(page.locator("#currentCostOfSales")).toHaveValue("18787");
    await expect(page.locator("#currentAdministrativeExpenses")).toHaveValue("151548");
    await expect(page.locator("#currentInterestReceivable")).toHaveValue("340");
    await expect(page.locator("#currentTax")).toHaveValue("29062");
    await expect(page.locator("#currentProfitAndLossTotals")).toContainText("Profit for the year: 142226.");
    await expect(page.locator("#currentFixedAssets")).toHaveValue("208990");
    await expect(page.locator("#currentCashAtBank")).toHaveValue("192995");
    await expect(page.locator("#currentProfitAndLossAccount")).toHaveValue("307928");
    await expect(page.locator("#currentBalanceSheetTotals")).toContainText("Matches share capital plus the profit and loss reserve.");
    await expect(page.locator("#includeFixedAssetNote")).toBeChecked();
    await expect(page.locator("#noteLandBuildingsCostAtStart")).toHaveValue("200000");
    await expect(page.locator("#notePlantMachineryAdditions")).toHaveValue("52500");
    await expect(page.locator("#fixedAssetNoteTotals")).toContainText("Matches fixed assets.");
    await expect(page.locator("#averageEmployees")).toHaveValue("3");
    await expect(page.locator("#directors")).toHaveValue("Carol Smith\nDavid Brown\nEmma Wilson");
    await expect(page.locator("#directorName")).toHaveValue("Carol Smith");
    await expect(page.locator("#includeComparatives")).not.toBeChecked();
    await expect(page.locator("#principalActivity")).toHaveValue("");
  });
});

const ACCOUNTS_CASES = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/companies-house-test-service-cases.json"), "utf8"),
).filter((testCase) => testCase.type === "accounts");

function builtAccountsDocument(caseName, overrides = {}) {
  const { name, type, govTestScenario, expectedOutcome, ...requestBody } = ACCOUNTS_CASES.find((testCase) => testCase.name === caseName);
  const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify({ ...requestBody, ...overrides }) }, []);
  return Buffer.from(buildAccountsIxbrl(accounts), "utf8");
}

test.describe("books import of an iXBRL accounts document", () => {
  test("a micro-entity document fills the micro-entity form", async ({ page }) => {
    await openAccountsPage(page, MICRO_URL, "06846849");
    await chooseFile(page, "accounts.xhtml", builtAccountsDocument("micro-entity-accounts"), "application/xhtml+xml");

    await expect(page.locator("#booksImportStatus")).toContainText(
      "from accounts.xhtml (FRS 102 2026 taxonomy) for the period 2025-04-01 to 2026-03-31.",
      { timeout: 60_000 },
    );
    await expect(page.locator("#periodStart")).toHaveValue("2025-04-01");
    await expect(page.locator("#currentFixedAssets")).toHaveValue("800");
    await expect(page.locator("#currentCurrentAssets")).toHaveValue("6000");
    await expect(page.locator("#currentCreditorsWithinOneYear")).toHaveValue("1968");
    await expect(page.locator("#currentProfitAndLossAccount")).toHaveValue("4732");
    await expect(page.locator("#currentCapitalAndReserves")).toHaveValue("4832");
    await expect(page.locator("#priorFixedAssets")).toHaveValue("0");
    await expect(page.locator("#priorCapitalAndReserves")).toHaveValue("134");
    await expect(page.locator("#averageEmployees")).toHaveValue("0");
    await expect(page.locator("#directorName")).toHaveValue("Antony Christopher Cartwright");
    await expect(page.locator("#dormant")).not.toBeChecked();
    await expect(page.locator("#directorDateApproved")).toHaveValue("");
  });

  test("a dormant document ticks the dormant box and fills its trading history and shares", async ({ page }) => {
    await openAccountsPage(page, MICRO_URL, "09991482");
    await chooseFile(page, "dormant.xhtml", builtAccountsDocument("micro-entity-accounts-dormant"), "application/xhtml+xml");

    await expect(page.locator("#booksImportStatus")).toContainText("so the dormant box is ticked", { timeout: 60_000 });
    await expect(page.locator("#dormant")).toBeChecked();
    await expect(page.locator("#dormantTradingStatus")).toHaveValue("neverTraded");
    await expect(page.locator("#shareClass")).toHaveValue("ordinaryShares");
    await expect(page.locator("#nominalValue")).toHaveValue("1");
    await expect(page.locator("#currentCalledUpShareCapital")).toHaveValue("1");
  });

  test("a small company document fills the profit and loss account, the balance sheets, the note and the directors", async ({ page }) => {
    await openAccountsPage(page, SMALL_URL, "06846849");
    await chooseFile(page, "accounts.xhtml", builtAccountsDocument("small-company-accounts-full"), "application/xhtml+xml");

    await expect(page.locator("#booksImportStatus")).toContainText("from accounts.xhtml (FRS 102 2026 taxonomy)", { timeout: 60_000 });
    await expect(page.locator("#copyFull")).toBeChecked();
    await expect(page.locator("#currentTurnover")).toHaveValue("8500");
    await expect(page.locator("#currentCostOfSales")).toHaveValue("0");
    await expect(page.locator("#currentTax")).toHaveValue("1102");
    await expect(page.locator("#currentFixedAssets")).toHaveValue("800");
    await expect(page.locator("#currentOtherCreditors")).toHaveValue("366");
    await expect(page.locator("#includeComparatives")).toBeChecked();
    await expect(page.locator("#priorTurnover")).toHaveValue("7639");
    await expect(page.locator("#priorCreditorsAfterOneYear")).toHaveValue("0");
    await expect(page.locator("#includeFixedAssetNote")).toBeChecked();
    await expect(page.locator("#noteComputerEquipmentAdditions")).toHaveValue("1200");
    await expect(page.locator("#noteComputerEquipmentDepreciationCharge")).toHaveValue("400");
    await expect(page.locator("#averageEmployees")).toHaveValue("0");
    await expect(page.locator("#principalActivity")).toHaveValue("the retail of accounting software");
    await expect(page.locator("#directors")).toHaveValue(
      "Antony Christopher Cartwright\nSamantha Ashley Cartwright\nJane Elizabeth Grundy",
    );
    await expect(page.locator("#directorName")).toHaveValue("Antony Christopher Cartwright");
  });

  test("a filleted small company document selects the filleted copy and leaves the profit and loss account empty", async ({ page }) => {
    await openAccountsPage(page, SMALL_URL, "06846849");
    await chooseFile(page, "filleted.xhtml", builtAccountsDocument("small-company-accounts-filleted"), "application/xhtml+xml");

    await expect(page.locator("#booksImportStatus")).toContainText("from filleted.xhtml", { timeout: 60_000 });
    await expect(page.locator("#copyFilleted")).toBeChecked();
    await expect(page.locator("#currentTurnover")).toHaveValue("");
    await expect(page.locator("#currentFixedAssets")).toHaveValue("800");
    await expect(page.locator("#priorFixedAssets")).toHaveValue("0");
  });

  test("a document for another company fills nothing", async ({ page }) => {
    await openAccountsPage(page, MICRO_URL, "99999999");
    await chooseFile(page, "accounts.xhtml", builtAccountsDocument("micro-entity-accounts"), "application/xhtml+xml");

    await expect(page.locator("#booksImportStatus")).toContainText(
      "This file is for company 06846849; the company looked up is 99999999. Nothing filled.",
      { timeout: 60_000 },
    );
    await expect(page.locator("#currentFixedAssets")).toHaveValue("");
  });

  test("a small company document on the micro-entity page fills nothing", async ({ page }) => {
    await openAccountsPage(page, MICRO_URL, "06846849");
    await chooseFile(page, "accounts.xhtml", builtAccountsDocument("small-company-accounts-full"), "application/xhtml+xml");

    await expect(page.locator("#booksImportStatus")).toContainText("this page takes a micro-entity's accounts", { timeout: 60_000 });
    await expect(page.locator("#currentFixedAssets")).toHaveValue("");
  });
});

const SET_FIXTURES = path.join(process.cwd(), "web/browser-tests/fixtures");

function setFiles(directory) {
  return ["accounts-1.xhtml", "accounts-2.xhtml"].map((name) => ({
    name,
    mimeType: "application/xhtml+xml",
    buffer: fs.readFileSync(path.join(SET_FIXTURES, directory, name)),
  }));
}

test.describe("books import of an iXBRL document set", () => {
  test("the two files of a set, chosen together, fill the small company form", async ({ page }) => {
    await openAccountsPage(page, SMALL_URL, "03176906");
    await page.locator("#booksImportFile").setInputFiles(setFiles("ixds-two-file"));

    await expect(page.locator("#booksImportStatus")).toContainText("from accounts-1.xhtml, accounts-2.xhtml (FRS 102 2026 taxonomy)", {
      timeout: 60_000,
    });
    await expect(page.locator("#currentTurnover")).toHaveValue("50000");
    await expect(page.locator("#currentCostOfSales")).toHaveValue("20000");
    await expect(page.locator("#currentFixedAssets")).not.toHaveValue("");
  });

  test("a set whose files state one fact with two values is refused with a title, a cause and a next step", async ({ page }) => {
    await openAccountsPage(page, SMALL_URL, "03176906");
    await page.locator("#booksImportFile").setInputFiles(setFiles("ixds-two-file-disagree"));

    await expect(page.locator(".status-message-title")).toHaveText("Could not read the accounts files", { timeout: 60_000 });
    await expect(page.locator(".status-message-cause")).toContainText("TurnoverRevenue");
    await expect(page.locator(".status-message-next")).toHaveText("Choose the files again");
    await expect(page.locator("#booksImportStatus")).toContainText("Nothing filled.");
    await expect(page.locator("#currentTurnover")).toHaveValue("");
  });
});
