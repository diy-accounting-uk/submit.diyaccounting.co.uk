#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/compliance-fraud-headers-rows.js
//
// Turns data/compliance/fraud-prevention-headers/<YYYY-MM>.json decision records (written by
// scripts/fraud-header-email-check.js, see PLAN_FRAUD_HEADER_EMAIL_CHECK.md) into
// newline-delimited JSON rows for compliance_fraud_headers, one row per month on file. Writes
// NDJSON to stdout, so the workflow step pipes this straight into
// .github/actions/dora-row's `row` input. An empty directory (B22's launchd agent has not run
// yet, or this is a fresh checkout) produces no rows rather than an error.
//
// Usage: node scripts/compliance-fraud-headers-rows.js <checkedAt> [directory]

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const DEFAULT_DIRECTORY = "data/compliance/fraud-prevention-headers";

/**
 * Read every `<YYYY-MM>.json` decision record in `directory`, oldest first.
 *
 * @param {string} directory
 * @returns {{month: string, decision: object}[]}
 */
export function readDecisions(directory) {
  if (!existsSync(directory)) return [];
  const fileNames = readdirSync(directory)
    .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
    .sort();

  return fileNames.map((fileName) => ({
    month: fileName.replace(/\.json$/, ""),
    decision: JSON.parse(readFileSync(join(directory, fileName), "utf8")),
  }));
}

/**
 * Project one decision record (see resolveDecision in scripts/fraud-header-email-check.js) to
 * the row shape compliance_fraud_headers carries.
 *
 * @param {{month: string, decision: object}} entry
 * @param {string} checkedAt
 * @returns {object}
 */
export function toRow({ month, decision }, checkedAt) {
  return {
    month,
    status: decision.status ?? "unknown",
    needs_action: Boolean(decision.needsAction),
    traffic_count: decision.trafficCount ?? null,
    advisories_count: Array.isArray(decision.advisories) ? decision.advisories.length : 0,
    errors_count: Array.isArray(decision.errors) ? decision.errors.length : 0,
    checked_at: checkedAt,
  };
}

export function toNdjson(records) {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
}

function main() {
  const [checkedAt, directory] = process.argv.slice(2);
  if (!checkedAt) {
    process.stderr.write("Usage: compliance-fraud-headers-rows.js <checkedAt> [directory]\n");
    process.exit(1);
  }

  const decisions = readDecisions(directory ?? DEFAULT_DIRECTORY);
  const rows = decisions.map((entry) => toRow(entry, checkedAt));
  process.stdout.write(toNdjson(rows));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
