// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/foreignPropertyEntries.browser.test.js
// The foreign property entry list: one fieldset for each country or property, add, remove, no
// repeated country, focus, and the figures of each entry.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveFormErrors, serveMoneyInput, serveSelfEmploymentExpenses, serveSiteStyles } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/foreign-property-entries");
const URL_OF_PAGE = "http://localhost:3000/hmrc/itsa/entriesHost.html";

const HOST_HTML = `<!doctype html>
<html lang="en-GB">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><link rel="stylesheet" href="/submit.css" /></head>
  <body>
    <main id="mainContent">
      <h1>Foreign property</h1>
      <form id="host" novalidate><div id="entries"></div></form>
    </main>
    <script src="/lib/money-input.js"></script>
    <script src="/lib/self-employment-expenses.js"></script>
    <script src="/lib/form-errors.js"></script>
    <script src="/lib/country-codes.js"></script>
    <script src="/lib/foreign-property-fields.js"></script>
    <script src="/widgets/foreign-property-entries.js"></script>
  </body>
</html>`;

function serveReal(page, pattern, relativePath) {
  return page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf-8"),
    }),
  );
}

async function openHost(page, mode, setup) {
  await page.route("**/*.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await serveMoneyInput(page);
  await serveSelfEmploymentExpenses(page);
  await serveFormErrors(page);
  await serveSiteStyles(page);
  await serveReal(page, "**/lib/country-codes.js", "lib/country-codes.js");
  await serveReal(page, "**/lib/foreign-property-fields.js", "lib/foreign-property-fields.js");
  await serveReal(page, "**/widgets/foreign-property-entries.js", "widgets/foreign-property-entries.js");
  await page.route(URL_OF_PAGE, (route) => route.fulfill({ status: 200, contentType: "text/html", body: HOST_HTML }));
  await page.goto(URL_OF_PAGE, { waitUntil: "load" });
  await page.evaluate(
    ({ mode, setup }) => {
      window.entries = window.foreignPropertyEntries.create(document.getElementById("entries"), {
        idPrefix: "fp",
        mode,
        renderBody: (body, prefix) => window.foreignPropertyFields.mountEntry(body, prefix),
      });
      // eslint-disable-next-line no-new-func
      if (setup) new Function(setup)();
    },
    { mode, setup },
  );
}

async function shoot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${width}.png`), fullPage: true });
  }
}

const optionValues = (page, selector) => page.locator(`${selector} option`).evaluateAll((options) => options.map((option) => option.value));

test.describe("foreign property entries: countries", () => {
  test.beforeEach(async ({ page }) => {
    await openHost(page, "country");
  });

  test("starts with no entry and an add button", async ({ page }) => {
    await expect(page.locator("fieldset.foreign-property-entry")).toHaveCount(0);
    await expect(page.locator("#fp-add")).toHaveText("Add a country");
  });

  test("adds a fieldset and moves focus to its country field", async ({ page }) => {
    await page.locator("#fp-add").click();
    await expect(page.locator("fieldset.foreign-property-entry")).toHaveCount(1);
    await expect(page.locator("#fp-1-country")).toBeFocused();
    await expect(page.locator("#fp-add")).toHaveText("Add another country");
    await page.locator("#fp-add").click();
    await expect(page.locator("#fp-2-country")).toBeFocused();
    await expect(page.locator("fieldset.foreign-property-entry > legend").allTextContents()).resolves.toEqual(["Country 1", "Country 2"]);
  });

  test("offers GBR in no fieldset and Jersey, Guernsey and the Isle of Man in each", async ({ page }) => {
    await page.locator("#fp-add").click();
    const codes = await optionValues(page, "#fp-1-country");
    expect(codes).not.toContain("GBR");
    expect(codes).toEqual(expect.arrayContaining(["JEY", "GGY", "IMN", "FRA"]));
    expect(codes.filter(Boolean).every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
  });

  test("does not offer a country chosen in one fieldset in the others, and offers it again after Remove", async ({ page }) => {
    await page.locator("#fp-add").click();
    await page.locator("#fp-1-country").selectOption("FRA");
    await page.locator("#fp-add").click();
    expect(await optionValues(page, "#fp-2-country")).not.toContain("FRA");
    expect(await optionValues(page, "#fp-1-country")).toContain("FRA");
    await page.locator("#fp-2-country").selectOption("ESP");
    expect(await optionValues(page, "#fp-1-country")).not.toContain("ESP");

    await page.locator("#fp-2 button.foreign-property-remove").click();
    await expect(page.locator("fieldset.foreign-property-entry")).toHaveCount(1);
    expect(await optionValues(page, "#fp-1-country")).toContain("ESP");
    await expect(page.locator("#fp-add")).toBeFocused();
    await page.locator("#fp-1 button.foreign-property-remove").click();
    await expect(page.locator("#fp-add")).toHaveText("Add a country");
  });

  test("renumbers the legends and the Remove labels after a Remove", async ({ page }) => {
    for (let i = 0; i < 3; i += 1) await page.locator("#fp-add").click();
    await page.locator("#fp-2 button.foreign-property-remove").click();
    await expect(page.locator("fieldset.foreign-property-entry > legend").allTextContents()).resolves.toEqual(["Country 1", "Country 2"]);
    await expect(page.locator("#fp-3 button.foreign-property-remove")).toHaveAttribute("aria-label", "Remove country 2");
  });

  test("reports each entry with no country, and links the error to its field", async ({ page }) => {
    await page.locator("#fp-add").click();
    await page.locator("#fp-add").click();
    await page.locator("#fp-1-country").selectOption("FRA");
    const errors = await page.evaluate(() => window.entries.validate().map((error) => ({ id: error.input.id, message: error.message })));
    expect(errors).toEqual([{ id: "fp-2-country", message: "Country 2: choose the country or territory" }]);
    await page.evaluate(() => window.formErrors.showFormErrors(window.entries.validate()));
    await page.locator(".error-summary a").click();
    await expect(page.locator("#fp-2-country")).toBeFocused();
  });

  test("reads each entry's figures under its own country", async ({ page }) => {
    await page.locator("#fp-add").click();
    await page.locator("#fp-1-country").selectOption("FRA");
    await page.locator("#fp-1-rentAmount").fill("1200");
    await page.locator("#fp-1-repairsAndMaintenance").fill("100.50");
    await page.locator("#fp-add").click();
    await page.locator("#fp-2-country").selectOption("ESP");
    await page.locator("#fp-2-rentAmount").fill("900");
    await page.locator("#fp-2 input[id$=expenseBasisTotal]").check();
    await page.locator("#fp-2-consolidatedExpenses").fill("250");
    await shoot(page, "countries");

    const sent = await page.evaluate(() =>
      window.entries.entries().map(({ prefix, key }) => ({ countryCode: key, ...window.foreignPropertyFields.readEntry(prefix) })),
    );
    expect(sent).toEqual([
      { countryCode: "FRA", income: { rentIncome: { rentAmount: 1200 } }, expenses: { repairsAndMaintenance: 100.5 } },
      { countryCode: "ESP", income: { rentIncome: { rentAmount: 900 } }, expenses: { consolidatedExpenses: 250 } },
    ]);
  });

  test("sends rentAmount and the relief choice for every entry in the dated model", async ({ page }) => {
    await page.locator("#fp-add").click();
    await page.locator("#fp-1-country").selectOption("DEU");
    const entry = await page.evaluate(() => window.foreignPropertyFields.readEntry("fp-1", { dated: true }));
    expect(entry.income).toEqual({ rentIncome: { rentAmount: 0 }, foreignTaxCreditRelief: false });
  });

  test("fills an entry from a loaded entry and opens the sections that hold figures", async ({ page }) => {
    await page.locator("#fp-add").click();
    await page.evaluate(() =>
      window.foreignPropertyFields.applyEntry("fp-1", {
        income: { rentIncome: { rentAmount: 500 }, foreignTaxPaidOrDeducted: 40, foreignTaxCreditRelief: true },
        expenses: { consolidatedExpenses: 75 },
      }),
    );
    await expect(page.locator("#fp-1-rentAmount")).toHaveValue("500");
    await expect(page.locator("#fp-1-moreIncome")).toHaveJSProperty("open", true);
    await expect(page.locator("#fp-1-expenseBasisTotal")).toBeChecked();
    await expect(page.locator("#fp-1-consolidatedExpenses")).toHaveValue("75");
    const entry = await page.evaluate(() => window.foreignPropertyFields.readEntry("fp-1"));
    expect(entry.income.foreignTaxCreditRelief).toBe(true);
    expect(entry.income.foreignTaxPaidOrDeducted).toBe(40);
  });
});

test.describe("foreign property entries: properties", () => {
  test.beforeEach(async ({ page }) => {
    await openHost(
      page,
      "property",
      `window.entries.setProperties([
        { propertyId: "P1", propertyName: "Lyon apartment", countryCode: "FRA" },
        { propertyId: "P2", propertyName: "Malaga villa", countryCode: "ESP" },
      ]);`,
    );
  });

  test("shows one fieldset for each property headed with its name and country, with no select, Remove or add button", async ({ page }) => {
    await expect(page.locator("fieldset.foreign-property-entry > legend").allTextContents()).resolves.toEqual([
      "Lyon apartment (France)",
      "Malaga villa (Spain)",
    ]);
    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.locator("button.foreign-property-remove")).toHaveCount(0);
    await expect(page.locator("#fp-add")).toHaveCount(0);
  });

  test("reads each entry under its property id", async ({ page }) => {
    await page.locator("#fp-1-rentAmount").fill("300");
    await page.locator("#fp-2-rentAmount").fill("700");
    await shoot(page, "properties");
    const sent = await page.evaluate(() =>
      window.entries.entries().map(({ prefix, key }) => ({ propertyId: key, ...window.foreignPropertyFields.readEntry(prefix) })),
    );
    expect(sent.map((entry) => entry.propertyId)).toEqual(["P1", "P2"]);
    expect(sent[0].income.rentIncome.rentAmount).toBe(300);
    expect(sent[1].income.rentIncome.rentAmount).toBe(700);
  });
});
