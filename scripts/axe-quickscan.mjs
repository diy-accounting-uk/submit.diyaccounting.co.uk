// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Ad-hoc axe-core scan (npx axe CLI is broken on this machine — chromedriver/Chrome
// version mismatch unrelated to the app). Injects axe-core from the local install via
// Playwright instead — the app's own Content-Security-Policy script-src has no CDN host on
// it, so a script tag pointed at a CDN URL is blocked by the page it is scanning.
import { chromium } from "@playwright/test";
import path from "path";

const axeCorePath = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");

const baseUrl = process.argv[2];
const tags = process.argv[3].split(",");

const PAGES = [
  "/",
  "/about.html",
  "/privacy.html",
  "/terms.html",
  "/accessibility.html",
  "/auth/login.html",
  "/bundles.html",
  "/hmrc/vat/submitVat.html",
  "/hmrc/vat/vatObligations.html",
  "/hmrc/vat/viewVatReturn.html",
  "/hmrc/receipt/receipts.html",
  "/guide.html",
  "/help.html",
  "/mcp.html",
  "/diy-accounting-spreadsheets.html",
  "/diy-accounting-limited.html",
  "/spreadsheets.html",
  "/errors/404-error-distribution.html",
  "/errors/404-error-origin.html",
  "/errors/403.html",
  "/errors/404.html",
  "/errors/500.html",
  "/errors/502.html",
  "/errors/503.html",
  "/errors/504.html",
  "/hmrc/itsa/dashboard.html",
  "/hmrc/itsa/businessDetails.html",
  "/hmrc/itsa/obligations.html",
  "/hmrc/itsa/selfEmploymentPeriod.html",
  "/hmrc/itsa/selfEmploymentPeriodAmend.html",
  "/hmrc/itsa/selfEmploymentPeriods.html",
  "/hmrc/itsa/selfEmploymentPeriodView.html",
  "/hmrc/itsa/annualSubmission.html",
  "/hmrc/itsa/adjustments.html",
  "/hmrc/itsa/lossesAndClaims.html",
  "/hmrc/itsa/taxLiabilityAdjustments.html",
  "/hmrc/itsa/taxCalculation.html",
  "/hmrc/itsa/finalDeclaration.html",
  "/hmrc/itsa/ukPropertyAdjustments.html",
  "/hmrc/itsa/ukPropertyAnnualSubmission.html",
  "/hmrc/itsa/ukPropertyPeriod.html",
  "/hmrc/itsa/ukPropertyPeriodAmend.html",
  "/hmrc/itsa/ukPropertyPeriods.html",
  "/hmrc/itsa/ukPropertyPeriodView.html",
];

const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });
let totalViolations = 0;
let totalPasses = 0;
const violationDetails = [];

for (const p of PAGES) {
  const page = await browser.newPage();
  await page.goto(baseUrl + p, { waitUntil: "networkidle" });
  await page.addScriptTag({ path: axeCorePath });
  const results = await page.evaluate(async (tags) => {
    return await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
  }, tags);
  totalViolations += results.violations.length;
  totalPasses += results.passes.length;
  if (results.violations.length) {
    violationDetails.push({ page: p, violations: results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
  }
  console.log(`${p}: ${results.violations.length} violations, ${results.passes.length} passes`);
  await page.close();
}

await browser.close();
console.log("");
console.log(`TOTAL: ${totalViolations} violations, ${totalPasses} passes`);
if (violationDetails.length) console.log(JSON.stringify(violationDetails, null, 2));
