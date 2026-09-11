// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaCumulativeModel.browser.test.js
// Browser tests for the dated/cumulative model switch across the ITSA period pages: a 2025-26
// tax year reads as a running total rather than a quarter, and drops the fields the cumulative
// endpoint has no use for.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function readPage(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

async function loadPage(page, html, url) {
  await page.route("**/*.js", async (route) => {
    const request = route.request();
    if (request.resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });

  const modifiedHtml = html
    .replace("<head>", `<head><base href="${new URL(".", url)}">`)
    .replace(
      "<body>",
      `<body><script>
window.showStatus = window.showStatus || function(){};
window.hideStatus = window.hideStatus || function(){};
window.showLoading = window.showLoading || function(){};
window.hideLoading = window.hideLoading || function(){};
window.generateRandomState = window.generateRandomState || function(){ return "test-state"; };
window.getGovClientHeaders = window.getGovClientHeaders || function(){ return Promise.resolve({}); };
window.authorizedFetch = window.authorizedFetch || function(){ return Promise.resolve({ ok: true, json: function(){ return Promise.resolve({}); }}); };
</script>`,
    );

  await page.setContent(modifiedHtml, { url, waitUntil: "domcontentloaded" });

  // The lib script is stripped by the blanket **/*.js route above (it has no src on the base
  // page's own origin resolution path in this harness), so load the real submission-model
  // helper directly into the page for these tests.
  await page.addScriptTag({ path: path.join(process.cwd(), "web/public/lib/itsaSubmissionModel.js") });

  await delay(200);
}

test.describe("ITSA cumulative model - self-employment period", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/selfEmploymentPeriod.html");
  });

  test("labels the money fields as quarterly figures for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html");

    await page.locator("#taxYear").fill("2024-25");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator('label[for="turnover"]')).toHaveText("Turnover");
    await expect(page.locator("#periodStartDate")).toHaveAttribute("required", "");
    await expect(page.locator("#loadCurrentTotalGroup")).toBeHidden();
  });

  test("labels the money fields as year-to-date totals for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html");

    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator('label[for="turnover"]')).toHaveText("Turnover (year to date)");
    await expect(page.locator("#periodStartDate")).not.toHaveAttribute("required", "");
    await expect(page.locator("#cumulativeMoneyNote")).toBeVisible();
    await expect(page.locator("#loadCurrentTotalGroup")).toBeVisible();
  });
});

test.describe("ITSA cumulative model - self-employment amend", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/selfEmploymentPeriodAmend.html");
  });

  test("requires a period ID for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriodAmend.html");

    await page.locator("#taxYear").fill("2023-24");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#periodIdGroup")).toBeVisible();
    await expect(page.locator("#periodId")).toHaveAttribute("required", "");
  });

  test("hides the period ID field for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriodAmend.html");

    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#periodIdGroup")).toBeHidden();
    await expect(page.locator("#periodId")).not.toHaveAttribute("required", "");
    await expect(page.locator("#loadCurrentTotalGroup")).toBeVisible();
  });
});

test.describe("ITSA cumulative model - self-employment periods list", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/selfEmploymentPeriods.html");
  });

  test("keeps the list button for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriods.html");

    await page.locator("#taxYear").fill("2023-24");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#retrieveBtn")).toHaveText("List Period Summaries");
    await expect(page.locator("#cumulativeListNote")).toBeHidden();
  });

  test("switches to the current-total button for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriods.html");

    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#retrieveBtn")).toHaveText("Show Current Total");
    await expect(page.locator("#cumulativeListNote")).toBeVisible();
  });
});

test.describe("ITSA cumulative model - self-employment period view", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/selfEmploymentPeriodView.html");
  });

  test("requires a period ID for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriodView.html");

    await page.locator("#taxYear").fill("2023-24");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#periodIdGroup")).toBeVisible();
  });

  test("hides the period ID field for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriodView.html");

    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#periodIdGroup")).toBeHidden();
    await expect(page.locator("#cumulativeViewNote")).toBeVisible();
  });
});

test.describe("ITSA cumulative model - UK property period", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/ukPropertyPeriod.html");
  });

  test("keeps the property type choice for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/ukPropertyPeriod.html");

    await page.locator("#taxYear").fill("2024-25");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#propertyTypeGroup")).toBeVisible();
    await expect(page.locator('label[for="periodAmount"]')).toHaveText("Rental income");
  });

  test("drops the property type choice and reads as a running total for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/ukPropertyPeriod.html");

    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#propertyTypeGroup")).toBeHidden();
    await expect(page.locator('label[for="periodAmount"]')).toHaveText("Rental income (year to date)");
    await expect(page.locator("#cumulativeMoneyNote")).toBeVisible();
    await expect(page.locator("#loadCurrentTotalGroup")).toBeVisible();
  });
});

test.describe("ITSA cumulative model - UK property amend", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/ukPropertyPeriodAmend.html");
  });

  test("hides the submission ID field for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/ukPropertyPeriodAmend.html");

    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#submissionIdGroup")).toBeHidden();
    await expect(page.locator("#propertyTypeGroup")).toBeHidden();
  });
});

test.describe("ITSA cumulative model - UK property period view", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/ukPropertyPeriodView.html");
  });

  test("hides the submission ID field for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/ukPropertyPeriodView.html");

    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#submissionIdGroup")).toBeHidden();
    await expect(page.locator("#cumulativeViewNote")).toBeVisible();
  });
});

test.describe("ITSA cumulative model - UK property periods list", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/ukPropertyPeriods.html");
  });

  test("switches to the current-total button for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/ukPropertyPeriods.html");

    await page.locator("#taxYear").fill("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#retrieveBtn")).toHaveText("Show Current Total");
  });
});
