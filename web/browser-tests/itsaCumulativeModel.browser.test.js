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
import {
  serveCarriedIdentifiers,
  serveItsaPageScripts,
  serveItsaSubmissionModel,
  serveSelfEmploymentExpenses,
  serveMoneyInput,
  serveFormErrors,
  serveHmrcFieldTableAssets,
} from "./hmrcFieldTableAssets.js";

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

  await serveCarriedIdentifiers(page);
  await serveItsaPageScripts(page);
  await serveItsaSubmissionModel(page);
  await serveSelfEmploymentExpenses(page);
  await serveMoneyInput(page);
  await serveFormErrors(page);
  await serveHmrcFieldTableAssets(page);

  const modifiedHtml = html.replace("<head>", `<head><base href="${new URL(".", url)}">`).replace(
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

  await delay(200);
}

async function stubSignedInFetch(page, responseBody) {
  await page.evaluate((body) => {
    window.__sentRequests = [];
    window.authorizedFetch = (url, init) => {
      window.__sentRequests.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    };
    const store = new Map([["hmrcAccessToken", "test-token"]]);
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
      },
    });
  }, responseBody);
}

async function fillIdentity(page, taxYear) {
  await page.locator("#nino").fill("AB123456C");
  await page.locator("#businessId").fill("XAIS12345678901");
  await page.locator("#taxYear").selectOption(taxYear);
  await page.locator("#taxYear").dispatchEvent("input");
}

async function captureShots(page, name) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `target/screenshots/${name}-${width}.png`, fullPage: true });
  }
}

test.describe("ITSA cumulative model - self-employment period", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/selfEmploymentPeriod.html");
  });

  test("labels the money fields as quarterly figures for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html");

    await page.locator("#taxYear").selectOption("2024-25");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator('label[for="turnover"]')).toHaveText("Turnover");
    await expect(page.locator("#periodStartDate")).toHaveAttribute("required", "");
    await expect(page.locator("#loadCurrentTotalGroup")).toBeHidden();
  });

  test("labels the money fields as year-to-date totals for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html");

    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator('label[for="turnover"]')).toHaveText("Turnover (year to date)");
    await expect(page.locator("#periodStartDate")).not.toHaveAttribute("required", "");
    await expect(page.locator("#cumulativeMoneyNote")).toBeVisible();
    await expect(page.locator("#loadCurrentTotalGroup")).toBeVisible();
  });

  test("sends taxTakenOffTradingIncome in periodIncome for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html");
    await stubSignedInFetch(page, { model: "cumulative" });

    await fillIdentity(page, "2025-26");
    await page.locator("#turnover").fill("5000");
    await page.locator("#taxTakenOffTradingIncome").fill("250.50");
    await captureShots(page, "selfEmploymentPeriod-taxTakenOff");
    await page.locator("#submitBtn").click();
    await expect.poll(() => page.evaluate(() => window.__sentRequests.length)).toBe(1);
    const cumulative = await page.evaluate(() => window.__sentRequests[0].body);
    expect(cumulative.periodIncome).toEqual({ turnover: 5000, other: 0, taxTakenOffTradingIncome: 250.5 });
  });

  test("sends taxTakenOffTradingIncome in periodIncome for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html");
    await stubSignedInFetch(page, { periodId: "2024-04-06_2024-07-05" });

    await fillIdentity(page, "2024-25");
    await page.locator("#periodStartDate").fill("2024-04-06");
    await page.locator("#periodEndDate").fill("2024-07-05");
    await page.locator("#turnover").fill("1000");
    await page.locator("#taxTakenOffTradingIncome").fill("250.50");
    await page.locator("#submitBtn").click();
    await expect.poll(() => page.evaluate(() => window.__sentRequests.length)).toBe(1);
    const dated = await page.evaluate(() => window.__sentRequests[0].body);
    expect(dated.periodIncome.taxTakenOffTradingIncome).toBe(250.5);
  });

  test("leaves taxTakenOffTradingIncome out of periodIncome when the field is blank", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html");
    await stubSignedInFetch(page, { model: "cumulative" });

    await fillIdentity(page, "2025-26");
    await page.locator("#turnover").fill("5000");
    await page.locator("#submitBtn").click();
    await expect.poll(() => page.evaluate(() => window.__sentRequests.length)).toBe(1);
    const sent = await page.evaluate(() => window.__sentRequests[0].body);
    expect(sent.periodIncome).toEqual({ turnover: 5000, other: 0 });
  });

  test("Load current total fills the taxTakenOffTradingIncome field", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriod.html");
    await stubSignedInFetch(page, { periodIncome: { turnover: 7000, other: 10, taxTakenOffTradingIncome: 125 } });

    await fillIdentity(page, "2025-26");
    await page.locator("#loadCurrentTotalBtn").click();

    await expect(page.locator("#taxTakenOffTradingIncome")).toHaveValue("125");
    await expect(page.locator("#turnover")).toHaveValue("7000");
  });
});

