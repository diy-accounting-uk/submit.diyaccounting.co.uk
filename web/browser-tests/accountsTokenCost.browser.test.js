// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/accountsTokenCost.browser.test.js
// What a customer sees above the Submit button of the micro-entity and small company accounts
// pages: the token cost, the balance, the exhausted state and the refusal message.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput, servePageScripts, serveSiteStyles } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const SHOTS_DIR = path.join(process.cwd(), "target/browser-test-results/accounts-token-cost");

const PAGES = [
  { name: "micro-entity", pagePath: "companies-house/fileMicroEntityAccounts.html" },
  { name: "small company", pagePath: "companies-house/fileSmallCompanyAccounts.html" },
];

const RESIDENT_LTD_BALANCE = (granted, remaining, extra = {}) => ({
  bundles: [{ bundleId: "resident-ltd", allocated: true, tokensGranted: granted, tokensRemaining: remaining, ...extra }],
});

function serveFromDisk(page, pattern, relativePath, contentType) {
  return page.route(pattern, async (route) => {
    await route.fulfill({ status: 200, contentType, body: fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf-8") });
  });
}

// Opens the real page HTML with the real widget, catalogue and page script. A balance of null
// leaves the balance read answering 500.
async function openPreviewView(page, pagePath, { balance, accountsAnswer = null, viewport = null } = {}) {
  if (viewport) await page.setViewportSize(viewport);
  const url = `http://localhost:3000/${pagePath}`;
  await page.addInitScript(() => localStorage.setItem("cognitoIdToken", "mock-id-token"));
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await servePageScripts(page);
  await serveMoneyInput(page);
  await serveSiteStyles(page);
  await serveFromDisk(page, "**/lib/toml-parser.js", "lib/toml-parser.js", "application/javascript");
  await serveFromDisk(page, "**/lib/request-cache.js", "lib/request-cache.js", "application/javascript");
  await serveFromDisk(page, "**/widgets/submission-cost.js", "widgets/submission-cost.js", "application/javascript");
  await serveFromDisk(page, "**/widgets/status-messages.js", "widgets/status-messages.js", "application/javascript");
  await serveFromDisk(
    page,
    "**/lib/services/companies-house-filing-service.js",
    "lib/services/companies-house-filing-service.js",
    "application/javascript",
  );
  await page.route("**/lib/services/api-client.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "export const fetchWithIdToken = (url, init) => fetch(url, init); export const authorizedFetch = fetchWithIdToken;",
    });
  });
  await serveFromDisk(page, "**/submit.catalogue.toml", "submit.catalogue.toml", "application/toml");
  await page.route("**/api/v1/bundle", async (route) => {
    if (balance) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(balance) });
    } else {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) });
    }
  });
  if (accountsAnswer) {
    await page.route("**/api/v1/companies-house/accounts", async (route) => {
      await route.fulfill({ status: accountsAnswer.status, contentType: "application/json", body: JSON.stringify(accountsAnswer.body) });
    });
  }
  const html = fs.readFileSync(path.join(PUBLIC_DIR, pagePath), "utf-8");
  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await delay(400);
  await page.evaluate(() => {
    company = { companyNumber: "00000001", companyName: "TEST LTD" };
    showView("previewView");
  });
}

async function screenshot(page, name) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.locator("#previewView").screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

