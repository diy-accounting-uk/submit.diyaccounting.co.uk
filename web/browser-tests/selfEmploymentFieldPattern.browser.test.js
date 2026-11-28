// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/selfEmploymentFieldPattern.browser.test.js
// The self-employment pages as a reader sees them: each field led by its SA103F box, its note
// with the link to the SA103F notes, its "In DIY Accounting's spreadsheets" disclosure, the stage
// of a write to HMRC, and the panel a refused write leaves. The field detail, hmrc-service.js, the
// failure panel and the status messages are the real ones; only the request to Submit's API is
// stubbed, with the answer the test gives.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  serveCarriedIdentifiers,
  serveFormErrors,
  serveItsaPageScripts,
  serveMoneyInput,
  serveSiteStyles,
} from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/browser-test-results/self-employment-field-pattern");
const SA103F_NOTES = "https://www.gov.uk/government/publications/self-assessment-self-employment-full-sa103f";

// The modules the field pattern, the stage, the failure panel and the status messages are made of, served from disk.
const REAL_MODULES = [
  "lib/field-detail.js",
  "lib/ct600-fields.js",
  "lib/ct600-source-cells.js",
  "lib/accounts-page-lines.js",
  "lib/long-period.js",
  "lib/first-accounts.js",
  "lib/balance-sheet-headings.js",
  "lib/itsa-field-detail.js",
  "lib/self-employment-fields.js",
  "lib/self-employment-field-detail.js",
  "lib/filing-failure.js",
  "lib/services/hmrc-service.js",
  "lib/utils/dom-utils.js",
  "widgets/status-messages.js",
];

// submit.js puts the status helpers on window; this stand-in does only that.
const SUBMIT_STUB = `
import { showStatus, hideStatus, dismissStatus, narrateStage, endStage } from "./lib/utils/dom-utils.js";
Object.assign(window, { showStatus, hideStatus, dismissStatus, narrateStage, endStage });
window.showLoading = () => {};
window.hideLoading = () => {};
window.getGovClientHeaders = () => Promise.resolve({});
window.generateRandomState = () => "state";
`;

// Submit's API answers with window.__answer, after the stage the page says has been seen.
const API_CLIENT_STUB = `
export async function authorizedFetch(url, init = {}) {
  window.__requests.push({ url, method: init.method, pollStage: init.pollStage, pollPendingMessage: init.pollPendingMessage });
  window.__stages.push(Array.from(document.querySelectorAll(".status-message-content")).map((el) => el.textContent));
  const { status, body } = window.__answer;
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "req-42" } });
}
window.authorizedFetch = authorizedFetch;
`;

async function openPage(page, fileName, answer) {
  page.on("pageerror", (error) => console.log("[PAGE_ERROR]", error?.message || String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("[PAGE_CONSOLE]", message.text());
  });
  await page.addInitScript((given) => {
    if (location.origin === "http://localhost:3000") sessionStorage.setItem("hmrcGrantId", "grant-1");
    window.__answer = given;
    window.__requests = [];
    window.__stages = [];
    window.booksImport = { mount: () => {}, applyPendingHandoff: () => false };
  }, answer);
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveItsaPageScripts(page);
  await serveCarriedIdentifiers(page);
  await serveMoneyInput(page);
  await serveFormErrors(page);
  await serveSiteStyles(page);
  for (const relative of REAL_MODULES) {
    await page.route(`**/${relative}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fs.readFileSync(path.join(PUBLIC_DIR, relative), "utf-8"),
      }),
    );
  }
  await page.route("**/submit.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: SUBMIT_STUB }));
  await page.route("**/lib/services/api-client.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: API_CLIENT_STUB }),
  );
  const url = `http://localhost:3000/hmrc/itsa/${fileName}`;
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, "hmrc/itsa", fileName), "utf-8")
    .replace("<head>", `<head><base href="${new URL(".", url)}">`);
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(url, { waitUntil: "load" });
  await expect(page.locator("label[data-field-reference], input[data-field-detail='applied']").first()).toBeAttached();
}

const HMRC_RULE = {
  status: 400,
  body: {
    message: "HMRC rejected the request",
    error: {
      hmrcResponseCode: 400,
      responseBody: { code: "RULE_BOTH_EXPENSES_SUPPLIED", message: "Both expenses and consolidated expenses must not be present" },
    },
  },
};

