#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-25 Build the marketing site data, social images and brand shots
// - **Use when:** web/marketing/marketing.toml changes, a brand stylesheet changes, or the social images or brand shots of marketing.diyaccounting.co.uk need to be made again.
// - **Does:** build-marketing-site.mjs parses marketing.toml into marketing.json. It copies each site's colour tokens into brand/tokens.css and the fonts into brand/fonts. It renders every set at all 11 sizes into images/ through cards/card.html, and keeps a hash per image so a stale one shows. It captures the brand fragments of the four sites into brand/shots/, Submit through the simulator lane and the others from their live sites. It screenshots the finished page at two widths and two colour schemes.
// - **Run:** `npm run marketing:build` (data, then tokens); `npm run marketing:build -- images`; `npm run marketing:build -- brand`; `npm run marketing:build -- screens`
// - **Entry:** `scripts/build-marketing-site.mjs:main`
// - **Files:** scripts/build-marketing-site.mjs, web/marketing/marketing.toml, web/marketing/marketing-lib.js, web/marketing/cards/card.html, web/unit-tests/marketing-site.test.js
// - **Keywords:** marketing, social images, og image, brand guide, brand shots, design tokens, banners, share posts
// - **Related:** DEV-47, SITE-11
// @end-capability

// scripts/build-marketing-site.mjs
//
// Usage: node scripts/build-marketing-site.mjs [data|tokens|images|brand|screens]
//   no argument         data, then tokens
//   data                web/marketing/marketing.toml -> web/marketing/marketing.json
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

import { chromium } from "playwright";

import { configuredOrigin, signIn, startSimulator } from "./site-screenshots.mjs";

const require = createRequire(import.meta.url);
const TOML = require("@iarna/toml");

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MARKETING_DIR = path.join(REPO_ROOT, "web", "marketing");
export const TOML_FILE = path.join(MARKETING_DIR, "marketing.toml");
export const JSON_FILE = path.join(MARKETING_DIR, "marketing.json");
export const TOKENS_FILE = path.join(MARKETING_DIR, "brand", "tokens.css");
export const IMAGES_DIR = path.join(MARKETING_DIR, "images");
export const SHOTS_DIR = path.join(MARKETING_DIR, "brand", "shots");
export const FONT_FILES = [
  "atkinson-hyperlegible-latin-400-italic.woff2",
  "atkinson-hyperlegible-latin-400-normal.woff2",
  "atkinson-hyperlegible-latin-700-normal.woff2",
  "plain-zero-400-italic.woff2",
  "plain-zero-400-normal.woff2",
  "plain-zero-700-normal.woff2",
  "OFL.txt",
];

const LIVE_BASES = {
  "spreadsheets": "https://spreadsheets.diyaccounting.co.uk/",
  "diya-gl": "https://diya-gl.co.uk/",
  "limited": "https://diyaccounting.co.uk/",
};

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
    creditHoldDays: customer.holdDays,
    cashHoldDays: cash.holdDays,
    capMonthPounds: cash.capMonthPence / 100,
    capTaxYearPounds: cash.capTaxYearPence / 100,
  };
}

export function readMarketingData() {
  const data = JSON.parse(JSON.stringify(TOML.parse(fs.readFileSync(TOML_FILE, "utf8"))));
  data.affiliates = { ...data.affiliates, ...affiliateFigures() };
  return data;
}

export function renderMarketingJson() {
  return JSON.stringify(readMarketingData(), null, 2) + "\n";
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
  console.log(`Wrote ${path.relative(REPO_ROOT, TOKENS_FILE)} and ${FONT_FILES.length} font files`);
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

async function buildImages() {
  const data = readMarketingData();
  const server = await serveMarketing();
  const browser = await chromium.launch();
  const manifest = {};
  let count = 0;
  try {
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

async function buildBrandShots(options) {
  const data = readMarketingData();
  const shots = [];
  let simulator = null;
  let browser = null;
  try {
    const needsSubmit = data.sections.some((s) => s.fragments.some((f) => f.source === "submit"));
    let submitOrigin = null;
    let storageState = null;
    if (needsSubmit) {
      simulator = await startSimulator();
      submitOrigin = configuredOrigin();
      const mapped = new URL(simulator.url);
      browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${new URL(submitOrigin).host} ${mapped.host}`] });
      storageState = await signIn(browser, { pageOrigin: submitOrigin });
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
  } finally {
    if (browser) await browser.close();
    if (simulator) simulator.stop();
  }
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
  if (step === null || step === "tokens") buildTokens(siblings);
  if (step === "images") await buildImages();
  if (step === "brand") await buildBrandShots(options);
  if (step === "screens") await buildScreens();
  if (step !== null && !["data", "tokens", "images", "brand", "screens"].includes(step)) {
    throw new Error(`unknown subcommand ${step}; use data, tokens, images, brand or screens`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
