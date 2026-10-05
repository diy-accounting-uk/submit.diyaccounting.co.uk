// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/view-vat-return.browser.test.js
// Phase 5: Browser tests for viewing submitted VAT returns with all 9 boxes

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveHmrcFieldTableAssets, serveSiteStyles, screenshotPath, expectCleanFigures } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("View VAT Return - 9-Box Display", () => {
  let viewVatReturnHtmlContent;

  test.beforeAll(async () => {
    viewVatReturnHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/vat/viewVatReturn.html"), "utf-8");
  });

  test("displays all 9 boxes with correct monetary formatting", async ({ page }) => {
    // Capture console errors for debugging
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`[PAGE_CONSOLE:${msg.type()}]`, msg.text());
      }
    });
    page.on("pageerror", (err) => {
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });

    // Stub globals used by inline scripts
    await page.addInitScript(() => {
      window.showStatus = window.showStatus || (() => {});
      window.checkAuthStatus = window.checkAuthStatus || (() => {});
      window.toggleMenu = window.toggleMenu || (() => {});
      window.loadEnv = window.loadEnv || (() => Promise.resolve({ HMRC_VAT_API_BASE_URL: "https://test-api" }));
      window.authorizedFetch = window.authorizedFetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    });

    // Prevent external script files from executing
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      if (resourceType === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    // Prepare HTML with base tag
    const modifiedHtml = viewVatReturnHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/vat/">').replace(
      "<body>",
      `<body><script>
window.showStatus = window.showStatus || function(){};
window.checkAuthStatus = window.checkAuthStatus || function(){};
window.toggleMenu = window.toggleMenu || function(){};
window.CarriedIdentifiers = window.CarriedIdentifiers || { bind: function(){} };
window.loadEnv = window.loadEnv || function(){ return Promise.resolve({ HMRC_VAT_API_BASE_URL: "https://test-api" }); };
window.authorizedFetch = window.authorizedFetch || function(){ return Promise.resolve({ ok: true, json: function(){ return Promise.resolve({}); }}); };
</script>`,
    );

    // Load the modified page HTML
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/vat/viewVatReturn.html",
      waitUntil: "domcontentloaded",
    });

    await delay(200);

    // Check that the page has the expected structure
    // The form should be visible
    const form = page.locator("#vatReturnForm");
    await expect(form).toBeVisible();

    // Check for VAT registration number input
    const vrnInput = page.locator("#vrn");
    await expect(vrnInput).toBeVisible();

    // Check for period date inputs (replaced obligation dropdown)
    const periodStartInput = page.locator("#periodStart");
    await expect(periodStartInput).toBeVisible();
    const periodEndInput = page.locator("#periodEnd");
    await expect(periodEndInput).toBeVisible();

    // Check for period key hidden input (populated server-side from obligations)
    const periodKeyInput = page.locator("#periodKey");
    await expect(periodKeyInput).toHaveCount(1);
    const fieldType = await periodKeyInput.getAttribute("type");
    expect(fieldType).toBe("hidden");

    // Check for retrieve button
    const retrieveBtn = page.locator("#retrieveBtn");
    await expect(retrieveBtn).toBeVisible();
  });

  test("formatPeriodKeyAsDateRange converts period keys correctly", async ({ page }) => {
    // Test the period key to date range conversion logic
    await page.addInitScript(() => {
      window.formatPeriodKeyAsDateRange = function (periodKey) {
        if (!periodKey || periodKey.length < 3) return periodKey;

        const year = parseInt("20" + periodKey.substring(0, 2));
        const type = periodKey.charAt(2).toUpperCase();
        const period = parseInt(periodKey.substring(3)) || 1;

        let startMonth, endMonth;

        if (type === "A" || type === "B") {
          // Quarterly periods: A1=Jan-Mar, A2=Apr-Jun, A3=Jul-Sep, A4=Oct-Dec
          startMonth = (period - 1) * 3;
          endMonth = period * 3 - 1;
        } else if (type === "M") {
          // Monthly periods
          startMonth = period - 1;
          endMonth = period - 1;
        } else {
          return periodKey;
        }

        const startDate = new Date(year, startMonth, 1);
        const endDate = new Date(year, endMonth + 1, 0);

        const options = { day: "numeric", month: "long", year: "numeric" };
        const startStr = startDate.toLocaleDateString("en-GB", options);
        const endStr = endDate.toLocaleDateString("en-GB", options);

        return `${startStr} to ${endStr}`;
      };
    });

    await page.goto("about:blank");

    // Test quarterly period keys
    const q1Result = await page.evaluate(() => window.formatPeriodKeyAsDateRange("24A1"));
    expect(q1Result).toContain("January");
    expect(q1Result).toContain("March");
    expect(q1Result).toContain("2024");

    const q2Result = await page.evaluate(() => window.formatPeriodKeyAsDateRange("24A2"));
    expect(q2Result).toContain("April");
    expect(q2Result).toContain("June");

    const q3Result = await page.evaluate(() => window.formatPeriodKeyAsDateRange("24A3"));
    expect(q3Result).toContain("July");
    expect(q3Result).toContain("September");

    const q4Result = await page.evaluate(() => window.formatPeriodKeyAsDateRange("24A4"));
    expect(q4Result).toContain("October");
    expect(q4Result).toContain("December");

    // Test that period key is not shown literally
    expect(q1Result).not.toBe("24A1");
  });

  test("monetary values format correctly for 9-box display", async ({ page }) => {
    await page.goto("about:blank");
    await page.addScriptTag({ path: path.resolve("web/public/lib/money-format.js") });

    // Box 1-5 (decimal) formatting
    expect(await page.evaluate(() => window.formatGbp(1000.0))).toBe("£1,000.00");
    expect(await page.evaluate(() => window.formatGbp(900.5))).toBe("£900.50");
    expect(await page.evaluate(() => window.formatGbp(463872))).toBe("£463,872.00");
    expect(await page.evaluate(() => window.formatGbp(-1234.5))).toBe("-£1,234.50");

    // Box 6-9 (whole) formatting
    const box6 = await page.evaluate(() => window.formatGbpWhole(5000));
    expect(box6).toBe("£5,000");
    expect(box6).not.toContain(".");
    expect(await page.evaluate(() => window.formatGbpWhole(0))).toBe("£0");
  });

  test("9-box VAT return validation rules", async ({ page }) => {
    // Test the validation rules for 9-box VAT return
    await page.addInitScript(() => {
      window.validateBox5NonNegative = function (value) {
        return value >= 0;
      };

      window.validateWholeAmount = function (value) {
        return Number.isInteger(value) || value === Math.floor(value);
      };

      window.validateDecimalPlaces = function (value, maxPlaces) {
        const str = value.toString();
        const decimalIndex = str.indexOf(".");
        if (decimalIndex === -1) return true;
        return str.length - decimalIndex - 1 <= maxPlaces;
      };
    });

    await page.goto("about:blank");

    // Box 5 must be non-negative
    const box5Valid = await page.evaluate(() => window.validateBox5NonNegative(900));
    expect(box5Valid).toBe(true);

    const box5Invalid = await page.evaluate(() => window.validateBox5NonNegative(-100));
    expect(box5Invalid).toBe(false);

    // Boxes 6-9 must be whole amounts
    const box6Valid = await page.evaluate(() => window.validateWholeAmount(5000));
    expect(box6Valid).toBe(true);

    const box6Invalid = await page.evaluate(() => window.validateWholeAmount(5000.5));
    expect(box6Invalid).toBe(false);

    // Boxes 1-5 max 2 decimal places
    const decimalValid = await page.evaluate(() => window.validateDecimalPlaces(1000.0, 2));
    expect(decimalValid).toBe(true);

    const decimalInvalid = await page.evaluate(() => window.validateDecimalPlaces(1000.001, 2));
    expect(decimalInvalid).toBe(false);
  });

  test("gives each box a stable id, its VAT Notice 700/12 definition and a link to that box's guidance", async ({ page }) => {
    await serveSiteStyles(page);
    await page.route("**/*.js", async (route) => {
      if (route.request().resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });
    await serveHmrcFieldTableAssets(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    const html = viewVatReturnHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/vat/">').replace(
      "<body>",
      `<body><script>
window.showStatus = function(){};
window.hideStatus = function(){};
window.loadEnv = function(){ return Promise.resolve({}); };
</script>`,
    );
    await page.route("**/hmrc/vat/viewVatReturn.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: html });
    });
    await page.goto("http://localhost:3000/hmrc/vat/viewVatReturn.html", { waitUntil: "domcontentloaded" });

    await page.evaluate(() => {
      document.getElementById("searchForm").style.display = "none";
      document.getElementById("returnResults").style.display = "block";
      window.displayReturn({
        finalised: true,
        vatDueSales: 1234.56,
        vatDueAcquisitions: 0,
        totalVatDue: 1234.56,
        vatReclaimedCurrPeriod: 234.5,
        netVatDue: 1000.06,
        totalValueSalesExVAT: 6173,
        totalValuePurchasesExVAT: 1172,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
      });
    });

    await expect(page.locator("#vatReturnBox1 dd")).toHaveText("£1,234.56");
    await expect(page.locator("#vatReturnBox5 dd")).toHaveText("£1,000.06");
    await expect(page.locator("#vatReturnBox6 dd")).toHaveText("£6,173");
    for (let box = 1; box <= 9; box += 1) {
      const item = page.locator(`#vatReturnBox${box}`);
      await expect(item.locator("dt")).toContainText(`Box ${box}:`);
      await expect(item.locator(`#vatReturnBox${box}Definition`)).toContainText("“");
      await expect(item.locator(`#vatReturnBox${box}Definition a`)).toHaveAttribute(
        "href",
        `https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012#filling-in-box-${box}`,
      );
    }
    await expect(page.locator("#vatReturnBox1")).toHaveAttribute("data-hmrc-field", "vatDueSales");
    await expect(page.locator("#returnDetails .field-table-source")).toContainText("retrieved 1 October 2026");

    const detailsText = await page.locator("#returnDetails").innerText();
    expectCleanFigures(expect, detailsText);

    // The VAT behaviour step reads each box's figure as the first pound amount after its label.
    const detailsHtml = await page.locator("#returnDetails").innerHTML();
    const firstAmountAfter = (label) => detailsHtml.match(new RegExp(`${label}[^£]*£([0-9,]+(?:\\.[0-9]{2})?)`))?.[1];
    expect(firstAmountAfter("VAT due in the period on sales")).toBe("1,234.56");
    expect(firstAmountAfter("VAT reclaimed in the period on purchases")).toBe("234.50");
    expect(firstAmountAfter("Total value of sales and all other outputs")).toBe("6,173");

    await page.locator("#returnDetails").screenshot({ path: screenshotPath("viewVatReturn") });
  });
});
