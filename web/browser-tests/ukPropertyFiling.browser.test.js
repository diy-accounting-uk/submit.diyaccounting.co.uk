// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/ukPropertyFiling.browser.test.js
// The UK property pages' writes to HMRC: the sending stage names what goes to HMRC, and a write HMRC
// refuses shows the failure panel with what HMRC has not got, where the figures are, and each of
// HMRC's errors. The real pages run against stand-ins for the API routes.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const SCOPES = "write:self-assessment read:self-assessment read:self-assessment-assist write:self-assessment-assist";

// HMRC's answer to a rule it applies, as the route passes it on.
const REFUSED = {
  message: "HMRC rejected the request",
  error: {
    hmrcResponseCode: 400,
    responseBody: { code: "RULE_BOTH_EXPENSES_SUPPLIED", message: "Both expenses and consolidated expenses must not be present" },
  },
};

// The site from web/public, signed in with an HMRC grant, and the routes given: each answers after
// a pause, so the sending stage can be read before the answer.
async function serveSite(page, routes) {
  await page.addInitScript((scopes) => {
    try {
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "landlord@test.diyaccounting.co.uk" }));
      sessionStorage.setItem("hmrcGrantId", "11111111-2222-4333-8444-555555555555");
      sessionStorage.setItem("hmrcTokenScope", scopes);
      sessionStorage.setItem("hmrcAccount", "synthetic");
    } catch {}
  }, SCOPES);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    const key = `${request.method()} ${url.pathname}`;
    if (routes[key]) {
      const { status, body } = routes[key];
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (url.pathname === "/api/v1/bundle") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles: [], tokensRemaining: 10 }) });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
}

async function fillIdentifiers(page, taxYear = "2024-25") {
  await page.locator("#nino").fill("AA123456A");
  await page.locator("#businessId").fill("XPIS12345678901");
  await page.locator("#taxYear").selectOption(taxYear);
}

async function expectPanel(page, notSent) {
  const panel = page.locator(".failure-detail");
  await expect(panel.locator("[data-part=sent]")).toHaveText(notSent);
  await expect(panel).toContainText("Your figures are still in the form.");
  await expect(panel.locator("[data-part=errors] li")).toHaveText([
    "Both expenses and consolidated expenses must not be present (RULE_BOTH_EXPENSES_SUPPLIED)",
  ]);
}

