#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-32 Write a landing page for each filing that is production on prod, and the article pages
// - **Use when:** a filing goes to production, its price or its steps change, or a page must answer the search query for that filing.
// - **Does:** build-filing-pages.mjs reads scripts/filing-pages.toml and writes one static page for each entry whose activity is listed on prod and whose web form is production in AVAILABILITY. A page holds an h1 that is the query, what the reader needs, the steps with the screenshots of the guide, the price from the catalogue, the due date with its source quote, the video and the action. A second entry kind, the article in the same data file, writes a page that is not one filing: sections of text, lists, the status of a filing from AVAILABILITY and the quotes of source files, and a form that a module script fills in (the VAT penalty calculator). A third entry kind, the comparison, writes a table of tools sorted by price from web/public/compare/vendors.toml, with our own row priced from the catalogue. The committed pages are checked against this render.
// - **Run:** `npm run build:filing-pages`; `npx vitest run web/unit-tests/filingPages.test.js`
// - **Entry:** `scripts/build-filing-pages.mjs:renderFilingPage`; `scripts/build-filing-pages.mjs:filingPagesToWrite`; `scripts/build-filing-pages.mjs:renderArticlePage`; `scripts/build-filing-pages.mjs:renderComparisonPage`
// - **Files:** scripts/build-filing-pages.mjs, scripts/filing-pages.toml, web/unit-tests/filingPages.test.js, web/public/vat-return-from-a-spreadsheet.html, web/public/micro-entity-accounts.html, web/public/small-company-accounts.html, web/public/dormant-company-accounts.html, web/public/confirmation-statement.html, web/public/hmrc-company-tax-return-service-closed.html, web/public/company-accounts-by-software-from-april-2028.html, web/public/making-tax-digital-income-tax-over-30000.html, web/public/vat-return-due-date-and-penalty-points.html, web/public/lib/vat/penalty-rules.js, web/public/lib/vat/penalty-calculator.js, web/unit-tests/vatPenaltyRules.test.js, web/public/compare/vendors.toml, web/public/mtd-vat-bridging-software-compared.html, web/public/company-accounts-filing-software-compared.html
// - **Keywords:** filing page, landing page, vat return from a spreadsheet, micro-entity accounts, small company accounts, dormant accounts, confirmation statement, search, seo, generated page
// - **Related:** SITE-14, SITE-31
// @end-capability

// Usage: node scripts/build-filing-pages.mjs   (npm run build:filing-pages)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import TOML from "@iarna/toml";
import { getActivityPrices, getBundlePrices, isActivityListedInEnvironment, parseCatalog } from "../app/services/productCatalog.js";
import { AREA_PAGES } from "../web/public/widgets/video-pages.js";
import { AVAILABILITY, QUARTERLY_FACT, availabilityStatus } from "./build-mtd-calendar.mjs";
import { FREQUENCIES } from "../web/public/lib/vat/penalty-rules.js";
import { escapeHtml } from "./page-markers.mjs";
import { formatIsoDate, loadSources, sourceQuoteHtml } from "./tax-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIRECTORY = join(ROOT, "web", "public");
const DATA_PATH = join(ROOT, "scripts", "filing-pages.toml");
const VENDORS_PATH = join(PUBLIC_DIRECTORY, "compare", "vendors.toml");
const SITE_ORIGIN = "https://submit.diyaccounting.co.uk";
const PUBLIC_ENVIRONMENT = "prod";
const RESIDENT_BUNDLE_BY_ACTIVITY_AREA = { "vat": "resident-vat", "companies-house": "resident-ltd" };

export function loadPages() {
  return TOML.parse(readFileSync(DATA_PATH, "utf8")).page;
}

export function loadArticles() {
  return TOML.parse(readFileSync(DATA_PATH, "utf8")).article;
}

export function loadComparisons() {
  return TOML.parse(readFileSync(DATA_PATH, "utf8")).comparison;
}

export function loadTools() {
  return TOML.parse(readFileSync(VENDORS_PATH, "utf8")).tool;
}

export function loadCatalog() {
  return parseCatalog(readFileSync(join(PUBLIC_DIRECTORY, "submit.catalogue.toml"), "utf8"));
}

export function loadManifest() {
  return JSON.parse(readFileSync(join(PUBLIC_DIRECTORY, "videos", "publish.json"), "utf8"));
}

