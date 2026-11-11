// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-30 Build the Welsh pages
// - **Use when:** a page needs a Welsh copy at /cy/, an English string on a Welsh page changed, or a Welsh string needs a fix.
// - **Does:** Reads each English page in WELSH_PAGES, replaces every element marked data-i18n (and every attribute marked data-i18n-<attr>) with its Welsh text from i18n/cy.toml, sets lang="cy", the canonical and og:url and the paths of links and assets, adds HMRC's Welsh services block, and writes web/public/cy/<page>. Each catalogue entry holds a hash of its English source; the unit test fails on a missing, stale or unused entry and on a committed Welsh page that differs from the render.
// - **Run:** `npm run build:welsh`; `npx vitest run web/unit-tests/welsh-pages.test.js`
// - **Entry:** `scripts/build-welsh-pages.mjs:renderWelshPage`; `scripts/build-welsh-pages.mjs:catalogueProblems`
// - **Files:** scripts/build-welsh-pages.mjs, i18n/cy.toml, web/public/cy/, web/public/get-started.html, web/public/widgets/page-chrome.js, web/unit-tests/welsh-pages.test.js
// - **Keywords:** welsh, cymraeg, cy, i18n, translation, hreflang, language switch, catalogue, stale translation
// - **Related:** SITE-14
// @end-capability

// Usage: node scripts/build-welsh-pages.mjs   (npm run build:welsh)
// A changed English string makes its catalogue entry stale: translate the new English, then put the hash this script prints in the entry.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import toml from "@iarna/toml";
import prettier from "prettier";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = join(ROOT, "web", "public");
export const CATALOGUE_PATH = join(ROOT, "i18n", "cy.toml");
export const SITE_ORIGIN = "https://submit.diyaccounting.co.uk";

export const WELSH_PAGES = [
  { id: "index", en: "index.html", cy: "cy/index.html", enUrl: `${SITE_ORIGIN}/` },
  { id: "get-started", en: "get-started.html", cy: "cy/get-started.html", enUrl: `${SITE_ORIGIN}/get-started.html` },
];

export function welshUrl(page) {
  return `${SITE_ORIGIN}/${page.cy}`;
}

export function expectedAlternates(page) {
  return [
    { hreflang: "en-GB", href: page.enUrl },
    { hreflang: "cy", href: welshUrl(page) },
    { hreflang: "x-default", href: page.enUrl },
  ];
}

export function sourceHash(html) {
  return createHash("sha256").update(normaliseSource(html)).digest("hex").slice(0, 12);
}

function normaliseSource(html) {
  return html.replace(/\s+/g, " ").trim();
}

export function loadCatalogue(text = readFileSync(CATALOGUE_PATH, "utf-8")) {
  const parsed = toml.parse(text);
  return { strings: parsed.strings || {}, shared: parsed.shared || {} };
}

export function readEnglishPage(page) {
  return readFileSync(join(PUBLIC_DIR, page.en), "utf-8");
}

const TITLE_PATTERN = /<title>([\s\S]*?)<\/title>/;
const ELEMENT_PATTERN = /<([a-z][a-z0-9]*)\b([^>]*?)\sdata-i18n="([^"]+)"([^>]*)>([\s\S]*?)<\/\1\s*>/g;
const TAG_PATTERN = /<[a-z][a-z0-9]*\b[^>]*\sdata-i18n-[a-z-]+="[^"]*"[^>]*>/g;
const ATTRIBUTE_MARK_PATTERN = /\sdata-i18n-([a-z-]+)="([^"]+)"/g;

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
}

// Every marked string on an English page, as { id, source }. The <title> is "<page id>.title".
export function englishStrings(html, page) {
  const title = html.match(TITLE_PATTERN);
  if (!title) throw new Error(`${page.en}: no <title>`);
  const found = [{ id: `${page.id}.title`, source: title[1] }];
  for (const match of html.matchAll(ELEMENT_PATTERN)) {
    const [, tag, , id, , inner] = match;
    if (new RegExp(`<${tag}[\\s>]`).test(inner))
      throw new Error(`data-i18n="${id}" holds a nested <${tag}>; mark the inner element instead`);
    found.push({ id, source: inner });
  }
  for (const tagMatch of html.matchAll(TAG_PATTERN)) {
    const tag = tagMatch[0];
    for (const [, name, id] of tag.matchAll(ATTRIBUTE_MARK_PATTERN)) {
      const value = attributeValue(tag, name);
      if (value === null) throw new Error(`data-i18n-${name}="${id}" is on a tag with no ${name} attribute`);
      found.push({ id, source: value });
    }
  }
  return found;
}

