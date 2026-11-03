// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-96 Scan pages for accessibility violations
// - **Use when:** a page set needs an axe-core accessibility scan or a WCAG 1.4.12 text-spacing check.
// - **Does:** axe-quickscan.mjs injects axe-core into Playwright-driven pages from the CDN allowlist and runs it, working around a broken local npx axe CLI. text-spacing-test.js checks WCAG 1.4.12 text-spacing compliance, such as line height and letter and word spacing, across the same page set.
// - **Run:** `node scripts/axe-quickscan.mjs <baseUrl> <tags>`; `npm run accessibility:text-spacing-proxy`; `npm run accessibility:text-spacing-ci`; `npm run accessibility:text-spacing-prod`; `npm run accessibility:axe-ci`; `npm run accessibility:axe-wcag22-ci-report`
// - **Entry:** `scripts/axe-quickscan.mjs`; `scripts/text-spacing-test.js`
// - **Files:** scripts/axe-quickscan.mjs, scripts/text-spacing-test.js
// - **Keywords:** axe-core, accessibility scan, wcag 1.4.12, text spacing, playwright, cdn allowlist
// - **Related:** OPS-95, OPS-97
// @end-capability

// Ad-hoc axe-core scan (npx axe CLI is broken on this machine — chromedriver/Chrome
// version mismatch unrelated to the app). Injects axe-core from the local install via
// Playwright instead — the app's own Content-Security-Policy script-src has no CDN host on
// it, so a script tag pointed at a CDN URL is blocked by the page it is scanning.
import { chromium } from "@playwright/test";
import path from "path";

const axeCorePath = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");

if (!process.argv[2] || !process.argv[3]) {
  console.error("Usage: node scripts/axe-quickscan.mjs <baseUrl> <comma-separated axe tags, e.g. wcag2a,wcag2aa> [path prefix]");
  process.exit(1);
}

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
  "/mtd-calendar.html",
  "/rates.html",
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
  "/companies-house/changeRegisteredEmail.html",
  "/companies-house/changeRegisteredOffice.html",
  "/companies-house/companySearch.html",
  "/companies-house/fileCompanyTaxReturn.html",
  "/companies-house/fileConfirmationStatement.html",
  "/companies-house/fileMicroEntityAccounts.html",
  "/companies-house/fileSmallCompanyAccounts.html",
  "/companies-house/filingCallback.html",
  "/companies-house/filings.html",
];

// The edge WAF blocks an address after 2000 requests in 5 minutes (RateLimitRule in EdgeStack).
// One page load makes about 90 requests, so an unpaced scan is blocked near page 23. The scan
// counts every request and waits until the last 5 minutes hold fewer than the budget.
const WAF_WINDOW_MS = 5 * 60 * 1000;
const REQUEST_BUDGET = 1500;
const requestTimes = [];

async function waitForRequestBudget(expectedRequests) {
  for (;;) {
    const cutoff = Date.now() - WAF_WINDOW_MS;
    while (requestTimes.length && requestTimes[0] < cutoff) requestTimes.shift();
    if (requestTimes.length + expectedRequests <= REQUEST_BUDGET) return;
    const waitMs = requestTimes[0] + WAF_WINDOW_MS - Date.now() + 1000;
    console.log(`Pacing: ${requestTimes.length} requests in the last 5 minutes, waiting ${Math.ceil(waitMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 1000)));
  }
}

const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });
// axe-core is injected as an inline script, which the site's CSP blocks; the bypass applies to this browser only.
const context = await browser.newContext({ bypassCSP: true });
context.on("request", () => requestTimes.push(Date.now()));
let totalViolations = 0;
let totalPasses = 0;
let maxRequestsPerPage = 100;
const violationDetails = [];
const unreachable = [];

// Optional fifth argument: only scan pages whose path starts with it, to resume a stopped scan.
const pathPrefix = process.argv[4] || "";

for (const p of PAGES.filter((page) => page.startsWith(pathPrefix))) {
  await waitForRequestBudget(maxRequestsPerPage);
  const before = requestTimes.length;
  const page = await context.newPage();
  const response = await page.goto(baseUrl + p, { waitUntil: "networkidle" });
  const status = response ? response.status() : 0;
  if (status < 200 || status >= 300) {
    unreachable.push({ page: p, status });
    console.log(`${p}: HTTP ${status}, not scanned`);
    await page.close();
    continue;
  }
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
  maxRequestsPerPage = Math.max(maxRequestsPerPage, requestTimes.length - before);
  await page.close();
}

await browser.close();
console.log("");
console.log(`TOTAL: ${totalViolations} violations, ${totalPasses} passes`);
if (violationDetails.length) console.log(JSON.stringify(violationDetails, null, 2));
if (unreachable.length) {
  console.log(`NOT SCANNED: ${unreachable.length} pages did not answer 2xx: ${JSON.stringify(unreachable)}`);
  process.exitCode = 1;
}
