// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-30 Build the Welsh pages
// - **Use when:** a page needs a Welsh copy at /cy/, an English string on a Welsh page changed, or a Welsh string needs a fix.
// - **Does:** Reads each English page in WELSH_PAGES, replaces every element marked data-i18n (and every attribute marked data-i18n-<attr>) with its Welsh text from i18n/cy.toml, sets lang="cy", the canonical and og:url and the paths of links and assets, adds HMRC's Welsh services block, and writes web/public/cy/<page>. A page with marks: "build" (the generated pages, and long static ones) is marked by the build as it reads it, with ids made from the first words and a hash of the English. It also finds every siteText("<id>", "<English>") call in the site's scripts and writes their Welsh text, and the list of pages with a Welsh copy, to web/public/lib/welsh-text.js, which page-chrome.js loads when the reader's language choice is Welsh. Each catalogue entry holds a hash of its English source; the unit test fails on a missing, stale or unused entry and on a committed Welsh page or text file that differs from the render.
// - **Run:** `npm run build:welsh`; `npx vitest run web/unit-tests/welsh-pages.test.js`
// - **Entry:** `scripts/build-welsh-pages.mjs:renderWelshPage`; `scripts/build-welsh-pages.mjs:catalogueProblems`
// - **Files:** scripts/build-welsh-pages.mjs, i18n/cy.toml, web/public/cy/, web/public/lib/welsh-text.js, web/public/get-started.html, web/public/widgets/page-chrome.js, web/unit-tests/welsh-pages.test.js
// - **Keywords:** welsh, cymraeg, cy, i18n, translation, hreflang, language switch, catalogue, stale translation
// - **Related:** SITE-14
// @end-capability

// Usage: node scripts/build-welsh-pages.mjs   (npm run build:welsh)
// A changed English string makes its catalogue entry stale: translate the new English, then put the hash this script prints in the entry.
//
// How a string gets its Welsh:
// - Static text on a page in WELSH_PAGES: mark the element data-i18n="<page id>.<name>" (an attribute:
//   data-i18n-<attr>="<id>"). The Welsh copy under cy/ carries the Welsh text in its place.
// - Text a script writes (a .page.js, page-chrome.js, the shared widgets, submit.js): siteText("<id>",
//   "<English>") with both arguments as double-quoted literals, and {name} for a value passed as
//   siteText(id, english, { name }). It follows the reader's language choice on every page. A .page.js
//   names its ids "<page id>.<name>" and starts with the helper `const siteText = (id, english, values)
//   => window.siteText ? ... : english`, so a unit test that loads it without page-chrome.js reads the
//   English (submitVat.page.js has it). Text that more than one page of a family writes uses the
//   family's id ("vat.<name>"); text of a shared widget uses "widget.<name>". A date, a number or an
//   amount follows the same choice: HmrcDisplayFormat.locale() gives "cy-GB" or "en-GB".
//   index.page.js keeps its older <template id="pageText"> spans, which follow the page.
// - Text that HMRC or Companies House sends back shows as received, in its own language.
// Each id has one [strings."<id>"] entry in i18n/cy.toml, under the section that names its prefix.
//
// How a page gets its Welsh copy: add it to WELSH_PAGES, give the English page the three hreflang
// links of expectedAlternates (a generator writes them with alternateLinksHtml), list both pages in
// sitemap.xml with the same links and in lighthouse.config.json, translate every string the build
// lists, and run this script. Mark the page's strings with data-i18n, or set marks: "build" to let the
// build mark it. A link in the Welsh text to a page with no Welsh copy is followed by "(yn Saesneg)".

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import toml from "@iarna/toml";
import prettier from "prettier";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = join(ROOT, "web", "public");
export const CATALOGUE_PATH = join(ROOT, "i18n", "cy.toml");
export const SITE_ORIGIN = "https://submit.diyaccounting.co.uk";
export const WELSH_TEXT_PATH = join(PUBLIC_DIR, "lib", "welsh-text.js");