/** Whether the filing's web form is production on prod: its activity lists prod and AVAILABILITY says production. */
export function isProductionOnProd(catalog, activityId) {
  const activity = catalog.activities.find((candidate) => candidate.id === activityId);
  if (!activity || !isActivityListedInEnvironment(activity, PUBLIC_ENVIRONMENT)) return false;
  const row = AVAILABILITY.find((entry) => entry.activity === activityId || entry.otherActivities?.includes(activityId));
  return row?.cells[0][0] === "production";
}

/** The entries of the data file that get a page. */
export function filingPagesToWrite(pages = loadPages(), catalog = loadCatalog()) {
  return pages.filter((page) => isProductionOnProd(catalog, page.activity));
}

function formatPounds(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

function intervalWords(interval) {
  return { year: "a year", month: "a month" }[interval] ?? `each ${interval}`;
}

/** The subscription prices of a bundle as a sentence, the default interval first: "£9.99 a year or £0.99 a month". */
export function bundlePriceText(bundle) {
  const prices = getBundlePrices(bundle);
  const ordered = [...prices.filter((price) => price.default), ...prices.filter((price) => !price.default)];
  return ordered.map((price) => `${formatPounds(price.amount)} ${intervalWords(price.interval)}`).join(" or ");
}

function priceHtml(page, catalog, video) {
  const activity = catalog.activities.find((candidate) => candidate.id === page.activity);
  const bundleId = RESIDENT_BUNDLE_BY_ACTIVITY_AREA[video.group];
  const bundle = catalog.bundles.find((candidate) => candidate.id === bundleId);
  const sentences = [
    `<p>The ${escapeHtml(bundle.name)} bundle covers this filing and costs <strong>${bundlePriceText(bundle)}</strong>.</p>`,
  ];
  const freePass = catalog.bundles.find((candidate) => candidate.id === "day-guest");
  if (activity.bundles.includes(freePass.id)) {
    sentences.push(`<p>The ${escapeHtml(freePass.name.toLowerCase())} is free and gives you 3 submissions to try it first.</p>`);
  }
  const filingPrice = getActivityPrices(activity).find((price) => price.default);
  if (filingPrice) {
    sentences.push(
      `<p>Without your own Companies House presenter, each filing costs ${formatPounds(filingPrice.amount)}, which includes Companies House's fee.</p>`,
    );
  }
  if (page.fee_note) sentences.push(`<p>${escapeHtml(page.fee_note)}</p>`);
  return sentences.join("");
}

function stepHtml(scene, id) {
  const image = scene.thumb
    ? `<img src="${escapeHtml(scene.thumb)}" srcset="${escapeHtml(scene.thumb)} ${scene.thumbWidth}w, ${escapeHtml(scene.full)} ${scene.fullWidth}w" sizes="(min-width: 700px) 45vw, 92vw" width="${scene.thumbWidth}" height="${scene.thumbHeight}" alt="Screenshot: ${escapeHtml(scene.headline)}" loading="lazy" />`
    : "";
  return `<li class="guide-step" id="${id}"><div class="guide-step-header"><h3 class="guide-step-title">${escapeHtml(scene.headline)}</h3></div>${image}<p class="guide-caption">${escapeHtml(scene.caption)}</p></li>`;
}

function videoLinkHtml(video) {
  const areaPage = AREA_PAGES[video.group];
  const title = video.title.replace(/ \| DIY Accounting Submit$/, "");
  return `<p>Watch the video: <a href="${areaPage}#${escapeHtml(video.id)}">${escapeHtml(title)}</a>.</p>`;
}

function deadlineHtml(page, sources) {
  const source = sources.find((candidate) => candidate.name === page.deadline.source);
  if (!source) throw new Error(`${page.file}: no source file named ${page.deadline.source}`);
  return `<p>${escapeHtml(page.deadline.text)}</p>${sourceQuoteHtml(source)}`;
}

function otherPagesHtml(page, pages, comparisons = [], articles = []) {
  const links = pages
    .filter((other) => other.file !== page.file)
    .map((other) => `<li><a href="${other.file}">${escapeHtml(other.heading)}</a></li>`);
  const compared = comparisons.find((comparison) => comparison.file === page.compared_in);
  if (compared) links.push(`<li><a href="${compared.file}">${escapeHtml(compared.heading)}</a></li>`);
  const lookup = articles.find((article) => article.file === page.lookup_in);
  if (lookup) links.push(`<li><a href="${lookup.file}">${escapeHtml(lookup.heading)}</a></li>`);
  return `<ul>${links.join("")}</ul>`;
}

/**
 * The shell every generated page shares: head tags, the header, the footer and the page scripts.
 * @param {object} page file, title, description, heading, subtitle
 * @param {string} mainHtml the content of main, after the status container
 * @param {string} scriptsHtml script tags that follow the shared scripts
 */
function renderPageShell(page, mainHtml, scriptsHtml = "") {
  const url = `${SITE_ORIGIN}/${page.file}`;
  const breadcrumb = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "DIY Accounting Submit", "item": `${SITE_ORIGIN}/` },
      { "@type": "ListItem", "position": 2, "name": page.heading, "item": url },
    ],
  });
  return `<!doctype html>
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->
<!-- Generated by scripts/build-filing-pages.mjs from scripts/filing-pages.toml; edit those, not this file. -->
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="DIY Accounting" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:image" content="${SITE_ORIGIN}/images/social/og-submit.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${breadcrumb}</script>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="submit.css" />
    <!-- CloudWatch RUM configuration placeholders; replace values during deployment -->
    <meta name="rum:appMonitorId" content="\${RUM_APP_MONITOR_ID}" />
    <meta name="rum:region" content="\${AWS_REGION}" />
    <script src="./lib/analytics.js"></script>
    <script src="./lib/session-beacon.js"></script>
  </head>
  <body>
    <a href="#mainContent" class="skip-link">Skip to main content</a>
    <header>
      <p class="chrome-fallback"><a href="./">DIY Accounting Submit</a></p>
      <h1>${escapeHtml(page.heading)}</h1>
      <p class="subtitle">${escapeHtml(page.subtitle)}</p>
    </header>

    <main id="mainContent" class="filing-page">
      <div id="statusMessagesContainer" role="status" aria-live="polite"></div>
${mainHtml}
    </main>

    <footer></footer>

    <script src="widgets/page-chrome.js"></script>
    <script src="lib/env-loader.js"></script>
    <script type="module" src="./submit.js"></script>
    <script src="./developer-mode.js"></script>
    <script src="./lib/request-cache.js"></script>
    <script src="./lib/toml-parser.js"></script>
    <script src="widgets/entitlement-status.js"></script>
    <script src="widgets/auth-status.js"></script>
    <script type="module" src="widgets/view-source-link.js"></script>${scriptsHtml}
  </body>
</html>
`;
}

