// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Fetches each source file's gov.uk page and checks its quote appears in the page text.
// Usage: node scripts/verify-tax-sources.mjs [--max-age-days <n>] [--issue-body <file>] [source-name ...]
// (names without .json; none means all)
// Exits 1 when a page cannot be fetched, a quote is absent, or, with --max-age-days, a source was
// retrieved more than <n> days ago. With --issue-body it writes the problems to that file as an issue body.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES_DIR, quoteAppearsIn, sourcesOlderThan } from "./tax-sources.mjs";

function takeOption(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const [, value] = args.splice(index, 2);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const maxAgeDays = takeOption(args, "--max-age-days");
  const issueBodyFile = takeOption(args, "--issue-body");
  const wanted = args;
  const names = readdirSync(SOURCES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .filter((n) => wanted.length === 0 || wanted.includes(n));
  const problems = [];
  for (const name of names) {
    const source = JSON.parse(readFileSync(join(SOURCES_DIR, `${name}.json`), "utf8"));
    const response = await fetch(source.url);
    const ok = response.ok && quoteAppearsIn(source.quote, await response.text());
    console.log(`${ok ? "ok  " : "FAIL"} ${name} (${response.status}) ${source.url}`);
    if (!ok) problems.push(`${name}: the quote is not on ${source.url} (HTTP ${response.status})`);
  }
  if (maxAgeDays !== null) {
    const sources = names.map((name) => ({ name, ...JSON.parse(readFileSync(join(SOURCES_DIR, `${name}.json`), "utf8")) }));
    for (const source of sourcesOlderThan(sources, Number(maxAgeDays))) {
      console.log(`OLD  ${source.name} retrieved ${source.retrieved}`);
      problems.push(`${source.name}: retrieved ${source.retrieved}, more than ${maxAgeDays} days ago`);
    }
  }
  if (problems.length > 0 && issueBodyFile) {
    const lines = problems.map((problem) => `- ${problem}`).join("\n");
    writeFileSync(
      issueBodyFile,
      `The weekly tax sources check found ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n\n${lines}\n\nRun the \`tax-sources\` skill in a session to refresh the sources, then rebuild the pages that print them.\n`,
    );
  }
  process.exit(problems.length === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