const CH_MARK_ATTRIBUTES = ["data-sign-in-title", "data-sign-in-text", "data-required-message", "data-column"];

// The pages with a Welsh copy. A page that a script writes is built after it: run its generator, then this.
export const WELSH_PAGES = [
  { id: "index", en: "index.html", cy: "cy/index.html", enUrl: `${SITE_ORIGIN}/` },
  { id: "get-started", en: "get-started.html", cy: "cy/get-started.html", enUrl: `${SITE_ORIGIN}/get-started.html` },
  { id: "tools", en: "tools.html", cy: "cy/tools.html", enUrl: `${SITE_ORIGIN}/tools.html`, marks: "build" },
  { id: "bundles", en: "bundles.html", cy: "cy/bundles.html", enUrl: `${SITE_ORIGIN}/bundles.html`, marks: "build" },
  { id: "pass", en: "pass.html", cy: "cy/pass.html", enUrl: `${SITE_ORIGIN}/pass.html`, marks: "build" },
  // The sign-in page; its OAuth callbacks stay at their registered English addresses.
  { id: "login", en: "auth/login.html", cy: "cy/auth/login.html", enUrl: `${SITE_ORIGIN}/auth/login.html`, marks: "build" },
  { id: "spreadsheets", en: "spreadsheets.html", cy: "cy/spreadsheets.html", enUrl: `${SITE_ORIGIN}/spreadsheets.html`, marks: "build" },
  { id: "mtd-calendar", en: "mtd-calendar.html", cy: "cy/mtd-calendar.html", enUrl: `${SITE_ORIGIN}/mtd-calendar.html`, marks: "build" },
  { id: "rates", en: "rates.html", cy: "cy/rates.html", enUrl: `${SITE_ORIGIN}/rates.html`, marks: "build" },
  // The pages a customer relies on. help-page.js reads the questions of the Welsh copy from its own markup.
  ...["privacy", "terms", "accessibility", "help"].map((id) => ({
    id,
    en: `${id}.html`,
    cy: `cy/${id}.html`,
    enUrl: `${SITE_ORIGIN}/${id}.html`,
    marks: "build",
  })),
  // LANG10a: the HMRC VAT pages and the receipts page, ids vat-* and receipt-*.
  ...[
    ["vat-submit", "hmrc/vat/submitVat.html"],
    ["vat-obligations", "hmrc/vat/vatObligations.html"],
    ["vat-liabilities", "hmrc/vat/vatLiabilities.html"],
    ["vat-payments", "hmrc/vat/vatPayments.html"],
    ["vat-penalties", "hmrc/vat/vatPenalties.html"],
    ["vat-view-return", "hmrc/vat/viewVatReturn.html"],
    ["receipts", "hmrc/receipt/receipts.html"],
  ].map(([id, en]) => ({ id, en, cy: `cy/${en}`, enUrl: `${SITE_ORIGIN}/${en}`, marks: "build" })),

  // LANG10b: the Income Tax pages, ids itsa-*.
  ...[
    ["itsa-dashboard", "hmrc/itsa/dashboard.html"],
    ["itsa-business-details", "hmrc/itsa/businessDetails.html"],
    ["itsa-obligations", "hmrc/itsa/obligations.html"],
    ["itsa-se-period", "hmrc/itsa/selfEmploymentPeriod.html"],
    ["itsa-se-periods", "hmrc/itsa/selfEmploymentPeriods.html"],
    ["itsa-se-view", "hmrc/itsa/selfEmploymentPeriodView.html"],
    ["itsa-se-amend", "hmrc/itsa/selfEmploymentPeriodAmend.html"],
    ["itsa-annual", "hmrc/itsa/annualSubmission.html"],
    ["itsa-calculation", "hmrc/itsa/taxCalculation.html"],
    ["itsa-uk-period", "hmrc/itsa/ukPropertyPeriod.html"],
    ["itsa-uk-periods", "hmrc/itsa/ukPropertyPeriods.html"],
    ["itsa-uk-view", "hmrc/itsa/ukPropertyPeriodView.html"],
    ["itsa-uk-amend", "hmrc/itsa/ukPropertyPeriodAmend.html"],
    ["itsa-uk-annual", "hmrc/itsa/ukPropertyAnnualSubmission.html"],
    ["itsa-uk-adjustments", "hmrc/itsa/ukPropertyAdjustments.html"],
    ["itsa-fp-details", "hmrc/itsa/foreignPropertyDetails.html"],
    ["itsa-fp-period", "hmrc/itsa/foreignPropertyPeriod.html"],
    ["itsa-fp-periods", "hmrc/itsa/foreignPropertyPeriods.html"],
    ["itsa-fp-view", "hmrc/itsa/foreignPropertyPeriodView.html"],
    ["itsa-fp-amend", "hmrc/itsa/foreignPropertyPeriodAmend.html"],
    ["itsa-fp-annual", "hmrc/itsa/foreignPropertyAnnualSubmission.html"],
    ["itsa-fp-adjustments", "hmrc/itsa/foreignPropertyAdjustments.html"],
    ["itsa-adjustments", "hmrc/itsa/adjustments.html"],
    ["itsa-tla", "hmrc/itsa/taxLiabilityAdjustments.html"],
    ["itsa-losses", "hmrc/itsa/lossesAndClaims.html"],
    ["itsa-final", "hmrc/itsa/finalDeclaration.html"],
  ].map(([id, en]) => ({ id, en, cy: `cy/${en}`, enUrl: `${SITE_ORIGIN}/${en}`, marks: "build" })),

  // LANG11a, LANG11b: the Companies House pages, ids ch-*.
  // The filing callback has no copy: its address is registered with Companies House, and its script writes its text.
  // The sign-in panel, the form's error summary and the ledger's phone layout read the markAttributes.
  {
    id: "ch-company-search",
    en: "companies-house/companySearch.html",
    cy: "cy/companies-house/companySearch.html",
    enUrl: `${SITE_ORIGIN}/companies-house/companySearch.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-watch-list",
    en: "companies-house/watchList.html",
    cy: "cy/companies-house/watchList.html",
    enUrl: `${SITE_ORIGIN}/companies-house/watchList.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-filings",
    en: "companies-house/filings.html",
    cy: "cy/companies-house/filings.html",
    enUrl: `${SITE_ORIGIN}/companies-house/filings.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-micro-entity",
    en: "companies-house/fileMicroEntityAccounts.html",
    cy: "cy/companies-house/fileMicroEntityAccounts.html",
    enUrl: `${SITE_ORIGIN}/companies-house/fileMicroEntityAccounts.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-small-company",
    en: "companies-house/fileSmallCompanyAccounts.html",
    cy: "cy/companies-house/fileSmallCompanyAccounts.html",
    enUrl: `${SITE_ORIGIN}/companies-house/fileSmallCompanyAccounts.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-tax-return",
    en: "companies-house/fileCompanyTaxReturn.html",
    cy: "cy/companies-house/fileCompanyTaxReturn.html",
    enUrl: `${SITE_ORIGIN}/companies-house/fileCompanyTaxReturn.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-confirmation-statement",
    en: "companies-house/fileConfirmationStatement.html",
    cy: "cy/companies-house/fileConfirmationStatement.html",
    enUrl: `${SITE_ORIGIN}/companies-house/fileConfirmationStatement.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-registered-office",
    en: "companies-house/changeRegisteredOffice.html",
    cy: "cy/companies-house/changeRegisteredOffice.html",
    enUrl: `${SITE_ORIGIN}/companies-house/changeRegisteredOffice.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-registered-email",
    en: "companies-house/changeRegisteredEmail.html",
    cy: "cy/companies-house/changeRegisteredEmail.html",
    enUrl: `${SITE_ORIGIN}/companies-house/changeRegisteredEmail.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-cease-psc",
    en: "companies-house/ceasePsc.html",
    cy: "cy/companies-house/ceasePsc.html",
    enUrl: `${SITE_ORIGIN}/companies-house/ceasePsc.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
  {
    id: "ch-mcp-codes",
    en: "companies-house/mcpCodes.html",
    cy: "cy/companies-house/mcpCodes.html",
    enUrl: `${SITE_ORIGIN}/companies-house/mcpCodes.html`,
    marks: "build",
    markAttributes: CH_MARK_ATTRIBUTES,
  },
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

// The hreflang links of a page with a Welsh copy, for a generator to put after the canonical link.
export function alternateLinksHtml(file, indent = "    ") {
  const page = WELSH_PAGES.find((entry) => entry.en === file);
  if (!page) return "";
  return expectedAlternates(page)
    .map(({ hreflang, href }) => `\n${indent}<link rel="alternate" hreflang="${hreflang}" href="${href}" />`)
    .join("");
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

// A page with marks: "build" carries no data-i18n marks of its own: the build marks it as it reads it.
// A page that a script generates uses this, so its generator stays as it is, and so does a long page
// of static text.
export function readEnglishPage(page) {
  const html = readFileSync(join(PUBLIC_DIR, page.en), "utf-8");
  return page.marks === "build" ? markPage(html, page) : html;
}

const MARKED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "th",
  "td",
  "caption",
  "dt",
  "dd",
  "figcaption",
  "summary",
  "label",
  "button",
];
const INLINE_TAGS = ["a", "span", "strong", "option", "legend"];
const BLOCK_TAG = /<(p|ul|ol|li|div|table|tr|td|th|h[1-6]|section|blockquote|dl|dt|dd|figure|details|caption|form|nav|aside)[\s>]/;
const MARKED_ATTRIBUTES = ["data-label", "aria-label", "title", "placeholder", "alt", "data-sign-in-title", "data-sign-in-text"];

function slug(text) {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join("-");
}

// The id of a string that the build marks: the page id, the first words of the English and a hash of
// all of it, so a changed English string gets a new id and the catalogue check lists it.
function markedId(page, source) {
  return `${page.id}.${slug(source) || "text"}-${sourceHash(source).slice(0, 6)}`;
}

// Marks every element of the header and main that holds text and no block element (and the
// attributes that a reader sees or hears, with the page's own markAttributes: text that a script
// reads from an attribute). It skips the skip link, the chrome's fallback link, each quote of a
// source (a quote keeps the words of its English source) and each element marked translate="no"
// with all it holds (the HMRC sandbox scenario names of the developer options).
export function markPage(html, page) {
  const bodyStart = html.indexOf("<body>");
  const mainEnd = html.indexOf("</main>");
  if (bodyStart === -1 || mainEnd === -1) throw new Error(`${page.en}: no <body> or </main>`);
  let body = html.slice(bodyStart, mainEnd);
  const edits = [];
  const keptEnglish = () =>
    [...body.matchAll(/<blockquote\b[\s\S]*?<\/blockquote>|<([a-z][a-z0-9]*)\b[^>]*\stranslate="no"[^>]*>[\s\S]*?<\/\1\s*>/g)].map(
      (kept) => [kept.index, kept.index + kept[0].length],
    );
  const covered = keptEnglish();
  const inside = (index) => covered.some(([start, end]) => index >= start && index < end);
  // Block elements first; then the inline ones (a link, a span, an option) that no marked block holds.
  for (const tags of [MARKED_TAGS, INLINE_TAGS]) {
    for (const match of body.matchAll(new RegExp(`<(${tags.join("|")})\\b([^>]*)>`, "g"))) {
      const [tag, name, attributes] = match;
      if (inside(match.index)) continue;
      const innerStart = match.index + tag.length;
      const closing = new RegExp(`</${name}\\s*>`, "g");
      closing.lastIndex = innerStart;
      const close = closing.exec(body)?.index ?? -1;
      if (close === -1) continue;
      if (/\sdata-i18n=/.test(attributes) || /class="[^"]*(skip-link|chrome-fallback)/.test(attributes)) {
        covered.push([match.index, close]);
        continue;
      }
      const inner = body.slice(innerStart, close);
      if (new RegExp(`<${name}[\\s>]`).test(inner) || BLOCK_TAG.test(inner) || /<(script|template|svg)[\s>]/.test(inner)) continue;
      if (!/[A-Za-z]/.test(inner.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, ""))) continue;
      edits.push({ at: match.index + 1 + name.length, text: ` data-i18n="${markedId(page, inner)}"` });
      covered.push([match.index, close]);
    }
  }
  for (const edit of edits.sort((a, b) => b.at - a.at)) body = body.slice(0, edit.at) + edit.text + body.slice(edit.at);
  const keptRanges = keptEnglish();
  body = body.replace(/<([a-z][a-z0-9]*)\b([^>]*)>/g, (tag, name, attributes, offset) => {
    if (keptRanges.some(([start, end]) => offset >= start && offset < end)) return tag;
    let marks = "";
    for (const attribute of [...MARKED_ATTRIBUTES, ...(page.markAttributes || [])]) {
      const value = attributeValue(tag, attribute);
      if (value === null || !/[A-Za-z]/.test(value) || new RegExp(`\\sdata-i18n-${attribute}=`).test(attributes)) continue;
      marks += ` data-i18n-${attribute}="${markedId(page, value)}"`;
    }
    return marks ? tag.replace(/\s*(\/?)>$/, `${marks}$1>`) : tag;
  });
  let head = html.slice(0, bodyStart);
  head = head.replace(
    /<meta\s+(name="description"|property="og:title"|property="og:description")\s+content="([^"]*)"/g,
    (whole, which, value) => {
      const name = which.replace(/^(name|property)="|"$/g, "").replace(":", "-");
      return `${whole} data-i18n-content="${page.id}.${name}-${sourceHash(value).slice(0, 6)}"`;
    },
  );
  return head + body + html.slice(mainEnd);
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

