// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Reads and writes capability headers: the comment block in a source file that holds one entry of
// REPORT_CAPABILITIES.md. Node built-ins only.
//
// A line-comment header (js mjs cjs java yml yaml sh toml sql) is a run of lines that each start
// with the leader (`//`, `#` or `--`) and one space:
//   <leader> @capability <ID> <name>
//   <leader> - **Use when:** ...
//   <leader> @end-capability
// A Markdown or HTML header is a comment whose body lines are raw:
//   <!-- @capability <ID> <name>
//   - **Use when:** ...
//   @end-capability -->

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ID_PATTERN = "[A-Z]+-\\d+[a-z]?";
export const FIELD_NAMES = ["Use when", "Does", "Run", "Entry", "Files", "Keywords", "Related"];
const REQUIRED_FIELD_COUNT = 6;
const FIELD_LINE = /^- \*\*(Use when|Does|Run|Entry|Files|Keywords|Related):\*\* (\S(?:.*\S)?)$/;
const SLOT_LINE = new RegExp(`^<!-- capability (${ID_PATTERN}) -->$`);
const AREA_HEADING = /^## .+ \(([A-Z]+)\)$/;
const END_MARKER = "@end-capability";

export const LEADERS = { slash: "//", hash: "#", dash: "--" };
export const HEADER_EXTENSIONS = ["js", "mjs", "cjs", "java", "yml", "yaml", "sh", "toml", "sql", "md", "html"];
export const SKELETON_PATH = "_developers/capabilities/skeleton.md";
export const REPORT_FILE = "REPORT_CAPABILITIES.md";

export class CapabilityError extends Error {}

export function kindOf(path) {
  const extension = path.includes(".") ? path.split(".").pop() : "";
  if (["js", "mjs", "cjs", "java"].includes(extension)) return "slash";
  if (["yml", "yaml", "sh", "toml"].includes(extension)) return "hash";
  if (extension === "sql") return "dash";
  if (["md", "html"].includes(extension)) return "html";
  return null;
}

export function formatHeader(entry, kind) {
  if (kind === "html") return [`<!-- @capability ${entry.id} ${entry.name}`, ...entry.fields, `${END_MARKER} -->`];
  const leader = LEADERS[kind];
  return [`${leader} @capability ${entry.id} ${entry.name}`, ...entry.fields.map((f) => `${leader} ${f}`), `${leader} ${END_MARKER}`];
}

function checkBody(where, entry, kind) {
  const label = `${where}: ${entry.id}`;
  const text = [entry.name, ...entry.fields].join("\n");
  if (kind === "html" && text.includes("-->")) throw new CapabilityError(`${label} has "-->" in its body, which would end the comment`);
  if (kind === "slash" && text.includes("\\u"))
    throw new CapabilityError(`${label} has "\\u" in its body, which Java reads as an escape inside a comment`);
  let last = -1;
  const seen = new Set();
  for (const line of entry.fields) {
    const match = line.match(FIELD_LINE);
    if (!match)
      throw new CapabilityError(
        `${label} has a line that is not a "- **Field:** value" line with no trailing space: ${JSON.stringify(line)}`,
      );
    const index = FIELD_NAMES.indexOf(match[1]);
    if (seen.has(match[1])) throw new CapabilityError(`${label} repeats the field ${match[1]}`);
    if (index < last) throw new CapabilityError(`${label} has the field ${match[1]} out of order (order: ${FIELD_NAMES.join(", ")})`);
    seen.add(match[1]);
    last = index;
  }
  for (const name of FIELD_NAMES.slice(0, REQUIRED_FIELD_COUNT)) {
    if (!seen.has(name)) throw new CapabilityError(`${label} has no ${name} field`);
  }
}

