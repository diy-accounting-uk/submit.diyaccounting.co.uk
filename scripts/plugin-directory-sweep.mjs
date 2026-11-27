#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-28 Record where Claude's connector directory shows us for each search term
// - **Use when:** the plugin or connector listing changes and its position in Claude's marketplace must be measured before and after, term by term.
// - **Does:** plugin-directory-sweep.mjs fetches claude.com/marketplace/connectors-plugins with a plain GET, reads the connector records from the page's self.__next_f.push script chunks (title, slug, oneLiner, author, popularityScore), and for each term counts the records whose title, one-liner or author holds it, gives our position by popularity among them and the first five titles. It writes one CSV (directory, term, matches, our position, first five) to the private repository's plugin-positions folder, or to --out. It throws when the page holds no record, so a changed page never writes an empty CSV.
// - **Run:** `node scripts/plugin-directory-sweep.mjs [--out target/plugin-positions/<date>.csv] [--html <saved page>]`
// - **Entry:** `scripts/plugin-directory-sweep.mjs:connectorRecords`; `scripts/plugin-directory-sweep.mjs:sweepTerms`
// - **Files:** scripts/plugin-directory-sweep.mjs, app/unit-tests/scripts/pluginDirectorySweep.test.js
// - **Keywords:** plugin directory, claude marketplace, connector listing, search terms, popularity, plugin positions, discovery, csv
// - **Related:** MCP-27
// @end-capability

// scripts/plugin-directory-sweep.mjs
//
// The marketplace page is a Next.js page: its data arrives as strings pushed to self.__next_f,
// split across script tags at arbitrary points. The strings are joined in order, then each
// connector record ({"_id":"…","title":…}) is read as JSON.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKETPLACE_URL = "https://claude.com/marketplace/connectors-plugins";
export const DIRECTORY = "claude";
export const OUR_AUTHOR = /diy accounting/i;

export const TERMS = [
  "mtd",
  "making tax digital",
  "vat",
  "vat return",
  "hmrc",
  "self assessment",
  "income tax",
  "sole trader",
  "landlord",
  "companies house",
  "accounts",
  "annual accounts",
  "confirmation statement",
  "ct600",
  "corporation tax",
  "ltd",
  "limited",
  "limited company",
  "bookkeeping",
  "books",
  "ledger",
  "accounting",
  "account",
  "tax return",
  "diy accounting",
  "declaration",
];

const PUSH_CHUNK = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;

/** The page's pushed strings, joined in order into the stream they were split from. */
export function nextFlightText(html) {
  let text = "";
  for (const [, literal] of html.matchAll(PUSH_CHUNK)) {
    const chunk = JSON.parse(literal);
    if (typeof chunk[1] === "string") text += chunk[1];
  }
  return text;
}

// The end of the JSON object that opens at `start`, skipping braces inside strings.
function objectEnd(text, start) {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (character === "\\") index += 1;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/**
 * The connector records in the marketplace page, one per slug.
 * @param {string} html - the page as served
 * @returns {Array<{title: string, slug: string, oneLiner: string, author: string, popularityScore: number}>}
 */
export function connectorRecords(html) {
  const text = nextFlightText(html);
  const bySlug = new Map();
  for (let start = text.indexOf('{"_id":'); start >= 0; start = text.indexOf('{"_id":', start + 1)) {
    const end = objectEnd(text, start);
    if (end < 0) break;
    let record;
    try {
      record = JSON.parse(text.slice(start, end));
    } catch {
      continue;
    }
    if (typeof record.title !== "string" || typeof record.slug !== "string" || typeof record.popularityScore !== "number") continue;
    if (!bySlug.has(record.slug)) {
      bySlug.set(record.slug, {
        title: record.title,
        slug: record.slug,
        oneLiner: record.oneLiner ?? "",
        author: record.author ?? "",
        popularityScore: record.popularityScore,
      });
    }
  }
  if (bySlug.size === 0) {
    throw new Error(
      `No connector record found in the marketplace page (no {"_id":…,"title":…,"slug":…,"popularityScore":…} object in its self.__next_f.push chunks); the page's shape has changed`,
    );
  }
  return [...bySlug.values()];
}

/**
 * For each term: the records whose title, one-liner or author holds it (case-insensitive
 * substring), our position among them by popularity (1 is the most popular; null when we are not
 * among them) and the first five titles in that order.
 */
export function sweepTerms(records, terms = TERMS, ours = OUR_AUTHOR) {
  return terms.map((term) => {
    const needle = term.toLowerCase();
    const matched = records
      .filter((record) => [record.title, record.oneLiner, record.author].some((field) => field.toLowerCase().includes(needle)))
      .sort((a, b) => b.popularityScore - a.popularityScore);
    const position = matched.findIndex((record) => ours.test(record.title) || ours.test(record.author));
    return {
      directory: DIRECTORY,
      term,
      matches: matched.length,
      ourPosition: position >= 0 ? position + 1 : null,
      firstFive: matched.slice(0, 5).map((record) => record.title),
    };
  });
}

function csvField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows) {
  const lines = ["directory,term,matches,our position,first five"];
  for (const row of rows) {
    lines.push([row.directory, row.term, row.matches, row.ourPosition, row.firstFive.join("; ")].map(csvField).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out =
    argument("--out") ??
    path.join(here, "..", "..", "private.diyaccounting.co.uk", "strategy", "marketing", "plugin-positions", `${date}.csv`);
  const saved = argument("--html");
  let html;
  if (saved) {
    html = readFileSync(saved, "utf8");
  } else {
    const response = await fetch(MARKETPLACE_URL);
    if (!response.ok) throw new Error(`${MARKETPLACE_URL} answered ${response.status}`);
    html = await response.text();
  }
  const records = connectorRecords(html);
  const rows = sweepTerms(records);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, toCsv(rows));
  console.log(`${records.length} connector records, ${rows.length} terms: ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
