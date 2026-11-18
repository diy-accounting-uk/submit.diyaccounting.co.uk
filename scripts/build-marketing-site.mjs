#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-25 Build the marketing site data, social images, brand shots and listing packs
// - **Use when:** web/marketing/marketing.toml changes, a brand stylesheet or icon changes, or the social images, logos, brand shots or listing-pack screenshots of marketing.diyaccounting.co.uk need to be made again.
// - **Does:** build-marketing-site.mjs parses marketing.toml into marketing.json, with each listing pack's logos, screenshots and videos. It copies each site's colour tokens into brand/tokens.css, the fonts into brand/fonts, each site's icon into brand/logos and the team photograph into brand/company. It renders every set at all 11 sizes into images/ through cards/card.html, each brand's square and wide logos into brand/logos, and the founder's square photograph, with a hash per image and logo set so a stale one shows. It captures the brand fragments of the four sites into brand/shots/ and each pack's 1270 by 760 screenshots into brand/packs/, Submit through the simulator lane and the others from their live sites. It screenshots the finished page at two widths and two colour schemes.
// - **Run:** `npm run marketing:build` (data, then tokens); `npm run marketing:build -- images`; `npm run marketing:build -- brand`; `npm run marketing:build -- screens`
// - **Entry:** `scripts/build-marketing-site.mjs:main`
// - **Files:** scripts/build-marketing-site.mjs, scripts/listings-register.mjs, web/marketing/marketing.toml, web/marketing/marketing-lib.js, web/marketing/cards/card.html, videos/publish.json, web/unit-tests/marketing-site.test.js
// - **Keywords:** marketing, social images, og image, brand guide, brand shots, design tokens, banners, share posts, listing packs, directory listing, logos, press kit, company facts
// - **Related:** DEV-47, SITE-11
// @end-capability

// scripts/build-marketing-site.mjs
//
// Usage: node scripts/build-marketing-site.mjs [data|tokens|images|brand|screens]
//   no argument         data, page, then tokens
//   data                web/marketing/marketing.toml -> web/marketing/marketing.json
//   page                the figures, summaries and listing names of marketing.json -> web/marketing/index.html
//   tokens              each site's :root tokens -> web/marketing/brand/tokens.css, and the fonts
//   images              web/marketing/images/<set>/<size>.png and images/manifest.json
//   brand               web/marketing/brand/shots/<section>/<fragment>-<theme>.png and manifest.json
//   screens             target/marketing-screens/<width>-<theme>.png of web/marketing/index.html
// Options: --siblings <dir>, --base-spreadsheets <url>, --base-diya-gl <url>, --base-limited <url>

import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";
import { chromium } from "playwright";

import { escapeHtml, replaceBetweenMarkers } from "./page-markers.mjs";
import { readListings } from "./listings-register.mjs";
import { configuredOrigin, signIn, startSimulator } from "./site-screenshots.mjs";

const require = createRequire(import.meta.url);
const TOML = require("@iarna/toml");

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MARKETING_DIR = path.join(REPO_ROOT, "web", "marketing");
export const TOML_FILE = path.join(MARKETING_DIR, "marketing.toml");
export const JSON_FILE = path.join(MARKETING_DIR, "marketing.json");
export const PAGE_FILE = path.join(MARKETING_DIR, "index.html");
export const TOKENS_FILE = path.join(MARKETING_DIR, "brand", "tokens.css");
export const IMAGES_DIR = path.join(MARKETING_DIR, "images");
export const SHOTS_DIR = path.join(MARKETING_DIR, "brand", "shots");
export const COMPANY_DIR = path.join(MARKETING_DIR, "brand", "company");
export const LOGOS_DIR = path.join(MARKETING_DIR, "brand", "logos");
export const PACKS_DIR = path.join(MARKETING_DIR, "brand", "packs");
export const PUBLISH_FILE = path.join(REPO_ROOT, "videos", "publish.json");
export const LOGO_SIZES = [240, 400, 512];
export const PACK_SHOT = { width: 1270, height: 760 };
export const LOGO_PALETTE = { light: { background: "#ffffff", ink: "#1b1b1b" }, dark: { background: "#1b1b1b", ink: "#ffffff" } };
const WIDE_LOGO = { height: 200, icon: 160, pad: 20, gap: 24, fontSize: 76, baseline: 128 };
export const FONT_FILES = [
  "atkinson-hyperlegible-latin-400-italic.woff2",
  "atkinson-hyperlegible-latin-400-normal.woff2",
  "atkinson-hyperlegible-latin-700-normal.woff2",
  "arimo-latin-400-italic.woff2",
  "arimo-latin-400-normal.woff2",
  "arimo-latin-700-normal.woff2",
  "OFL.txt",
  "OFL-Arimo.txt",
];

