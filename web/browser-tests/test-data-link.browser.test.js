// web/browser-tests/test-data-link.browser.test.js
// Browser tests for the "add test data" link functionality

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Test Data Link Browser Tests", () => {
  let submitVatHtmlContent;
  let viewVatReturnHtmlContent;
  let vatObligationsHtmlContent;
  let testDataGeneratorContent;

  test.beforeAll(async () => {
    // Read the HTML files
    submitVatHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/vat/submitVat.html"), "utf-8");
    viewVatReturnHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/vat/viewVatReturn.html"), "utf-8");
    vatObligationsHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/vat/vatObligations.html"), "utf-8");
    testDataGeneratorContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/test-data-generator.js"), "utf-8");
  });

  test.describe("Submit VAT Form - Test Data Link", () => {
    test("should show test data link in synthetic mode", async ({ page }) => {
      // Set the page content with synthetic mode query parameter
      await page.setContent(submitVatHtmlContent, {
        baseURL: "http://localhost:3000/hmrc/vat/submitVat.html",
        waitUntil: "domcontentloaded",
      });

      // Load the test data generator script
      await page.addScriptTag({ content: testDataGeneratorContent });

      // Simulate the initializePage logic that shows synthetic indicator, developer section, and test data link
      await page.evaluate(() => {
        const syntheticIndicator = document.getElementById("syntheticIndicator");
        if (syntheticIndicator) {
          syntheticIndicator.classList.add("visible");
        }
        const developerSection = document.getElementById("developerSection");
        if (developerSection) {
          developerSection.style.display = "block";
        }
        const testDataLink = document.getElementById("testDataLink");
        if (testDataLink) {
          testDataLink.classList.add("visible");
        }
      });

      // Verify the test data link is visible
      const testDataLink = page.locator("#testDataLink.visible");
      await expect(testDataLink).toBeVisible();
      await expect(testDataLink.locator("a")).toHaveText("add test data");
    });

    test("should not show test data link in non-synthetic mode", async ({ page }) => {
      // Set the page content without synthetic mode
      await page.setContent(submitVatHtmlContent, {
        baseURL: "http://localhost:3000/hmrc/vat/submitVat.html",
        waitUntil: "domcontentloaded",
      });

      // Verify the test data link is not visible
      const testDataLink = page.locator("#testDataLink");
      await expect(testDataLink).not.toHaveClass(/visible/);
    });

    test("should populate form when test data link is clicked", async ({ page }) => {
      // Set the page content with synthetic mode
      await page.setContent(submitVatHtmlContent, {
        baseURL: "http://localhost:3000/hmrc/vat/submitVat.html",
        waitUntil: "domcontentloaded",
      });

      // Load the test data generator script
      await page.addScriptTag({ content: testDataGeneratorContent });

      // Simulate synthetic mode initialization
      await page.evaluate(() => {
        const syntheticIndicator = document.getElementById("syntheticIndicator");
        if (syntheticIndicator) syntheticIndicator.classList.add("visible");
        const developerSection = document.getElementById("developerSection");
        if (developerSection) developerSection.style.display = "block";
        const testDataLink = document.getElementById("testDataLink");
        if (testDataLink) testDataLink.classList.add("visible");
      });

      // Click the test data link
      await page.click("#testDataLink a");

      // Verify fields are populated
      const vrnValue = await page.locator("#vatNumber").inputValue();
      const periodKeyValue = await page.locator("#periodKey").inputValue();

      expect(vrnValue).toBe("983238295");
      expect(periodKeyValue).toMatch(/^\d{2}[A-Z][A-Z0-9]$/); // YYXZ format (last char can be digit or letter)

      // Check 9-box fields are populated
      const vatDueSalesValue = await page.locator("#vatDueSales").inputValue();
      expect(vatDueSalesValue).toMatch(/^\d+\.\d{2}$/); // Decimal with 2 places

      // Check declaration is checked
      const declarationChecked = await page.locator("#declaration").isChecked();
      expect(declarationChecked).toBe(true);
    });
  });

  test.describe("View VAT Return Form - Test Data Link", () => {
    test("should show test data link in synthetic mode", async ({ page }) => {
      await page.setContent(viewVatReturnHtmlContent, {
        baseURL: "http://localhost:3000/hmrc/vat/viewVatReturn.html",
        waitUntil: "domcontentloaded",
      });

      await page.addScriptTag({ content: testDataGeneratorContent });

      await page.evaluate(() => {
        const syntheticIndicator = document.getElementById("syntheticIndicator");
        if (syntheticIndicator) syntheticIndicator.classList.add("visible");
        const developerSection = document.getElementById("developerSection");
        if (developerSection) developerSection.style.display = "block";
        const testDataLink = document.getElementById("testDataLink");
        if (testDataLink) testDataLink.classList.add("visible");
      });

      const testDataLink = page.locator("#testDataLink.visible");
      await expect(testDataLink).toBeVisible();
    });

    test("should populate form when test data link is clicked", async ({ page }) => {
      await page.setContent(viewVatReturnHtmlContent, {
        baseURL: "http://localhost:3000/hmrc/vat/viewVatReturn.html",
        waitUntil: "domcontentloaded",
      });

      await page.addScriptTag({ content: testDataGeneratorContent });

      await page.evaluate(() => {
        const syntheticIndicator = document.getElementById("syntheticIndicator");
        if (syntheticIndicator) syntheticIndicator.classList.add("visible");
        const developerSection = document.getElementById("developerSection");
        if (developerSection) developerSection.style.display = "block";
        const testDataLink = document.getElementById("testDataLink");
        if (testDataLink) testDataLink.classList.add("visible");
      });

      await page.click("#testDataLink a");

      const vrnValue = await page.locator("#vrn").inputValue();
      const periodStartValue = await page.locator("#periodStart").inputValue();
      const periodEndValue = await page.locator("#periodEnd").inputValue();

      expect(vrnValue).toBe("983238295");
      // View VAT Return form now uses date inputs instead of periodKey dropdown
      expect(periodStartValue).toBe("2017-01-01");
      expect(periodEndValue).toBe("2017-03-31");
    });
  });

  test.describe("VAT Obligations Form - Test Data Link", () => {
    test("should show test data link in synthetic mode", async ({ page }) => {
      await page.setContent(vatObligationsHtmlContent, {
        baseURL: "http://localhost:3000/hmrc/vat/vatObligations.html",
        waitUntil: "domcontentloaded",
      });

      await page.addScriptTag({ content: testDataGeneratorContent });

      await page.evaluate(() => {
        const syntheticIndicator = document.getElementById("syntheticIndicator");
        if (syntheticIndicator) syntheticIndicator.classList.add("visible");
        const developerSection = document.getElementById("developerSection");
        if (developerSection) developerSection.style.display = "block";
        const testDataLink = document.getElementById("testDataLink");
        if (testDataLink) testDataLink.classList.add("visible");
      });

      const testDataLink = page.locator("#testDataLink.visible");
      await expect(testDataLink).toBeVisible();
    });

    test("should populate form when test data link is clicked", async ({ page }) => {
      await page.setContent(vatObligationsHtmlContent, {
        baseURL: "http://localhost:3000/hmrc/vat/vatObligations.html",
        waitUntil: "domcontentloaded",
      });

      await page.addScriptTag({ content: testDataGeneratorContent });

      await page.evaluate(() => {
        const syntheticIndicator = document.getElementById("syntheticIndicator");
        if (syntheticIndicator) syntheticIndicator.classList.add("visible");
        const developerSection = document.getElementById("developerSection");
        if (developerSection) developerSection.style.display = "block";
        const testDataLink = document.getElementById("testDataLink");
        if (testDataLink) testDataLink.classList.add("visible");
      });

      await page.click("#testDataLink a");

      const vrnValue = await page.locator("#vrn").inputValue();
      const fromDateValue = await page.locator("#fromDate").inputValue();
      const toDateValue = await page.locator("#toDate").inputValue();

      expect(vrnValue).toBe("983238295");
      expect(fromDateValue).toMatch(/^\d{4}-01-01$/); // Start of current year
      expect(toDateValue).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Current date
    });
  });

  test.describe("Test Data Generation Validation", () => {
    test("should generate valid VAT registration number", async ({ page }) => {
      await page.setContent("<html><body></body></html>");
      await page.addScriptTag({ content: testDataGeneratorContent });

      const vrn = await page.evaluate(() => {
        return window.testDataGenerator.generateTestVrn();
      });

      expect(vrn).toBe("983238295");
      expect(vrn).toHaveLength(9);
      expect(vrn).toMatch(/^\d{9}$/);
    });

    test("should generate valid period key", async ({ page }) => {
      await page.setContent("<html><body></body></html>");
      await page.addScriptTag({ content: testDataGeneratorContent });

      const periodKey = await page.evaluate(() => {
        return window.testDataGenerator.generateTestPeriodKey();
      });

      expect(periodKey).toMatch(/^\d{2}[A-Z][A-Z0-9]$/); // YYXZ format
      const year = periodKey.substring(0, 2);
      expect(["24", "25"]).toContain(year);
    });

    test("should generate valid VAT amount", async ({ page }) => {
      await page.setContent("<html><body></body></html>");
      await page.addScriptTag({ content: testDataGeneratorContent });

      const vatAmount = await page.evaluate(() => {
        return window.testDataGenerator.generateTestVatAmount();
      });

      expect(vatAmount).toMatch(/^\d+\.\d{2}$/);
      const numAmount = parseFloat(vatAmount);
      expect(numAmount).toBeGreaterThanOrEqual(100);
      expect(numAmount).toBeLessThan(10000);
    });
  });
});
