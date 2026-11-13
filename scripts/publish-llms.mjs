#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-214 Write llms.txt, llms-full.txt and a Markdown copy of each page into the deployed web root
// - **Use when:** an assistant or a crawler that reads Markdown must find the site's pages, what Submit files and what it costs, in the pages that the environment lists.
// - **Does:** publish-llms.mjs reads the sitemap.xml of a built web root, so it covers the pages that the environment lists and any page that a later change adds. For each page it writes `<page>.md` beside the page (the page's main content as Markdown, read from the parsed page) and adds `<link rel="alternate" type="text/markdown">` to the page's head, once. It writes llms.txt (the site name, one paragraph from the catalogue for the environment, one linked line per page) and llms-full.txt (the Markdown of every page, then the FAQ entries that the environment lists). The page files in web/public do not change. EdgeStack serves `*.md` with X-Robots-Tag: noindex. deploy-stacks.yml, deploy-app.yml and deploy-app.js run it after publish-content.mjs.
// - **Run:** `node scripts/publish-llms.mjs <web-root> <environment-name>`
// - **Entry:** `scripts/publish-llms.mjs:publishLlms`; `scripts/publish-llms.mjs:pageMarkdown`
// - **Files:** scripts/publish-llms.mjs, app/unit-tests/scripts/publishLlms.test.js, scripts/deploy-app.js, .github/workflows/deploy-stacks.yml, .github/workflows/deploy-app.yml, infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java
// - **Keywords:** llms.txt, llms-full.txt, markdown, alternate link, assistant, crawler, noindex, sitemap, catalogue environments
// - **Related:** OPS-143, OPS-213
// @end-capability

// Usage: node scripts/publish-llms.mjs <web-root> <environment-name>   (the deploy workflows and deploy-app.js)
// Run it after publish-sitemap.mjs and publish-content.mjs: the sitemap lists the pages, and the
// bundles and home pages hold their lists. A real HTML parser reads each page, because a regular
// expression cannot strip HTML safely.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import { Window } from "happy-dom";
import { isActivityListedInEnvironment, parseCatalog } from "../app/services/productCatalog.js";
import { listedBundles, priceSentence } from "./publish-content.mjs";

const SKIPPED_TAGS = new Set(["script", "style", "noscript", "template", "svg", "iframe", "button", "input", "select", "textarea"]);
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "address",
  "details",
  "summary",
  "nav",
  "section",
  "aside",
  "article",
  "header",
  "footer",
  "main",
  "figure",
  "figcaption",
  "blockquote",
  "dl",
  "dt",
  "dd",
]);
const FILING_PAGE_FOLDERS = ["hmrc/", "companies-house/"];
const LIST_TAGS = new Set(["ul", "ol"]);
const TABLE_TAGS = new Set(["table", "thead", "tbody", "tfoot"]);
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const LINE_BREAK = " ";
const ALTERNATE_LINK_TYPE = 'type="text/markdown"';

function squash(text) {
  return text.replace(/\s+/g, " ").trim();
}

// happy-dom ends the document at a comment that holds a closing script tag, such as a commented-out
// script element, so comments go before the parse. A comment holds no page content.
function withoutComments(html) {
  let output = "";
  let position = 0;
  while (position < html.length) {
    const start = html.indexOf("<!--", position);
    if (start === -1) break;
    const end = html.indexOf("-->", start + 4);
    output += html.slice(position, start);
    position = end === -1 ? html.length : end + 3;
  }
  return output + html.slice(position);
}

function parseHtml(html) {
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
    },
  });
  window.document.write(withoutComments(html));
  return window;
}

function isSkipped(element) {
  return SKIPPED_TAGS.has(element.localName) || element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true";
}

// A link is kept only when it opens a page, a mailbox or a dialler; any other scheme leaves its text.
const LINKED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function inlineMarkdown(node, pageUrl) {
  if (node.nodeType === TEXT_NODE) return node.textContent;
  if (node.nodeType !== ELEMENT_NODE || isSkipped(node)) return "";
  const name = node.localName;
  if (name === "br") return LINE_BREAK;
  if (name === "img") return squash(node.getAttribute("alt") ?? "");
  const inner = Array.from(node.childNodes, (child) => inlineMarkdown(child, pageUrl)).join("");
  if (name === "a") {
    const label = squash(inner);
    const href = node.getAttribute("href") ?? "";
    if (label === "" || href === "" || href.startsWith("#")) return label;
    const target = new URL(href, pageUrl);
    if (!LINKED_PROTOCOLS.has(target.protocol)) return label;
    return `[${label}](${target.href})`;
  }
  if (name === "strong" || name === "b") return `**${inner}**`;
  if (name === "code") return `\`${inner}\``;
  return BLOCK_TAGS.has(name) || LIST_TAGS.has(name) || name === "li" ? ` ${inner} ` : inner;
}