const LIVE_BASES = {
  "spreadsheets": "https://spreadsheets.diyaccounting.co.uk/",
  "diya-gl": "https://diya-gl.co.uk/",
  "limited": "https://diyaccounting.co.uk/",
};

/** Each brand's own icon, the source of its logo set. */
export const ICON_SOURCES = [
  { id: "submit", own: true, file: "web/public/favicon.svg" },
  { id: "spreadsheets", repo: "spreadsheets.diyaccounting.co.uk", file: "web/spreadsheets.diyaccounting.co.uk/public/favicon.svg" },
  { id: "diya-gl", repo: "spreadsheets.diyaccounting.co.uk", file: "web/diya-gl.co.uk/public/icon.svg" },
  { id: "limited", repo: "www.diyaccounting.co.uk", file: "web/www.diyaccounting.co.uk/public/favicon.svg" },
];

export const TOKEN_SOURCES = [
  { id: "submit", own: true, file: "web/public/css/tokens.css" },
  { id: "spreadsheets", repo: "spreadsheets.diyaccounting.co.uk", file: "web/spreadsheets.diyaccounting.co.uk/public/spreadsheets.css" },
  { id: "diya-gl", repo: "spreadsheets.diyaccounting.co.uk", file: "web/diya-gl.co.uk/public/diya-gl.css" },
  { id: "limited", repo: "www.diyaccounting.co.uk", file: "web/www.diyaccounting.co.uk/public/gateway.css" },
];

// ---------------------------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------------------------

/** The figures of the affiliate section, taken from referrals.toml so a rate change needs no copy edit. */
export function affiliateFigures() {
  const referrals = TOML.parse(fs.readFileSync(path.join(REPO_ROOT, "referrals.toml"), "utf8"));
  const customer = referrals.tiers.find((t) => t.id === "customer");
  const cash = referrals.tiers.find((t) => t.id === "casual");
  return {
    ratePercent: cash.rateBps / 100,
    months: cash.months,
    annualRatePercent: cash.annualRateBps / 100,
    creditHoldDays: customer.holdDays,
    cashHoldDays: cash.holdDays,
    capMonthPounds: cash.capMonthPence / 100,
    capTaxYearPounds: cash.capTaxYearPence / 100,
  };
}

/** The files of one brand's logo set, relative to web/marketing. */
export function logoFiles(sectionId) {
  const dir = `brand/logos/${sectionId}`;
  const sized = (variant) => LOGO_SIZES.map((size) => ({ size, file: `${dir}/square-${variant}-${size}.png` }));
  return {
    icon: `${dir}/icon.svg`,
    square: {
      light: { svg: `${dir}/square-light.svg`, png: sized("light") },
      dark: { svg: `${dir}/square-dark.svg`, png: sized("dark") },
      transparent: { svg: `${dir}/icon.svg`, png: sized("transparent") },
    },
    wide: {
      light: { svg: `${dir}/wide-light.svg`, png: `${dir}/wide-light.png` },
      dark: { svg: `${dir}/wide-dark.svg`, png: `${dir}/wide-dark.png` },
    },
  };
}

/** The file of one pack screenshot, relative to web/marketing. */
export function packShotFile(packId, shotId) {
  return `brand/packs/${packId}/${shotId}.png`;
}

