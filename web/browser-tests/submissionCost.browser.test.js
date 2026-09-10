// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submissionCost.browser.test.js
// Browser tests for the submission-cost widget: the line above a writing page's submit
// control that says what the submission will cost before the customer sends it.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const CATALOGUE_TOML = `
[[activities]]
id = "self-employed"
name = "Self Assessment (HMRC)"
bundles = ["resident-itsa"]
tokenCost = 1
metered = true
paths = ["activity.html"]

[[activities]]
id = "self-employed-year-end"
name = "Self Assessment year-end submissions (HMRC)"
bundles = ["resident-itsa"]
tokenCost = 0
metered = true
paths = ["free-activity.html"]
`;

test.describe("Submission cost widget", () => {
  let tomlParserJsContent;
  let requestCacheJsContent;
  let submissionCostJsContent;

  test.beforeAll(async () => {
    tomlParserJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/toml-parser.js"), "utf-8");
    requestCacheJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/request-cache.js"), "utf-8");
    submissionCostJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/submission-cost.js"), "utf-8");
  });

  function pageHtml() {
    return `<!doctype html>
<html lang="en">
  <head><base href="http://localhost:3000/" /></head>
  <body>
    <input id="turnover" type="number" />
    <div id="submissionCost" class="submission-cost"></div>
    <button type="submit" id="submitBtn">File Quarterly Update</button>
    <script src="lib/toml-parser.js"></script>
    <script src="lib/request-cache.js"></script>
    <script src="widgets/submission-cost.js"></script>
  </body>
</html>`;
  }

  async function setupRoutes(page, { loggedIn = true, bundleResponse = null, buttonDisabled = false } = {}) {
    if (loggedIn) {
      await page.addInitScript(() => {
        try {
          localStorage.setItem("cognitoIdToken", "mock-id-token");
        } catch {}
      });
    }

    const html = buttonDisabled
      ? pageHtml().replace('<button type="submit" id="submitBtn">', '<button type="submit" id="submitBtn" disabled>')
      : pageHtml();
    // Two distinct page paths, each matching a different catalogue activity - activity.html is
    // the metered one (self-employed), free-activity.html the free one (self-employed-year-end)
    // - so the widget picks the right activity from the URL the same way the server does.
    await page.route("**/activity.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: html });
    });
    await page.route("**/free-activity.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: html });
    });
    await page.route("**/lib/toml-parser.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: tomlParserJsContent });
    });
    await page.route("**/lib/request-cache.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: requestCacheJsContent });
    });
    await page.route("**/widgets/submission-cost.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: submissionCostJsContent });
    });
    await page.route("**/submit.catalogue.toml", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/toml", body: CATALOGUE_TOML });
    });
    if (bundleResponse !== null) {
      await page.route("**/api/v1/bundle", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bundleResponse) });
      });
    }
  }

  test("shows the cost and remaining balance when both are known", async ({ page }) => {
    await setupRoutes(page, {
      bundleResponse: {
        bundles: [{ bundleId: "resident-itsa", allocated: true, tokensGranted: 100, tokensConsumed: 13, tokensRemaining: 87 }],
        tokensRemaining: 87,
      },
    });

    await page.goto("http://localhost:3000/activity.html", { waitUntil: "domcontentloaded" });
    await delay(300);

    await expect(page.locator("#submissionCost")).toHaveText("This submission costs 1 token. You have 87 left.");
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("shows the cost alone, and leaves the submit button enabled, when the balance read fails", async ({ page }) => {
    await setupRoutes(page, { loggedIn: true });
    await page.route("**/api/v1/bundle", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) });
    });

    await page.goto("http://localhost:3000/activity.html", { waitUntil: "domcontentloaded" });
    await delay(300);

    await expect(page.locator("#submissionCost")).toHaveText("This submission costs 1 token.");
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("says the write is free and never touches the submit button on a page whose activity carries no token cost", async ({
    page,
  }) => {
    await setupRoutes(page, { loggedIn: true });

    await page.goto("http://localhost:3000/free-activity.html", { waitUntil: "domcontentloaded" });
    await delay(300);

    await expect(page.locator("#submissionCost")).toHaveText("This submission is free. It does not use a token.");
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("disables the submit button and names the reset date when the balance is exhausted", async ({ page }) => {
    await setupRoutes(page, {
      bundleResponse: {
        bundles: [
          {
            bundleId: "resident-itsa",
            allocated: true,
            tokensGranted: 100,
            tokensConsumed: 100,
            tokensRemaining: 0,
            tokenResetAt: "2026-10-06T00:00:00.000Z",
          },
        ],
        tokensRemaining: 0,
      },
    });

    await page.goto("http://localhost:3000/activity.html", { waitUntil: "domcontentloaded" });
    await page.locator("#turnover").fill("1234");
    await delay(300);

    await expect(page.locator("#submissionCost")).toContainText("You have no tokens left.");
    await expect(page.locator("#submissionCost")).toContainText("Your allowance refreshes on 6 October 2026");
    const bundlesLink = page.locator('#submissionCost a[href="/bundles.html"]');
    await expect(bundlesLink).toHaveCount(1);
    await expect(page.locator("#submitBtn")).toBeDisabled();
    await expect(page.locator("#turnover")).toHaveValue("1234");
  });

  test("re-enables a button it disabled once a fresh balance is sufficient again", async ({ page }) => {
    let exhausted = true;
    await setupRoutes(page, { loggedIn: true });
    await page.route("**/api/v1/bundle", async (route) => {
      const body = exhausted
        ? {
            bundles: [{ bundleId: "resident-itsa", allocated: true, tokensGranted: 100, tokensConsumed: 100, tokensRemaining: 0 }],
            tokensRemaining: 0,
          }
        : {
            bundles: [{ bundleId: "resident-itsa", allocated: true, tokensGranted: 100, tokensConsumed: 99, tokensRemaining: 1 }],
            tokensRemaining: 1,
          };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    await page.goto("http://localhost:3000/activity.html", { waitUntil: "domcontentloaded" });
    await delay(300);
    await expect(page.locator("#submitBtn")).toBeDisabled();

    exhausted = false;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
    await delay(300);

    await expect(page.locator("#submissionCost")).toHaveText("This submission costs 1 token. You have 1 left.");
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("does not re-enable a button disabled for a page's own reason", async ({ page }) => {
    await setupRoutes(page, {
      buttonDisabled: true,
      bundleResponse: {
        bundles: [{ bundleId: "resident-itsa", allocated: true, tokensGranted: 100, tokensConsumed: 13, tokensRemaining: 87 }],
        tokensRemaining: 87,
      },
    });

    await page.goto("http://localhost:3000/activity.html", { waitUntil: "domcontentloaded" });
    await delay(300);

    await expect(page.locator("#submissionCost")).toHaveText("This submission costs 1 token. You have 87 left.");
    await expect(page.locator("#submitBtn")).toBeDisabled();
  });
});
