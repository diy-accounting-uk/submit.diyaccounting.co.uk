// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitVatPassCheck.browser.test.js
//
// The VAT return form checks for a pass before it reads HMRC's open periods or sends the return. With
// no pass it sends nothing and offers a day pass; a refusal for want of a pass keeps the HMRC grant.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const GRANT_ID = "0a1b2c3d-0a1b-4a1b-8a1b-0a1b2c3d4e5f";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const HELD_DAY_PASS = [{ bundleId: "day-guest", allocated: true, tokensGranted: 3, tokensRemaining: 3 }];
const ENTITLEMENT_REFUSAL = {
  message: "Forbidden - missing or insufficient bundle entitlement",
  error: { code: "BUNDLE_ENTITLEMENT_REQUIRED" },
};

const STORED_RETURN = {
  vatNumber: "123456789",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  vatDueSales: 100,
  vatDueAcquisitions: 0,
  totalVatDue: 100,
  vatReclaimedCurrPeriod: 20,
  netVatDue: 80,
  totalValueSalesExVAT: 500,
  totalValuePurchasesExVAT: 100,
  totalValueGoodsSuppliedExVAT: 0,
  totalAcquisitionsExVAT: 0,
  finalised: true,
};

// The real page with the API answered here. Returns the requests that would reach HMRC.
async function openSubmitVat(page, { bundles = [], obligation, returnAnswer, session = {} } = {}) {
  const hmrcRequests = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      let answer = { status: 200, body: {} };
      if (url.pathname === "/api/v1/bundle") answer = { status: 200, body: { bundles } };
      if (url.pathname === "/api/v1/hmrc/vat/obligation") {
        hmrcRequests.push(`GET ${url.pathname}`);
        answer = obligation || answer;
      }
      if (url.pathname === "/api/v1/hmrc/vat/return") {
        hmrcRequests.push(`${route.request().method()} ${url.pathname}`);
        answer = returnAnswer || answer;
      }
      await route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
  await page.addInitScript((stored) => {
    localStorage.setItem("siteLanguage", "en");
    localStorage.setItem("cognitoIdToken", "test-id-token");
    for (const [key, value] of Object.entries(stored)) sessionStorage.setItem(key, value);
  }, session);
  await page.goto("http://localhost:3000/hmrc/vat/submitVat.html", { waitUntil: "load" });
  return hmrcRequests;
}

const grantSession = (extra = {}) => ({ hmrcGrantId: GRANT_ID, hmrcTokenScope: "write:vat read:vat", ...extra });

async function fillReturn(page) {
  await page.fill("#vatNumber", STORED_RETURN.vatNumber);
  await page.fill("#periodStart", STORED_RETURN.periodStart);
  await page.fill("#periodEnd", STORED_RETURN.periodEnd);
  await page.fill("#vatDueSales", "100");
  await page.fill("#vatDueAcquisitions", "0");
  await page.fill("#vatReclaimedCurrPeriod", "20");
  await page.fill("#totalValueSalesExVAT", "500");
  await page.fill("#totalValuePurchasesExVAT", "100");
  await page.fill("#totalValueGoodsSuppliedExVAT", "0");
  await page.fill("#totalAcquisitionsExVAT", "0");
  await page.check("#declaration");
}

async function expectPassNeeded(page) {
  const message = page.locator("#statusMessagesContainer .status-message.status-error");
  await expect(message).toContainText("You need a pass to submit a VAT return");
  await expect(message).toContainText("Nothing has been sent to HMRC.");
  await expect(message.getByRole("link", { name: "Get a day pass" })).toHaveAttribute("href", "/bundles.html");
}

test.describe("VAT return pass check", () => {
  test("with no pass, the submit sends nothing, leaves for no HMRC sign-in and offers a day pass", async ({ page }) => {
    const hmrcRequests = await openSubmitVat(page);
    await fillReturn(page);
    await page.locator("#submitBtn").click();

    await expectPassNeeded(page);
    expect(page.url()).toBe("http://localhost:3000/hmrc/vat/submitVat.html");
    expect(hmrcRequests).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem("submission_data"))).toBeNull();
  });

  test("with no pass, the return stored before the HMRC sign-in is not sent and the grant stays", async ({ page }) => {
    const hmrcRequests = await openSubmitVat(page, {
      session: grantSession({ submission_data: JSON.stringify(STORED_RETURN) }),
    });

    await expectPassNeeded(page);
    await expect(page.locator("#vatForm")).toBeVisible();
    expect(hmrcRequests).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem("hmrcGrantId"))).toBe(GRANT_ID);
    expect(await page.evaluate(() => sessionStorage.getItem("submission_data"))).toBeNull();
  });

  test("with no pass, the open periods are not read and the period line offers a day pass", async ({ page }) => {
    const hmrcRequests = await openSubmitVat(page, { session: grantSession() });
    await page.fill("#vatNumber", STORED_RETURN.vatNumber);

    const status = page.locator("#obligationStatus");
    await expect(status).toContainText("You need a pass to read your open VAT periods from HMRC");
    await expect(status.getByRole("link", { name: "Get a day pass" })).toHaveAttribute("href", "/bundles.html");
    expect(hmrcRequests).toEqual([]);
  });

  test("an open periods read refused for want of a pass offers a day pass", async ({ page }) => {
    await openSubmitVat(page, {
      bundles: HELD_DAY_PASS,
      session: grantSession(),
      obligation: { status: 403, body: ENTITLEMENT_REFUSAL },
    });
    await page.fill("#vatNumber", STORED_RETURN.vatNumber);

    const status = page.locator("#obligationStatus");
    await expect(status).toContainText("You need a pass to read your open VAT periods from HMRC");
    await expect(status).not.toContainText("could not be read");
  });

  test("a submit refused for want of a pass offers a day pass and keeps the HMRC grant", async ({ page }) => {
    const hmrcRequests = await openSubmitVat(page, {
      bundles: HELD_DAY_PASS,
      session: grantSession({ submission_data: JSON.stringify(STORED_RETURN) }),
      returnAnswer: { status: 403, body: ENTITLEMENT_REFUSAL },
    });

    await expectPassNeeded(page);
    expect(hmrcRequests).toContain("POST /api/v1/hmrc/vat/return");
    expect(await page.evaluate(() => sessionStorage.getItem("hmrcGrantId"))).toBe(GRANT_ID);
  });
});