/** A published video of videos/publish.json with its YouTube link and its length. */
function publishedVideo(id, publish, seconds) {
  const video = publish.videos.find((v) => v.id === id);
  if (!video || !video.videoId) throw new Error(`videos/publish.json has no published video ${id}`);
  if (!Number.isInteger(seconds[id])) throw new Error(`marketing.toml videoSeconds has no length for ${id}`);
  return {
    id,
    title: video.title,
    youtubeId: video.videoId,
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
    seconds: seconds[id],
  };
}

export function readMarketingData() {
  const data = JSON.parse(JSON.stringify(TOML.parse(fs.readFileSync(TOML_FILE, "utf8"))));
  data.affiliates = { ...data.affiliates, ...affiliateFigures() };
  const { groups, products, listings } = readListings();
  const publish = JSON.parse(fs.readFileSync(PUBLISH_FILE, "utf8"));
  const seconds = data.videoSeconds ?? {};
  delete data.listingGroup;
  delete data.listingProduct;
  delete data.listing;
  delete data.videoSeconds;
  data.listingGroups = groups;
  data.listingProducts = products.map((product) => ({
    ...product,
    logos: logoFiles(product.section),
    screenshots: product.screenshots.map((shot) => ({ ...shot, file: packShotFile(product.id, shot.id) })),
    videos: product.videos.map((id) => publishedVideo(id, publish, seconds)),
  }));
  data.listings = listings;
  return data;
}

export function renderMarketingJson() {
  return JSON.stringify(readMarketingData(), null, 2) + "\n";
}

// ---------------------------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------------------------

/** Replaces the text between the end of the tag that holds `marker` and the next tag, for each `marker` in the page. */
function fillElements(html, marker, textFor) {
  let out = "";
  let from = 0;
  for (let at = html.indexOf(marker, from); at !== -1; at = html.indexOf(marker, from)) {
    const tagEnd = html.indexOf(">", at) + 1;
    const end = html.indexOf("<", tagEnd);
    const key = html.slice(at + marker.length, html.indexOf('"', at + marker.length));
    out += html.slice(from, tagEnd) + escapeHtml(textFor(key));
    from = end;
  }
  return out + html.slice(from);
}

/** The listings as the page holds them before its script runs: one line per place with its state. */
export function renderListingNames(data) {
  return data.listingGroups
    .map((group) => {
      const listings = data.listings.filter((listing) => listing.group === group.id);
      const items = listings
        .map(
          (listing) =>
            `<li>${escapeHtml(listing.place)} <span class="listing-state" data-state="${escapeHtml(listing.state)}">${escapeHtml(listing.state)}</span></li>`,
        )
        .join("");
      return `<div class="post-group"><h3>${escapeHtml(`${group.label}, ${listings.length}`)}</h3><ul>${items}</ul></div>`;
    })
    .join("");
}

/** The two indexes of the listing packs: by site, and by product activity within each site. */
export function renderPackIndex(data) {
  const link = (pack, text) => `<li><a href="#pack-${escapeHtml(pack.id)}">${escapeHtml(text)}</a></li>`;
  const sites = data.listingProducts.filter((pack) => !pack.activity);
  const bySite = sites.map((pack) => link(pack, pack.name)).join("");
  const byActivity = sites
    .map((site) => {
      const activities = data.listingProducts.filter((pack) => pack.parent === site.id);
      if (!activities.length) return "";
      return `<div class="pack-group"><h4>${escapeHtml(site.name)}</h4><ul>${activities.map((pack) => link(pack, pack.activity)).join("")}</ul></div>`;
    })
    .join("");
  return `<nav class="pack-index" aria-label="Listing packs"><div class="pack-group"><h3>By site</h3><ul>${bySite}</ul></div><div class="pack-group"><h3>By product activity</h3>${byActivity}</div></nav>`;
}

/** The date the assets were last made: the latest capture or render date in the asset manifests. */
export function builtAt() {
  const dates = [path.join(SHOTS_DIR, "manifest.json"), path.join(PACKS_DIR, "manifest.json"), path.join(LOGOS_DIR, "manifest.json")]
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, "utf8")).capturedAt)
    .filter(Boolean);
  return dates.sort().at(-1) ?? "";
}