// The site's own scripts: everything under web/public but the generated and the third-party files.
const SCRIPT_SKIP = [/^cy\//, /^docs\//, /^tests\//, /^lib\/welsh-text\.js$/, /\.bundle\.js$/, /\.min\.js$/];

export function siteScriptPaths(dir = PUBLIC_DIR, prefix = "") {
  const paths = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) paths.push(...siteScriptPaths(join(dir, entry.name), `${relative}/`));
    else if (/\.m?js$/.test(entry.name) && !SCRIPT_SKIP.some((pattern) => pattern.test(relative))) paths.push(relative);
  }
  return paths.sort();
}

const SITE_TEXT_PATTERN = /\bsiteText\(\s*"([a-z0-9][a-z0-9.-]*)"\s*,\s*"((?:[^"\\\n]|\\.)*)"/g;

// Every siteText("<id>", "<English>") call in the site's scripts, as { id, source, file }.
export function scriptStrings(paths = siteScriptPaths()) {
  const found = [];
  for (const file of paths) {
    const text = readFileSync(join(PUBLIC_DIR, file), "utf-8");
    for (const [, id, raw] of text.matchAll(SITE_TEXT_PATTERN)) found.push({ id, source: JSON.parse(`"${raw}"`), file });
  }
  return found;
}

