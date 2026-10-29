// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/hiddenContent.browser.test.js
//
// The content that describes a feature (guide journeys, videos, FAQs, the MCP tool lists) shows
// only where the catalogue lists the feature's activity in the environment: absent in prod,
// present in ci.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function serveSite(page, environmentName) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
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

test.describe("Hidden feature content", () => {
  test("the guide has no Income Tax or Company Tax Return journeys in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "networkidle" });
    await expect(page.locator("details#submit-return")).toHaveCount(1);
    await expect(page.locator("details#itsa-quarterly-update")).toHaveCount(0);
    await expect(page.locator("details#file-confirmation-statement")).toHaveCount(0);
    await expect(page.locator("details#diya-gl-storage")).toHaveCount(0);
    await expect(page.locator(".guide-group h2", { hasText: "Income Tax" })).toHaveCount(0);
    await expect(page.locator(".guide-group h2", { hasText: "Company Tax Return" })).toHaveCount(0);
    await expect(page.locator("details#company-lookup")).toHaveCount(1);
  });

  test("the guide has the Income Tax and Company Tax Return journeys in ci", async ({ page }) => {
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/guide.html", { waitUntil: "networkidle" });
    await expect(page.locator("details#itsa-quarterly-update")).toHaveCount(1);
    await expect(page.locator("details#file-confirmation-statement")).toHaveCount(1);
    await expect(page.locator("details#diya-gl-storage")).toHaveCount(1);
    await expect(page.locator(".guide-group h2", { hasText: "Income Tax" })).toHaveCount(1);
  });

  test("the Income Tax videos page lists no videos in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/videos-hmrc-itsa.html", { waitUntil: "networkidle" });
    await expect(page.locator("section.video-section")).toHaveCount(0);
    await expect(page.locator("#videoList")).toContainText("No videos are published yet.");
  });

  test("the VAT videos page keeps its videos and the contents drop Income Tax in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/videos-hmrc-vat.html", { waitUntil: "networkidle" });
    await expect(page.locator("section.video-section#submit-return")).toHaveCount(1);
    const contents = page.locator("#videoContents");
    await expect(contents).toContainText("submit a VAT return");
    await expect(contents).not.toContainText("quarterly update");
    await expect(contents.locator("h3", { hasText: "Self Assessment" })).toHaveCount(0);
  });

  test("a Companies House videos page keeps the lookup and drops the sandbox filings in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/videos-ch.html", { waitUntil: "networkidle" });
    await expect(page.locator("section.video-section#company-lookup")).toHaveCount(1);
    await expect(page.locator("section.video-section#file-confirmation-statement")).toHaveCount(0);
    await expect(page.locator("section.video-section#file-micro-entity-accounts")).toHaveCount(0);
  });

  test("the Income Tax videos page lists its videos in ci", async ({ page }) => {
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/videos-hmrc-itsa.html", { waitUntil: "networkidle" });
    await expect(page.locator("section.video-section#itsa-quarterly-update")).toHaveCount(1);
  });

  test("the videos index features only listed videos in prod and all four in ci", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/videos.html", { waitUntil: "networkidle" });
    await expect(page.locator("section.video-section#submit-return")).toHaveCount(1);
    await expect(page.locator("section.video-section#itsa-quarterly-update")).toHaveCount(0);
    await expect(page.locator("section.video-section#file-confirmation-statement")).toHaveCount(0);
    await page.unrouteAll();
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/videos.html", { waitUntil: "networkidle" });
    await expect(page.locator("section.video-section")).toHaveCount(4);
  });

  test("the help page has no FAQ about Income Tax, Company Tax Return, sandbox filings or diya-gl books in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/help.html", { waitUntil: "networkidle" });
    await page.locator("#faq-search").fill("tax");
    await expect(page.locator(".faq-item").first()).toBeVisible();
    await expect(page.locator('.faq-item[data-id="self-assessment-itsa"]')).toHaveCount(0);
    await expect(page.locator('.faq-item[data-id="company-tax-return-ct600"]')).toHaveCount(0);
    await page.locator("#faq-search").fill("Companies House");
    await expect(page.locator('.faq-item[data-id="companies-house-filings"]')).toBeVisible();
    await expect(page.locator('.faq-item[data-id="companies-house-sandbox-filings"]')).toHaveCount(0);
    await page.locator("#faq-search").fill("diya-gl");
    await expect(page.locator('.faq-item[data-id="diya-gl-books"]')).toHaveCount(0);
  });

  test("the help page has those FAQs in ci", async ({ page }) => {
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/help.html", { waitUntil: "networkidle" });
    await page.locator("#faq-search").fill("Self Assessment");
    await expect(page.locator('.faq-item[data-id="self-assessment-itsa"]')).toBeVisible();
    await page.locator("#faq-search").fill("confirmation statement");
    await expect(page.locator('.faq-item[data-id="companies-house-sandbox-filings"]')).toBeVisible();
  });

  test("the MCP page lists no Income Tax, accounts, confirmation statement or practice tools in prod", async ({ page }) => {
    await serveSite(page, "prod");
    await page.goto("http://localhost:3000/mcp.html", { waitUntil: "networkidle" });
    await expect(page.locator("main")).toContainText("derive_vat_return");
    for (const tool of [
      "derive_itsa_quarterly_update",
      "derive_micro_entity_accounts",
      "submit_confirmation_statement_sandbox",
      "add_client",
      "Income Tax (MTD)",
    ]) {
      await expect(page.locator("main").getByText(tool, { exact: false }).filter({ visible: true })).toHaveCount(0);
    }
  });

  test("the MCP page lists those tools in ci", async ({ page }) => {
    await serveSite(page, "ci");
    await page.goto("http://localhost:3000/mcp.html", { waitUntil: "networkidle" });
    for (const tool of [
      "derive_itsa_quarterly_update",
      "derive_micro_entity_accounts",
      "submit_confirmation_statement_sandbox",
      "add_client",
    ]) {
      await expect(page.locator("main").getByText(tool, { exact: false }).filter({ visible: true }).first()).toBeVisible();
    }
  });

  for (const pagePath of ["about.html", "index.html"]) {
    test(`${pagePath} describes no hidden feature in prod`, async ({ page }) => {
      await serveSite(page, "prod");
      await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "networkidle" });
      const main = page.locator("main");
      await expect(main).not.toContainText("Income Tax");
      await expect(main).not.toContainText("Company Tax Return");
      await expect(main).not.toContainText("confirmation statement");
    });
  }
});
