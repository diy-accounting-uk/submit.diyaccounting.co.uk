#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/check-zap-urls.js
//
// Fails when the ZAP baseline scan did not hold every path in scripts/zap/seed-urls.json
// (the Corporation Tax page and routes). The hook scripts/zap/zap-hooks.py writes the scanned
// URLs to web/public/tests/penetration/zap-urls.json.
//
// Usage: node scripts/check-zap-urls.js [urlsFile] [seedFile]

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

const DEFAULT_URLS_FILE = "web/public/tests/penetration/zap-urls.json";
const DEFAULT_SEED_FILE = "scripts/zap/seed-urls.json";

/**
 * Return the seed paths that no scanned URL carries.
 *
 * @param {string[]} scannedUrls Absolute URLs the scan held.
 * @param {string[]} seedPaths Paths that must be scanned.
 * @returns {string[]}
 */
export function missingSeedPaths(scannedUrls, seedPaths) {
  const scannedPaths = new Set(
    scannedUrls.map((url) => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    }),
  );
  return seedPaths.filter((seedPath) => !scannedPaths.has(seedPath));
}

function main() {
  const urlsFile = process.argv[2] ?? DEFAULT_URLS_FILE;
  const seedFile = process.argv[3] ?? DEFAULT_SEED_FILE;
  if (!existsSync(urlsFile)) {
    console.error(`ZAP URL list not found: ${urlsFile}. The scan did not run with the hook.`);
    process.exit(1);
  }
  const scannedUrls = JSON.parse(readFileSync(urlsFile, "utf8")).urls ?? [];
  const seedPaths = JSON.parse(readFileSync(seedFile, "utf8")).paths;
  const missing = missingSeedPaths(scannedUrls, seedPaths);
  if (missing.length > 0) {
    console.error(`ZAP did not scan: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`ZAP scanned all ${seedPaths.length} seed paths.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