// Missing, stale, untranslated and unused entries, one message each.
export function catalogueProblems(catalogue = loadCatalogue(), pages = WELSH_PAGES, scripts = scriptStrings()) {
  const problems = [];
  const sources = new Map();
  const remember = (id, source) => {
    const hash = sourceHash(source);
    if (sources.has(id) && sources.get(id) !== hash) problems.push(`${id}: used twice with different English text`);
    sources.set(id, hash);
  };
  for (const page of pages) {
    for (const { id, source } of englishStrings(readEnglishPage(page), page)) remember(id, source);
  }
  for (const { id, source } of scripts) remember(id, source);
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

// A relative href or src on an English page, as seen from its Welsh copy one folder deeper under
// web/public/cy/. A link to a page with a Welsh copy goes to the copy; any other link reaches the
// English file.
function relocate(url, pages, page) {
  if (url === "" || /^(\/|#|\$\{|[a-z][a-z0-9+.-]*:)/i.test(url)) return url;
  const bare = url.replace(/^\.\//, "");
  const suffixStart = bare.search(/[?#]/);
  const path = suffixStart === -1 ? bare : bare.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : bare.slice(suffixStart);
  const resolved = posix.join(posix.dirname(page.en), path || ".").replace(/^\.\/?/, "");
  const target = resolved === "" || resolved.endsWith("/") ? `${resolved}index.html` : resolved;
  const welsh = pages.find((entry) => entry.en === target);
  if (welsh) return posix.relative(posix.dirname(page.cy), welsh.cy) + suffix;
  const folder = path === "" || path.endsWith("/") ? "/" : "";
  return posix.relative(posix.dirname(page.cy), resolved.replace(/\/$/, "") || ".") + folder + suffix;
}

// HMRC's Welsh services. The HMRC Assist line names the VAT Return, so only the VAT pages and the
// receipts page carry it.
// The line under a source quote that tax-sources.mjs writes: "Source: <a>GOV.UK, title</a> (checked 13 November 2026)",
// or legislation.gov.uk in place of GOV.UK for a statute.
// The quote keeps its English words, each paragraph marked lang="en-GB"; the line is ours, so the copy
// writes it in Welsh with the date in Welsh month names, and marks only the linked GOV.UK title as English.
const SOURCE_FOOTER_PATTERN =
  /<footer>\s*Source:\s*(<a\b[\s\S]*?<\/a\s*>)\s*\(checked\s+(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})\)\s*<\/footer>/g;
const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WELSH_MONTHS = [
  "Ionawr",
  "Chwefror",
  "Mawrth",
  "Ebrill",
  "Mai",
  "Mehefin",
  "Gorffennaf",
  "Awst",
  "Medi",
  "Hydref",
  "Tachwedd",
  "Rhagfyr",
];

function welshSourceFooter(catalogue, link, day, month, year) {
  const entry = catalogue.shared["source-line"];
  if (!entry || !entry.cy) throw new Error("shared.source-line: no Welsh text in i18n/cy.toml");
  const monthIndex = ENGLISH_MONTHS.indexOf(month);
  if (monthIndex === -1) throw new Error(`source line: unknown month ${month}`);
  const englishLink = link.replace(/^<a\b/, '<a lang="en-GB" hreflang="en"');
  const line = entry.cy.trim().replace("{link}", englishLink).replace("{date}", `${day} ${WELSH_MONTHS[monthIndex]} ${year}`);
  return `<footer>${line}</footer>`;
}

// HMRC's Welsh services block tells the reader that Submit sends them to HMRC to sign in, which a
// Companies House page does not do, so the Companies House pages carry none.
function carriesHmrcWelshServices(page) {
  return !page.id.startsWith("ch-");
}

function welshServicesBlock(catalogue, page) {
  if (!carriesHmrcWelshServices(page)) return "";
  const entry = catalogue.shared["hmrc-welsh-services"];
  if (!entry || !entry.cy) throw new Error("shared.hmrc-welsh-services: no Welsh text in i18n/cy.toml");
  let block = entry.cy.trim();
  if (page.id.startsWith("vat-") || page.id === "receipts") {
    const vat = catalogue.shared["hmrc-welsh-services-vat"];
    if (!vat || !vat.cy) throw new Error("shared.hmrc-welsh-services-vat: no Welsh text in i18n/cy.toml");
    const firstParagraphEnd = block.indexOf("</p>\n") + "</p>\n".length;
    if (firstParagraphEnd < "</p>\n".length) throw new Error("shared.hmrc-welsh-services: no paragraph to follow");
    block = `${block.slice(0, firstParagraphEnd)}${vat.cy.trim()}\n${block.slice(firstParagraphEnd)}`;
  }
  return `<aside class="welsh-services" aria-labelledby="welshServicesHeading" data-welsh-services>${block}</aside>`;
}

export async function renderWelshPage(page, catalogue = loadCatalogue(), pages = WELSH_PAGES) {
  const english = readEnglishPage(page);
  for (const { hreflang, href } of expectedAlternates(page)) {
    if (!english.includes(`<link rel="alternate" hreflang="${hreflang}" href="${href}" />`)) {
      throw new Error(`${page.en}: missing <link rel="alternate" hreflang="${hreflang}" href="${href}" />`);
    }
  }
  // A capability header names the English file; the copy is generated, so it carries none.
  let html = english.replace(/<!-- @capability [\s\S]*?@end-capability -->\n?/g, "");
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
  // markPage leaves the skip link unmarked, so a page the build marks gets the shared Welsh here.
  html = html.replace(/<a ([^>]*class="skip-link"[^>]*)>[^<]*<\/a>/g, (whole, attributes) =>
    /\sdata-i18n=/.test(` ${attributes}`)
      ? whole
      : `<a ${attributes} data-i18n="common.skip-link">${welshText(catalogue, "common.skip-link")}</a>`,
  );
  html = replaceOnce(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${welshUrl(page)}$2`, `canonical link in ${page.en}`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${welshUrl(page)}$2`);
  html = replaceOnce(html, /<\/main>/, `${welshServicesBlock(catalogue, page)}</main>`, `</main> in ${page.en}`);
  html = html.replace(/<blockquote class="(source-quote[^"]*)">([\s\S]*?)<\/blockquote>/g, (whole, className, inner) => {
    const quotes = inner.replace(/<p>/g, '<p lang="en-GB">');
    return `<blockquote class="${className}">${quotes.replace(SOURCE_FOOTER_PATTERN, (footer, link, day, month, year) => welshSourceFooter(catalogue, link, day, month, year))}</blockquote>`;
  });
  html = html.replace(/(\s(?:href|src)=")([^"]*)(")/g, (whole, start, url, end) => `${start}${relocate(url, pages, page)}${end}`);
  html = replaceOnce(
    html,
    /(<script src="([^"]*)widgets\/page-chrome\.js"><\/script>)/,
    (tag, whole, prefix) => `<script src="${prefix}lib/welsh-text.js"></script>\n${tag}`,
    `page-chrome.js script in ${page.en}`,
  );
  html = html.replace(`<!-- ${page.en} -->`, `<!-- ${page.cy} -->`);
  html = html.replace(
    /(<!-- Copyright \(C\) [^>]*-->)/,
    `$1\n<!-- Built by scripts/build-welsh-pages.mjs from ${page.en} and i18n/cy.toml: edit those and run npm run build:welsh. -->`,
  );
  const options = await prettier.resolveConfig(join(PUBLIC_DIR, page.cy));
  return prettier.format(html, { ...options, parser: "html" });
}

// The Welsh text of every siteText call and the pages that have a Welsh copy, for page-chrome.js.
export async function renderWelshText(catalogue = loadCatalogue(), scripts = scriptStrings(), pages = WELSH_PAGES) {
  const ids = [...new Set(scripts.map(({ id }) => id))].sort();
  const text = Object.fromEntries(ids.map((id) => [id, welshText(catalogue, id)]));
  const source = [
    "// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0",
    "// Copyright (C) 2006-2026 DIY Accounting Limited",
    "",
    "// Built by scripts/build-welsh-pages.mjs from i18n/cy.toml and the siteText calls in the site's scripts:",
    "// edit those and run npm run build:welsh. page-chrome.js loads this file when the language choice is Welsh.",
    "",
    `window.WELSH_TEXT = ${JSON.stringify(text, null, 2)};`,
    "",
    `window.WELSH_COPIES = ${JSON.stringify(pages.map((page) => page.en))};`,
    "",
  ].join("\n");
  const options = await prettier.resolveConfig(WELSH_TEXT_PATH);
  return prettier.format(source, { ...options, parser: "babel" });
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
  writeFileSync(WELSH_TEXT_PATH, await renderWelshText(catalogue));
  console.log("wrote lib/welsh-text.js");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildWelshPages().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
