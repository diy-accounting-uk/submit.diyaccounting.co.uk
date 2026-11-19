// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companiesHouseNotReceived.browser.test.js
//
// A filing Companies House never received comes back with our own NOT-RECEIVED reason. The filing
// page and the filings list show it in the reader's language; a reason Companies House sent stays
// as Companies House wrote it, with its code.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const ENGLISH_MESSAGE = "Companies House did not receive this filing. Nothing was filed. File it again.";
const WELSH_MESSAGE = "Ni chafodd Tŷ’r Cwmnïau y ffeilio hwn. Ni ffeiliwyd dim. Ffeiliwch ef eto.";
const ENGLISH_HEADLINE = "Companies House did not receive this filing. Nothing was filed.";
const WELSH_HEADLINE = "Ni chafodd Tŷ’r Cwmnïau y ffeilio hwn. Ni ffeiliwyd dim.";
const NOT_RECEIVED = { rejectCode: "NOT-RECEIVED", description: ENGLISH_MESSAGE, instanceNumber: "1" };
const COMPANIES_HOUSE_REASON = {
  rejectCode: "9001",
  description: "The company number does not match the company name.",
  instanceNumber: "1",
};

async function serveSite(page, { language, apiBodies = {} }) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const body = Object.entries(apiBodies).find(([prefix]) => url.pathname.startsWith(prefix))?.[1] ?? {};
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
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
  await page.addInitScript((siteLanguage) => {
    localStorage.setItem("cognitoIdToken", "test-id-token");
    localStorage.setItem("siteLanguage", siteLanguage);
  }, language);
}

// Files on the real micro-entity or small company page with the submit and the poll answered in the page, and
// waits for the outcome.
async function fileWithOutcome(page, pagePath, rejections) {
  await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.handleSubmitFiling === "function" || typeof handleSubmitFiling === "function");
  await page.evaluate(async (outcomeRejections) => {
    window.submitMicroEntityAccounts = async () => ({ submissionNumber: "00001A", pollInterval: 1 });
    window.pollMicroEntityAccounts = async () => ({ statusCode: "REJECT", submissionNumber: "00001A", rejections: outcomeRejections });
    window.buildAccountsPayload = () => ({});
    company = { companyNumber: "00000001", companyName: "TEST LTD" };
    showView("previewView");
    document.getElementById("companyAuthCode").value = "ABC123";
    await handleSubmitFiling();
  }, rejections);
  const shown = page.locator("#rejections");
  await expect(shown).toBeVisible({ timeout: 15000 });
  return shown;
}

test.describe("A filing Companies House never received", () => {
  test("the Welsh micro-entity filing page shows the reason in Welsh", async ({ page }) => {
    await serveSite(page, { language: "cy" });

    const shown = await fileWithOutcome(page, "cy/companies-house/fileMicroEntityAccounts.html", [NOT_RECEIVED]);

    await expect(shown).toHaveText(WELSH_MESSAGE);
    await expect(shown).not.toContainText("NOT-RECEIVED");
    await expect(shown).not.toContainText("did not receive");
    const result = page.locator("#filingResult");
    await expect(result.locator(".outcome__title")).toHaveText(WELSH_HEADLINE);
    await expect(result.locator(".hint")).toHaveText("Rhif cyflwyno 00001A.");
    await expect(result).toHaveClass(/outcome--error/);
    await expect(result).not.toContainText("REJECT");
  });

  test("a reason Companies House sent shows as Companies House wrote it, with its code", async ({ page }) => {
    await serveSite(page, { language: "cy" });

    const shown = await fileWithOutcome(page, "cy/companies-house/fileMicroEntityAccounts.html", [COMPANIES_HOUSE_REASON]);

    await expect(shown).toHaveText(`9001: ${COMPANIES_HOUSE_REASON.description}`);
    await expect(page.locator("#filingResult .outcome__title")).not.toHaveText(WELSH_HEADLINE);
    await expect(page.locator("#filingResult .hint")).toContainText("REJECT");
  });

  test("the English page shows the reason in English, without our code", async ({ page }) => {
    await serveSite(page, { language: "en" });

    const shown = await fileWithOutcome(page, "companies-house/fileMicroEntityAccounts.html", [NOT_RECEIVED]);

    await expect(shown).toHaveText(ENGLISH_MESSAGE);
    const result = page.locator("#filingResult");
    await expect(result.locator(".outcome__title")).toHaveText(ENGLISH_HEADLINE);
    await expect(result.locator(".hint")).toHaveText("Submission number 00001A.");
    await expect(result).not.toContainText("rejected");
  });

  test("the small company page heads a not-received outcome as not received, in English and Welsh", async ({ page }) => {
    await serveSite(page, { language: "en" });
    await fileWithOutcome(page, "companies-house/fileSmallCompanyAccounts.html", [NOT_RECEIVED]);
    await expect(page.locator("#filingResult")).toHaveText(`${ENGLISH_HEADLINE} Submission number 00001A.`);

    await serveSite(page, { language: "cy" });
    await fileWithOutcome(page, "cy/companies-house/fileSmallCompanyAccounts.html", [NOT_RECEIVED]);
    await expect(page.locator("#filingResult")).toHaveText(`${WELSH_HEADLINE} Rhif cyflwyno 00001A.`);
  });

  test("the small company page keeps the rejected outcome for a reason Companies House sent", async ({ page }) => {
    await serveSite(page, { language: "en" });
    await fileWithOutcome(page, "companies-house/fileSmallCompanyAccounts.html", [COMPANIES_HOUSE_REASON]);
    await expect(page.locator("#filingResult")).toHaveText("Submission 00001A was REJECT.");
  });

  test("the Welsh filings list names it as not received, with the reason in Welsh", async ({ page }) => {
    await serveSite(page, {
      language: "cy",
      apiBodies: {
        "/api/v1/hmrc/receipt": {
          receipts: [],
          filingsInProgress: [
            {
              submissionNumber: "00001A",
              kind: "accounts",
              status: "rejected",
              submittedAt: "2026-11-18T10:00:00.000Z",
              rejections: [NOT_RECEIVED],
            },
          ],
        },
      },
    });

    await page.goto("http://localhost:3000/cy/hmrc/receipt/receipts.html", { waitUntil: "load" });

    const section = page.locator("#filingsInProgress");
    await expect(section).toBeVisible({ timeout: 15000 });
    await expect(section.locator(".filing-status")).toHaveText("Ni chafodd Tŷ’r Cwmnïau ef");
    await expect(section.locator("li").last()).toHaveText(WELSH_MESSAGE);
    await expect(section).not.toContainText("Rejected by Companies House");
  });
});