/** web/marketing/index.html with the figures, the summaries and the listings that its script reads from marketing.json written in. */
export async function renderMarketingPage(html, data) {
  const figures = data.affiliates;
  let page = fillElements(html, 'data-aff="', (key) => (key === "disclosure" ? data.disclosure : figures[key].toLocaleString("en-GB")));
  page = fillElements(page, "data-aff-offer", () => data.offers.withPass);
  page = page.replace(/(<a\b[^>]*?data-aff-generate[^>]*?href=")[^"]*"/, `$1${escapeHtml(data.generatePassUrl)}"`);
  if (figures.applyUrl) {
    const marker = "data-aff-apply>";
    const at = page.indexOf(marker) + marker.length;
    const link = `<a href="${escapeHtml(figures.applyUrl)}">Apply to become an affiliate</a>`;
    page = page.slice(0, at) + link + page.slice(page.indexOf("</p>", at));
  }
  for (const section of data.sections) {
    const start = page.indexOf(`id="${section.id}"`);
    const marker = "data-summary>";
    const at = page.indexOf(marker, start);
    const end = page.indexOf("</p>", at);
    page = page.slice(0, at + marker.length) + escapeHtml(section.summary) + page.slice(end);
  }
  page = replaceBetweenMarkers(page, "listings", renderListingNames(data));
  page = replaceBetweenMarkers(page, "packs", renderPackIndex(data));
  page = replaceBetweenMarkers(page, "built", `<p class="built" id="builtAt">Built ${escapeHtml(builtAt())}</p>`);
  const config = (await prettier.resolveConfig(PAGE_FILE)) ?? {};
  return prettier.format(page, { ...config, filepath: PAGE_FILE });
}

// ---------------------------------------------------------------------------------------------
// tokens
// ---------------------------------------------------------------------------------------------

/** The text of the first top-level rule that opens with `opener`, from its selector line to its closing brace. */
function topLevelRule(css, opener) {
  const lines = css.split("\n");
  const start = lines.findIndex((line) => line.startsWith(opener));
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && line === "}");
  return lines.slice(start + 1, end).join("\n");
}

/** One site's block of tokens.css: its light :root as .brand-<id>, and its dark :root when it has one. */
export function renderSiteTokens(id, css) {
  const light = topLevelRule(css, ":root {");
  if (light === null) throw new Error(`no top-level :root block for ${id}`);
  const dark = topLevelRule(css, ':root[data-theme="dark"] {');
  let block = `/* site: ${id} */\n.brand-${id} {\n${light}\n}\n`;
  if (dark !== null) block += `.brand-${id}[data-theme="dark"] {\n${dark}\n}\n`;
  return block + `/* end site: ${id} */\n`;
}

/** The block of a site inside tokens.css, or null. */
export function siteTokenBlock(tokensCss, id) {
  const start = tokensCss.indexOf(`/* site: ${id} */`);
  const endMarker = `/* end site: ${id} */\n`;
  const end = tokensCss.indexOf(endMarker);
  if (start < 0 || end < 0) return null;
  return tokensCss.slice(start, end + endMarker.length);
}

/** The first parent directory (or the given one) that holds both sibling repositories, or null. */
export function findSiblings(explicit) {
  const holds = (dir) =>
    fs.existsSync(path.join(dir, "spreadsheets.diyaccounting.co.uk")) && fs.existsSync(path.join(dir, "www.diyaccounting.co.uk"));
  if (explicit) return holds(path.resolve(explicit)) ? path.resolve(explicit) : null;
  let dir = path.dirname(REPO_ROOT);
  for (;;) {
    if (holds(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function tokenSourcePath(source, siblings) {
  return source.own ? path.join(REPO_ROOT, source.file) : path.join(siblings, source.repo, source.file);
}

export const HEADER =
  "/* SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 */\n/* Copyright (C) 2006-2026 DIY Accounting Limited */\n\n" +
  "/* Generated by scripts/build-marketing-site.mjs tokens: each site's top-level :root tokens under .brand-<id>. */\n\n";

function buildTokens(siblings) {
  if (!siblings) throw new Error("the sibling repositories were not found; pass --siblings <dir>");
  const blocks = TOKEN_SOURCES.map((source) => renderSiteTokens(source.id, fs.readFileSync(tokenSourcePath(source, siblings), "utf8")));
  fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
  fs.writeFileSync(TOKENS_FILE, HEADER + blocks.join("\n"));
  const fontsDir = path.join(MARKETING_DIR, "brand", "fonts");
  fs.mkdirSync(fontsDir, { recursive: true });
  for (const name of FONT_FILES) fs.copyFileSync(path.join(REPO_ROOT, "web", "public", "fonts", name), path.join(fontsDir, name));
  for (const source of ICON_SOURCES) {
    const target = path.join(MARKETING_DIR, logoFiles(source.id).icon);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(tokenSourcePath(source, siblings), target);
  }
  const company = readMarketingData().company;
  fs.mkdirSync(COMPANY_DIR, { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, company.teamPhotoSource), path.join(MARKETING_DIR, company.teamPhoto));
  console.log(`Wrote ${path.relative(REPO_ROOT, TOKENS_FILE)}, ${FONT_FILES.length} font files, the four icons and the team photo`);
}

// ---------------------------------------------------------------------------------------------
// images
// ---------------------------------------------------------------------------------------------

/** The hash that says whether an image is stale: the card files, the brand's tokens, the set's image text, the section name and the size. */
export function imageHash({ section, set, size }) {
  const read = (name) => fs.readFileSync(path.join(MARKETING_DIR, "cards", name), "utf8");
  const tokens = siteTokenBlock(fs.readFileSync(TOKENS_FILE, "utf8"), section.brand);
  const hash = createHash("sha256");
  for (const part of [read("card.html"), read("card.css"), read("card.js"), tokens, JSON.stringify(set.image), section.name, size.id]) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex");
}

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

function serveMarketing() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let file = path.join(MARKETING_DIR, decodeURIComponent(url.pathname));
    if (!file.startsWith(MARKETING_DIR)) file = MARKETING_DIR;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, stop: () => server.close() }));
  });
}

/** The name a brand's wide logo and its cards carry. */
export function markName(section) {
  return section.id === "limited" ? section.name : `${section.name}™`;
}

/** The viewBox and the inner markup of an SVG icon. */
export function iconParts(svgText) {
  const open = svgText.match(/<svg\b[^>]*>/);
  const viewBox = open[0].match(/viewBox="([^"]+)"/)[1];
  const inner = svgText.slice(open.index + open[0].length, svgText.lastIndexOf("</svg>"));
  return { viewBox, inner: inner.replace(/<!--[\s\S]*?-->/g, "").trim() };
}

const SVG_HEADER =
  "<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->\n<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->\n<!-- Generated by scripts/build-marketing-site.mjs images. -->\n";

/** The square logo: the icon on a light or dark square. */
export function squareLogoSvg(iconSvg, background) {
  const { viewBox, inner } = iconParts(iconSvg);
  return `${SVG_HEADER}<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${background}"/><svg x="56" y="56" width="400" height="400" viewBox="${viewBox}">${inner}</svg></svg>\n`;
}

/** The wide logo: the icon and the name in one row, the name in ink for its background, textWidth wide. */
export function wideLogoSvg(iconSvg, name, ink, textWidth) {
  const { viewBox, inner } = iconParts(iconSvg);
  const w = WIDE_LOGO;
  const x = w.pad + w.icon + w.gap;
  const width = Math.ceil(x + textWidth + w.pad);
  return `${SVG_HEADER}<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${w.height}" viewBox="0 0 ${width} ${w.height}"><svg x="${w.pad}" y="${w.pad}" width="${w.icon}" height="${w.icon}" viewBox="${viewBox}">${inner}</svg><text x="${x}" y="${w.baseline}" fill="${ink}" font-family="Arial, Arimo, sans-serif" font-weight="700" font-size="${w.fontSize}">${escapeHtml(name)}</text></svg>\n`;
}

/** The hash that says whether a brand's logo set is stale: its icon, its name, the palette, the sizes and the layout. */
export function logoHash(section) {
  const hash = createHash("sha256");
  const icon = fs.readFileSync(path.join(MARKETING_DIR, logoFiles(section.id).icon), "utf8");
  for (const part of [icon, markName(section), JSON.stringify(LOGO_PALETTE), JSON.stringify(LOGO_SIZES), JSON.stringify(WIDE_LOGO)]) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function renderSvgPng(browser, svg, { width, height, scale = 1, file }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: true });
  await context.close();
}

