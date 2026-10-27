// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.dormant.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput, servePageScripts } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PAGE_PATH = "companies-house/fileMicroEntityAccounts.html";

async function openFormView(page) {
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
  await page.evaluate(() => {
    company = { companyNumber: "00000001", companyName: "TEST DORMANT LTD" };
    showView("formView");
  });
}

test.describe("File micro-entity accounts page - dormant company", () => {
  test("the share fields stay hidden until dormant is ticked", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#dormantFields")).toBeHidden();
    await page.check("#dormant");
    await expect(page.locator("#dormantFields")).toBeVisible();
    await expect(page.locator("#shareClass")).toBeVisible();
    await expect(page.locator("#nominalValue")).toBeVisible();
    await expect(page.locator("#dormantTradingStatus")).toBeVisible();
    await page.uncheck("#dormant");
    await expect(page.locator("#dormantFields")).toBeHidden();
  });

  test("the dormant hint says what dormant means", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#dormant-hint")).toContainText("no significant accounting transaction");
    await expect(page.locator("#dormant")).toHaveAttribute("aria-describedby", "dormant-hint");
  });

  test("ticking dormant swaps the section 477 statement for the section 480 statement", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#statementSection477ExemptionLabel")).toContainText("section 477");
    await page.check("#dormant");
    await expect(page.locator("#statementSection477ExemptionLabel")).toContainText(
      "section 480 of the Companies Act 2006 relating to dormant",
    );
    await page.uncheck("#dormant");
    await expect(page.locator("#statementSection477ExemptionLabel")).toContainText("section 477");
  });

  test("the request carries the dormant fields only when dormant is ticked", async ({ page }) => {
    await openFormView(page);
    const undormant = await page.evaluate(() => buildAccountsPayload());
    expect(undormant.dormant).toBeUndefined();
    expect(undormant.shareClass).toBeUndefined();

    await page.check("#dormant");
    await page.selectOption("#dormantTradingStatus", "noLongerTrading");
    await page.selectOption("#shareClass", "preferenceShares");
    await page.fill("#nominalValue", "0.01");
    const dormant = await page.evaluate(() => buildAccountsPayload());
    expect(dormant).toMatchObject({
      dormant: true,
      dormantTradingStatus: "noLongerTrading",
      shareClass: "preferenceShares",
      nominalValue: 0.01,
    });
  });

  test("the registered office parts fill from the company record, can be edited and reach the request", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#officeAddressLine1")).toBeVisible();
    expect(await page.evaluate(() => buildAccountsPayload().registeredOffice)).toBeUndefined();
    await page.evaluate(() =>
      window.accountsFormSections.fillRegisteredOffice({
        addressLine1: "14 Marsh Lane",
        cityOrTown: "Stockport",
        countyRegion: "Cheshire",
        postalCode: "SK4 1PX",
      }),
    );
    await expect(page.locator("#officeCityOrTown")).toHaveValue("Stockport");
    await page.fill("#officePostalCode", "SK4 1PY");
    const office = await page.evaluate(() => buildAccountsPayload().registeredOffice);
    expect(office).toEqual({ addressLine1: "14 Marsh Lane", cityOrTown: "Stockport", countyRegion: "Cheshire", postalCode: "SK4 1PY" });
  });

  test("the accountants' report fields show only when ticked and the statement is prefilled", async ({ page }) => {
    await openFormView(page);
    await expect(page.locator("#accountantsReportFields")).toBeHidden();
    expect(await page.evaluate(() => buildAccountsPayload().accountantsReport)).toBeUndefined();
    await page.check("#includeAccountantsReport");
    await expect(page.locator("#accountantsReportFields")).toBeVisible();
    await expect(page.locator("#accountantsStatement")).toHaveValue(/In accordance with your instructions, we have compiled/);
    await page.fill("#accountantsName", "Calder Brook Accountants LLP");
    const report = await page.evaluate(() => buildAccountsPayload().accountantsReport);
    expect(report.accountantsName).toBe("Calder Brook Accountants LLP");
    expect(report.statement).toContain("unaudited financial statements");
    await page.uncheck("#includeAccountantsReport");
    await expect(page.locator("#accountantsReportFields")).toBeHidden();
    expect(await page.evaluate(() => buildAccountsPayload().accountantsReport)).toBeUndefined();
  });

  test("the directors' report consistency flag is empty, read only, explained and sent nowhere", async ({ page }) => {
    await openFormView(page);
    const flag = page.locator("#directorsReportConsistent");
    await expect(flag).toHaveValue("");
    await expect(flag).toHaveJSProperty("readOnly", true);
    await expect(page.locator("#directorsReportConsistent-hint")).toHaveText(
      "These accounts are unaudited, so this statement does not apply. Nothing is sent.",
    );
    expect(JSON.stringify(await page.evaluate(() => buildAccountsPayload()))).not.toContain("onsistent");
  });
});
