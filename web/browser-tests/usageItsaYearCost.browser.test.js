// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/usageItsaYearCost.browser.test.js
// Browser tests for usage.html's mirror of the ITSA dashboard's year token cost (D6)

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("usage.html - ITSA year token cost summary", () => {
  let htmlContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/usage.html"), "utf-8");
  });

  async function loadPage(page) {
    await page.route("**/*.js", async (route) => {
      const request = route.request();
      if (request.resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else {
        await route.continue();
      }
    });

    const modifiedHtml = htmlContent.replace("<head>", '<head><base href="http://localhost:3000/">');
    await page.setContent(modifiedHtml, { url: "http://localhost:3000/usage.html", waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("stays hidden when the dashboard's business picker has not been used this session", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => window.renderItsaYearCostSummary());

    await expect(page.locator("#itsaYearCostSummary")).toBeHidden();
  });

  test("shows the year's token cost once the dashboard has recorded it", async ({ page }) => {
    await loadPage(page);

    await page.evaluate(() => {
      sessionStorage.setItem("itsaYearTokenCost", JSON.stringify({ yearTokens: 9, businessCount: 2 }));
      window.renderItsaYearCostSummary();
    });

    await expect(page.locator("#itsaYearCostSummary")).toBeVisible();
    await expect(page.locator("#itsaYearCostSummary")).toContainText("9 tokens");
    await expect(page.locator("#itsaYearCostSummary")).toContainText("2 businesses");
  });
});