async function textWidth(browser, name) {
  const page = await browser.newPage();
  await page.setContent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><text id="t" font-family="Arial, Arimo, sans-serif" font-weight="700" font-size="${WIDE_LOGO.fontSize}">${escapeHtml(name)}</text></svg>`,
  );
  const width = await page.evaluate(() => document.getElementById("t").getComputedTextLength());
  await page.close();
  return width;
}

/** Each brand's logo set: square logos on light, dark and no background, and the wide logo for light and dark. */
async function buildLogos(browser, data) {
  const manifest = { capturedAt: new Date().toISOString().slice(0, 10), logos: {} };
  for (const section of data.sections) {
    const files = logoFiles(section.id);
    const icon = fs.readFileSync(path.join(MARKETING_DIR, files.icon), "utf8");
    const out = (rel) => path.join(MARKETING_DIR, rel);
    for (const variant of ["light", "dark"]) {
      const svg = squareLogoSvg(icon, LOGO_PALETTE[variant].background);
      fs.writeFileSync(out(files.square[variant].svg), svg);
      for (const { size, file } of files.square[variant].png)
        await renderSvgPng(browser, svg, { width: size, height: size, file: out(file) });
    }
    for (const { size, file } of files.square.transparent.png)
      await renderSvgPng(browser, icon, { width: size, height: size, file: out(file) });
    const width = await textWidth(browser, markName(section));
    for (const variant of ["light", "dark"]) {
      const svg = wideLogoSvg(icon, markName(section), LOGO_PALETTE[variant].ink, width);
      fs.writeFileSync(out(files.wide[variant].svg), svg);
      const svgWidth = Number(svg.match(/width="(\d+)"/)[1]);
      await renderSvgPng(browser, svg, { width: svgWidth, height: WIDE_LOGO.height, scale: 2, file: out(files.wide[variant].png) });
    }
    manifest.logos[section.id] = { hash: logoHash(section) };
  }
  fs.writeFileSync(path.join(LOGOS_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote the logo sets of ${data.sections.length} brands to ${path.relative(REPO_ROOT, LOGOS_DIR)}`);
}

