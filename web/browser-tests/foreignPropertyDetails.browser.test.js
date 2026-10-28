// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/foreignPropertyDetails.browser.test.js
// The foreign property details page: list the properties of a tax year, add one, rename one and
// end one. The HMRC calls are stubbed; the page, its form errors and its styles are the real ones.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  serveCarriedIdentifiers,
  serveFormErrors,
  serveItsaPageScripts,
  serveItsaSubmissionModel,
  serveSiteStyles,
} from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/foreign-property-details");
const PAGE_URL = "http://localhost:3000/hmrc/itsa/foreignPropertyDetails.html";

const STUBS = `
window.__sent = [];
window.__status = [];
window.__properties = [
  { propertyId: "FP1", propertyName: "Lyon apartment", countryCode: "FRA" },
  { propertyId: "FP2", propertyName: "Malaga villa", countryCode: "ESP", endDate: "2026-09-30", endReason: "disposal" },
];
window.showStatus = function(message, type){ window.__status.push({ message, type }); };
window.hideStatus = function(){}; window.showLoading = function(){}; window.hideLoading = function(){};
window.generateRandomState = function(){ return "s"; };
window.getGovClientHeaders = function(){ return Promise.resolve({}); };
window.getForeignPropertyDetails = function(nino, businessId, taxYear){
  window.__sent.push({ call: "get", nino, businessId, taxYear });
  return Promise.resolve({ propertyDetails: window.__properties });
};
window.postForeignPropertyDetails = function(details){
  window.__sent.push({ call: "post", details });
  window.__properties.push({ propertyId: "FP3", propertyName: details.propertyName, countryCode: details.countryCode });
  return Promise.resolve({ propertyId: "FP3" });
};
window.putForeignPropertyDetails = function(details){
  window.__sent.push({ call: "put", details });
  return Promise.resolve({});
};
`;

async function openPage(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("hmrcAccessToken", "token");
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
  await serveFormErrors(page);
  await serveSiteStyles(page);
  await page.route("**/lib/country-codes.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: fs.readFileSync(path.join(PUBLIC_DIR, "lib/country-codes.js"), "utf-8"),
    }),
  );
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, "hmrc/itsa/foreignPropertyDetails.html"), "utf-8")
    .replace("<head>", `<head><base href="${new URL(".", PAGE_URL)}">`)
    .replace("<body>", `<body><script>${STUBS}</script>`);
  await page.route(PAGE_URL, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(PAGE_URL, { waitUntil: "load" });
}