/**
 * The HTML of one filing page, before formatting.
 * @param {object} page an entry of filing-pages.toml
 * @param {object[]} pages every entry that gets a page, for the links between them
 */
export function renderFilingPage(page, pages, catalog, manifest, sources, comparisons = [], articles = []) {
  const video = manifest.videos.find((candidate) => candidate.id === page.video);
  if (!video || !Array.isArray(video.walkthrough)) throw new Error(`${page.file}: no walkthrough for video ${page.video}`);
  const scenes = [...(page.lead_steps ?? []), ...video.walkthrough];
  const steps = scenes.map((scene, index) => stepHtml(scene, `step-${index + 1}`)).join("");
  const main = `
      <div class="form-container">
        <p>${escapeHtml(page.summary)}</p>
        <p><a class="btn" href="${escapeHtml(page.action.href)}">${escapeHtml(page.action.label)}</a></p>
      </div>

      <div class="form-container">
        <h2>What you need before you start</h2>
        <ul>${page.before.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>

      <div class="form-container">
        <h2>The steps</h2>
        <ol class="guide-steps-list">${steps}</ol>
        ${videoLinkHtml(video)}
      </div>

      <div class="form-container">
        <h2>Price</h2>
        ${priceHtml(page, catalog, video)}
      </div>

      <div class="form-container">
        <h2>When it is due</h2>
        ${deadlineHtml(page, sources)}
        <p>See every date on the <a href="mtd-calendar.html">MTD calendar</a>.</p>
      </div>

      <div class="form-container">
        <h2>Ready to file</h2>
        <p><a class="btn" href="${escapeHtml(page.action.href)}">${escapeHtml(page.action.label)}</a></p>
        <h2>Other filings</h2>
        ${otherPagesHtml(page, pages, comparisons, articles)}
        <p>Each filing and the channels that offer it are in the <a href="mtd-calendar.html#availability">availability table</a>.</p>
      </div>
`;
  return renderPageShell(page, main);
}