function tidyLines(text) {
  return text
    .split(LINE_BREAK)
    .map(squash)
    .filter((line) => line !== "")
    .join("\n");
}

function isListItem(block) {
  return block.trimStart().startsWith("- ");
}

/**
 * The main content of a page as Markdown, read from the parsed page.
 * @param {string} html the page
 * @param {string} pageUrl the page's URL, which resolves its relative links
 * @returns {string} headings, paragraphs, list items and links; no HTML
 */
export function pageMarkdown(html, pageUrl) {
  const window = parseHtml(html);
  try {
    const main = window.document.querySelector("main");
    if (!main) throw new Error(`The page ${pageUrl} has no <main> element`);
    const blocks = [];
    let inline = "";
    const flush = () => {
      const text = tidyLines(inline);
      if (text !== "") blocks.push(text);
      inline = "";
    };
    const push = (text) => {
      flush();
      if (text.trim() !== "-") blocks.push(text);
    };
    const walk = (node, depth) => {
      if (node.nodeType === TEXT_NODE) {
        inline += node.textContent;
        return;
      }
      if (node.nodeType !== ELEMENT_NODE || isSkipped(node)) return;
      const name = node.localName;
      const heading = /^h([1-6])$/.exec(name);
      if (heading) {
        push(`${"#".repeat(Number(heading[1]))} ${squash(inlineMarkdown(node, pageUrl))}`);
      } else if (name === "li") {
        const ownContent = Array.from(node.childNodes).filter((child) => !LIST_TAGS.has(child.localName));
        push(`${"  ".repeat(depth)}- ${squash(ownContent.map((child) => inlineMarkdown(child, pageUrl)).join(""))}`);
        Array.from(node.children)
          .filter((child) => LIST_TAGS.has(child.localName))
          .forEach((child) => walk(child, depth + 1));
      } else if (name === "tr") {
        const cells = Array.from(node.children, (cell) => squash(inlineMarkdown(cell, pageUrl))).filter((cell) => cell !== "");
        push(`- ${cells.join(" | ")}`);
      } else if (name === "a" && node.classList.contains("btn")) {
        push(`- ${squash(inlineMarkdown(node, pageUrl))}`);
      } else if (BLOCK_TAGS.has(name) || LIST_TAGS.has(name) || TABLE_TAGS.has(name)) {
        flush();
        Array.from(node.childNodes).forEach((child) => walk(child, LIST_TAGS.has(name) ? depth : 0));
        flush();
      } else {
        inline += inlineMarkdown(node, pageUrl);
      }
    };
    Array.from(main.childNodes).forEach((child) => walk(child, 0));
    flush();
    return blocks
      .map((block, index) => (index > 0 && isListItem(block) && isListItem(blocks[index - 1]) ? `\n${block}` : `\n\n${block}`))
      .join("")
      .trim();
  } finally {
    window.happyDOM.close();
  }
}

/** The title, the meta description and the site name of a page. */
export function pageHead(html) {
  const window = parseHtml(html);
  try {
    const { document } = window;
    return {
      title: squash(document.querySelector("title")?.textContent ?? ""),
      description: squash(document.querySelector('meta[name="description"]')?.getAttribute("content") ?? ""),
      siteName: squash(document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ?? ""),
    };
  } finally {
    window.happyDOM.close();
  }
}

/** The page URLs of a sitemap.xml, in order. */
export function sitemapUrls(sitemapXml) {
  const window = parseHtml(sitemapXml);
  try {
    return Array.from(window.document.querySelectorAll("url > loc"), (element) => squash(element.textContent)).filter((url) => url !== "");
  } finally {
    window.happyDOM.close();
  }
}

