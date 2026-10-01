// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/adjustments.browser.test.js
// Browser tests for the ITSA year-end adjustments (BSAS) page

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveHmrcFieldTableAssets, serveSiteStyles, screenshotPath, expectCleanFigures } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("ITSA Adjustments - Form", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/adjustments.html"), "utf-8");
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
    await page.route("**/hmrc/itsa/adjustments.html", async (route) => {
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

    await page.goto("http://localhost:3000/hmrc/itsa/adjustments.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("displays the trigger form and the trigger button", async ({ page }) => {
    await loadPage(page);

    const form = page.locator("#itsaBsasTriggerForm");
    await expect(form).toBeVisible();

    const triggerBtn = page.locator("#triggerBtn");
    await expect(triggerBtn).toBeVisible();
    await expect(triggerBtn).toHaveText(/Trigger Year-End Summary/);

    const summaryContainer = page.locator("#summaryContainer");
    await expect(summaryContainer).toBeHidden();
  });

  test("uppercases the NINO as the user types", async ({ page }) => {
    await loadPage(page);

    const ninoInput = page.locator("#nino");
    await ninoInput.fill("ab123456c");
    await expect(ninoInput).toHaveValue("AB123456C");
  });

  test("displays the year-end summary figures when a summary renders", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => {
      window.displaySummary({
        adjustableSummaryCalculation: {
          totalIncome: 10000,
          income: { turnover: 10000 },
          totalExpenses: 4000,
          expenses: { costOfGoods: 2000 },
          totalAdditions: 0,
          netProfit: 6000,
        },
      });
    });

    const summaryDetails = page.locator("#summaryDetails");
    await expect(summaryDetails).toContainText("£10,000.00");
    await expect(summaryDetails).toContainText("£6,000.00");
  });

  test("retrieveSummary retries while HMRC answers the triggered summary is not ready yet", async ({ page }) => {
    await loadPage(page);

    const result = await page.evaluate(async () => {
      let calls = 0;
      window.getBsasSelfEmployment = async () => {
        calls += 1;
        if (calls < 3) {
          const notReadyYet = new Error("Matching resource not found");
          notReadyYet.status = 404;
          throw notReadyYet;
        }
        return { adjustableSummaryCalculation: { netProfit: 6000 } };
      };
      const bsas = await window.retrieveSummary("AB123456C", "calc-id", "2024-25", "token", null, 0, 0);
      return { calls, netProfit: bsas.adjustableSummaryCalculation.netProfit };
    });

    expect(result.calls).toBe(3);
    expect(result.netProfit).toBe(6000);
  });

  test("retrieveSummary gives up once every attempt answers not ready yet", async ({ page }) => {
    await loadPage(page);

    const status = await page.evaluate(async () => {
      window.getBsasSelfEmployment = async () => {
        const notReadyYet = new Error("Matching resource not found");
        notReadyYet.status = 404;
        throw notReadyYet;
      };
      try {
        await window.retrieveSummary("AB123456C", "calc-id", "2024-25", "token", null, 0, 0);
        return "resolved";
      } catch (error) {
        return error.status;
      }
    });

    expect(status).toBe(404);
  });

  test("retrieveSummary sends a canned success scenario for a synthetic run with no explicit test scenario", async ({ page }) => {
    await loadPage(page);

    const receivedScenario = await page.evaluate(async () => {
      sessionStorage.setItem("hmrcAccount", "synthetic");
      let receivedScenario;
      window.getBsasSelfEmployment = async (
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
      await window.retrieveSummary("AB123456C", "calc-id", "2024-25", "token", null, 0, 0);
      return receivedScenario;
    });

    expect(receivedScenario).toBe("SELF_EMPLOYMENT_PROFIT");
  });

  test("retrieveSummary sends no test scenario for a live run with no explicit test scenario", async ({ page }) => {
    await loadPage(page);

    const receivedScenario = await page.evaluate(async () => {
      let receivedScenario = "unset";
      window.getBsasSelfEmployment = async (
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
      await window.retrieveSummary("AB123456C", "calc-id", "2024-25", "token", null, 0, 0);
      return receivedScenario;
    });

    expect(receivedScenario).toBeNull();
  });

  test("retrieveSummary passes an explicit test scenario through unchanged", async ({ page }) => {
    await loadPage(page);

    const receivedScenario = await page.evaluate(async () => {
      sessionStorage.setItem("hmrcAccount", "synthetic");
      let receivedScenario;
      window.getBsasSelfEmployment = async (
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
      await window.retrieveSummary("AB123456C", "calc-id", "2024-25", "token", "STATEFUL", 0, 0);
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
          totalIncome: 12430.43,
          income: { turnover: 12000.43, other: 430 },
          totalExpenses: 3210,
          expenses: { costOfGoods: 1800.5 },
          totalAdditions: 0,
          netLoss: 250.75,
        },
      });
    });

    const table = page.locator("#summaryDetails table.field-table");
    const row = (field) => table.locator(`tr[data-hmrc-field="${field}"]`);
    await expect(row("income.turnover").locator(".field-name")).toHaveText("Turnover");
    await expect(row("income.turnover").locator("td.field-amount")).toHaveText("£12,000.43");
    await expect(row("expenses.costOfGoods").locator("td.field-amount")).toHaveText("£1,800.50");
    await expect(row("totalAdditions").locator("td.field-amount")).toHaveText("£0.00");
    await expect(row("netLoss").locator(".field-name")).toHaveText("Net loss");
    await expect(row("netLoss")).toHaveClass(/field-row-total/);
    await expect(row("netProfit")).toHaveCount(0);
    await expect(row("totalIncome").locator(".field-definition")).toContainText("The total income for the income source.");
    await expect(table.locator("tbody tr")).toHaveCount(6);
    expectCleanFigures(expect, await page.locator("#summaryContainer").innerText());
    await expect(page.locator("#adjustTurnover")).toHaveAttribute("data-hmrc-field", "income.turnover");

    await page.locator("#summaryContainer").screenshot({ path: screenshotPath("adjustments") });
  });

  test("shows a dash for a summary figure HMRC did not return", async ({ page }) => {
    await loadPage(page);
    await page.evaluate(() => window.displaySummary({ adjustableSummaryCalculation: { totalIncome: 100 } }));
    const row = page.locator('#summaryDetails tr[data-hmrc-field="income.turnover"] td.field-amount');
    await expect(row).toHaveText("—");
  });
});
