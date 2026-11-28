// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Builds mcp/lib/help-index.json, the data behind the hosted connector's find_help and book_format tools:
// the Submit guide's journeys and the sections of the MCP, rates and MTD calendar pages, the diya-gl
// knowledge base's articles, the DIYA-GL book format from the diya-gl package's v3 schemas, and the CT600
// box map from the same package.
// Usage: node scripts/build-mcp-help-index.mjs [--fetch]   (npm run build:mcp-help-index)
// The diya-gl package ships the knowledge base's keywords but not its index, so --fetch reads the published
// knowledge-base.toml; without it the build keeps the articles the committed file already holds.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import toml from "@iarna/toml";
import prettier from "prettier";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT_PATH = join(ROOT, "mcp", "lib", "help-index.json");
const PUBLIC_DIR = join(ROOT, "web", "public");
const DIYA_GL_DIR = join(ROOT, "node_modules", "@diy-accounting-uk", "diya-gl");
const SCHEMA_DIR = join(DIYA_GL_DIR, "dist", "web", "spreadsheets.diyaccounting.co.uk", "public", "schema");
const CT600_PATH = join(DIYA_GL_DIR, "dist", "app", "data", "filing", "ct600-v3.toml");

export const SUBMIT_ORIGIN = "https://submit.diyaccounting.co.uk";
export const SPREADSHEETS_ORIGIN = "https://spreadsheets.diyaccounting.co.uk";
export const KNOWLEDGE_BASE_URL = `${SPREADSHEETS_ORIGIN}/knowledge-base.toml`;
const PAGES = ["mcp.html", "rates.html", "mtd-calendar.html"];
const SUMMARY_LIMIT = 240;
const TEXT_LIMIT = 1500;

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&pound;": "£", "&rsquo;": "’" };

/** Text of an HTML fragment: no tags, scripts or styles, entities read, white space folded. */
export function textOf(html) {
  return html
    .replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => ENTITIES[entity] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first sentences of a text, up to the summary limit: about two lines. */
export function summaryOf(text) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let summary = "";
  for (const sentence of sentences) {
    if (summary && (summary + sentence).length > SUMMARY_LIMIT) break;
    summary += sentence;
  }
  summary = summary.trim() || text;
  return summary.length > SUMMARY_LIMIT ? `${summary.slice(0, SUMMARY_LIMIT - 1).trimEnd()}…` : summary;
}

/** The guide's journeys: each one's title, its group, its steps' titles and captions, and its address. */
export function guideEntries(html) {
  const entries = [];
  const groups = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((match) => ({ at: match.index, name: textOf(match[1]) }));
  for (const match of html.matchAll(
    /<details class="guide-journey" id="([^"]+)">\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g,
  )) {
    const [, id, summaryHtml, body] = match;
    const group = groups.filter((candidate) => candidate.at < match.index).at(-1)?.name ?? "";
    // A note beside the title (the journey runs on HMRC's test service) goes in brackets after it.
    const note = summaryHtml.match(/<span class="guide-journey-note">([\s\S]*?)<\/span>/)?.[1];
    const title = textOf(summaryHtml.replace(/<span class="guide-journey-note">[\s\S]*?<\/span>/, ""));
    const steps = [...body.matchAll(/<h3 class="guide-step-title">([\s\S]*?)<\/h3>/g)].map((step) => textOf(step[1]));
    const captions = [...body.matchAll(/<p class="guide-caption">([\s\S]*?)<\/p>/g)].map((caption) => textOf(caption[1]));
    entries.push({
      source: "Submit guide",
      title: note ? `${title} (${textOf(note)})` : title,
      section: group,
      summary: summaryOf(captions.join(" ")),
      url: `${SUBMIT_ORIGIN}/guide.html#${id}`,
      text: [group, ...steps, ...captions].join(" ").slice(0, TEXT_LIMIT),
    });
  }
  return entries;
}

/** A page's sections, one per h2: its heading, its text, and the page address with the heading's id. */
export function pageEntries(html, page) {
  const title = textOf(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? page).replace(/ - DIY Accounting Submit$/, "");
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? html;
  const parts = main.split(/(?=<h2[\s>])/).slice(1);
  return parts.map((part) => {
    const heading = part.match(/^<h2([^>]*)>([\s\S]*?)<\/h2>/);
    const id = heading?.[1].match(/id="([^"]+)"/)?.[1];
    const text = textOf(part.slice(heading?.[0].length ?? 0));
    return {
      source: "Submit guide",
      title: `${title}: ${textOf(heading?.[2] ?? "")}`,
      section: title,
      summary: summaryOf(text),
      url: `${SUBMIT_ORIGIN}/${page}${id ? `#${id}` : ""}`,
      text: text.slice(0, TEXT_LIMIT),
    };
  });
}

