#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-215 List every GitHub secret and variable in the README
// - **Use when:** a workflow gains or loses a secrets.* or vars.* reference, or you need the list of names a fork must set.
// - **Does:** build-secrets-table.mjs reads each secrets.X and vars.X reference in .github/workflows and .github/actions. It joins them to the level and purpose in scripts/secrets-and-variables.toml. It writes the "Secrets and variables" section of README.md.
// - **Run:** `npm run secrets:table`; `node scripts/build-secrets-table.mjs --check`
// - **Entry:** `scripts/build-secrets-table.mjs:applySecretsTable`
// - **Files:** scripts/build-secrets-table.mjs, scripts/secrets-and-variables.toml, README.md, app/unit-tests/secretsTable.test.js
// - **Keywords:** secrets and variables, readme table, github secrets list, vars reference, fork setup, workflow references
// - **Related:** OPS-165
// @end-capability

// Writes the table of GitHub secrets and variables into README.md, between the two marker comments.
//   node scripts/build-secrets-table.mjs           write the section
//   node scripts/build-secrets-table.mjs --check   exit 1 when README.md or the name list is stale

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";

export const START_MARKER = "<!-- secrets-table:start -->";
export const END_MARKER = "<!-- secrets-table:end -->";

export const LEVELS = ["organisation", "repository", "environment ci and prod", "environment ci", "environment prod"];
export const MAX_PURPOSE_WORDS = 12;
const MAX_LISTED_WORKFLOWS = 4;
const IGNORED_NAMES = new Set(["GITHUB_TOKEN"]);
const REFERENCE = /(?<![\w.-])(secrets|vars)\.([A-Z][A-Z0-9_]*)\b/g;

function* walkYaml(dir, prefix) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkYaml(path, `${prefix}${entry.name}/`);
    else if (/\.ya?ml$/.test(entry.name)) yield { path, label: `${prefix}${entry.name}` };
  }
}

// Returns Map<name, { kind, readers: string[] }> for every secrets.X and vars.X reference.
export function scanReferences(root) {
  const found = new Map();
  const sources = [...walkYaml(join(root, ".github", "workflows"), ""), ...walkYaml(join(root, ".github", "actions"), "actions/")];
  for (const { path, label } of sources) {
    const text = readFileSync(path, "utf8");
    for (const [, scope, name] of text.matchAll(REFERENCE)) {
      if (IGNORED_NAMES.has(name)) continue;
      const kind = scope === "secrets" ? "secret" : "variable";
      if (!found.has(name)) found.set(name, { kind, readers: new Set() });
      found.get(name).readers.add(label);
    }
  }
  return new Map([...found].map(([name, { kind, readers }]) => [name, { kind, readers: [...readers].sort() }]));
}

export function loadItems(root) {
  return TOML.parse(readFileSync(join(root, "scripts", "secrets-and-variables.toml"), "utf8")).item ?? [];
}

// Names that a workflow reads and the file lacks, and names the file holds that nothing reads.
export function compareNames(references, items) {
  const listed = new Set(items.map((item) => item.name));
  return {
    unlisted: [...references.keys()].filter((name) => !listed.has(name)).sort(),
    unreferenced: [...listed].filter((name) => !references.has(name)).sort(),
  };
}

function readerCell(readers) {
  if (readers.length > MAX_LISTED_WORKFLOWS) return `${readers.length} workflows`;
  return readers.map((reader) => `\`${reader}\``).join(" ");
}

export function renderSecretsTable(items, references) {
  const { unlisted, unreferenced } = compareNames(references, items);
  if (unlisted.length || unreferenced.length) {
    throw new Error(
      `scripts/secrets-and-variables.toml is out of step with .github/. Not in the file: ${unlisted.join(", ") || "none"}. Read by no workflow: ${unreferenced.join(", ") || "none"}.`,
    );
  }
  const lines = [];
  for (const level of LEVELS) {
    const rows = items.filter((item) => item.level === level).sort((a, b) => a.name.localeCompare(b.name));
    if (rows.length === 0) continue;
    const heading = level.charAt(0).toUpperCase() + level.slice(1);
    lines.push(`**${heading}** (${rows.length})`, "", "| Name | Kind | Purpose | Read by |", "|------|------|---------|---------|");
    for (const item of rows) {
      lines.push(`| \`${item.name}\` | ${item.kind} | ${item.purpose} | ${readerCell(references.get(item.name).readers)} |`);
    }
    lines.push("");
  }
  return [
    "Values live only in GitHub secrets and AWS Secrets Manager. `secrets-rotation.toml` is the rotation schedule.",
    "`rotation-check.yml` raises an issue 30 days before a key is due. A new fork needs every item below set before its pipelines run.",
    "",
    ...lines,
  ]
    .join("\n")
    .trimEnd();
}

export function applySecretsTable(readme, items, references) {
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) throw new Error(`README.md needs ${START_MARKER} then ${END_MARKER}`);
  return `${readme.slice(0, start + START_MARKER.length)}\n${renderSecretsTable(items, references)}\n${readme.slice(end)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const readmePath = join(root, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const items = loadItems(root);
  const references = scanReferences(root);
  try {
    const next = applySecretsTable(readme, items, references);
    if (process.argv.includes("--check")) {
      if (next !== readme) {
        console.error("README.md secrets and variables section is stale: run `npm run secrets:table`");
        process.exit(1);
      }
      console.log("README.md secrets and variables section is current");
    } else {
      writeFileSync(readmePath, next);
      console.log(`README.md secrets and variables section written for ${items.length} names`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