test.describe("the UK property pages' fields", () => {
  test("each money field's label is led by its UK property box, with a note that links to the SA105 notes", async ({ page }) => {
    await serveSite(page, {});
    await page.goto(`${SITE}/hmrc/itsa/ukPropertyPeriod.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator('label[for="periodAmount"]')).toHaveText("UK property box 20: Rental income");
    await expect(page.locator('label[for="repairsAndMaintenance"]')).toHaveText("UK property box 25: Repairs and maintenance");
    await expect(page.locator('label[for="residentialFinancialCost"]')).toHaveText(
      "UK property box 44: Residential property finance costs",
    );
    const note = page.locator("#repairsAndMaintenance-term-hint a");
    await expect(note).toHaveText("UK property notes (SA105)");
    await expect(note).toHaveAttribute("href", "https://www.gov.uk/government/publications/self-assessment-uk-property-sa105");
    await expect(page.locator("#repairsAndMaintenance")).toHaveAttribute("aria-describedby", /repairsAndMaintenance-term-hint/);
    await page.locator("#moreExpenses summary").click();
    await page.screenshot({ path: "target/browser-test-results/ukPropertyFiling-period-fields.png", fullPage: true });
  });

  test("a cumulative year keeps the box when the label says year to date", async ({ page }) => {
    await serveSite(page, {});
    await page.goto(`${SITE}/hmrc/itsa/ukPropertyPeriod.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#taxYear").selectOption("2025-26");

    await expect(page.locator('label[for="otherIncome"]')).toHaveText("UK property box 20: Other property income (year to date)");
  });

  test("the annual submission's adjustments and allowances are led by their boxes", async ({ page }) => {
    await serveSite(page, {});
    await page.goto(`${SITE}/hmrc/itsa/ukPropertyAnnualSubmission.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator('label[for="privateUseAdjustment"]')).toHaveText("UK property box 30: Private use adjustment");
    await expect(page.locator('label[for="balancingCharge"]')).toHaveText("UK property box 31: Balancing charge");
    await expect(page.locator('label[for="costOfReplacingDomesticItems"]')).toHaveText(
      "UK property box 36: Cost of replacing domestic items",
    );
  });
});

test.describe("the UK property pages' writes to HMRC", () => {
  test("the period update says it is sending the UK property update, then shows HMRC's refusal in the panel", async ({ page }) => {
    await serveSite(page, { "POST /api/v1/hmrc/itsa/uk-property/period": { status: 400, body: REFUSED } });
    await page.goto(`${SITE}/hmrc/itsa/ukPropertyPeriod.html`, { waitUntil: "domcontentloaded" });
    await fillIdentifiers(page);
    await page.locator("#fromDate").fill("2024-04-06");
    await page.locator("#toDate").fill("2024-07-05");
    await page.locator("#periodAmount").fill("1200");

    await page.locator("#submitBtn").click();

    await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the UK property update to HMRC...");
    await expectPanel(page, "HMRC has not got the UK property update.");
    await expect(page.locator("#statusMessagesContainer")).not.toContainText("Failed to file the quarterly update");
    await page.screenshot({ path: "target/browser-test-results/ukPropertyFiling-period-panel.png", fullPage: true });
  });

  test("the amend says it is sending the amended update, then shows HMRC's refusal in the panel", async ({ page }) => {
    await serveSite(page, { "PUT /api/v1/hmrc/itsa/uk-property/period": { status: 400, body: REFUSED } });
    await page.goto(`${SITE}/hmrc/itsa/ukPropertyPeriodAmend.html`, { waitUntil: "domcontentloaded" });
    await fillIdentifiers(page);
    await page.locator("#submissionId").fill("4557ecb5-fd32-48cc-81f5-e6acd1099f3c");
    await page.locator("#periodAmount").fill("1300");

    await page.locator("form#itsaUkPropertyPeriodAmendForm [type=submit]").click();

    await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the amended UK property update to HMRC...");
    await expectPanel(page, "HMRC has not got the amended UK property update.");
  });

  test("the annual save says it is sending the annual submission, then shows HMRC's refusal in the panel", async ({ page }) => {
    await serveSite(page, {
      "GET /api/v1/hmrc/itsa/uk-property/annual": { status: 200, body: { ukProperty: { adjustments: { balancingCharge: 0 } } } },
      "PUT /api/v1/hmrc/itsa/uk-property/annual": { status: 400, body: REFUSED },
    });
    await page.goto(`${SITE}/hmrc/itsa/ukPropertyAnnualSubmission.html`, { waitUntil: "domcontentloaded" });
    await fillIdentifiers(page);
    await page.locator("#loadBtn").click();
    await expect(page.locator("#annualEditForm")).toBeVisible({ timeout: 10_000 });

    await page.locator("#saveBtn").click();

    await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the UK property annual submission to HMRC...");
    await expectPanel(page, "HMRC has not got the UK property annual submission.");
  });

  test("the year-end summary request says it is asking HMRC, then shows HMRC's refusal in the panel", async ({ page }) => {
    await serveSite(page, { "POST /api/v1/hmrc/itsa/bsas/trigger": { status: 400, body: REFUSED } });
    await page.goto(`${SITE}/hmrc/itsa/ukPropertyAdjustments.html`, { waitUntil: "domcontentloaded" });
    await fillIdentifiers(page);
    await page.locator("#accountingPeriodStartDate").fill("2024-04-06");
    await page.locator("#accountingPeriodEndDate").fill("2025-04-05");

    await page.locator("#triggerBtn").click();

    await expect(page.locator("#statusMessagesContainer")).toContainText("Asking HMRC for the UK property year-end summary...");
    const panel = page.locator(".failure-detail");
    await expect(panel.locator("[data-part=sent]")).toHaveText("HMRC has not made the UK property year-end summary.");
    await expect(panel).toContainText("Your answers are still in the form.");
  });
});