/** The founder's photograph cropped square at founderPhotoCrop, as the company pack's founder image. */
async function cropFounderPhoto(browser, company) {
  const { x, y, size } = company.founderPhotoCrop;
  const source = fs.readFileSync(path.join(REPO_ROOT, company.founderPhotoSource)).toString("base64");
  const context = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(
    `<body style="margin:0;overflow:hidden"><img alt="" src="data:image/jpeg;base64,${source}" style="position:absolute;left:${-x}px;top:${-y}px"></body>`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  fs.mkdirSync(COMPANY_DIR, { recursive: true });
  await page.screenshot({ path: path.join(MARKETING_DIR, company.founderPhoto), type: "jpeg", quality: 92 });
  await context.close();
}

async function buildImages() {
  const data = readMarketingData();
  const server = await serveMarketing();
  const browser = await chromium.launch();
  const manifest = {};
  let count = 0;
  try {
    await cropFounderPhoto(browser, data.company);
    await buildLogos(browser, data);
    for (const section of data.sections) {
      for (const set of section.sets) {
        manifest[set.id] = {};
        for (const size of data.imageSizes) {
          const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
          const page = await context.newPage();
          await page.goto(`${server.origin}/cards/card.html?set=${encodeURIComponent(set.id)}&size=${encodeURIComponent(size.id)}`);
          await page.waitForSelector("body[data-ready]", { timeout: 15000 });
          const file = path.join(IMAGES_DIR, set.id, `${size.id}.png`);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size.width, height: size.height } });
          await context.close();
          manifest[set.id][size.id] = { width: size.width, height: size.height, hash: imageHash({ section, set, size }) };
          count++;
        }
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(IMAGES_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${count} images to ${path.relative(REPO_ROOT, IMAGES_DIR)}`);
}

// ---------------------------------------------------------------------------------------------
// brand shots
// ---------------------------------------------------------------------------------------------

const CONSENT_DECLINED = () => {
  try {
    localStorage.setItem("consent.rum", "declined");
    localStorage.setItem("consent.analytics", "declined");
    // diya-gl's donation prompts, which would cover the products shot
    localStorage.setItem("diya-books-donation-seen-figures", "true");
    localStorage.setItem("diya-books-donation-seen-save", "true");
  } catch {
    // storage is blocked: the banner shows and the capture goes on
  }
};

async function shootFragment(browser, { origin, fragment, theme, storageState, file }) {
  const context = await browser.newContext({
    viewport: { width: fragment.width, height: 900 },
    colorScheme: theme,
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(CONSENT_DECLINED);
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: theme });
  try {
    await page.goto(new URL(fragment.page, origin).toString(), { waitUntil: "load", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const locator = page.locator(fragment.selector).first();
    await locator.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(300);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await locator.screenshot({ path: file, animations: "disabled" });
  } finally {
    await context.close();
  }
}

/** One pack screenshot at 1270 by 760: a page of a site, or a workbook image from the site on the canvas with its caption. */
async function shootPackScreenshot(browser, { origin, shot, storageState, file }) {
  const context = await browser.newContext({
    viewport: { width: PACK_SHOT.width, height: PACK_SHOT.height },
    colorScheme: "light",
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(CONSENT_DECLINED);
  const page = await context.newPage();
  try {
    if (shot.image) {
      const response = await fetch(new URL(shot.image, origin));
      if (!response.ok) throw new Error(`${shot.image}: ${response.status}`);
      const type = response.headers.get("content-type") ?? "image/png";
      const src = `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
      await page.setContent(
        `<body style="margin:0;width:${PACK_SHOT.width}px;height:${PACK_SHOT.height}px;background:#eef1f4;font-family:Arial,Arimo,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px">` +
          `<img alt="" src="${escapeHtml(src)}" style="max-width:1170px;max-height:620px;box-shadow:0 2px 12px rgba(0,0,0,.18);background:#fff">` +
          `<p style="margin:0;font-size:24px;color:#1b1b1b">${escapeHtml(shot.alt)}</p></body>`,
      );
      await page.locator("img").evaluate((img) => img.decode());
      await page.locator("img").evaluate((img) => {
        const scale = Math.min(1.6, 1170 / img.naturalWidth, 620 / img.naturalHeight);
        img.style.width = `${Math.round(img.naturalWidth * scale)}px`;
      });
    } else {
      await page.goto(new URL(shot.page, origin).toString(), { waitUntil: "load", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      if (shot.click) {
        await page.locator(shot.click).first().click({ timeout: 15000 });
        await page.mouse.move(0, 0);
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(6000);
      }
      if (shot.scrollTo)
        await page
          .locator(shot.scrollTo)
          .first()
          .evaluate((el) => el.scrollIntoView({ block: "start" }));
    }
    await page.waitForTimeout(300);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, animations: "disabled" });
  } finally {
    await context.close();
  }
}