/** The words that say what Submit offers for a filing, from its state in the availability table. */
export function filingStatusText(activity, label) {
  const status = availabilityStatus(activity);
  if (status === "production") return `Submit files ${label}.`;
  if (status === "sandbox") {
    return `Submit's ${label} filing awaits HMRC recognition. Until then it runs against a test service and files nothing real.`;
  }
  if (status === "preview") {
    return `Submit's ${label} filing awaits HMRC recognition. Until then it runs on our simulator only and files nothing.`;
  }
  throw new Error(`no availability row for ${activity}`);
}

/** Escape text, then turn [label](href) into a link. */
function inlineHtml(text) {
  return escapeHtml(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** The form of the penalty calculator. It stays hidden until its script runs. */
function vatPenaltyCalculatorHtml() {
  const options = Object.entries(FREQUENCIES)
    .map(([id, rule]) => `<option value="${id}">${rule.label}</option>`)
    .join("");
  return (
    `<noscript><p>The calculator needs JavaScript. The rules on this page give the same answer.</p></noscript>` +
    `<div id="vatCalculator" hidden>` +
    `<div class="form-group"><label for="vatPeriodEnd">Last day of the accounting period</label>` +
    `<input type="date" id="vatPeriodEnd" name="vatPeriodEnd" /></div>` +
    `<div class="form-group"><label for="vatFrequency">How often you send a return</label>` +
    `<select id="vatFrequency" name="vatFrequency">${options}</select></div>` +
    `<fieldset class="form-group"><legend>Tick each return that was late</legend><div id="vatReturnTicks"></div></fieldset>` +
    `<div id="vatResult" role="status" aria-live="polite" hidden>` +
    `<p><strong>Due date:</strong> <span id="vatDueDate"></span></p>` +
    `<p><strong>Penalty points:</strong> <span id="vatPoints"></span></p>` +
    `<p><strong>Threshold:</strong> <span id="vatThreshold"></span></p>` +
    `<p id="vatPenalties"></p><p id="vatRemoval"></p></div></div>`
  );
}

/** The search box of the company deadlines lookup. It stays hidden until its script runs. */
function companyDeadlinesLookupHtml() {
  return (
    `<noscript><p>The lookup needs JavaScript. Search for the company on ` +
    `<a href="https://find-and-update.company-information.service.gov.uk/">Companies House</a>: its page shows the next accounts and the next confirmation statement.</p></noscript>` +
    `<div id="companyLookup" hidden>` +
    `<form id="companyLookupForm" class="form-group">` +
    `<label for="companyQuery">Company name or number</label>` +
    `<input type="search" id="companyQuery" name="companyQuery" minlength="2" maxlength="100" autocomplete="off" required />` +
    `<button type="submit" class="btn">Look up</button></form>` +
    `<p id="companyError" role="alert" hidden></p>` +
    `<div id="companyMatches" role="status" aria-live="polite" hidden></div>` +
    `<div id="companyResult" role="status" aria-live="polite" hidden></div></div>`
  );
}

function articleSectionHtml(section, sources) {
  const parts = [`<h2>${escapeHtml(section.heading)}</h2>`];
  for (const text of section.text ?? []) parts.push(`<p>${inlineHtml(text)}</p>`);
  if (section.list) parts.push(`<ul>${section.list.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ul>`);
  if (section.table === "quarterly") {
    const rows = QUARTERLY_FACT.rows.map(([period, deadline]) => `<tr><td>${period}</td><td>${deadline}</td></tr>`).join("");
    parts.push(
      `<div class="table-scroll"><table class="deadline-table"><thead><tr><th scope="col">Update period</th><th scope="col">Deadline</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    );
  }
  if (section.table === "vat-penalty-rules") {
    const rows = Object.values(FREQUENCIES)
      .map(
        (rule) =>
          `<tr><td>${rule.label}</td><td>${rule.threshold}</td><td>${rule.complianceMonths} months</td><td>${rule.complianceReturns}</td></tr>`,
      )
      .join("");
    parts.push(
      `<div class="table-scroll"><table class="deadline-table"><thead><tr><th scope="col">Return</th><th scope="col">Points threshold</th>` +
        `<th scope="col">Compliance period</th><th scope="col">Returns</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    );
  }
  if (section.widget === "vat-penalty-calculator") parts.push(vatPenaltyCalculatorHtml());
  if (section.widget === "company-deadlines-lookup") parts.push(companyDeadlinesLookupHtml());
  for (const name of section.status ?? []) {
    parts.push(`<p>${escapeHtml(filingStatusText(name.activity, name.label))}</p>`);
  }
  for (const name of section.sources ?? []) {
    const source = sources.find((candidate) => candidate.name === name);
    if (!source) throw new Error(`no source file named ${name}`);
    parts.push(sourceQuoteHtml(source));
  }
  return `<div class="form-container">${parts.join("")}</div>`;
}

/**
 * The HTML of one article page, before formatting.
 * @param {object} article an entry of the article list in filing-pages.toml
 */
export function renderArticlePage(article, sources) {
  const sections = article.section.map((section) => articleSectionHtml(section, sources)).join("\n");
  const scripts = article.script ? `\n    <script type="module" src="${escapeHtml(article.script)}"></script>` : "";
  const main = `
      <div class="form-container">
        <p>${inlineHtml(article.summary)}</p>
        <p><a class="btn" href="${escapeHtml(article.action.href)}">${escapeHtml(article.action.label)}</a></p>
      </div>
${sections}
      <div class="form-container">
        <h2>${escapeHtml(article.closing_heading ?? "Ready to file")}</h2>
        <p><a class="btn" href="${escapeHtml(article.action.href)}">${escapeHtml(article.action.label)}</a></p>
        ${article.action.href === "mtd-calendar.html" ? "" : `<p>See every date on the <a href="mtd-calendar.html">MTD calendar</a>.</p>`}
      </div>
`;
  return renderPageShell(article, main, scripts);
}

/** What one year costs for sorting: a monthly price counts 12 times, a price for each filing counts `filingsPerYear` times. */
export function yearPence(tool, filingsPerYear) {
  const times = { year: 1, month: 12, filing: filingsPerYear }[tool.price_period];
  if (times === undefined) throw new Error(`${tool.name}: unknown price_period ${tool.price_period}`);
  return tool.price_pence * times;
}

/** The tools of one comparison with our own row's price read from the catalogue, sorted by the price for one year. */
export function comparisonTools(comparison, tools, catalog) {
  const rows = tools
    .filter((tool) => tool.compares === comparison.compares)
    .map((tool) => {
      if (!tool.ours) return tool;
      const bundle = catalog.bundles.find((candidate) => candidate.id === tool.bundle);
      const price = getBundlePrices(bundle).find((candidate) => candidate.default);
      return {
        ...tool,
        price_text: `${formatPounds(price.amount)} ${intervalWords(price.interval)}`,
        price_pence: price.amount,
        price_period: price.interval,
      };
    });
  return rows.sort(
    (a, b) => yearPence(a, comparison.filings_per_year) - yearPence(b, comparison.filings_per_year) || a.name.localeCompare(b.name),
  );
}

/** The first and last dates on which a price was read, as words. */
export function priceReadWords(tools) {
  const dates = tools
    .filter((tool) => !tool.ours)
    .map((tool) => tool.price_read)
    .sort();
  const first = formatIsoDate(dates[0]);
  const last = formatIsoDate(dates[dates.length - 1]);
  return first === last ? `on ${first}` : `between ${first} and ${last}`;
}

function toolRowHtml(tool) {
  const name = tool.ours
    ? `<a href="${escapeHtml(tool.url)}">${escapeHtml(tool.name)}</a> <strong>(our own product)</strong>`
    : `<a href="${escapeHtml(tool.url)}" rel="noopener">${escapeHtml(tool.name)}</a>`;
  const source = tool.ours
    ? `<a href="bundles.html">Our price list</a>`
    : `Price read on ${formatIsoDate(tool.price_read)}: <a href="${escapeHtml(tool.price_url)}" rel="noopener">the price page</a>`;
  return `<tr><td>${name}</td><td data-label="Files">${escapeHtml(tool.files)}</td><td data-label="Price">${escapeHtml(tool.price_text)}</td><td>${source}</td></tr>`;
}

/**
 * The HTML of one comparison page, before formatting.
 * @param {object} comparison an entry of the comparison list in filing-pages.toml
 * @param {object[]} tools the entries of vendors.toml
 */
export function renderComparisonPage(comparison, tools, catalog) {
  const rows = comparisonTools(comparison, tools, catalog);
  const vendors = rows.filter((tool) => !tool.ours);
  const sortRule =
    comparison.filings_per_year > 1
      ? `a monthly price counts 12 times and a price for each return counts ${comparison.filings_per_year} times, for ${comparison.filings_per_year} quarterly returns`
      : "a monthly price counts 12 times";
  const summary =
    `This table lists tools that ${comparison.job}. ${comparison.rule} ` +
    `We read each price on the vendor's own website ${priceReadWords(rows)}. ` +
    `The table is a selection of ${vendors.length} tools, not every tool on the list.`;
  const body = rows.map(toolRowHtml).join("");
  const main = `
      <div class="form-container">
        <p>${escapeHtml(summary)}</p>
        <p>${escapeHtml(comparison.list_sentence)} <a href="${escapeHtml(comparison.list_url)}" rel="noopener">${escapeHtml(comparison.list_name)}</a>.</p>
        <p>The rows run from the lowest price for one year to the highest: ${escapeHtml(sortRule)}.</p>
        <div class="table-scroll"><table class="deadline-table stacked-table compare-table"><thead><tr><th scope="col">Tool</th><th scope="col">What it files</th><th scope="col">Price, in the vendor's words</th><th scope="col">Source</th></tr></thead><tbody>${body}</tbody></table></div>
        <p>${escapeHtml(comparison.note)}</p>
        <p>Prices change. The vendor's own page is the authority, so check it before you buy.</p>
        <p><a class="btn" href="${escapeHtml(comparison.action.href)}">${escapeHtml(comparison.action.label)}</a></p>
      </div>
`;
  return renderPageShell(comparison, main);
}

/** The fact ids that the quotes on the article pages support. */
export function articleFactIds(articles = loadArticles(), sources = loadSources()) {
  const names = new Set(articles.flatMap((article) => article.section.flatMap((section) => section.sources ?? [])));
  return [...new Set(sources.filter((source) => names.has(source.name)).flatMap((source) => source.facts))];
}

export function filingPagePath(page) {
  return join(PUBLIC_DIRECTORY, page.file);
}

export async function renderFilingPages(
  pages = loadPages(),
  catalog = loadCatalog(),
  manifest = loadManifest(),
  sources = loadSources(),
  comparisons = loadComparisons(),
  articles = loadArticles(),
) {
  const toWrite = filingPagesToWrite(pages, catalog);
  const rendered = new Map();
  for (const page of toWrite) {
    const path = filingPagePath(page);
    const config = (await prettier.resolveConfig(path)) ?? {};
    rendered.set(
      page.file,
      await prettier.format(renderFilingPage(page, toWrite, catalog, manifest, sources, comparisons, articles), {
        ...config,
        filepath: path,
      }),
    );
  }
  return rendered;
}

export async function renderArticlePages(articles = loadArticles(), sources = loadSources()) {
  const rendered = new Map();
  for (const article of articles) {
    const path = filingPagePath(article);
    const config = (await prettier.resolveConfig(path)) ?? {};
    rendered.set(article.file, await prettier.format(renderArticlePage(article, sources), { ...config, filepath: path }));
  }
  return rendered;
}

export async function renderComparisonPages(comparisons = loadComparisons(), tools = loadTools(), catalog = loadCatalog()) {
  const rendered = new Map();
  for (const comparison of comparisons) {
    const path = filingPagePath(comparison);
    const config = (await prettier.resolveConfig(path)) ?? {};
    rendered.set(comparison.file, await prettier.format(renderComparisonPage(comparison, tools, catalog), { ...config, filepath: path }));
  }
  return rendered;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [file, html] of [...(await renderFilingPages()), ...(await renderArticlePages()), ...(await renderComparisonPages())]) {
    writeFileSync(join(PUBLIC_DIRECTORY, file), html);
    console.log(`wrote ${file}`);
  }
}
