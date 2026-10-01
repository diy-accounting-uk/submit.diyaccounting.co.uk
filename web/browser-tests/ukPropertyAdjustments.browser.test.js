// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/ukPropertyAdjustments.browser.test.js
// Browser tests for the ITSA UK property year-end adjustments (BSAS) page's retrieveSummary

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  serveMoneyInput,
  serveFormErrors,
  serveHmrcFieldTableAssets,
  serveSiteStyles,
  screenshotPath,
  expectCleanFigures,
} from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA UK Property Adjustments - retrieveSummary", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/ukPropertyAdjustments.html"), "utf-8");
  });

  async function loadPage(page) {
    const modifiedHtml = htmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">').replace(
      "<body>",
      `<body><script>
window.showStatus = window.showStatus || function(){};
window.hideStatus = window.hideStatus || function(){};
window.showLoading = window.showLoading || function(){};
window.hideLoading = window.hideLoading || function(){};
window.generateRandomState = window.generateRandomState || function(){ return "test-state"; };
window.getGovClientHeaders = window.getGovClientHeaders || function(){ return Promise.resolve({}); };
</script>`,
    );

    // Served through a real navigation (not page.setContent) so the document gets a committed
    // http://localhost:3000 origin - session storage throws a SecurityError on a document that
    // was never actually navigated to.
    await page.route("**/hmrc/itsa/ukPropertyAdjustments.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });
    await serveHmrcFieldTableAssets(page);
    await serveMoneyInput(page);
    await serveFormErrors(page);

    await page.goto("http://localhost:3000/hmrc/itsa/ukPropertyAdjustments.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("retrieveSummary sends a canned success scenario for a synthetic run with no explicit test scenario", async ({ page }) => {
    await loadPage(page);

    const receivedScenario = await page.evaluate(async () => {
      sessionStorage.setItem("hmrcAccount", "synthetic");
      let receivedScenario;
      window.getBsasUkProperty = async (
        nino,
        calculationId,
        taxYear,
        accessToken,
        govClientHeaders,
        runFraudPreventionHeaderValidation,
        testScenario,
      ) => {
        receivedScenario = testScenario;
        return { adjustableSummaryCalculation: { netProfit: 6000 } };
      };
      await window.retrieveSummary("AB123456C", "calc-id", "2024-25", "token", null);
      return receivedScenario;
    });

    expect(receivedScenario).toBe("UK_PROPERTY_PROFIT");
  });

  test("retrieveSummary sends no test scenario for a live run with no explicit test scenario", async ({ page }) => {
    await loadPage(page);

    const receivedScenario = await page.evaluate(async () => {
      let receivedScenario = "unset";
      window.getBsasUkProperty = async (
        nino,
        calculationId,
        taxYear,
        accessToken,
        govClientHeaders,
        runFraudPreventionHeaderValidation,
        testScenario,
      ) => {
        receivedScenario = testScenario;
        return { adjustableSummaryCalculation: { netProfit: 6000 } };
      };
      await window.retrieveSummary("AB123456C", "calc-id", "2024-25", "token", null);
      return receivedScenario;
    });

    expect(receivedScenario).toBeNull();
  });

  test("retrieveSummary passes an explicit test scenario through unchanged", async ({ page }) => {
    await loadPage(page);

    const receivedScenario = await page.evaluate(async () => {
      sessionStorage.setItem("hmrcAccount", "synthetic");
      let receivedScenario;
      window.getBsasUkProperty = async (
        nino,
        calculationId,
        taxYear,
        accessToken,
        govClientHeaders,
        runFraudPreventionHeaderValidation,
        testScenario,
      ) => {
        receivedScenario = testScenario;
        return { adjustableSummaryCalculation: { netProfit: 6000 } };
      };
      await window.retrieveSummary("AB123456C", "calc-id", "2024-25", "token", "STATEFUL");
      return receivedScenario;
    });

    expect(receivedScenario).toBe("STATEFUL");
  });

  test("shows the year-end summary as named, defined rows with formatted amounts and no raw keys", async ({ page }) => {
    await serveSiteStyles(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await loadPage(page);
    await page.evaluate(() => {
      document.getElementById("triggerForm").style.display = "none";
      document.getElementById("summaryContainer").style.display = "block";
      window.displaySummary({
        adjustableSummaryCalculation: {
          totalIncome: 8430.43,
          income: { totalRentsReceived: 8000.43, otherPropertyIncome: 430 },
          totalDeductions: 1000,
          deductions: { costOfReplacingDomesticItems: 1000 },
          netProfit: 5430.43,
        },
      });
    });

    const table = page.locator("#summaryDetails table.field-table");
    const row = (field) => table.locator(`tr[data-hmrc-field="${field}"]`);
    await expect(row("income.totalRentsReceived").locator(".field-name")).toHaveText("Total rents received");
    await expect(row("income.totalRentsReceived").locator("td.field-amount")).toHaveText("£8,000.43");
    await expect(row("deductions.costOfReplacingDomesticItems").locator("td.field-amount")).toHaveText("£1,000.00");
    await expect(row("netProfit")).toHaveClass(/field-row-total/);
    await expect(row("netProfit").locator("td.field-amount")).toHaveText("£5,430.43");
    await expect(table.locator("tbody tr")).toHaveCount(6);
    expectCleanFigures(expect, await page.locator("#summaryContainer").innerText());
    await expect(page.locator("#adjustTotalRentsReceived")).toHaveAttribute("data-hmrc-field", "income.totalRentsReceived");

    await page.locator("#summaryContainer").screenshot({ path: screenshotPath("ukPropertyAdjustments") });
  });

  test("submitting an adjustment sends repairs and maintenance under expenses and no field outside HMRC's request", async ({ page }) => {
    await loadPage(page);
    const sentAdjustDetails = await page.evaluate(async () => {
      sessionStorage.setItem("hmrcAccount", "synthetic");
      window.ensureAuthorizedThen = async (pendingKey, pendingValue, run) => run("token");
      let sent;
      window.adjustBsasUkProperty = async (adjustDetails) => {
        sent = adjustDetails;
      };
      document.getElementById("summaryContainer").style.display = "block";
      document.getElementById("adjustTotalRentsReceived").value = "100.5";
      document.getElementById("adjustRepairsAndMaintenance").value = "25";
      await window.handleAdjustmentSubmit(false);
      return sent;
    });

    expect(sentAdjustDetails.income).toEqual({ totalRentsReceived: 100.5 });
    expect(sentAdjustDetails.expenses).toEqual({ repairsAndMaintenance: 25 });
  });
});
