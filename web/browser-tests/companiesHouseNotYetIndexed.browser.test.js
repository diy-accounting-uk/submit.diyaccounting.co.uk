// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companiesHouseNotYetIndexed.browser.test.js
//
// A status poll of a submission Companies House has not yet indexed answers pending with
// notYetIndexed. The accounts pages say so while they keep polling, and offer Start a new filing
// only once Companies House has decided the submission.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { registerCompany } from "@app/http-simulator/fixtures/register.js";

const COMPANY = registerCompany("00000001");

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

// Files on the real page with the submit answered in the page and each poll answered by the next
// entry of answers; an entry of "hold" waits until the test releases it. Does not wait for the outcome.
async function fileWithPolls(page, pagePath, answers) {
  await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.handleSubmitFiling === "function" || typeof handleSubmitFiling === "function");
  await page.evaluate(
    ({ pollAnswers, companyName }) => {
      let polls = 0;
      window.releasePoll = null;
      window.submitMicroEntityAccounts = async () => ({ submissionNumber: "000001", pollInterval: 1 });
      window.pollMicroEntityAccounts = async () => {
        const next = pollAnswers[Math.min(polls++, pollAnswers.length - 1)];
        if (next === "hold") {
          await new Promise((resolve) => {
            window.releasePoll = resolve;
          });
          return { statusCode: "ACCEPT", submissionNumber: "000001", rejections: [], receiptId: "receipt-1" };
        }
        return next;
      };
      window.buildAccountsPayload = () => ({});
      company = { companyNumber: "00000001", companyName };
      showView("previewView");
      document.getElementById("companyAuthCode").value = "ABC123";
      handleSubmitFiling();
    },
    { pollAnswers: answers, companyName: COMPANY.name },
  );
}

const NOT_YET_INDEXED = { submissionNumber: "000001", statusCode: "PENDING", rejections: [], notYetIndexed: true };

test.describe("A submission Companies House has not yet indexed", () => {
  for (const pagePath of ["companies-house/fileMicroEntityAccounts.html", "companies-house/fileSmallCompanyAccounts.html"]) {
    test(`${pagePath} says so, keeps polling, and offers Start a new filing only once Companies House decides`, async ({ page }) => {
      await serveSite(page, { language: "en" });

      await fileWithPolls(page, pagePath, [NOT_YET_INDEXED, "hold"]);

      const result = page.locator("#filingResult");
      await expect(result).toHaveText("Companies House has not indexed submission 000001 yet. Checking again...", { timeout: 15000 });
      await page.waitForFunction(() => typeof window.releasePoll === "function");
      await expect(page.locator("#startAgainBtn")).toBeHidden();

      await page.evaluate(() => window.releasePoll());

      await expect(result).toContainText("accepted", { timeout: 15000 });
      await expect(page.locator("#startAgainBtn")).toBeVisible();
    });
  }

  test("the micro-entity page shows the not-indexed note in Welsh", async ({ page }) => {
    await serveSite(page, { language: "cy" });

    await fileWithPolls(page, "cy/companies-house/fileMicroEntityAccounts.html", [NOT_YET_INDEXED, "hold"]);

    await expect(page.locator("#filingResult")).toHaveText("Nid yw Tŷ’r Cwmnïau wedi mynegeio cyflwyniad 000001 eto. Yn gwirio eto...", {
      timeout: 15000,
    });
  });

  test("the micro-entity page still pending after its polls offers Check again and not Start a new filing", async ({ page }) => {
    await serveSite(page, { language: "en" });

    await fileWithPolls(page, "companies-house/fileMicroEntityAccounts.html", [NOT_YET_INDEXED]);

    await expect(page.locator("#checkAgainBtn")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#startAgainBtn")).toBeHidden();
    await expect(page.locator("#filingResult")).toContainText("has not finished checking submission 000001");
  });
});
