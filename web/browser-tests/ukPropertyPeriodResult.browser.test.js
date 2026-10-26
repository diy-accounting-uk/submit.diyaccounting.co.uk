// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/ukPropertyPeriodResult.browser.test.js
// The UK property quarterly update result names the submission, or the year to date when HMRC gave no id.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import {
  serveItsaPageScripts,
  serveCarriedIdentifiers,
  serveSelfEmploymentExpenses,
  serveItsaSubmissionModel,
} from "./hmrcFieldTableAssets.js";

test.describe("ITSA UK property period - result", () => {
  let periodHtmlContent;

  test.beforeAll(async () => {
    periodHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa/ukPropertyPeriod.html"), "utf-8");
  });

  async function openPage(page) {
    await page.route("**/*.js", async (route) => {
      if (route.request().resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });
    await serveItsaPageScripts(page);
    await serveCarriedIdentifiers(page);
    await serveSelfEmploymentExpenses(page);
    await serveItsaSubmissionModel(page);

    const modifiedHtml = periodHtmlContent.replace("<head>", '<head><base href="http://localhost:3000/hmrc/itsa/">');
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/hmrc/itsa/ukPropertyPeriod.html",
      waitUntil: "domcontentloaded",
    });
    await delay(200);
  }

  test("shows the submission id the dated model returns", async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => window.displayResult({ submissionId: "4557ecb5-fd32-48cc-81f5-e6acd1099f3c" }));
    await expect(page.locator("#submissionIdLabel")).toHaveText("Submission ID");
    await expect(page.locator("#submissionIdResult")).toHaveText("4557ecb5-fd32-48cc-81f5-e6acd1099f3c");
  });

  test("reads Year to date when the cumulative model returns no id", async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => window.displayResult({ model: "cumulative" }));
    await expect(page.locator("#submissionIdLabel")).toHaveText("Reporting");
    await expect(page.locator("#submissionIdResult")).toHaveText("Year to date");
  });
});
