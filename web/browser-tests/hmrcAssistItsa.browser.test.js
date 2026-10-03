// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/hmrcAssistItsa.browser.test.js
// The HMRC Assist check on the Income Tax calculation page and the note on the final
// declaration page, against the simulator's canned report content.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { itsaDefaultMessages } from "@app/http-simulator/scenarios/assist.js";
import { serveHmrcAssistWidget, serveHmrcFieldTableAssets, serveFormErrors } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const NINO = "AB123456C";
const TAX_YEAR = "2023-24";
const CALCULATION_ID = "f2fb30e5-4ab6-4a29-b3c1-c7efc90fc66a";
const PAGES_URL = "http://localhost:3000/hmrc/itsa";

const CALCULATION = {
  metadata: { calculationId: CALCULATION_ID, calculationType: "intent-to-finalise" },
  calculation: {
    taxCalculation: {
      totalIncomeTaxAndNicsDue: 1900,
      incomeTax: { totalIncomeTaxDue: 1400 },
      nics: { totalNic: 500 },
      totalTaxDeducted: 0,
    },
    allowancesAndDeductions: { personalAllowance: 12570 },
  },
  messages: { errors: [], warnings: [], info: [] },
};

function pageHtml(file) {
  return fs
    .readFileSync(path.join(process.cwd(), `web/public/hmrc/itsa/${file}`), "utf-8")
    .replace("<head>", `<head><base href="${PAGES_URL}/">`)
    .replace(
      "<body>",
      `<body><script>
window.showStatus = window.showStatus || function(){};
window.hideStatus = window.hideStatus || function(){};
window.showLoading = window.showLoading || function(){};
window.hideLoading = window.hideLoading || function(){};
window.generateRandomState = window.generateRandomState || function(){ return "test-state"; };
window.getGovClientHeaders = window.getGovClientHeaders || function(){ return Promise.resolve({}); };
window.authorizedFetch = window.authorizedFetch || function(url, options){ return fetch(url, options); };
</script>`,
    );
}

async function stubSite(page) {
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveHmrcFieldTableAssets(page);
  await serveHmrcAssistWidget(page);
  await serveFormErrors(page);
}

/**
 * Open the calculation page with HMRC Assist answered as the simulator answers it.
 * @param {import("@playwright/test").Page} page
 * @param {{report?: (request: object) => {status: number, body?: object}, acknowledgeStatus?: number}} behaviour
 */
async function openCalculationPage(page, { report, acknowledgeStatus = 204 } = {}) {
  const reportRequests = [];
  const acknowledgeRequests = [];
  await stubSite(page);
  await page.route("**/api/v1/hmrc/itsa/assist/report", async (route) => {
    const request = route.request().postDataJSON();
    reportRequests.push(request);
    const answer = report
      ? report(request)
      : {
          status: 200,
          body: {
            reportId: "report-1",
            correlationId: "correlation-1",
            receiptId: "receipt-1",
            messages: itsaDefaultMessages(),
            ...request,
          },
        };
    await route.fulfill({
      status: answer.status,
      contentType: "application/json",
      body: answer.body === undefined ? undefined : JSON.stringify(answer.body),
    });
  });
  await page.route("**/api/v1/hmrc/itsa/assist/acknowledge", async (route) => {
    acknowledgeRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: acknowledgeStatus, contentType: "application/json", body: acknowledgeStatus === 204 ? undefined : "{}" });
  });
  const url = `${PAGES_URL}/taxCalculation.html`;
  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: pageHtml("taxCalculation.html") });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hmrcAssistCheck")).toBeAttached();
  return { reportRequests, acknowledgeRequests };
}

async function showCalculation(page) {
  await page.evaluate(
    ({ calculation, nino, taxYear }) => {
      document.getElementById("calculationResults").style.display = "block";
      window.displayCalculation(calculation, nino, taxYear, "intent-to-finalise");
    },
    { calculation: CALCULATION, nino: NINO, taxYear: TAX_YEAR },
  );
}

async function scrollToLastMessage(page) {
  await page.locator("#hmrcAssistMessages > li").last().scrollIntoViewIfNeeded();
}

