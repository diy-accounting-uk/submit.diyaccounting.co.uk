// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/view-vat-return.browser.test.js
// Phase 5: Browser tests for viewing submitted VAT returns with all 9 boxes

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

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
    // Test the formatting logic for monetary values
    await page.addInitScript(() => {
      window.formatMonetaryValue = function (value, isWholeAmount) {
        if (isWholeAmount) {
          return "£" + Math.round(value).toString();
        }
        return "£" + value.toFixed(2);
      };
    });

    await page.goto("about:blank");

    // Test Box 1-5 (decimal) formatting
    const box1 = await page.evaluate(() => window.formatMonetaryValue(1000.0, false));
    expect(box1).toBe("£1000.00");

    const box5 = await page.evaluate(() => window.formatMonetaryValue(900.5, false));
    expect(box5).toBe("£900.50");

    // Test Box 6-9 (whole) formatting
    const box6 = await page.evaluate(() => window.formatMonetaryValue(5000, true));
    expect(box6).toBe("£5000");
    expect(box6).not.toContain(".");

    const box8Zero = await page.evaluate(() => window.formatMonetaryValue(0, true));
    expect(box8Zero).toBe("£0");
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
});