test.describe("the self-employment quarterly update", () => {
  test("leads each field with its SA103F box, links the SA103F notes and names the spreadsheet cell", async ({ page }) => {
    await openPage(page, "selfEmploymentPeriod.html", { status: 200, body: {} });

    await expect(page.locator('label[for="turnover"]')).toHaveText("Box 15: Turnover");
    await expect(page.locator('label[for="costOfGoods"]')).toHaveText("Box 17: Cost of goods");
    await expect(page.locator('label[for="costOfGoodsDisallowable"]')).toHaveText(/^Box 32: /);
    const note = page.locator("#turnover-field-hint");
    await expect(note.locator("a")).toHaveAttribute("href", SA103F_NOTES);
    await expect(note.locator("a")).toHaveText("SA103F notes");
    await expect(page.locator("#turnover")).toHaveAttribute("aria-describedby", /turnover-field-hint/);

    const disclosure = page.locator("#turnover-field-source");
    await disclosure.locator("summary").click();
    await expect(disclosure).toContainText("Financialaccounts.xlsx");
    await expect(disclosure).toContainText("SE Full");
    await expect(disclosure).toContainText("D55");
    await expect(disclosure).toContainText("The Self Employed package's workbook.");
    await expect(page.locator("#costOfGoodsDisallowable-field-source")).toContainText("The spreadsheets have no cell for this.");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "quarterly-fields.png"), fullPage: true });
  });

  test("says the sending stage, then shows HMRC's rule in the failure panel with what HMRC has not got", async ({ page }) => {
    await openPage(page, "selfEmploymentPeriod.html", HMRC_RULE);
    await page.fill("#nino", "AA123456A");
    await page.fill("#businessId", "XAIS12345678901");
    await page.selectOption("#taxYear", { index: 1 });
    if (await page.locator("#periodStartDate").isVisible()) {
      await page.fill("#periodStartDate", "2024-04-06");
      await page.fill("#periodEndDate", "2024-07-05");
    }
    await page.fill("#turnover", "1000");
    await page.click("#submitBtn");

    const panel = page.locator("#failureDetail");
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-part="sent"]')).toHaveText("HMRC has not got the quarterly update.");
    await expect(panel.locator('[data-part="answers"]')).toHaveText("Your figures are still in the form.");
    await expect(panel.locator('[data-part="errors"]')).toHaveText(
      "Both expenses and consolidated expenses must not be present (RULE_BOTH_EXPENSES_SUPPLIED)",
    );
    const stages = await page.evaluate(() => window.__stages);
    expect(stages[0]).toContain("Sending the quarterly update to HMRC...");
    const requests = await page.evaluate(() => window.__requests);
    expect(requests[0]).toMatchObject({ method: "POST", pollStage: true, pollPendingMessage: "Waiting for HMRC's answer..." });
    await expect(page.locator(".status-message-content", { hasText: "Sending the quarterly update" })).toHaveCount(0);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "quarterly-failure.png"), fullPage: true });
  });
});

test.describe("the self-employment annual submission and adjustments", () => {
  test("lead the allowances and the adjustments with their SA103F boxes", async ({ page }) => {
    await openPage(page, "annualSubmission.html", { status: 200, body: { adjustments: {}, allowances: {}, nonFinancials: {} } });
    await page.fill("#nino", "AA123456A");
    await page.fill("#businessId", "XAIS12345678901");
    await page.selectOption("#taxYear", { index: 1 });
    await page.click("#loadBtn");
    await expect(page.locator("#annualEditForm")).toBeVisible();
    await expect(page.locator('label[for="annualInvestmentAllowance"]')).toHaveText(/^Box 49: /);
    await expect(page.locator('label[for="zeroEmissionsCarAllowance"]')).toHaveText(/^Box 52\.1: /);
    await expect(page.locator("#annualInvestmentAllowance-field-source")).toContainText("D139");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "annual-fields.png"), fullPage: true });
  });

  test("the adjustments page leads its two adjustments with the boxes they adjust", async ({ page }) => {
    await openPage(page, "adjustments.html", { status: 200, body: {} });
    await expect(page.locator('label[for="adjustTurnover"]')).toHaveText(/^Box 15: /);
    await expect(page.locator('label[for="adjustCostOfGoods"]')).toHaveText(/^Box 17: /);
  });
});
