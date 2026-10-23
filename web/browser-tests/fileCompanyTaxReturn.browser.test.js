// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileCompanyTaxReturn.browser.test.js

import { test, expect } from "@playwright/test";
import { serveSiteStyles } from "./hmrcFieldTableAssets.js";
import fs from "fs";
import path from "path";

const PAGE_URL = "http://localhost:3000/companies-house/fileCompanyTaxReturn.html";

test.describe("File Company Tax Return page", () => {
  let pageHtml;

  test.beforeAll(() => {
    pageHtml = fs.readFileSync(path.join(process.cwd(), "web/public/companies-house/fileCompanyTaxReturn.html"), "utf-8");
  });

  async function loadReviewView(page) {
    const html = pageHtml.replace("<head>", '<head><base href="http://localhost:3000/companies-house/">');
    await page.route("**/fileCompanyTaxReturn.html*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.route("**/*.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await serveSiteStyles(page);
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      document.getElementById("companyView").style.display = "none";
      document.getElementById("previewView").style.display = "block";
      document.getElementById("previewIxbrl").textContent = `<html>${"<ix:nonFraction>1</ix:nonFraction>".repeat(400)}</html>`;
    });
  }

  test("hides the raw iXBRL source without developer mode", async ({ page }) => {
    await loadReviewView(page);
    await expect(page.locator("#previewIxbrl")).toBeHidden();
  });

  test("shows the raw iXBRL source inside the card with developer mode", async ({ page }) => {
    await loadReviewView(page);
    await page.evaluate(() => document.body.classList.add("developer-mode"));
    const source = page.locator("#previewIxbrl");
    await expect(source).toBeVisible();
    const fits = await page.evaluate(() => {
      const pre = document.getElementById("previewIxbrl");
      const card = document.getElementById("previewView");
      return pre.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1;
    });
    expect(fits).toBe(true);
  });

  test("renders the password input as wide as the text input", async ({ page }) => {
    await loadReviewView(page);
    const widths = await page.evaluate(() => ({
      text: document.getElementById("gatewayUserId").getBoundingClientRect().width,
      password: document.getElementById("gatewayPassword").getBoundingClientRect().width,
    }));
    expect(widths.text).toBeGreaterThan(100);
    expect(widths.password).toBe(widths.text);
  });

  test("links the Company Tax Return guide and the CT600 form in a new tab", async ({ page }) => {
    await loadReviewView(page);
    for (const id of ["companyTaxReturnGuideLink", "ct600FormLink"]) {
      const link = page.locator(`#${id}`);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener");
    }
  });
});