/** The knowledge base's articles from its published index: question, description, keywords and address. */
export function knowledgeBaseEntries(tomlText) {
  return (toml.parse(tomlText).article ?? []).map((article) => ({
    source: "diya-gl knowledge base",
    title: article.question,
    section: article.category,
    summary: summaryOf(article.description ?? ""),
    url: `${SPREADSHEETS_ORIGIN}/articles/${article.id}.html`,
    text: [article.category, ...(article.keywords ?? [])].join(" "),
  }));
}

function fieldsOf(schema) {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    ...(property.type ? { type: Array.isArray(property.type) ? property.type.join(" or ") : property.type } : {}),
    ...(required.has(name) ? { required: true } : {}),
    description: property.description ?? "",
  }));
}

/** The DIYA-GL book format: the two files and the fields of each, from the package's v3 schemas. */
export function bookFormat(bookSchema, linesSchema, version) {
  return {
    diyaGlVersion: version,
    files: [
      { name: "book.toml", holds: "the business, the period, the chart of accounts, the tax settings and the registers, in TOML" },
      { name: "lines.jsonl", holds: "the transaction lines, one JSON object a line" },
    ],
    bookSections: fieldsOf(bookSchema),
    lineFields: fieldsOf(linesSchema),
    schemas: [`${SPREADSHEETS_ORIGIN}/schema/diya-gl-book-v3.schema.json`, `${SPREADSHEETS_ORIGIN}/schema/diya-gl-lines-v3.schema.json`],
    specification: "https://diya-gl.co.uk/spec.html",
  };
}

/** The CT600 box map: the form's version, its source, and each box's number, label, section and format. */
export function ct600BoxMap(tomlText) {
  const map = toml.parse(tomlText);
  return {
    version: map.version,
    source: map.source,
    boxes: (map.box ?? []).map((box) => ({
      number: box.number,
      label: box.label,
      section: box.section,
      format: box.format,
      ...(box.notes ? { notes: box.notes } : {}),
    })),
  };
}

async function knowledgeBaseArticles(fetchPublished) {
  if (fetchPublished) {
    const response = await fetch(KNOWLEDGE_BASE_URL);
    if (!response.ok) throw new Error(`${KNOWLEDGE_BASE_URL} answered ${response.status}`);
    return knowledgeBaseEntries(await response.text());
  }
  if (!existsSync(OUTPUT_PATH)) throw new Error(`no ${OUTPUT_PATH} to keep the knowledge base from; run with --fetch`);
  return JSON.parse(readFileSync(OUTPUT_PATH, "utf8")).entries.filter((entry) => entry.source === "diya-gl knowledge base");
}

/**
 * The help index, formatted as the committed file is.
 * @param {{fetchPublished?: boolean}} [options]
 * @returns {Promise<string>}
 */
export async function buildHelpIndex({ fetchPublished = false } = {}) {
  const entries = [
    ...guideEntries(readFileSync(join(PUBLIC_DIR, "guide.html"), "utf8")),
    ...PAGES.flatMap((page) => pageEntries(readFileSync(join(PUBLIC_DIR, page), "utf8"), page)),
    ...(await knowledgeBaseArticles(fetchPublished)),
  ];
  const version = JSON.parse(readFileSync(join(DIYA_GL_DIR, "package.json"), "utf8")).version;
  const index = {
    entries,
    bookFormat: bookFormat(
      JSON.parse(readFileSync(join(SCHEMA_DIR, "diya-gl-book-v3.schema.json"), "utf8")),
      JSON.parse(readFileSync(join(SCHEMA_DIR, "diya-gl-lines-v3.schema.json"), "utf8")),
      version,
    ),
    ct600: ct600BoxMap(readFileSync(CT600_PATH, "utf8")),
  };
  return prettier.format(JSON.stringify(index), { ...(await prettier.resolveConfig(OUTPUT_PATH)), filepath: OUTPUT_PATH });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = await buildHelpIndex({ fetchPublished: process.argv.includes("--fetch") });
  writeFileSync(OUTPUT_PATH, text);
  const index = JSON.parse(text);
  const bySource = Object.groupBy(index.entries, (entry) => entry.source);
  console.log(
    `wrote ${OUTPUT_PATH}: ${Object.entries(bySource)
      .map(([source, entries]) => `${entries.length} ${source}`)
      .join(", ")}, ${index.bookFormat.lineFields.length} line fields, ${index.ct600.boxes.length} CT600 boxes`,
  );
}
