// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileCompanyTaxReturn.operatorPreview.browser.test.js
//
// The Company Tax Return page opens by its listing on prod and on ci, to a customer as to an
// operator, with no banner and no preview mark.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/ct600-operator-preview");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

// Serves the real site from disk, signed in, with the bundle answer a person of this kind gets.
async function serveSite(page, { environmentName, operator, previewFeatures }) {
  await page.addInitScript(() => {
    localStorage.setItem("consent.analytics", "declined");
    localStorage.setItem("cognitoIdToken", "id-token");
    localStorage.setItem("userInfo", JSON.stringify({ email: "person@test.diyaccounting.co.uk", sub: "person-sub" }));
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (url.pathname === "/api/v1/bundle") {
      const bundles = [{ bundleId: "resident-ltd", allocated: true, tokensRemaining: 5 }];
      if (operator) bundles.push({ bundleId: "operator", allocated: true });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bundles, tokensRemaining: 5, settings: { passGeneration: true, watchedCompanies: [], previewFeatures } }),
      });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (url.pathname === "/submit.environment-name.txt") {
      return route.fulfill({ status: 200, contentType: "text/plain", body: environmentName });
    }
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
}

async function openPage(page, { welsh = false } = {}) {
  const pagePath = welsh ? "cy/companies-house/fileCompanyTaxReturn.html" : "companies-house/fileCompanyTaxReturn.html";
  await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "networkidle" });
}

async function shoot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`), fullPage: true });
}

test.describe("The Company Tax Return page on prod and on ci", () => {
  for (const width of [1280, 390]) {
    test.describe(`at ${width} px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
      });

      for (const [environmentName, operator] of [
        ["prod", false],
        ["prod", true],
        ["ci", false],
      ]) {
        const who = operator ? "an operator" : "a customer";
        test(`on ${environmentName} ${who} sees the page with no banner and no preview mark`, async ({ page }) => {
          await serveSite(page, { environmentName, operator, previewFeatures: false });
          await openPage(page);
          await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
          await expect(page.locator("[data-preview-sandbox]")).toHaveCount(0);
          await expect(page.locator("[data-operator-live]")).toHaveCount(0);
          await expect(page.locator('main [data-feature-status="preview"]')).toHaveCount(0);
          await expect(page.locator("h1")).toHaveText("File a Company Tax Return");
          await expect(page).toHaveTitle("File a Company Tax Return - DIY Accounting Submit");
          await expect(page.locator("main")).not.toContainText("(preview)");
          await expect(page.locator("main")).not.toContainText("Status: preview");
          await shoot(page, `${environmentName}-${operator ? "operator" : "customer"}`);
        });
      }
    });
  }

  test("the form's fields carry their reference, the note's link and a closed spreadsheet disclosure, in English and Welsh", async ({
    page,
  }) => {
    await serveSite(page, { environmentName: "ci", operator: false, previewFeatures: false });
    await openPage(page);
    await expect(page.locator('label[for="utr"]')).toHaveText("Box 3: Tax reference");
    await expect(page.locator("#utr-hint a")).toHaveAttribute(
      "href",
      "https://www.gov.uk/guidance/the-company-tax-return-guide#tax-reference",
    );
    await expect(page.locator("#utr-source")).not.toHaveAttribute("open", "");
    await expect(page.locator("#utr-source img")).toHaveAttribute("src", "/images/ct600-sources/OpenAccounts-O3.webp");

    await openPage(page, { welsh: true });
    await expect(page.locator('label[for="utr"]')).toHaveText("Blwch 3: Cyfeirnod treth");
    await expect(page.locator("#utr-hint")).toContainText("(yn Saesneg)");
    await expect(page.locator("#utr-source summary")).toHaveText("Yn nhaenlenni DIY Accounting");
    await expect(page.locator("#currentTurnover-source img").first()).toHaveAttribute("alt", "Dalen PubP&L yng nghell F9");
  });

  test("the Welsh page on prod has no banner and no preview mark", async ({ page }) => {
    await serveSite(page, { environmentName: "prod", operator: false, previewFeatures: false });
    await openPage(page, { welsh: true });
    await expect(page.locator("#activityUnavailablePanel")).toHaveCount(0);
    await expect(page.locator("[data-operator-live]")).toHaveCount(0);
    await expect(page.locator("h1")).toHaveText("Ffeilio Ffurflen Dreth y Cwmni");
    await expect(page.locator("main")).not.toContainText("(rhagolwg)");
    await shoot(page, "prod-customer-cy");
  });
});