for (const { name, pagePath } of PAGES) {
  test.describe(`The ${name} accounts page token cost`, () => {
    test("states the cost and the balance above Submit, tied to the button", async ({ page }) => {
      await openPreviewView(page, pagePath, { balance: RESIDENT_LTD_BALANCE(10, 7) });
      await expect(page.locator("#submissionCost")).toHaveText("This submission costs 1 token. You have 7 left.");
      await expect(page.locator("#submitFilingBtn")).toBeEnabled();
      await expect(page.locator("#submitFilingBtn")).toHaveAttribute("aria-describedby", "submissionCost");
      await screenshot(page, `${name.replace(" ", "-")}-balance-${page.viewportSize().width}`);
    });

    test("states the cost alone and leaves Submit enabled when the balance cannot be read", async ({ page }) => {
      await openPreviewView(page, pagePath, { balance: null });
      await expect(page.locator("#submissionCost")).toHaveText("This submission costs 1 token.");
      await expect(page.locator("#submitFilingBtn")).toBeEnabled();
    });

    test("says the allowance is unlimited for an unlimited grant", async ({ page }) => {
      await openPreviewView(page, pagePath, { balance: RESIDENT_LTD_BALANCE("unlimited", 0) });
      await expect(page.locator("#submissionCost")).toHaveText("This submission costs 1 token. You have unlimited tokens.");
      await expect(page.locator("#submitFilingBtn")).toBeEnabled();
    });

    test("disables Submit and says why when no token is left", async ({ page }) => {
      await openPreviewView(page, pagePath, { balance: RESIDENT_LTD_BALANCE(10, 0, { tokenResetAt: "2026-12-01T00:00:00.000Z" }) });
      await expect(page.locator("#submissionCost")).toContainText(
        "You have no tokens left. Your allowance refreshes on 1 December 2026, or you can add a bundle.",
      );
      await expect(page.locator('#submissionCost a[href="/bundles.html"]')).toHaveCount(1);
      await expect(page.locator("#submitFilingBtn")).toBeDisabled();
      await screenshot(page, `${name.replace(" ", "-")}-exhausted-${page.viewportSize().width}`);
    });

    for (const width of [1280, 390])
      test(`a refusal for no token left shows the message and says nothing was sent at ${width} pixels`, async ({ page }) => {
        await openPreviewView(page, pagePath, {
          viewport: { width, height: 900 },
          balance: RESIDENT_LTD_BALANCE(10, 1),
          accountsAnswer: { status: 403, body: { message: "Token limit reached", reason: "tokens_exhausted", tokensRemaining: 0 } },
        });
        await page.route("**/api/v1/bundle", async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESIDENT_LTD_BALANCE(10, 0)) });
        });
        await page.evaluate(async () => {
          const service = await import("/lib/services/companies-house-filing-service.js");
          window.submitMicroEntityAccounts = service.submitMicroEntityAccounts;
          window.buildAccountsPayload = () => ({});
          document.getElementById("companyAuthCode").value = "ABC123";
          await handleSubmitFiling();
        });
        const banner = page.locator("#statusMessagesContainer .status-error");
        await expect(banner).toContainText(
          "No tokens remaining. Your token allowance has been used, so nothing was sent to Companies House.",
        );
        await expect(banner).toContainText("Tokens refresh at the start of the next period. Visit the Bundles page for more options.");
        await expect(banner).toHaveAttribute("role", "alert");
        await expect(banner).toBeInViewport();
        await expect(page.locator("#resultView")).toBeHidden();
        await expect(page.locator("#submissionCost")).toContainText("You have no tokens left.");
        await expect(page.locator("#submitFilingBtn")).toBeDisabled();
        await screenshot(page, `${name.replace(" ", "-")}-refused-${width}`);
        await page.screenshot({ fullPage: true, path: path.join(SHOTS_DIR, `${name.replace(" ", "-")}-refused-page-${width}.png`) });
      });
  });
}

test.describe("The accounts pages token cost on a phone", () => {
  for (const { name, pagePath } of PAGES) {
    test(`the ${name} cost line and the refusal fit a 390 pixel screen`, async ({ page }) => {
      await openPreviewView(page, pagePath, { balance: RESIDENT_LTD_BALANCE(10, 0), viewport: { width: 390, height: 900 } });
      await expect(page.locator("#submissionCost")).toContainText("You have no tokens left.");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await screenshot(page, `${name.replace(" ", "-")}-exhausted-390`);
    });
  }
});
