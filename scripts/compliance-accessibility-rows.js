#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/compliance-accessibility-rows.js
//
// Turns compliance.yml's pa11y and axe result files into newline-delimited JSON rows for
// compliance_accessibility, one row per page per tool per WCAG standard. Reads whichever of
// the three result files exist (a tool that found nothing to report, or errored before
// producing one, is skipped rather than failing the whole run) and writes NDJSON to stdout,
// so the workflow step pipes this straight into .github/actions/dora-row's `row` input.
//
// Usage: node scripts/compliance-accessibility-rows.js <environment> <checkedAt>
//   [--pa11y path] [--axe path] [--axe-wcag22 path]

import { readFileSync, existsSync } from "fs";

const DEFAULT_PA11Y_PATH = "web/public/tests/accessibility/pa11y-results.json";
const DEFAULT_AXE_PATH = "web/public/tests/accessibility/axe-results.json";
const DEFAULT_AXE_WCAG22_PATH = "web/public/tests/accessibility/axe-wcag22-results.json";

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * axe-core CLI's `--save` output: an array of per-URL results, each carrying `violations` and
 * `passes` arrays. One row per URL.
 *
 * @param {object[]} axeResults
 * @param {string} standard
 * @returns {{page: string, violations: number, passes: number}[]}
 */
export function rowsFromAxeResults(axeResults, standard) {
  if (!Array.isArray(axeResults)) return [];
  return axeResults.map((result) => ({
    page: result.url ?? "unknown",
    violations: Array.isArray(result.violations) ? result.violations.length : 0,
    passes: Array.isArray(result.passes) ? result.passes.length : 0,
    standard,
  }));
}

/**
 * pa11y-ci's `--reporter json` output: `{results: {<url>: [<issue>, ...]}}`. pa11y reports
 * issues only, with no passing-rule count, so passes is always 0 for these rows - a real
 * absence, not an unmeasured one.
 *
 * @param {{results?: Record<string, object[]>}} pa11yResults
 * @returns {{page: string, violations: number, passes: number}[]}
 */
export function rowsFromPa11yResults(pa11yResults) {
  const results = pa11yResults?.results;
  if (!results || typeof results !== "object") return [];
  return Object.entries(results).map(([page, issues]) => ({
    page,
    violations: Array.isArray(issues) ? issues.length : 0,
    passes: 0,
    standard: "wcag2aa",
  }));
}

/**
 * Build every accessibility row this run produced, across whichever tools left a result file.
 *
 * @param {{pa11y: object|null, axe: object|null, axeWcag22: object|null}} results
 * @returns {object[]} rows shaped for compliance_accessibility, missing run_id/environment/checked_at
 */
export function buildRows({ pa11y, axe, axeWcag22 }) {
  const rows = [];
  for (const row of rowsFromPa11yResults(pa11y)) {
    rows.push({ tool: "pa11y", ...row });
  }
  for (const row of rowsFromAxeResults(axe, "wcag21aa")) {
    rows.push({ tool: "axe", ...row });
  }
  for (const row of rowsFromAxeResults(axeWcag22, "wcag22aa")) {
    rows.push({ tool: "axe", ...row });
  }
  return rows;
}

export function toNdjson(records) {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
}

function parseArgs(argv) {
  const positional = [];
  const paths = { pa11y: DEFAULT_PA11Y_PATH, axe: DEFAULT_AXE_PATH, axeWcag22: DEFAULT_AXE_WCAG22_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--pa11y") paths.pa11y = argv[++i];
    else if (argv[i] === "--axe") paths.axe = argv[++i];
    else if (argv[i] === "--axe-wcag22") paths.axeWcag22 = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, paths };
}

function main() {
  const { positional, paths } = parseArgs(process.argv.slice(2));
  const [environment, checkedAt] = positional;
  if (!environment || !checkedAt) {
    process.stderr.write("Usage: compliance-accessibility-rows.js <environment> <checkedAt>\n");
    process.exit(1);
  }

  const runId = process.env.GITHUB_RUN_ID ?? "local";
  const results = {
    pa11y: readJsonIfExists(paths.pa11y),
    axe: readJsonIfExists(paths.axe),
    axeWcag22: readJsonIfExists(paths.axeWcag22),
  };

  const rows = buildRows(results).map((row) => ({
    run_id: runId,
    environment,
    checked_at: checkedAt,
    ...row,
  }));

  process.stdout.write(toNdjson(rows));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
