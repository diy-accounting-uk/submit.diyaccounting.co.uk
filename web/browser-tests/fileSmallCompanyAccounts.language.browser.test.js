// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileSmallCompanyAccounts.language.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput, servePageScripts } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PAGE_PATH = "companies-house/fileSmallCompanyAccounts.html";

async function openFormView(page, jurisdiction) {
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
  await page.evaluate((companyJurisdiction) => {
    company = { companyNumber: "00000001", companyName: "CWMNI PRAWF CYFYNGEDIG" };
    showDocumentLanguageChoice(companyJurisdiction);
    showView("formView");
  }, jurisdiction);
}

test.describe("File small company accounts page - the language of the accounts", () => {
  test("a Welsh company chooses Welsh accounts, and the request carries the choice", async ({ page }) => {
    await openFormView(page, "wales");
    await expect(page.locator("#documentLanguageSection")).toBeVisible();
    await expect(page.locator("#documentLanguageEn")).toBeChecked();
    expect(await page.evaluate(() => buildAccountsPayload().documentLanguage)).toBeUndefined();
    await page.check("#documentLanguageCy");
    expect(await page.evaluate(() => buildAccountsPayload().documentLanguage)).toBe("cy");
    await expect(page.locator("#documentLanguage-hint")).toContainText("Companies House sends its answer in English");
  });

  test("a company in England and Wales sees no choice and files in English", async ({ page }) => {
    await openFormView(page, "england-wales");
    await expect(page.locator("#documentLanguageSection")).toBeHidden();
    expect(await page.evaluate(() => buildAccountsPayload().documentLanguage)).toBeUndefined();
  });

  test("the Welsh copy of the page offers the same choice in Welsh", async ({ page }) => {
    const url = "http://localhost:3000/cy/companies-house/fileSmallCompanyAccounts.html";
    await page.route("**/*.js", async (route) => {
      if (route.request().resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });
    await servePageScripts(page);
    await serveMoneyInput(page);
    const html = fs.readFileSync(path.join(process.cwd(), "web/public/cy/companies-house/fileSmallCompanyAccounts.html"), "utf-8");
    await page.route(url, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: html });
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      company = { companyNumber: "00000001", companyName: "CWMNI PRAWF CYFYNGEDIG" };
      showDocumentLanguageChoice("wales");
      showView("formView");
    });
    await expect(page.locator("#documentLanguageSection h3")).toHaveText("Iaith y cyfrifon");
    await expect(page.locator("label[for=documentLanguageCy]")).toHaveText("Cymraeg");
    await page.check("#documentLanguageCy");
    expect(await page.evaluate(() => buildAccountsPayload().documentLanguage)).toBe("cy");
  });

  test("looking up an English company after a Welsh one hides the choice and drops Welsh", async ({ page }) => {
    await openFormView(page, "wales");
    await page.check("#documentLanguageCy");
    await page.evaluate(() => showDocumentLanguageChoice("england-wales"));
    await expect(page.locator("#documentLanguageSection")).toBeHidden();
    await expect(page.locator("#documentLanguageEn")).toBeChecked();
    expect(await page.evaluate(() => buildAccountsPayload().documentLanguage)).toBeUndefined();
  });
});
