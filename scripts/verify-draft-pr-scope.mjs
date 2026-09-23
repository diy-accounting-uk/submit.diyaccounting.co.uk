#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/verify-draft-pr-scope.mjs
//
// Decides whether a triage draft PR may be marked ready for review under
// the draft-pr remedy: every file the PR touches must be one of the alarm
// family's own remedy row paths. A PR that touches anything else — an
// unrelated file the model also happened to change — stays a draft, so the
// only PRs this ever marks ready are the narrow, named-in-advance fixes the
// remedy list allows.
//
// Fails closed: an empty changed-file list, a family with no row, or a row
// whose remedy is not draft-pr all come back as not allowed.
//
// Usage:
//   git diff --name-only main...HEAD | node scripts/verify-draft-pr-scope.mjs --family prod-env-activity-stack-health

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REMEDIES_PATH = join(REPO_ROOT, "app", "data", "alarm-remedies.json");

/**
 * The one check this script exists for: does every changed path fall
 * inside the allowed set? An empty changed-file list is never "vacuously
 * allowed" — a PR with nothing to review is not a PR worth marking ready.
 */
export function touchesOnlyAllowedPaths(changedPaths, allowedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) return false;
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) return false;
  const allowed = new Set(allowedPaths);
  return changedPaths.every((path) => allowed.has(path));
}

export function loadRemedyRow(family, remediesPath = REMEDIES_PATH) {
  const remedies = JSON.parse(readFileSync(remediesPath, "utf8"));
  return remedies.find((row) => row.family === family) ?? null;
}

export function parseArgs(argv) {
  const opts = { family: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--family":
        opts.family = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

/**
 * Resolves to `{ allowed, reason }` and never throws: a missing family or
 * row, or an unreadable remedies file, all come back as `allowed: false`.
 */
export function evaluate({ family, changedPaths, remediesPath = REMEDIES_PATH }) {
  if (!family) {
    return { allowed: false, reason: "no --family was given" };
  }
  const row = loadRemedyRow(family, remediesPath);
  if (!row) {
    return { allowed: false, reason: `no remedy row for family ${family}` };
  }
  if (row.remedy !== "draft-pr") {
    return { allowed: false, reason: `family ${family}'s remedy is ${row.remedy}, not draft-pr` };
  }
  if (touchesOnlyAllowedPaths(changedPaths, row.paths)) {
    return { allowed: true, reason: `every changed path is one of ${family}'s own remedy paths` };
  }
  const outside = changedPaths.filter((path) => !new Set(row.paths).has(path));
  return {
    allowed: false,
    reason: `changed paths outside family ${family}'s remedy paths: ${outside.join(", ") || "(no changed paths given)"}`,
  };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const stdin = await readStdin();
  const changedPaths = stdin
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const result = evaluate({ family: opts.family, changedPaths });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((result) => {
      process.exitCode = result.allowed ? 0 : 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
