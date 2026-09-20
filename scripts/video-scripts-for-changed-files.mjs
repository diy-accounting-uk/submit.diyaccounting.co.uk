#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/video-scripts-for-changed-files.mjs
//
// Works out which recorded scene scripts (videos/*.json) a set of changed repo files could have
// broken, from each script's own "pages" field. Used by the workflow that re-records a video
// after a deploy touches the page(s) it walks, so a capture only reruns when the page it proves
// might have changed.
//
// CLI usage: pass the changed files as arguments, or pipe them one per line on stdin.
//   node scripts/video-scripts-for-changed-files.mjs web/public/hmrc/vat/vatObligations.html
//   git diff --name-only base head | node scripts/video-scripts-for-changed-files.mjs
// Prints one script name per line, in videos/ file order. Prints nothing (exit 0) when no
// script is touched.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

// Every scene script video-capture.yml can dispatch by name. timer-check.json is a local-only
// rehearsal script (never published, not in that workflow's dropdown) and publish.json is the
// YouTube publish manifest, not a scene script - neither belongs in this list.
export const DISPATCHABLE_SCRIPTS = [
  "tour",
  "view-obligations",
  "view-return",
  "view-liabilities",
  "view-payments",
  "view-penalties",
  "submit-return",
  "itsa-business-details",
  "itsa-quarterly-update",
  "file-micro-entity-accounts",
];

// Assets shared by every page's chrome. A change here can change what any script's pages render
// even though the page's own file did not change, so it counts as touching every script - the
// non-obvious rule this module exists to encode.
export function isSharedWebAsset(filePath) {
  return filePath === "web/public/submit.js" || filePath.startsWith("web/public/lib/") || /^web\/public\/[^/]+\.css$/.test(filePath);
}

// Pure: takes the changed file paths and the scene scripts (each { name, pages }) and returns
// the names of the scripts whose pages the change could have touched.
export function scriptsTouchedBy(changedFiles, scripts) {
  if (changedFiles.some(isSharedWebAsset)) return scripts.map((script) => script.name);
  const changed = new Set(changedFiles);
  return scripts.filter((script) => script.pages.some((page) => changed.has(page))).map((script) => script.name);
}

export function loadDispatchableScripts(videosDir) {
  return DISPATCHABLE_SCRIPTS.map((name) => {
    const script = JSON.parse(fs.readFileSync(path.join(videosDir, `${name}.json`), "utf8"));
    return { name, pages: script.pages };
  });
}

async function readStdinLines() {
  const lines = [];
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim().length > 0) lines.push(line.trim());
  }
  return lines;
}

async function main() {
  const changedFiles = process.argv.length > 2 ? process.argv.slice(2) : await readStdinLines();
  const videosDir = path.resolve(process.cwd(), "videos");
  const scripts = loadDispatchableScripts(videosDir);
  for (const name of scriptsTouchedBy(changedFiles, scripts)) {
    console.log(name);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
