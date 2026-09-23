// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Regenerates the contents sections of REPORT_CAPABILITIES.md from its capability entries.
// The entries (#### headings with their field lines) are the only hand-written part; the global
// index, each area's and each group's contents, and the keyword index are derived from them,
// between <!-- generated:... --> markers. `--check` exits 1 when the file is not current.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPORT_PATH = resolve(ROOT, "REPORT_CAPABILITIES.md");

export function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/ /g, "-");
}

function field(lines, name) {
  const prefix = `- **${name}:** `;
  const line = lines.find((l) => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

export function parseEntries(markdown) {
  const areas = [];
  let area = null;
  let group = null;
  let entry = null;
  for (const line of markdown.split("\n")) {
    const areaMatch = line.match(/^## (.+) \(([A-Z]+)\)$/);
    if (areaMatch) {
      area = { title: areaMatch[1], prefix: areaMatch[2], heading: line.slice(3), groups: [] };
      areas.push(area);
      group = null;
      entry = null;
      continue;
    }
    if (line.startsWith("## ")) {
      area = null;
      group = null;
      entry = null;
      continue;
    }
    if (area && line.startsWith("### ")) {
      group = { title: line.slice(4).replace(/ \([A-Z]+\)$/, ""), heading: line.slice(4), entries: [] };
      area.groups.push(group);
      entry = null;
      continue;
    }
    const entryMatch = line.match(/^#### ([A-Z]+-\d+) (.+)$/);
    if (group && entryMatch) {
      entry = { id: entryMatch[1], name: entryMatch[2], heading: line.slice(5), lines: [] };
      group.entries.push(entry);
      continue;
    }
    if (entry) entry.lines.push(line);
  }
  for (const a of areas) {
    for (const g of a.groups) {
      for (const e of g.entries) {
        e.useWhen = field(e.lines, "Use when").replace(/^Use when /i, "");
        e.keywords = field(e.lines, "Keywords")
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);
      }
    }
  }
  return areas;
}

function entryLink(e) {
  return `[${e.id}](#${slug(e.heading)})`;
}

function renderIndex(areas) {
  const out = [];
  for (const a of areas) {
    out.push(`- **[${a.title}](#${slug(a.heading)})**`);
    for (const g of a.groups) {
      out.push(`  - [${g.title}](#${slug(g.heading)})`);
      for (const e of g.entries) out.push(`    - ${entryLink(e)} ${e.name}: use when ${e.useWhen}`);
    }
  }
  return out.join("\n");
}

function renderAreaContents(area) {
  const out = [];
  for (const g of area.groups) {
    out.push(`- [${g.title}](#${slug(g.heading)}): ${g.entries.map((e) => `${entryLink(e)} ${e.name}`).join(" · ")}`);
  }
  return out.join("\n");
}

function renderGroupContents(group) {
  return group.entries.map((e) => `- ${entryLink(e)} ${e.name}`).join("\n");
}

function renderKeywords(areas) {
  const map = new Map();
  for (const a of areas) {
    for (const g of a.groups) {
      for (const e of g.entries) {
        for (const k of e.keywords) {
          if (!map.has(k)) map.set(k, []);
          if (!map.get(k).includes(e.id)) map.get(k).push(e.id);
        }
      }
    }
  }
  const ids = new Map(areas.flatMap((a) => a.groups.flatMap((g) => g.entries.map((e) => [e.id, e]))));
  return [...map.keys()]
    .sort()
    .map(
      (k) =>
        `- ${k}: ${map
          .get(k)
          .map((id) => entryLink(ids.get(id)))
          .join(", ")}`,
    )
    .join("\n");
}

function replaceBlock(markdown, marker, body) {
  const open = `<!-- generated:${marker} -->`;
  const close = `<!-- /generated:${marker} -->`;
  const start = markdown.indexOf(open);
  const end = markdown.indexOf(close);
  if (start === -1 || end === -1 || end < start) throw new Error(`REPORT_CAPABILITIES.md is missing the ${marker} markers`);
  return `${markdown.slice(0, start + open.length)}\n${body}\n${markdown.slice(end)}`;
}

export function render(markdown) {
  const areas = parseEntries(markdown);
  let out = replaceBlock(markdown, "index", renderIndex(areas));
  out = replaceBlock(out, "keywords", renderKeywords(areas));
  for (const a of areas) {
    out = replaceBlock(out, `area ${a.prefix}`, renderAreaContents(a));
    for (const g of a.groups) out = replaceBlock(out, `group ${slug(g.heading)}`, renderGroupContents(g));
  }
  return out;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const current = readFileSync(REPORT_PATH, "utf8");
  const next = render(current);
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error("REPORT_CAPABILITIES.md contents are stale: run `npm run capabilities:index`");
      process.exit(1);
    }
    console.log("REPORT_CAPABILITIES.md contents are current");
  } else {
    writeFileSync(REPORT_PATH, next);
    console.log("REPORT_CAPABILITIES.md contents regenerated");
  }
}