/** The page file of a sitemap URL, relative to the web root. */
export function pageFileOf(url) {
  const path = decodeURIComponent(new URL(url).pathname).replace(/^\//, "");
  return path === "" ? "index.html" : path;
}

/** The page's HTML with an alternate link to its Markdown copy at the end of the head; unchanged when it has one. */
export function addMarkdownAlternateLink(html, pageFile) {
  if (html.includes(ALTERNATE_LINK_TYPE)) return html;
  const headEnd = html.indexOf("</head>");
  if (headEnd === -1) throw new Error(`The page ${pageFile} has no </head>`);
  const lineStart = html.lastIndexOf("\n", headEnd) + 1;
  const insertAt = html.slice(lineStart, headEnd).trim() === "" ? lineStart : headEnd;
  const link = `    <link rel="alternate" ${ALTERNATE_LINK_TYPE} href="/${pageFile}.md" />\n`;
  return `${html.slice(0, insertAt)}${link}${html.slice(insertAt)}`;
}

/** The names of the HMRC and Companies House activities that the environment lists, from the catalogue. */
export function filingActivityNames(catalog, environmentName) {
  return (catalog.activities ?? [])
    .filter((activity) => isActivityListedInEnvironment(activity, environmentName))
    .filter((activity) => activity.display !== "never")
    .filter((activity) => (activity.paths ?? []).some((path) => FILING_PAGE_FOLDERS.some((folder) => path.startsWith(folder))))
    .map((activity) => activity.name);
}

/** llms.txt: the site name, one paragraph from the catalogue, one linked line per page. */
export function renderLlmsTxt(pages, catalog, environmentName) {
  const siteName = `${pages[0].siteName || "DIY Accounting"} Submit`;
  const filed = filingActivityNames(catalog, environmentName).join("; ");
  const prices = listedBundles(catalog, environmentName).map((bundle) => `${bundle.name}: ${priceSentence(bundle)}`);
  const summary = `${siteName} offers these activities in the browser: ${filed}. Price of each bundle: ${prices.join(" ")}`;
  const lines = pages.map((page) => `- [${page.title}](${page.url}): ${page.description}`);
  return [`# ${siteName}`, "", `> ${summary}`, "", "## Pages", "", ...lines, ""].join("\n");
}

/** The FAQ entries whose catalogue activity, if any, the environment lists. */
export function listedFaqs(faqs, catalog, environmentName) {
  return faqs.filter((faq) => {
    if (!faq.activity) return true;
    const activity = (catalog.activities ?? []).find((candidate) => candidate.id === faq.activity);
    return activity !== undefined && isActivityListedInEnvironment(activity, environmentName);
  });
}

function pageSection(page) {
  return `# ${page.title}\n\nSource: ${page.url}\n\n${page.markdown}\n`;
}

/** llms-full.txt: the Markdown of every page, then the FAQ entries. */
export function renderLlmsFullTxt(pages, faqs) {
  const entries = faqs.map((faq) => `## ${faq.question}\n\n${faq.answer.trim()}\n`).join("\n");
  return [...pages.map(pageSection), `# Frequently asked questions\n\n${entries}`].join("\n");
}

/**
 * Write llms.txt, llms-full.txt and a Markdown copy of each page that the web root's sitemap lists,
 * and add the alternate link to each page's head.
 * @returns {number} the number of pages
 */
export function publishLlms(webRoot, environmentName) {
  const catalog = parseCatalog(readFileSync(join(webRoot, "submit.catalogue.toml"), "utf8"));
  const faqs = listedFaqs(TOML.parse(readFileSync(join(webRoot, "faqs.toml"), "utf8")).faq, catalog, environmentName);
  const urls = sitemapUrls(readFileSync(join(webRoot, "sitemap.xml"), "utf8"));
  const pages = urls.map((url) => {
    const pageFile = pageFileOf(url);
    const html = readFileSync(join(webRoot, pageFile), "utf8");
    const page = { ...pageHead(html), url, markdown: pageMarkdown(html, url) };
    writeFileSync(join(webRoot, `${pageFile}.md`), pageSection(page));
    writeFileSync(join(webRoot, pageFile), addMarkdownAlternateLink(html, pageFile));
    return page;
  });
  writeFileSync(join(webRoot, "llms.txt"), renderLlmsTxt(pages, catalog, environmentName));
  writeFileSync(join(webRoot, "llms-full.txt"), renderLlmsFullTxt(pages, faqs));
  return pages.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [webRoot, environmentName] = process.argv.slice(2);
  if (!webRoot || !environmentName) {
    console.error("Usage: node scripts/publish-llms.mjs <web-root> <environment-name>");
    process.exit(2);
  }
  const count = publishLlms(webRoot, environmentName);
  console.log(`publish-llms: wrote llms.txt, llms-full.txt and ${count} Markdown copies for ${environmentName}`);
}
