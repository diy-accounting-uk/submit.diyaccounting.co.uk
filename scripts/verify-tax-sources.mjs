// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Fetches each source file's gov.uk page and checks its quote appears in the page text.
// Usage: node scripts/verify-tax-sources.mjs [source-name ...]   (names without .json; none means all)
// Exits 1 when a page cannot be fetched or a quote is absent.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES_DIR, quoteAppearsIn } from "./tax-sources.mjs";

async function main() {
  const wanted = process.argv.slice(2);
  const names = readdirSync(SOURCES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .filter((n) => wanted.length === 0 || wanted.includes(n));
  let failures = 0;
  for (const name of names) {
    const source = JSON.parse(readFileSync(join(SOURCES_DIR, `${name}.json`), "utf8"));
    const response = await fetch(source.url);
    const ok = response.ok && quoteAppearsIn(source.quote, await response.text());
    console.log(`${ok ? "ok  " : "FAIL"} ${name} (${response.status}) ${source.url}`);
    if (!ok) failures += 1;
  }
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
