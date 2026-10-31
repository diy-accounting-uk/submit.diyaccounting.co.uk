#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Writes the table of npm scripts into README.md, between the two marker comments, from package.json.
//   node scripts/scripts-table.mjs           write the table
//   node scripts/scripts-table.mjs --check   exit 1 when README.md differs from package.json

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const START_MARKER = "<!-- scripts-table:start -->";
export const END_MARKER = "<!-- scripts-table:end -->";

export function groupScripts(scripts) {
  const groups = new Map();
  for (const name of Object.keys(scripts)) {
    const colon = name.indexOf(":");
    const group = colon === -1 ? name : name.slice(0, colon);
    const member = colon === -1 ? "" : name.slice(colon + 1);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(member);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

export function renderScriptsTable(scripts) {
  const groups = groupScripts(scripts);
  const total = Object.keys(scripts).length;
  const rows = groups.map(([group, members]) => {
    const names = members.map((member) => (member === "" ? `\`${group}\`` : `\`${member}\``)).join(" ");
    return `| \`npm run ${group}:\` | ${members.length} | ${names} |`;
  });
  return [
    `${total} scripts in package.json. A group is the text before the first colon; a name below follows it.`,
    "",
    "| Group | Scripts | Names |",
    "|-------|---------|-------|",
    ...rows,
  ].join("\n");
}

export function applyScriptsTable(readme, scripts) {
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) throw new Error(`README.md needs ${START_MARKER} then ${END_MARKER}`);
  return `${readme.slice(0, start + START_MARKER.length)}\n${renderScriptsTable(scripts)}\n${readme.slice(end)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const readmePath = join(root, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const next = applyScriptsTable(readme, scripts);
  if (process.argv.includes("--check")) {
    if (next !== readme) {
      console.error("README.md script table is stale: run `npm run scripts:table`");
      process.exit(1);
    }
    console.log("README.md script table is current");
  } else {
    writeFileSync(readmePath, next);
    console.log(`README.md script table written for ${Object.keys(scripts).length} scripts`);
  }
}