// Returns the headers in a file as { id, name, fields, home, line }. `fields` are the field lines
// without the leader. Fenced code blocks in Markdown are skipped.
export function parseHeaders(path, text, kind = kindOf(path)) {
  if (!kind) throw new CapabilityError(`${path}: no comment syntax for this file type`);
  const lines = text.split("\n");
  const found = [];
  const open =
    kind === "html"
      ? new RegExp(`^<!-- @capability (${ID_PATTERN}) (.+)$`)
      : new RegExp(`^${LEADERS[kind]} @capability (${ID_PATTERN}) (.+)$`);
  const leader = kind === "html" ? "" : `${LEADERS[kind]} `;
  const close = kind === "html" ? `${END_MARKER} -->` : `${LEADERS[kind]} ${END_MARKER}`;
  let fence = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i++;
    if (path.endsWith(".md")) {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch && !fence) {
        fence = fenceMatch[1][0];
        continue;
      }
      if (fenceMatch && fence === fenceMatch[1][0]) {
        fence = null;
        continue;
      }
      if (fence) continue;
    }
    const match = line.match(open);
    if (!match) continue;
    const entry = { id: match[1], name: match[2], fields: [], home: path, line: i };
    let closed = false;
    while (i < lines.length && !closed) {
      const bodyLine = lines[i];
      i++;
      if (bodyLine === close) {
        closed = true;
      } else if (leader && !bodyLine.startsWith(leader)) {
        throw new CapabilityError(`${path}:${i}: ${entry.id} has a line without the "${leader.trim()}" leader before ${END_MARKER}`);
      } else {
        entry.fields.push(bodyLine.slice(leader.length));
      }
    }
    if (!closed) throw new CapabilityError(`${path}:${entry.line}: ${entry.id} has no ${close} line`);
    checkBody(`${path}:${entry.line}`, entry, kind);
    found.push(entry);
  }
  return found;
}

export function trackedFiles(root) {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter(Boolean);
}

export function discoverHeaders(root, files = trackedFiles(root)) {
  const entries = [];
  for (const path of files) {
    if (path === REPORT_FILE || !HEADER_EXTENSIONS.includes(path.split(".").pop())) continue;
    let text;
    try {
      text = readFileSync(join(root, path), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!text.includes("@capability ")) continue;
    entries.push(...parseHeaders(path, text));
  }
  return entries;
}

export function scanSkeleton(skeletonText) {
  const slots = [];
  let areaPrefix = null;
  skeletonText.split("\n").forEach((line, index) => {
    const area = line.match(AREA_HEADING);
    if (area) areaPrefix = area[1];
    else if (line.startsWith("## ")) areaPrefix = null;
    const slot = line.match(SLOT_LINE);
    if (slot) slots.push({ id: slot[1], prefix: areaPrefix, line: index + 1 });
  });
  return slots;
}

// Replaces each slot line of the skeleton with its entry. The result still has empty generated
// blocks; the caller renders them.
export function assemble(skeletonText, entries) {
  const problems = [];
  const byId = new Map();
  for (const entry of entries) {
    if (byId.has(entry.id))
      problems.push(`duplicate ${entry.id}: ${byId.get(entry.id).home}:${byId.get(entry.id).line} and ${entry.home}:${entry.line}`);
    else byId.set(entry.id, entry);
  }
  const slotIds = new Set();
  for (const slot of scanSkeleton(skeletonText)) {
    if (slotIds.has(slot.id)) problems.push(`duplicate slot ${slot.id} in the skeleton (line ${slot.line})`);
    slotIds.add(slot.id);
    if (slot.prefix === null || !slot.id.startsWith(`${slot.prefix}-`)) {
      problems.push(`prefix mismatch: ${slot.id} sits in the skeleton under area ${slot.prefix ?? "(none)"} (line ${slot.line})`);
    }
    if (!byId.has(slot.id)) problems.push(`skeleton slot ${slot.id} has no header`);
  }
  for (const entry of byId.values()) {
    if (!slotIds.has(entry.id)) problems.push(`header ${entry.id} in ${entry.home}:${entry.line} has no skeleton slot`);
  }
  if (problems.length) throw new CapabilityError(problems.join("\n"));
  return skeletonText
    .split("\n")
    .flatMap((line) => {
      const slot = line.match(SLOT_LINE);
      if (!slot) return [line];
      const entry = byId.get(slot[1]);
      return [`#### ${entry.id} ${entry.name}`, "", ...entry.fields, ""];
    })
    .join("\n");
}

// The next unused number for an area prefix: the highest number among the headers plus one.
export function nextId(entries, prefix) {
  let highest = 0;
  for (const entry of entries) {
    const match = entry.id.match(/^([A-Z]+)-(\d+)/);
    if (match && match[1] === prefix) highest = Math.max(highest, Number(match[2]));
  }
  return `${prefix}-${String(highest + 1).padStart(2, "0")}`;
}
