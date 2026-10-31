// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Builds REPORT_CAPABILITIES.md from the capability headers in the tracked source files and the
// skeleton at _developers/capabilities/skeleton.md.
//   node scripts/capabilities-generate.mjs                 write the file
//   node scripts/capabilities-generate.mjs --check         exit 1 when the file differs
//   node scripts/capabilities-generate.mjs --next <PREFIX> print the next unused id of an area
//   --root <dir> runs against another checkout (a new header file must be `git add`-ed first)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, parseEntries } from "./capabilities-index.mjs";
import { CapabilityError, REPORT_FILE, SKELETON_PATH, assemble, discoverHeaders, nextId } from "./lib/capabilityHeaders.mjs";

const DIFF_LINES_SHOWN = 40;

export function generateReport(skeletonText, entries) {
  return render(assemble(skeletonText, entries));
}

export function describeStaleness(current, next, entries) {
  const out = [];
  const withHeader = new Set(entries.map((e) => e.id));
  const missing = parseEntries(current)
    .flatMap((a) => a.groups.flatMap((g) => g.entries.map((e) => e.id)))
    .filter((id) => !withHeader.has(id));
  if (missing.length) out.push(`ids in ${REPORT_FILE} with no header: ${missing.join(" ")}`);
  const a = current.split("\n");
  const b = next.split("\n");
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < DIFF_LINES_SHOWN; i++) {
    if (a[i] === b[i]) continue;
    out.push(`line ${i + 1}: tracked ${JSON.stringify(a[i] ?? null)}`, `line ${i + 1}: generated ${JSON.stringify(b[i] ?? null)}`);
    shown++;
  }
  return out;
}

function option(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1];
}

export function main(args) {
  const root = resolve(option(args, "--root") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const entries = discoverHeaders(root);
  if (args.includes("--next")) {
    console.log(nextId(entries, option(args, "--next")));
    return 0;
  }
  const next = generateReport(readFileSync(join(root, SKELETON_PATH), "utf8"), entries);
  const reportPath = join(root, REPORT_FILE);
  if (args.includes("--check")) {
    const current = readFileSync(reportPath, "utf8");
    if (current === next) {
      console.log(`${REPORT_FILE} is current`);
      return 0;
    }
    console.error(`${REPORT_FILE} is not what the headers generate`);
    for (const line of describeStaleness(current, next, entries)) console.error(line);
    console.error("run: npm run capabilities:generate");
    return 1;
  }
  writeFileSync(reportPath, next);
  console.log(`${REPORT_FILE} generated from ${entries.length} headers`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof CapabilityError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
