// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.dormant.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput } from "./hmrcFieldTableAssets.js";

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
});