test.describe("ITSA cumulative model - self-employment amend", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/selfEmploymentPeriodAmend.html");
  });

  test("requires a period ID for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriodAmend.html");

    await page.locator("#taxYear").selectOption("2023-24");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#periodIdGroup")).toBeVisible();
    await expect(page.locator("#periodId")).toHaveAttribute("required", "");
  });

  test("hides the period ID field for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriodAmend.html");

    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#periodIdGroup")).toBeHidden();
    await expect(page.locator("#periodId")).not.toHaveAttribute("required", "");
    await expect(page.locator("#loadCurrentTotalGroup")).toBeVisible();
  });

  test("sends taxTakenOffTradingIncome in periodIncome and reads it back with Load current total", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriodAmend.html");
    await stubSignedInFetch(page, { periodIncome: { turnover: 7000, taxTakenOffTradingIncome: 125 } });

    await fillIdentity(page, "2025-26");
    await page.locator("#loadCurrentTotalBtn").click();
    await expect(page.locator("#taxTakenOffTradingIncome")).toHaveValue("125");
    await captureShots(page, "selfEmploymentPeriodAmend-taxTakenOff");

    await page.locator("#taxTakenOffTradingIncome").fill("300");
    await page.locator("button[type=submit]").click();
    await expect.poll(() => page.evaluate(() => window.__sentRequests.length)).toBe(2);
    const sent = await page.evaluate(() => window.__sentRequests[1].body);
    expect(sent.periodIncome.taxTakenOffTradingIncome).toBe(300);
  });
});

test.describe("ITSA cumulative model - self-employment periods list", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/selfEmploymentPeriods.html");
  });

  test("keeps the list button for a dated tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriods.html");

    await page.locator("#taxYear").selectOption("2023-24");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#retrieveBtn")).toHaveText("List period summaries");
    await expect(page.locator("#cumulativeListNote")).toBeHidden();
  });

  test("switches to the current-total button for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriods.html");

    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#retrieveBtn")).toHaveText("Show current total");
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

    await page.locator("#taxYear").selectOption("2023-24");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#periodIdGroup")).toBeVisible();
  });

  test("hides the period ID field for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/selfEmploymentPeriodView.html");

    await page.locator("#taxYear").selectOption("2025-26");
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

    await page.locator("#taxYear").selectOption("2024-25");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#propertyTypeGroup")).toBeVisible();
    await expect(page.locator('label[for="periodAmount"]')).toHaveText("Rental income");
  });

  test("drops the property type choice and reads as a running total for a cumulative tax year", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/ukPropertyPeriod.html");

    await page.locator("#taxYear").selectOption("2025-26");
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

    await page.locator("#taxYear").selectOption("2025-26");
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

    await page.locator("#taxYear").selectOption("2025-26");
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

    await page.locator("#taxYear").selectOption("2025-26");
    await page.locator("#taxYear").dispatchEvent("input");

    await expect(page.locator("#retrieveBtn")).toHaveText("Show current total");
  });
});
