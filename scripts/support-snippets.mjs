#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-snippets.mjs
//
// Splits the pages that the support triage request carries (web/public/faqs.toml, help.html and
// guide.html) into snippets. One snippet is one FAQ entry or one heading section of a page. Each
// snippet file starts with front matter: id, source, title, summary, keywords, topics, bytes and
// updated. The summary is the first sentence of the section, so no model call is needed. The
// output goes to the directory that --out names at run time; no snippet output is committed.
//
// usage: support-snippets.mjs --out <dir> [--root <dir>]

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export const SNIPPET_SOURCES = [
  { source: "faqs", path: "web/public/faqs.toml" },
  { source: "help", path: "web/public/help.html" },
  { source: "guide", path: "web/public/guide.html" },
];

const STOP_WORDS = new Set(
  "a about an and are as at be but by can do does for from has have how i if in is it its my of on or so that the this to we what when which will with you your".split(
    " ",
  ),
);
const KEYWORD_COUNT = 6;
const SUMMARY_MAX_CHARS = 200;

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-/, "")
    .replace(/-$/, "");

/** The first sentence of a text, cut to a safe length. */
export function firstSentence(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  const match = /^.+?[.!?](?=\s|$)/.exec(flat);
  return (match ? match[0] : flat).slice(0, SUMMARY_MAX_CHARS);
}

/** The most frequent words of a text that are not stop words, longest-lived first on ties. */
export function topWords(text, count = KEYWORD_COUNT) {
  const tally = new Map();
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
    if (!STOP_WORDS.has(word)) tally.set(word, (tally.get(word) ?? 0) + 1);
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([word]) => word);
}

const tomlString = (block, key) => {
  const triple = new RegExp(`^${key}\\s*=\\s*"""\\n?([\\s\\S]*?)"""`, "m").exec(block);
  if (triple) return triple[1].trim();
  const single = new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(block);
  return single ? single[1].replace(/\\"/g, '"').trim() : "";
};

const tomlList = (block, key) => {
  const match = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(block);
  return match ? [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((item) => item[1]) : [];
};

/** One snippet for each [[faq]] entry. */
export function splitFaqs(tomlText) {
  return tomlText
    .split(/^\[\[faq\]\]\s*$/m)
    .slice(1)
    .map((block) => {
      const id = tomlString(block, "id");
      const question = tomlString(block, "question");
      const answer = tomlString(block, "answer");
      const category = tomlString(block, "category");
      return {
        id,
        title: question,
        summary: firstSentence(answer),
        keywords: tomlList(block, "keywords"),
        topics: category ? [category] : [],
        body: `${question}\n\n${answer}`,
      };
    })
    .filter((snippet) => snippet.id !== "faq-" && snippet.title);
}

const decode = (text) =>
  text
    .replace(/&nbsp;|&middot;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

const visibleText = (html) =>
  decode(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^<>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

/** One snippet for each heading section (h1 to h3) of a page that holds visible text. */
export function splitHtml(html, source) {
  const pageTitle = visibleText(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? source);
  const bodyStart = html.search(/<body\b/i);
  const body = bodyStart < 0 ? html : html.slice(html.indexOf(">", bodyStart) + 1);
  const parts = body.split(/(<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>)/i);
  const sections = [{ title: pageTitle, text: visibleText(parts[0]) }];
  for (let index = 1; index < parts.length; index += 2) {
    sections.push({ title: visibleText(parts[index]), text: visibleText(parts[index + 1] ?? "") });
  }
  return sections
    .filter((section) => section.text.length > 0)
    .map((section, order) => ({
      id: `${source}-${order + 1}-${slug(section.title) || "section"}`,
      title: section.title,
      summary: firstSentence(section.text),
      keywords: topWords(`${section.title} ${section.text}`),
      topics: [source],
      body: `${section.title}\n\n${section.text}`,
    }));
}

/**
 * Splits every source into snippets.
 * @param {object} options
 * @param {string} [options.root] the repository root
 * @param {(path: string) => string} [options.read]
 * @param {(path: string) => string} [options.updatedOf] the date a file last changed
 * @returns {Array<{id: string, source: string, title: string, summary: string, keywords: string[], topics: string[], bytes: number, updated: string, body: string}>}
 */
export function buildSnippets({ root = ".", read = (path) => readFileSync(path, "utf8"), updatedOf = gitDate } = {}) {
  return SNIPPET_SOURCES.flatMap(({ source, path }) => {
    const text = read(join(root, path));
    const updated = updatedOf(join(root, path));
    const parts = source === "faqs" ? splitFaqs(text) : splitHtml(text, source);
    return parts.map((part) => ({ ...part, source, bytes: Buffer.byteLength(part.body), updated }));
  });
}

function gitDate(path) {
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    return execFileSync("git", ["log", "-1", "--format=%cI", "--", path], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const yamlList = (items) => `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;

/** The text of one snippet file: front matter, then the body. */
export function renderSnippet(snippet) {
  return [
    "---",
    `id: ${snippet.id}`,
    `source: ${snippet.source}`,
    `title: ${JSON.stringify(snippet.title)}`,
    `summary: ${JSON.stringify(snippet.summary)}`,
    `keywords: ${yamlList(snippet.keywords)}`,
    `topics: ${yamlList(snippet.topics)}`,
    `bytes: ${snippet.bytes}`,
    `updated: ${JSON.stringify(snippet.updated)}`,
    "---",
    "",
    snippet.body,
    "",
  ].join("\n");
}

/** Writes one file for each snippet into a directory and returns the snippet list. */
export function writeSnippets(snippets, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const snippet of snippets) writeFileSync(join(outDir, `${snippet.id}.md`), renderSnippet(snippet));
  return snippets;
}

function main() {
  const { values } = parseArgs({ options: { out: { type: "string" }, root: { type: "string", default: "." } } });
  if (!values.out) {
    console.error("usage: support-snippets.mjs --out <dir> [--root <dir>]");
    process.exit(2);
  }
  const snippets = writeSnippets(buildSnippets({ root: values.root }), values.out);
  const bytes = snippets.reduce((sum, snippet) => sum + snippet.bytes, 0);
  console.log(`support-snippets: ${snippets.length} snippets, ${bytes} bytes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