async function loadList(page, taxYear = "2026-27") {
  await page.locator("#nino").fill("qq123456c");
  await page.locator("#businessId").fill("XAIS12345678910");
  await page.locator("#taxYear").selectOption(taxYear);
  await page.locator("#loadBtn").click();
}

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${scheme}-${width}.png`), fullPage: true });
    }
  }
}

test.describe("foreign property details", () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page);
  });

  test("lists the properties of the tax year with their country and status", async ({ page }) => {
    await loadList(page);
    const rows = page.locator("#propertiesTable tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Lyon apartment");
    await expect(rows.nth(0)).toContainText("France");
    await expect(rows.nth(0)).toContainText("Letting");
    await expect(rows.nth(1)).toContainText("Spain");
    await expect(rows.nth(1)).toContainText("Ended on 2026-09-30 (Sold or given away)");
    expect(await page.evaluate(() => window.__sent[0])).toEqual({
      call: "get",
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      taxYear: "2026-27",
    });
    await shoot(page, "list");
  });

  test("refuses a tax year before 2026-27 without calling HMRC", async ({ page }) => {
    await loadList(page, "2025-26");
    await expect(page.locator(".error-summary")).toContainText("Property details start with the 2026-27 tax year");
    expect(await page.evaluate(() => window.__sent.length)).toBe(0);
  });

  test("adds a property and lists it", async ({ page }) => {
    await loadList(page);
    await page.locator("#addPropertyBtn").click();
    await expect(page.locator("#propertyFormTitle")).toBeFocused();
    await page.locator("#savePropertyBtn").click();
    await expect(page.locator(".error-summary")).toContainText("Enter the property name");
    await expect(page.locator(".error-summary")).toContainText("Choose the country or territory");

    await page.locator("#propertyName").fill("  Porto flat ");
    await page.locator("#propertyCountry").selectOption("PRT");
    await shoot(page, "add");
    await page.locator("#savePropertyBtn").click();

    await expect(page.locator("#propertiesTable tbody tr")).toHaveCount(3);
    await expect(page.locator("#propertiesTable tbody tr").nth(2)).toContainText("Porto flat");
    const post = await page.evaluate(() => window.__sent.find((sent) => sent.call === "post"));
    expect(post.details).toMatchObject({
      nino: "QQ123456C",
      businessId: "XAIS12345678910",
      taxYear: "2026-27",
      propertyName: "Porto flat",
      countryCode: "PRT",
    });
    expect(post.details.endDate).toBeUndefined();
    await expect(page.locator("#propertyForm")).toBeHidden();
  });

  test("offers neither GBR nor a free-text country", async ({ page }) => {
    await loadList(page);
    await page.locator("#addPropertyBtn").click();
    const codes = await page.locator("#propertyCountry option").evaluateAll((options) => options.map((option) => option.value));
    expect(codes).not.toContain("GBR");
    expect(codes).toEqual(expect.arrayContaining(["FRA", "JEY", "GGY", "IMN"]));
  });

  test("renames a property and keeps its country fixed", async ({ page }) => {
    await loadList(page);
    await page.getByRole("button", { name: "Change Lyon apartment" }).click();
    await expect(page.locator("#propertyFormTitle")).toHaveText("Change Lyon apartment");
    await expect(page.locator("#propertyCountry")).toBeDisabled();
    await expect(page.locator("#propertyCountry")).toHaveValue("FRA");
    await page.locator("#propertyName").fill("Lyon flat");
    await page.locator("#savePropertyBtn").click();
    await expect.poll(() => page.evaluate(() => window.__sent.some((sent) => sent.call === "put"))).toBe(true);
    const put = await page.evaluate(() => window.__sent.find((sent) => sent.call === "put"));
    expect(put.details).toMatchObject({ nino: "QQ123456C", taxYear: "2026-27", propertyId: "FP1", propertyName: "Lyon flat" });
    expect(put.details.countryCode).toBeUndefined();
    expect(put.details.endDate).toBeUndefined();
  });

  test("ends a property with a date and a reason, and asks for both", async ({ page }) => {
    await loadList(page);
    await page.getByRole("button", { name: "Change Lyon apartment" }).click();
    await expect(page.locator("#propertyEndFields")).toBeHidden();
    await page.locator("#propertyEnded").check();
    await expect(page.locator("#propertyEndFields")).toBeVisible();
    await page.locator("#savePropertyBtn").click();
    await expect(page.locator(".error-summary")).toContainText("Enter the date you stopped letting the property");
    await expect(page.locator(".error-summary")).toContainText("Choose why you stopped letting the property");

    await page.locator("#propertyEndDate").fill("2026-10-31");
    await page.locator("#propertyEndReason").selectOption("no-longer-letting");
    await shoot(page, "end");
    await page.locator("#savePropertyBtn").click();
    await expect.poll(() => page.evaluate(() => window.__sent.some((sent) => sent.call === "put"))).toBe(true);
    const put = await page.evaluate(() => window.__sent.find((sent) => sent.call === "put"));
    expect(put.details).toMatchObject({ propertyId: "FP1", endDate: "2026-10-31", endReason: "no-longer-letting" });
  });

  test("refuses a property name over 105 characters", async ({ page }) => {
    await loadList(page);
    await page.locator("#addPropertyBtn").click();
    await page.locator("#propertyName").evaluate((input) => input.removeAttribute("maxlength"));
    await page.locator("#propertyName").fill("x".repeat(106));
    await page.locator("#propertyCountry").selectOption("FRA");
    await page.locator("#savePropertyBtn").click();
    await expect(page.locator(".error-summary")).toContainText("105 characters or fewer");
  });

  test("shows an empty message when HMRC holds no properties", async ({ page }) => {
    await page.evaluate(() => {
      window.__properties = [];
    });
    await loadList(page);
    await expect(page.locator("#propertiesTable")).toContainText("HMRC holds no foreign properties for this tax year");
  });
});
