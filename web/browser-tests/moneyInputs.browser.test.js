// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/moneyInputs.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SHARE_CURRENCY_PAGE = "companies-house/fileConfirmationStatement.html";

const PAGES = [
  "hmrc/itsa/annualSubmission.html",
  "hmrc/itsa/lossesAndClaims.html",
  "hmrc/itsa/selfEmploymentPeriod.html",
  "hmrc/itsa/selfEmploymentPeriodAmend.html",
  "hmrc/itsa/taxLiabilityAdjustments.html",
  "hmrc/itsa/ukPropertyAnnualSubmission.html",
  "hmrc/itsa/ukPropertyPeriod.html",
  "hmrc/itsa/ukPropertyPeriodAmend.html",
  "hmrc/itsa/adjustments.html",
  "hmrc/itsa/ukPropertyAdjustments.html",
  "companies-house/fileMicroEntityAccounts.html",
  "companies-house/fileSmallCompanyAccounts.html",
  "companies-house/fileConfirmationStatement.html",
];

async function openPage(page, relativePath) {
  const url = `http://localhost:3000/${relativePath}`;
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveMoneyInput(page);
  const html = fs.readFileSync(path.join(process.cwd(), "web/public", relativePath), "utf-8");
  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
}

for (const relativePath of PAGES) {
  test.describe(`Money inputs - ${relativePath}`, () => {
    test("every pounds box is a text box with a £ prefix and a linked example hint", async ({ page }) => {
      await openPage(page, relativePath);
      const report = await page.evaluate(() =>
        Array.from(document.querySelectorAll("input[data-money]")).map((input) => ({
          id: input.id,
          type: input.type,
          inputMode: input.inputMode,
          prefix: input.parentElement.querySelector(".prefix")?.textContent,
          hintText: input
            .getAttribute("aria-describedby")
            .split(" ")
            .map((hintId) => document.getElementById(hintId)?.textContent || "")
            .join(" "),
        })),
      );
      expect(report.length).toBeGreaterThan(1);
      for (const box of report) {
        expect(box.type, box.id).toBe("text");
        expect(box.inputMode, box.id).toBe("decimal");
        if (relativePath === SHARE_CURRENCY_PAGE) {
          expect(box.hintText, box.id).toContain("For example, 600 or 1,200.50");
        } else {
          expect(box.prefix, box.id).toBe("£");
          expect(box.hintText, box.id).toContain("For example, £600 or £");
        }
      }
    });

    test("no pounds box is a number input", async ({ page }) => {
      await openPage(page, relativePath);
      const numberIds = await page.evaluate(() =>
        Array.from(document.querySelectorAll('input[type="number"]'))
          .map((input) => input.id)
          .filter((id) => !/^(averageEmployees|totalNumberOfIssuedShares)$/.test(id)),
      );
      expect(numberIds).toEqual([]);
    });

    test("a filled £ and comma amount is flagged only when it does not parse", async ({ page }) => {
      await openPage(page, relativePath);
      const result = await page.evaluate(() => {
        const input = document.querySelector("input[data-money]:not([disabled])");
        input.value = "£1,200";
        const accepted = window.moneyInputProblem();
        input.value = "twelve";
        const rejected = window.moneyInputProblem();
        return { accepted, rejected, invalid: input.getAttribute("aria-invalid") };
      });
      expect(result.accepted).toBeNull();
      expect(result.rejected).toContain("Enter an amount");
      expect(result.invalid).toBe("true");
    });
  });
}

test.describe("Money inputs - share currency prefix", () => {
  test("the nominal value boxes show the share currency as their prefix and follow changes to it", async ({ page }) => {
    await openPage(page, SHARE_CURRENCY_PAGE);
    const prefixes = async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-share-currency-prefix]")).map((prefix) => ({
          text: prefix.textContent,
          visible: prefix.style.display !== "none",
        })),
      );

    expect(await prefixes()).toEqual([
      { text: "", visible: false },
      { text: "", visible: false },
    ]);

    await page.locator("#shareCurrency").evaluate((input) => {
      input.value = "GBP";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(await prefixes()).toEqual([
      { text: "GBP", visible: true },
      { text: "GBP", visible: true },
    ]);

    await page.locator("#shareCurrency").evaluate((input) => {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect((await prefixes()).every((prefix) => !prefix.visible)).toBe(true);
  });
});
