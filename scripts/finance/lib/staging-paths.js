// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/finance/lib/staging-paths.js
//
// Resolves ../staging/<year-end>/<source>/ paths outside this repository, the way
// scripts/itsa-sandbox-year.js's resolveDefaultOutDir resolves ../itsa-sandbox/<tax-year>/:
// through `git rev-parse --git-common-dir`, which points at the main checkout's .git even when
// run from a worktree, so every worktree stages into the same tree instead of one nested inside
// itself.
//
// Year-end labels mirror the Drive mirror's `finance/<year-end> accounts/` naming without the
// word "accounts": a month in January to March belongs to the year-end closing that March
// (March 2026 is "2025-2026"); a month in April to December belongs to the year-end that opens
// that April (April 2026 is "2026-2027").
//
// Shared by scripts/finance/stripe-stage.js and scripts/finance/paypal-stage.js. Nothing else
// about staging is shared between them.

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";

/**
 * @param {Date} date - a UTC date within the month being staged
 * @returns {string} the year-end label, e.g. "2025-2026"
 */
export function resolveYearEnd(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-12
  return month <= 3 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
}

/**
 * @param {string} [cwd] - working directory to resolve the repository root from; defaults to
 *   the current process's working directory
 * @returns {string} the absolute path to the workspace's staging root
 */
export function resolveStagingRoot(cwd = process.cwd()) {
  const gitCommonDir = execSync("git rev-parse --git-common-dir", { cwd, encoding: "utf8" }).trim();
  const repoRoot = dirname(gitCommonDir);
  return resolve(repoRoot, "..", "staging");
}

/**
 * @param {Date} date - a UTC date within the month being staged
 * @param {string} source - the source name, e.g. "stripe", "paypal", "bank"
 * @param {string} [cwd] - working directory to resolve the repository root from; defaults to
 *   the current process's working directory
 * @returns {string} the absolute path to ../staging/<year-end>/<source>/
 */
export function resolveStagingDir(date, source, cwd = process.cwd()) {
  return resolve(resolveStagingRoot(cwd), resolveYearEnd(date), source);
}