function readOptions(argv) {
  const options = { siblings: null, bases: { ...LIVE_BASES } };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--siblings") options.siblings = argv[++i];
    else if (argv[i] === "--base-spreadsheets") options.bases.spreadsheets = argv[++i];
    else if (argv[i] === "--base-diya-gl") options.bases["diya-gl"] = argv[++i];
    else if (argv[i] === "--base-limited") options.bases.limited = argv[++i];
  }
  return options;
}

/** The signed-in state with a given name, so the header shows a person's name in place of the test address. */
function withDisplayName(storageState, givenName) {
  for (const origin of storageState.origins) {
    const entry = origin.localStorage.find((item) => item.name === "userInfo");
    if (entry) entry.value = JSON.stringify({ ...JSON.parse(entry.value), given_name: givenName });
  }
  return storageState;
}

async function buildBrandShots(options) {
  const data = readMarketingData();
  const shots = [];
  const packShots = [];
  let simulator = null;
  let browser = null;
  try {
    const needsSubmit =
      data.sections.some((s) => s.fragments.some((f) => f.source === "submit")) ||
      data.listingProducts.some((p) => p.screenshots.some((s) => s.source === "submit"));
    let submitOrigin = null;
    let storageState = null;
    if (needsSubmit) {
      simulator = await startSimulator();
      submitOrigin = configuredOrigin();
      const mapped = new URL(simulator.url);
      browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${new URL(submitOrigin).host} ${mapped.host}`] });
      storageState = withDisplayName(await signIn(browser, { pageOrigin: submitOrigin }), "Alex");
    } else {
      browser = await chromium.launch();
    }
    for (const section of data.sections) {
      const themes = section.hasDark ? ["light", "dark"] : ["light"];
      for (const fragment of section.fragments) {
        for (const theme of themes) {
          const file = path.join(SHOTS_DIR, section.id, `${fragment.id}-${theme}.png`);
          const origin = fragment.source === "submit" ? submitOrigin : options.bases[fragment.source];
          await shootFragment(browser, { origin, fragment, theme, storageState: fragment.signedIn ? storageState : null, file });
          shots.push({
            section: section.id,
            fragment: fragment.id,
            theme,
            width: fragment.width,
            file: path.relative(SHOTS_DIR, file).split(path.sep).join("/"),
          });
          console.log(`  ${path.relative(SHOTS_DIR, file)}`);
        }
      }
    }
    for (const pack of data.listingProducts) {
      for (const shot of pack.screenshots) {
        const origin = shot.source === "submit" ? submitOrigin : options.bases[shot.source];
        const file = path.join(MARKETING_DIR, shot.file);
        await shootPackScreenshot(browser, { origin, shot, storageState: shot.signedIn ? storageState : null, file });
        packShots.push({ pack: pack.id, shot: shot.id, file: shot.file });
        console.log(`  ${shot.file}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    if (simulator) simulator.stop();
  }
  fs.writeFileSync(
    path.join(PACKS_DIR, "manifest.json"),
    JSON.stringify({ capturedAt: new Date().toISOString().slice(0, 10), shots: packShots }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(SHOTS_DIR, "manifest.json"),
    JSON.stringify({ capturedAt: new Date().toISOString().slice(0, 10), shots }, null, 2) + "\n",
  );
  console.log(`Wrote ${shots.length} brand shots to ${path.relative(REPO_ROOT, SHOTS_DIR)}`);
}

// ---------------------------------------------------------------------------------------------
// page screenshots
// ---------------------------------------------------------------------------------------------

async function buildScreens() {
  const outDir = path.join(REPO_ROOT, "target", "marketing-screens");
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serveMarketing();
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
        const page = await context.newPage();
        await page.goto(`${server.origin}/index.html`, { waitUntil: "load" });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.screenshot({ path: path.join(outDir, `${width}-${theme}.png`), fullPage: true });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  console.log(`Wrote 4 screenshots to ${path.relative(REPO_ROOT, outDir)}`);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = readOptions(command && command.startsWith("--") ? process.argv.slice(2) : rest);
  const step = command && !command.startsWith("--") ? command : null;
  const siblings = findSiblings(options.siblings);
  if (step === null || step === "data") {
    fs.writeFileSync(JSON_FILE, renderMarketingJson());
    console.log(`Wrote ${path.relative(REPO_ROOT, JSON_FILE)}`);
  }
  if (step === null || step === "page")
    fs.writeFileSync(PAGE_FILE, await renderMarketingPage(fs.readFileSync(PAGE_FILE, "utf8"), readMarketingData()));
  if (step === null || step === "tokens") buildTokens(siblings);
  if (step === "images") await buildImages();
  if (step === "brand") await buildBrandShots(options);
  if (step === "screens") await buildScreens();
  if (step !== null && !["data", "page", "tokens", "images", "brand", "screens"].includes(step)) {
    throw new Error(`unknown subcommand ${step}; use data, page, tokens, images, brand or screens`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
