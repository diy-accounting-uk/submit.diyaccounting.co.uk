// Ad-hoc axe-core scan (npx axe CLI is broken on this machine — chromedriver/Chrome
// version mismatch unrelated to the app). Injects axe-core from the CDN allowlist
// via Playwright instead, against the same 25 pages as text-spacing-test.js.
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2];
const tags = process.argv[3].split(",");

const PAGES = [
  "/", "/about.html", "/privacy.html", "/terms.html", "/accessibility.html",
  "/auth/login.html", "/bundles.html", "/hmrc/vat/submitVat.html",
  "/hmrc/vat/vatObligations.html", "/hmrc/vat/viewVatReturn.html",
  "/hmrc/receipt/receipts.html", "/guide.html", "/help.html", "/mcp.html",
  "/diy-accounting-spreadsheets.html", "/diy-accounting-limited.html",
  "/spreadsheets.html", "/errors/404-error-distribution.html",
  "/errors/404-error-origin.html", "/errors/403.html", "/errors/404.html",
  "/errors/500.html", "/errors/502.html", "/errors/503.html", "/errors/504.html",
];

const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox"] });
let totalViolations = 0;
let totalPasses = 0;
const violationDetails = [];

for (const p of PAGES) {
  const page = await browser.newPage();
  await page.goto(baseUrl + p, { waitUntil: "networkidle" });
  await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js" });
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