test.describe("HMRC Assist check on the Income Tax calculation", () => {
  test("shows no control until a calculation is displayed", async ({ page }) => {
    await openCalculationPage(page);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeHidden();

    await showCalculation(page);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeEnabled();
  });

  test("requests the report for the displayed calculation and shows HMRC's messages verbatim and in order", async ({ page }) => {
    const { reportRequests } = await openCalculationPage(page);
    await showCalculation(page);
    await page.locator("#hmrcAssistCheckBtn").click();

    const expected = itsaDefaultMessages();
    const items = page.locator("#hmrcAssistMessages > li");
    await expect(items).toHaveCount(expected.length);
    await expect(page.locator("#hmrcAssistFeedback h3")).toHaveText("HMRC feedback");
    for (const [index, message] of expected.entries()) {
      const item = items.nth(index);
      await expect(item.locator(".hmrc-assist-message-title")).toHaveText(message.title);
      await expect(item.locator(".hmrc-assist-message-body")).toHaveText(message.body);
      await expect(item.locator(".hmrc-assist-message-action")).toHaveText(message.action);
      await expect(item.locator("a")).toHaveText(message.links[0].title);
      await expect(item.locator("a")).toHaveAttribute("href", message.links[0].url);
    }
    expect(reportRequests).toEqual([{ nino: NINO, taxYear: TAX_YEAR, calculationId: CALCULATION_ID }]);
    await expect(page.locator(".hmrc-assist-highlight")).toHaveCount(0);
    await expect(page.locator("#continueToFinalDeclarationLink")).toBeVisible();
  });

  test("acknowledges the report once, with the receipt id, and clears the unacknowledged mark", async ({ page }) => {
    const { acknowledgeRequests } = await openCalculationPage(page);
    await showCalculation(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
    await scrollToLastMessage(page);

    await expect.poll(() => acknowledgeRequests.length).toBe(1);
    expect(acknowledgeRequests[0]).toEqual({ nino: NINO, reportId: "report-1", correlationId: "correlation-1", receiptId: "receipt-1" });
    await expect
      .poll(() => page.evaluate(() => window.hmrcAssistMessages.unacknowledgedFor("itsa", "f2fb30e5-4ab6-4a29-b3c1-c7efc90fc66a")))
      .toBe(false);
  });

  test("says HMRC Assist has no feedback when HMRC answers 204", async ({ page }) => {
    const { acknowledgeRequests } = await openCalculationPage(page, { report: () => ({ status: 204 }) });
    await showCalculation(page);
    await page.locator("#hmrcAssistCheckBtn").click();

    await expect(page.locator("#hmrcAssistStatus")).toHaveText("HMRC Assist has no feedback on this return");
    await expect(page.locator("#hmrcAssistFeedback")).toBeHidden();
    expect(acknowledgeRequests).toHaveLength(0);
  });

  test("shows one line and keeps the page as it was when HMRC answers 404", async ({ page }) => {
    await openCalculationPage(page, { report: () => ({ status: 404, body: { code: "MATCHING_CALCULATION_ID_NOT_FOUND" } }) });
    await showCalculation(page);
    await page.locator("#hmrcAssistCheckBtn").click();

    await expect(page.locator("#hmrcAssistStatus")).toContainText("HMRC Assist feedback is unavailable");
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeEnabled();
    await expect(page.locator("#continueToFinalDeclarationLink")).toBeVisible();
    await expect(page.locator("#totalIncomeTaxAndNicsDue")).toBeVisible();
  });

  test("clears the feedback when a new calculation is displayed", async ({ page }) => {
    await openCalculationPage(page);
    await showCalculation(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);

    await showCalculation(page);
    await expect(page.locator("#hmrcAssistFeedback")).toBeHidden();
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeEnabled();
  });
});

test.describe("HMRC Assist note on the final declaration", () => {
  async function openFinalDeclaration(page) {
    await stubSite(page);
    const url = `${PAGES_URL}/finalDeclaration.html`;
    await page.route(url, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: pageHtml("finalDeclaration.html") });
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate((calculation) => {
      window.displayCalculation(calculation);
      document.getElementById("declarationContainer").style.display = "block";
    }, CALCULATION);
  }

  test("notes that HMRC has not confirmed feedback it was shown for this calculation", async ({ page }) => {
    await openCalculationPage(page, { acknowledgeStatus: 400 });
    await showCalculation(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
    await page.evaluate(() => document.getElementById("hmrcAssistCheck").remove());

    await page.unrouteAll();
    await openFinalDeclaration(page);
    await expect(page.locator("#hmrcAssistUnacknowledged")).toBeVisible();
    await expect(page.locator("#hmrcAssistUnacknowledged")).toContainText("has not yet confirmed");
  });

  test("shows no note when no report was shown", async ({ page }) => {
    await openFinalDeclaration(page);
    await expect(page.locator("#hmrcAssistUnacknowledged")).toBeHidden();
  });
});
