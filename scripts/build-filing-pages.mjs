#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-32 Write a landing page for each filing that is production on prod
// - **Use when:** a filing goes to production, its price or its steps change, or a page must answer the search query for that filing.
// - **Does:** build-filing-pages.mjs reads scripts/filing-pages.toml and writes one static page for each entry whose activity is listed on prod and whose web form is production in AVAILABILITY. A page holds an h1 that is the query, what the reader needs, the steps with the screenshots of the guide, the price from the catalogue, the due date with its source quote, the video and the action. The committed pages are checked against this render.
// - **Run:** `npm run build:filing-pages`; `npx vitest run web/unit-tests/filingPages.test.js`
// - **Entry:** `scripts/build-filing-pages.mjs:renderFilingPage`; `scripts/build-filing-pages.mjs:filingPagesToWrite`
// - **Files:** scripts/build-filing-pages.mjs, scripts/filing-pages.toml, web/unit-tests/filingPages.test.js, web/public/vat-return-from-a-spreadsheet.html, web/public/micro-entity-accounts.html, web/public/small-company-accounts.html, web/public/dormant-company-accounts.html, web/public/confirmation-statement.html
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
import { AVAILABILITY } from "./build-mtd-calendar.mjs";
import { escapeHtml } from "./page-markers.mjs";
import { loadSources, sourceQuoteHtml } from "./tax-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIRECTORY = join(ROOT, "web", "public");
const DATA_PATH = join(ROOT, "scripts", "filing-pages.toml");
const SITE_ORIGIN = "https://submit.diyaccounting.co.uk";
const PUBLIC_ENVIRONMENT = "prod";
const RESIDENT_BUNDLE_BY_ACTIVITY_AREA = { "vat": "resident-vat", "companies-house": "resident-ltd" };

export function loadPages() {
  return TOML.parse(readFileSync(DATA_PATH, "utf8")).page;
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

function otherPagesHtml(page, pages) {
  const links = pages
    .filter((other) => other.file !== page.file)
    .map((other) => `<li><a href="${other.file}">${escapeHtml(other.heading)}</a></li>`)
    .join("");
  return `<ul>${links}</ul>`;
}

/**
 * The HTML of one filing page, before formatting.
 * @param {object} page an entry of filing-pages.toml
 * @param {object[]} pages every entry that gets a page, for the links between them
 */
export function renderFilingPage(page, pages, catalog, manifest, sources) {
  const video = manifest.videos.find((candidate) => candidate.id === page.video);
  if (!video || !Array.isArray(video.walkthrough)) throw new Error(`${page.file}: no walkthrough for video ${page.video}`);
  const url = `${SITE_ORIGIN}/${page.file}`;
  const scenes = [...(page.lead_steps ?? []), ...video.walkthrough];
  const steps = scenes.map((scene, index) => stepHtml(scene, `step-${index + 1}`)).join("");
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
        ${otherPagesHtml(page, pages)}
        <p>Each filing and the channels that offer it are in the <a href="mtd-calendar.html#availability">availability table</a>.</p>
      </div>
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
    <script type="module" src="widgets/view-source-link.js"></script>
  </body>
</html>
`;
}

export function filingPagePath(page) {
  return join(PUBLIC_DIRECTORY, page.file);
}

export async function renderFilingPages(pages = loadPages(), catalog = loadCatalog(), manifest = loadManifest(), sources = loadSources()) {
  const toWrite = filingPagesToWrite(pages, catalog);
  const rendered = new Map();
  for (const page of toWrite) {
    const path = filingPagePath(page);
    const config = (await prettier.resolveConfig(path)) ?? {};
    rendered.set(
      page.file,
      await prettier.format(renderFilingPage(page, toWrite, catalog, manifest, sources), { ...config, filepath: path }),
    );
  }
  return rendered;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [file, html] of await renderFilingPages()) {
    writeFileSync(join(PUBLIC_DIRECTORY, file), html);
    console.log(`wrote ${file}`);
  }
}