// Missing, stale, untranslated and unused entries, one message each.
export function catalogueProblems(catalogue = loadCatalogue(), pages = WELSH_PAGES) {
  const problems = [];
  const sources = new Map();
  for (const page of pages) {
    for (const { id, source } of englishStrings(readEnglishPage(page), page)) {
      const hash = sourceHash(source);
      if (sources.has(id) && sources.get(id) !== hash) problems.push(`${id}: used twice with different English text`);
      sources.set(id, hash);
    }
  }
  for (const [id, hash] of sources) {
    const entry = catalogue.strings[id];
    if (!entry) problems.push(`${id}: missing from i18n/cy.toml (hash ${hash})`);
    else if (entry.hash !== hash) problems.push(`${id}: stale, the English changed (hash ${hash}, catalogue ${entry.hash})`);
    else if (!entry.cy || !entry.cy.trim()) problems.push(`${id}: no Welsh text`);
  }
  for (const id of Object.keys(catalogue.strings)) {
    if (!sources.has(id)) problems.push(`${id}: unused, no English page marks it`);
  }
  for (const [id, entry] of Object.entries(catalogue.shared)) {
    if (!entry.cy || !entry.cy.trim()) problems.push(`shared.${id}: no Welsh text`);
  }
  return problems;
}

function escapeAttribute(text) {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function welshText(catalogue, id) {
  const entry = catalogue.strings[id];
  if (!entry || !entry.cy) throw new Error(`${id}: no Welsh text in i18n/cy.toml`);
  return entry.cy.trim();
}

function replaceOnce(html, pattern, replacement, what) {
  const count = html.match(new RegExp(pattern.source, "g"))?.length ?? 0;
  if (count !== 1) throw new Error(`expected one ${what}, found ${count}`);
  return html.replace(pattern, replacement);
}

// A relative href or src on an English page, as seen from web/public/cy/.
function relocate(url, pages) {
  if (url === "" || /^(\/|#|\$\{|[a-z][a-z0-9+.-]*:)/i.test(url)) return url;
  const bare = url.replace(/^\.\//, "");
  const suffixStart = bare.search(/[?#]/);
  const path = suffixStart === -1 ? bare : bare.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : bare.slice(suffixStart);
  const target = path === "" ? "index.html" : path;
  const welsh = pages.find((page) => page.en === target);
  if (welsh) return welsh.cy.replace(/^cy\//, "") + suffix;
  return `../${bare}`;
}

function welshServicesBlock(catalogue) {
  const entry = catalogue.shared["hmrc-welsh-services"];
  if (!entry || !entry.cy) throw new Error("shared.hmrc-welsh-services: no Welsh text in i18n/cy.toml");
  return `<aside class="welsh-services" aria-labelledby="welshServicesHeading" data-welsh-services>${entry.cy.trim()}</aside>`;
}

export async function renderWelshPage(page, catalogue = loadCatalogue(), pages = WELSH_PAGES) {
  const english = readEnglishPage(page);
  for (const { hreflang, href } of expectedAlternates(page)) {
    if (!english.includes(`<link rel="alternate" hreflang="${hreflang}" href="${href}" />`)) {
      throw new Error(`${page.en}: missing <link rel="alternate" hreflang="${hreflang}" href="${href}" />`);
    }
  }
  let html = english;
  html = replaceOnce(html, /<html lang="en-GB">/, '<html lang="cy">', `<html lang="en-GB"> in ${page.en}`);
  const titleId = `${page.id}.title`;
  html = html.replace(TITLE_PATTERN, () => `<title>${welshText(catalogue, titleId)}</title>`);
  html = html.replace(ELEMENT_PATTERN, (whole, tag, before, id, after) => {
    return `<${tag}${before} data-i18n="${id}"${after}>${welshText(catalogue, id)}</${tag}>`;
  });
  html = html.replace(TAG_PATTERN, (tag) => {
    let result = tag;
    for (const [, name, id] of tag.matchAll(ATTRIBUTE_MARK_PATTERN)) {
      result = result.replace(new RegExp(`(\\s${name}=")[^"]*(")`), `$1${escapeAttribute(welshText(catalogue, id))}$2`);
    }
    return result;
  });
  html = replaceOnce(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${welshUrl(page)}$2`, `canonical link in ${page.en}`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${welshUrl(page)}$2`);
  html = replaceOnce(html, /<\/main>/, `${welshServicesBlock(catalogue)}</main>`, `</main> in ${page.en}`);
  html = html.replace(/(\s(?:href|src)=")([^"]*)(")/g, (whole, start, url, end) => `${start}${relocate(url, pages)}${end}`);
  html = html.replace(`<!-- ${page.en} -->`, `<!-- ${page.cy} -->`);
  html = html.replace(
    /(<!-- Copyright \(C\) [^>]*-->)/,
    `$1\n<!-- Built by scripts/build-welsh-pages.mjs from ${page.en} and i18n/cy.toml: edit those and run npm run build:welsh. -->`,
  );
  const options = await prettier.resolveConfig(join(PUBLIC_DIR, page.cy));
  return prettier.format(html, { ...options, parser: "html" });
}

export async function buildWelshPages() {
  const problems = catalogueProblems();
  if (problems.length > 0) throw new Error(`i18n/cy.toml needs attention:\n${problems.join("\n")}`);
  const catalogue = loadCatalogue();
  for (const page of WELSH_PAGES) {
    const outputPath = join(PUBLIC_DIR, page.cy);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, await renderWelshPage(page, catalogue));
    console.log(`wrote ${page.cy}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildWelshPages().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
