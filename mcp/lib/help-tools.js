// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-29 Answer help questions and the DIYA-GL book format from the hosted connector
// - **Use when:** an assistant needs Submit's own help on a step, a diya-gl knowledge base article, the shape of a DIYA-GL book, or a CT600 box.
// - **Does:** findHelp in mcp/lib/help-tools.js scores the Submit guide's journeys, the MCP, rates and MTD calendar pages' sections and the diya-gl knowledge base's articles against a question and answers each match's title, a two-line summary and its public address. bookFormat answers the DIYA-GL book's two files and their fields, or the CT600 box map. Both read mcp/lib/help-index.json, which scripts/build-mcp-help-index.mjs builds; it calls no service.
// - **Run:** `npm run build:mcp-help-index` (rebuild the index); `npm run build:mcp-help-index -- --fetch` (read the published knowledge base again)
// - **Entry:** `mcp/lib/help-tools.js:findHelp`; `mcp/lib/help-tools.js:bookFormat`; `scripts/build-mcp-help-index.mjs:buildHelpIndex`
// - **Files:** mcp/lib/help-tools.js, mcp/lib/help-index.json, scripts/build-mcp-help-index.mjs, mcp/test/help-tools.test.js, app/unit-tests/scripts/buildMcpHelpIndex.test.js
// - **Keywords:** find_help, book_format, guide search, knowledge base, book format, ct600 box map, help index
// - **Related:** MCP-01
// @end-capability

// help-tools.js -- find_help and book_format: read-only answers from the help index.

import { readFileSync } from "node:fs";

const INDEX_URL = new URL("./help-index.json", import.meta.url);
export const GUIDE_URL = "https://submit.diyaccounting.co.uk/guide.html";
export const KNOWLEDGE_BASE_PAGE_URL = "https://spreadsheets.diyaccounting.co.uk/knowledge-base.html";
export const HELP_SOURCES = { "guide": "Submit guide", "knowledge-base": "diya-gl knowledge base" };
export const DEFAULT_MATCHES = 5;
export const MAX_MATCHES = 10;

const STOP_WORDS = new Set(
  "a an and are as at be by can do does for from get how i in is it me my of on or the to what when where which who why will with you your".split(
    " ",
  ),
);

let index;
function helpIndex() {
  index ??= JSON.parse(readFileSync(INDEX_URL, "utf8"));
  return index;
}

const wordsOf = (text) =>
  (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9£%]+/)
    .filter(Boolean);

/** The words of a question that carry its meaning. */
export function queryTerms(query) {
  return [...new Set(wordsOf(query).filter((word) => !STOP_WORDS.has(word)))];
}

// A term matches a word it begins, so "allowance" finds "allowances".
function hits(term, words) {
  return words.some((word) => word.startsWith(term));
}

/** How well an entry answers the terms: a term in the title counts most, then the summary, then the rest. */
export function scoreOf(entry, terms, phrase) {
  const title = wordsOf(entry.title);
  const summary = wordsOf(`${entry.section} ${entry.summary}`);
  const text = wordsOf(entry.text);
  let score = 0;
  for (const term of terms) {
    if (hits(term, title)) score += 3;
    else if (hits(term, summary)) score += 2;
    else if (hits(term, text)) score += 1;
  }
  if (phrase && entry.title.toLowerCase().includes(phrase)) score += 5;
  return score;
}

/**
 * The guide sections and knowledge base articles that answer a question, best first.
 * @param {Object} _session - unused: the help index is the same for every caller
 * @param {{query: string, source?: "guide"|"knowledge-base", limit?: number}} args
 */
export function findHelp(_session, { query, source, limit = DEFAULT_MATCHES } = {}) {
  const terms = queryTerms(query);
  if (terms.length === 0) throw new Error("find_help needs a question or some words to search for");
  const phrase = (query ?? "").trim().toLowerCase();
  const wanted = source ? HELP_SOURCES[source] : undefined;
  if (source && !wanted) throw new Error(`find_help source must be one of ${Object.keys(HELP_SOURCES).join(", ")}`);
  const count = Math.min(Math.max(Math.trunc(limit) || DEFAULT_MATCHES, 1), MAX_MATCHES);
  const matches = helpIndex()
    .entries.filter((entry) => !wanted || entry.source === wanted)
    .map((entry, order) => ({ entry, order, score: scoreOf(entry, terms, phrase) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, count)
    .map(({ entry }) => ({ source: entry.source, title: entry.title, summary: entry.summary, url: entry.url }));
  if (matches.length > 0) return { query, matches };
  return {
    query,
    matches,
    note: `Nothing in the Submit guide or the diya-gl knowledge base matches. The guide is ${GUIDE_URL} and the knowledge base is ${KNOWLEDGE_BASE_PAGE_URL}.`,
  };
}

/**
 * The DIYA-GL book format (part "book", the default) or the CT600 box map (part "ct600"), whose boxes a
 * section narrows.
 * @param {Object} _session - unused: the format is the same for every caller
 * @param {{part?: "book"|"ct600", section?: string}} args
 */
export function bookFormat(_session, { part = "book", section } = {}) {
  const { bookFormat: format, ct600 } = helpIndex();
  if (part === "book") return format;
  if (part !== "ct600") throw new Error('book_format part must be "book" or "ct600"');
  const sections = [...new Set(ct600.boxes.map((box) => box.section))];
  if (!section) return { version: ct600.version, source: ct600.source, sections, boxes: ct600.boxes };
  const wanted = section.trim().toLowerCase();
  const boxes = ct600.boxes.filter((box) => box.section.toLowerCase().includes(wanted));
  if (boxes.length === 0) throw new Error(`No CT600 section matches "${section}"; the sections are: ${sections.join("; ")}`);
  return { version: ct600.version, source: ct600.source, sections, boxes };
}
