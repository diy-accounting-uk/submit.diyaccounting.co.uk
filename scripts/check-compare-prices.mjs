// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Fetches each price page named in web/public/compare/vendors.toml and checks its `price_text` appears in the page text.
// Usage: node scripts/check-compare-prices.mjs [--issue-body <file>] [tool name ...]
// Exits 1 when a page cannot be fetched or a price text is absent. With --issue-body it writes the problems to that file as an issue body.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadTools } from "./build-filing-pages.mjs";
import { quoteAppearsIn } from "./tax-sources.mjs";

const USER_AGENT = "Mozilla/5.0 (compatible; DIYAccountingPriceCheck/1.0; +https://submit.diyaccounting.co.uk/)";

/**
 * Compares each tool's price text with the text of its price page.
 * @param {object[]} tools entries of vendors.toml that carry a price
 * @param {Map<string, {status: number, html: string}>} pages the fetched pages by price URL
 * @returns {{tool: object, status: number, found: boolean}[]} one result for each tool
 */
export function comparePrices(tools, pages) {
  return tools.map((tool) => {
    const page = pages.get(tool.price_url);
    const status = page?.status ?? 0;
    return { tool, status, found: status >= 200 && status < 300 && quoteAppearsIn(tool.price_text, page.html) };
  });
}

export function problemLines(results) {
  return results
    .filter((result) => !result.found)
    .map(({ tool, status }) =>
      status >= 200 && status < 300
        ? `${tool.name} (${tool.compares}): "${tool.price_text}" is no longer on ${tool.price_url}`
        : `${tool.name} (${tool.compares}): ${tool.price_url} did not load (HTTP ${status})`,
    );
}

async function fetchPage(url) {
  try {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(30000) });
    return { status: response.status, html: await response.text() };
  } catch {
    return { status: 0, html: "" };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const bodyIndex = args.indexOf("--issue-body");
  const issueBodyFile = bodyIndex < 0 ? null : args.splice(bodyIndex, 2)[1];
  const tools = loadTools().filter((tool) => !tool.ours && (args.length === 0 || args.includes(tool.name)));
  const pages = new Map();
  for (const url of new Set(tools.map((tool) => tool.price_url))) pages.set(url, await fetchPage(url));
  const results = comparePrices(tools, pages);
  for (const { tool, status, found } of results)
    console.log(`${found ? "ok  " : "FAIL"} ${tool.name} (${tool.compares}, HTTP ${status}) ${tool.price_url}`);
  const problems = problemLines(results);
  if (problems.length > 0 && issueBodyFile) {
    writeFileSync(
      issueBodyFile,
      `The monthly price check found ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n\n${problems.map((line) => `- ${line}`).join("\n")}\n\n` +
        `Open each price page, read the price, update \`price_text\`, \`price_pence\`, \`price_period\` and \`price_read\` in \`web/public/compare/vendors.toml\`, ` +
        `run \`npm run build:filing-pages\`, and commit the data file with the two comparison pages. A vendor whose price is no longer public leaves the file.\n`,
    );
  }
  process.exit(problems.length === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
