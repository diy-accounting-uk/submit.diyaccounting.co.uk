#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/exploratory-crawl.mjs
//
// A blind crawl of the site. It follows every same-origin link and submits every form empty, as
// each role, at a desktop and a phone viewport, in light and dark, and records what a reader
// would see as broken: a 4xx or 5xx response, a console error, a failed request, a broken image,
// sideways overflow, text that overflows its box, a heavy page, and a raw identifier in the
// page text outside a developer section. It finds; it does not judge.
//
// Output: target/exploratory-crawl/<lane>/<role>/<viewport>-<theme>/ holds contact-sheet.html,
// one PNG per page and findings.json. target/exploratory-crawl/summary.md holds the counts.
//
// The customer role reads the storage state `node scripts/mint-exploratory-state.mjs` writes.
//
// Usage: node scripts/exploratory-crawl.mjs --lane <ci|prod|simulator> [--base-url <url>]
//   [--roles visitor,customer] [--viewports desktop,phone] [--themes light,dark]
//   [--max-pages 300] [--state-file .cache/playwright-mcp/ci-state.json] [--out target/exploratory-crawl]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
};
export const THEMES = ["light", "dark"];
export const ROLES = ["visitor", "customer"];
export const LANE_BASE_URLS = {
  ci: "https://ci-submit.diyaccounting.co.uk/",
  prod: "https://submit.diyaccounting.co.uk/",
};
export const DEFAULT_OUT_DIR = "target/exploratory-crawl";
export const DEFAULT_STATE_FILE = ".cache/playwright-mcp/ci-state.json";
export const DEFAULT_MAX_PAGES = 300;
// The prod web ACL blocks an address that sends more than 2000 requests in 5 minutes. The crawl
// keeps its own count under that line, across all of its browser contexts, which share one address.
export const PACING_WINDOW_MS = 5 * 60 * 1000;
export const PROD_REQUEST_BUDGET = 1200;
// Requests one page may add after the pacer lets it start: the page, its assets and the form retries.
export const PAGE_REQUEST_RESERVE = 80;
export const BLOCKED_RUN_MINIMUM = 3;
export const PAGE_WEIGHT_LIMIT_BYTES = 1.5 * 1024 * 1024;
export const FINDING_CLASSES = [
  "http-error",
  "console-error",
  "failed-request",
  "broken-image",
  "sideways-overflow",
  "text-overflow",
  "page-weight",
  "raw-identifier",
];
// Query parameters that only reorder or slice a list: one value of each is crawled.
const LIST_PARAMETERS = new Set(["sort", "order", "orderby", "dir", "page", "offset", "limit", "cursor"]);
// A signed-in crawl must not end its own session or destroy the customer's data.
const DANGEROUS_PATH = /(log-?out|sign-?out|delete|remove|revoke|cancel|unsubscribe)/i;
const DOWNLOAD_PATH = /\.(pdf|zip|csv|xlsx?|docx?|xml|xbrl|json|txt|ics|png|jpe?g|gif|svg|webp|ico|woff2?|mp4|webm)$/i;

const RAW_IDENTIFIER_PATTERNS = [
  ["uuid", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ["stripe-id", /\b(?:cus|sub|price|prod|pi|cs|in|evt|plink)_[A-Za-z0-9]{8,}\b/],
  ["arn", /\barn:aws:[a-z0-9-]+:[a-z0-9-]*:\d*:[^\s]+/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/],
  ["stack-name", /\b(?:ci|prod)(?:-[a-z0-9]+)?-(?:app|env)-[A-Za-z]+Stack\b/],
  ["undefined-text", /\b(?:undefined|NaN|\[object Object\])\b/],
  ["template-placeholder", /\{\{\s*[\w.]+\s*\}\}|\$\{[\w.]+\}/],
];

export function parseArguments(argv) {
  const options = {
    lane: null,
    baseUrl: null,
    roles: ["visitor"],
    viewports: Object.keys(VIEWPORTS),
    themes: [...THEMES],
    maxPages: DEFAULT_MAX_PAGES,
    stateFile: DEFAULT_STATE_FILE,
    outDir: DEFAULT_OUT_DIR,
    requestBudget: null,
  };
  const valueFlags = {
    "--lane": "lane",
    "--base-url": "baseUrl",
    "--roles": "roles",
    "--viewports": "viewports",
    "--themes": "themes",
    "--max-pages": "maxPages",
    "--state-file": "stateFile",
    "--out": "outDir",
    "--request-budget": "requestBudget",
  };
  const listKeys = new Set(["roles", "viewports", "themes"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = valueFlags[argv[index]];
    if (!key) {
      throw new Error(`Unknown argument ${argv[index]}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argv[index]} needs a value`);
    }
    if (listKeys.has(key)) {
      options[key] = value.split(",").filter(Boolean);
    } else if (key === "maxPages") {
      options[key] = Number.parseInt(value, 10);
      if (!Number.isInteger(options[key]) || options[key] < 1) {
        throw new Error("--max-pages needs a positive whole number");
      }
    } else if (key === "requestBudget") {
      options[key] = Number.parseInt(value, 10);
      if (!Number.isInteger(options[key]) || options[key] < 0) {
        throw new Error("--request-budget needs a whole number, 0 for no limit");
      }
    } else {
      options[key] = value;
    }
    index += 1;
  }
  if (!options.lane) {
    throw new Error("--lane is required");
  }
  if (!options.baseUrl && !LANE_BASE_URLS[options.lane]) {
    throw new Error(`--base-url is required for lane ${options.lane}`);
  }
  for (const role of options.roles) {
    if (!ROLES.includes(role)) throw new Error(`Unknown role ${role}`);
  }
  for (const viewport of options.viewports) {
    if (!VIEWPORTS[viewport]) throw new Error(`Unknown viewport ${viewport}`);
  }
  for (const theme of options.themes) {
    if (!THEMES.includes(theme)) throw new Error(`Unknown theme ${theme}`);
  }
  if (options.requestBudget === null) {
    options.requestBudget = options.lane === "prod" ? PROD_REQUEST_BUDGET : 0;
  }
  return options;
}

// Counts the requests of every browser context in a sliding window and holds a page back until its
// reserve fits under the budget. A budget of 0 never waits.
// Every concurrent crawl may start a page at the same moment, so the room kept free is one reserve
// for each of them.
export function createRequestPacer({
  budget,
  windowMs = PACING_WINDOW_MS,
  reserve = PAGE_REQUEST_RESERVE,
  concurrency = 1,
  now = Date.now,
  sleep,
}) {
  const room = reserve * concurrency;
  const sleepFor = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const stamps = [];
  const prune = () => {
    const cutoff = now() - windowMs;
    while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
  };
  return {
    record() {
      stamps.push(now());
    },
    count() {
      prune();
      return stamps.length;
    },
    async waitForRoom() {
      if (!budget) return 0;
      let waited = 0;
      prune();
      while (stamps.length > 0 && stamps.length + room > budget) {
        const delay = Math.max(1, stamps[0] + windowMs - now() + 1);
        await sleepFor(delay);
        waited += delay;
        prune();
      }
      return waited;
    },
  };
}

// A run of consecutive 403 pages is the edge refusing this client, not a missing page each time.
// The first page of the run carries one finding that names the block; the rest carry none.
export function collapseBlockedRuns(pages, minimumRun = BLOCKED_RUN_MINIMUM) {
  const result = [];
  let index = 0;
  while (index < pages.length) {
    let end = index;
    while (end < pages.length && pages[end].status === 403) end += 1;
    const length = end - index;
    if (length >= minimumRun) {
      const first = pages[index];
      const last = pages[end - 1];
      result.push({
        ...first,
        findings: [
          {
            class: "http-error",
            detail: `blocked: status 403 on ${length} consecutive pages from ${first.label} to ${last.label}; the edge refused this client, so these pages are unchecked`,
          },
        ],
      });
      for (let rest = index + 1; rest < end; rest += 1) {
        result.push({ ...pages[rest], findings: [] });
      }
      index = end;
    } else {
      result.push(pages[index]);
      index += 1;
    }
  }
  return result;
}

// Returns the absolute URL to crawl, or null when the link is not a page of this site.
export function normaliseLink(href, pageUrl, baseUrl, { signedIn = false } = {}) {
  if (!href) return null;
  if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(href.trim())) return null;
  let url;
  try {
    url = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (url.origin !== new URL(baseUrl).origin) return null;
  url.hash = "";
  if (signedIn && DANGEROUS_PATH.test(url.pathname)) return null;
  return url.toString();
}

// One key per page shape: the path plus the names of the query parameters, so a list is crawled
// once with its default order, once with a sort and once with a page, never once per value.
export function crawlKey(urlString) {
  const url = new URL(urlString);
  const names = [...new Set([...url.searchParams.keys()])].sort();
  const pathname = url.pathname.replace(/\/index\.html$/, "/");
  return `${pathname}?${names.join("&")}`;
}

// A list link that changes only the order or the slice, after the first of its kind.
export function isListVariant(urlString) {
  const url = new URL(urlString);
  return [...url.searchParams.keys()].some((name) => LIST_PARAMETERS.has(name.toLowerCase()));
}

export function isDownloadLink(urlString) {
  return DOWNLOAD_PATH.test(new URL(urlString).pathname);
}

export function slugForUrl(urlString) {
  const url = new URL(urlString);
  const raw = `${url.pathname}${url.search}`.replace(/^\/+/, "").replace(/\/index\.html$/, "");
  const slug = raw.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (slug || "home").slice(0, 80);
}

export function findRawIdentifiers(text) {
  const found = [];
  for (const [kind, pattern] of RAW_IDENTIFIER_PATTERNS) {
    const match = pattern.exec(text ?? "");
    if (match) found.push({ kind, sample: match[0].slice(0, 80) });
  }
  return found;
}

// Turns one page's measurements into findings. The record is what the browser pass collects:
// status, consoleErrors[], failedRequests[], brokenImages[], scrollWidth, clientWidth,
// overflowingText[], bytes, visibleText.
export function classifyPage(record) {
  const findings = [];
  if (typeof record.status === "number" && record.status >= 400) {
    findings.push({ class: "http-error", detail: `status ${record.status}` });
  }
  if (record.status === null || record.status === undefined) {
    findings.push({ class: "http-error", detail: "no response" });
  }
  for (const message of record.consoleErrors ?? []) {
    findings.push({ class: "console-error", detail: message });
  }
  for (const failure of record.failedRequests ?? []) {
    findings.push({ class: "failed-request", detail: failure });
  }
  for (const source of record.brokenImages ?? []) {
    findings.push({ class: "broken-image", detail: source });
  }
  if (record.scrollWidth > record.clientWidth + 1) {
    findings.push({ class: "sideways-overflow", detail: `scrollWidth ${record.scrollWidth} over clientWidth ${record.clientWidth}` });
  }
  for (const description of record.overflowingText ?? []) {
    findings.push({ class: "text-overflow", detail: description });
  }
  if (record.bytes > PAGE_WEIGHT_LIMIT_BYTES) {
    findings.push({ class: "page-weight", detail: `${(record.bytes / 1024 / 1024).toFixed(2)} MB` });
  }
  for (const identifier of findRawIdentifiers(record.visibleText)) {
    findings.push({ class: "raw-identifier", detail: `${identifier.kind}: ${identifier.sample}` });
  }
  return findings;
}

export function countByClass(pages) {
  const counts = Object.fromEntries(FINDING_CLASSES.map((name) => [name, 0]));
  for (const page of pages) {
    for (const finding of page.findings) {
      counts[finding.class] = (counts[finding.class] ?? 0) + 1;
    }
  }
  return counts;
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

export function renderContactSheet({ lane, role, viewport, theme, baseUrl, pages }) {
  const counts = countByClass(pages);
  const countList = FINDING_CLASSES.map((name) => `<li>${escapeHtml(name)}: ${counts[name]}</li>`).join("");
  const cards = pages
    .map((page) => {
      const items = page.findings.map((finding) => `<li><b>${escapeHtml(finding.class)}</b> ${escapeHtml(finding.detail)}</li>`).join("");
      const image = page.screenshot
        ? `<a href="${escapeHtml(page.screenshot)}"><img loading="lazy" src="${escapeHtml(page.screenshot)}" alt=""></a>`
        : "<p>no screenshot</p>";
      const flagged = page.findings.length > 0 ? " flagged" : "";
      return `<figure class="card${flagged}">${image}<figcaption><a href="${escapeHtml(page.url)}">${escapeHtml(page.label)}</a> <span>${escapeHtml(String(page.status))}</span><ul>${items}</ul></figcaption></figure>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crawl ${escapeHtml(lane)} ${escapeHtml(role)} ${escapeHtml(viewport)} ${escapeHtml(theme)}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1b1b1b;--line:#c9c9c9;--flag:#b00020}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--line:#444;--flag:#ff8a80}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
a{color:inherit}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.card{margin:0;border:1px solid var(--line);padding:8px;overflow-wrap:anywhere}
.card.flagged{border-color:var(--flag);border-width:2px}
.card img{width:100%;height:auto;max-height:420px;object-fit:cover;object-position:top}
ul{padding-left:18px;margin:4px 0}
</style></head><body>
<h1>${escapeHtml(lane)} / ${escapeHtml(role)} / ${escapeHtml(viewport)} / ${escapeHtml(theme)}</h1>
<p>${escapeHtml(baseUrl)}: ${pages.length} pages</p>
<ul>${countList}</ul>
<div class="grid">
${cards}
</div></body></html>
`;
}

export function renderSummary(runs) {
  const header = ["| Lane | Role | Viewport | Theme | Pages", ...FINDING_CLASSES.map((name) => ` ${name}`)].join(" |") + " |";
  const divider = "|" + new Array(5 + FINDING_CLASSES.length).fill(" --- ").join("|") + "|";
  const rows = runs.map((run) => {
    const counts = countByClass(run.pages);
    return `| ${run.lane} | ${run.role} | ${run.viewport} | ${run.theme} | ${run.pages.length} | ${FINDING_CLASSES.map((name) => counts[name]).join(" | ")} |`;
  });
  const total = countByClass(runs.flatMap((run) => run.pages));
  const totalRow = `| all | | | | ${runs.reduce((sum, run) => sum + run.pages.length, 0)} | ${FINDING_CLASSES.map((name) => total[name]).join(" | ")} |`;
  return ["# Exploratory crawl", "", header, divider, ...rows, totalRow, ""].join("\n");
}

// The in-page measurement. It runs inside the browser, so it takes no outside names.
export function measurePage() {
  const developerSelector = ".developer, [data-developer], details, pre, code, script, style, textarea, input, select, noscript";
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(developerSelector).forEach((element) => element.remove());
  const brokenImages = Array.from(document.images)
    .filter((image) => image.complete && image.naturalWidth === 0 && image.currentSrc)
    .map((image) => image.currentSrc);
  // Screen-reader-only text is clipped to nothing on purpose: a clip rectangle or clip path that
  // shows no pixels, or a box of one pixel or less.
  const isVisuallyHidden = (element, style) => {
    const clip = (style.clip ?? "").replace(/\s+/g, "");
    if (/^rect\(0(px)?,0(px)?,0(px)?,0(px)?\)$/.test(clip)) return true;
    if (/^(inset\((50|100)%\)|circle\(0|polygon\(0)/.test((style.clipPath ?? "").replace(/\s+/g, ""))) return true;
    const box = element.getBoundingClientRect();
    return box.width <= 1 && box.height <= 1;
  };
  const overflowingText = [];
  for (const element of document.body.querySelectorAll("*")) {
    if (overflowingText.length >= 10) break;
    if (element.children.length > 0 && !element.matches("a, button, label, td, th, li, p, h1, h2, h3, h4, span")) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (isVisuallyHidden(element, style)) continue;
    if (!element.textContent.trim()) continue;
    if (
      style.overflowX === "visible" &&
      element.scrollWidth > element.clientWidth + 1 &&
      element.clientWidth > 0 &&
      style.display !== "inline"
    ) {
      overflowingText.push(`${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 40)}"`);
    } else if (style.overflowX === "hidden" && style.textOverflow !== "ellipsis" && element.scrollWidth > element.clientWidth + 1) {
      overflowingText.push(`${element.tagName.toLowerCase()} clipped "${element.textContent.trim().slice(0, 40)}"`);
    }
  }
  const links = Array.from(document.querySelectorAll("a[href]")).map((anchor) => anchor.getAttribute("href"));
  return {
    brokenImages,
    overflowingText,
    links,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    visibleText: clone.innerText ?? clone.textContent ?? "",
    formCount: document.querySelectorAll("form").length,
    title: document.title,
  };
}

async function crawlOne({ browser, lane, role, viewport, theme, baseUrl, maxPages, storageState, outDir, pacer }) {
  const runDir = path.join(outDir, lane, role, `${viewport}-${theme}`);
  fs.mkdirSync(runDir, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    colorScheme: theme,
    storageState,
    isMobile: viewport === "phone",
    hasTouch: viewport === "phone",
  });
  const page = await context.newPage();
  context.on("request", () => pacer.record());
  let consoleErrors = [];
  let failedRequests = [];
  let bytes = 0;
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`.slice(0, 300)));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`.slice(0, 300));
  });
  page.on("response", async (response) => {
    try {
      const declared = response.headers()["content-length"];
      const length = declared === undefined ? (await response.request().sizes()).responseBodySize : Number(declared);
      bytes += Number.isFinite(length) && length > 0 ? length : 0;
    } catch {
      // A response with no readable headers adds nothing to the weight.
    }
  });

  const signedIn = role !== "visitor";
  const queue = [new URL(baseUrl).toString()];
  const seen = new Set();
  const listVariantsTaken = new Map();
  const pages = [];
  let sequence = 0;

  const record = async (urlString, label, status, extra) => {
    sequence += 1;
    const number = String(sequence).padStart(3, "0");
    const screenshot = `${number}-${slugForUrl(urlString)}${extra.suffix ?? ""}.png`;
    try {
      await page.screenshot({ path: path.join(runDir, screenshot), fullPage: true, timeout: 20000 });
    } catch {
      // A page whose screenshot fails still carries its measurements.
    }
    const measured = await page.evaluate(measurePage).catch(() => null);
    const findings = classifyPage({
      status,
      consoleErrors,
      failedRequests,
      bytes,
      ...(measured ?? { scrollWidth: 0, clientWidth: 0 }),
    });
    pages.push({ url: urlString, label, status, screenshot, findings });
    consoleErrors = [];
    failedRequests = [];
    bytes = 0;
    return measured;
  };

  while (queue.length > 0 && pages.length < maxPages) {
    const urlString = queue.shift();
    const key = crawlKey(urlString);
    if (seen.has(key)) continue;
    seen.add(key);
    if (isListVariant(urlString)) {
      const base = new URL(urlString).pathname;
      const taken = listVariantsTaken.get(base) ?? 0;
      if (taken >= 2) continue;
      listVariantsTaken.set(base, taken + 1);
    }

    await pacer.waitForRoom();
    if (isDownloadLink(urlString)) {
      pacer.record();
      const response = await context.request.get(urlString, { failOnStatusCode: false, timeout: 30000 }).catch(() => null);
      const body = response ? await response.body().catch(() => Buffer.alloc(0)) : Buffer.alloc(0);
      sequence += 1;
      const status = response ? response.status() : null;
      pages.push({
        url: urlString,
        label: new URL(urlString).pathname,
        status,
        screenshot: null,
        findings: classifyPage({ status, bytes: body.length, scrollWidth: 0, clientWidth: 0 }),
      });
      continue;
    }

    consoleErrors = [];
    failedRequests = [];
    bytes = 0;
    let response = null;
    try {
      response = await page.goto(urlString, { waitUntil: "networkidle", timeout: 30000 });
    } catch {
      response = await page.goto(urlString, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    }
    const contentType = response?.headers()["content-type"] ?? "";
    if (response && !/html/i.test(contentType)) {
      const body = await response.body().catch(() => Buffer.alloc(0));
      sequence += 1;
      pages.push({
        url: urlString,
        label: new URL(urlString).pathname,
        status: response.status(),
        screenshot: null,
        findings: classifyPage({ status: response.status(), bytes: body.length, scrollWidth: 0, clientWidth: 0 }),
      });
      continue;
    }
    const measured = await record(
      urlString,
      new URL(urlString).pathname + new URL(urlString).search,
      response ? response.status() : null,
      {},
    );
    if (!measured) continue;

    for (const href of measured.links) {
      const next = normaliseLink(href, urlString, baseUrl, { signedIn });
      if (next && !seen.has(crawlKey(next))) queue.push(next);
    }

    for (let formIndex = 0; formIndex < Math.min(measured.formCount, 3) && pages.length < maxPages; formIndex += 1) {
      await pacer.waitForRoom();
      await page.goto(urlString, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      consoleErrors = [];
      failedRequests = [];
      bytes = 0;
      const submit = page.locator("form").nth(formIndex).locator('button[type="submit"], input[type="submit"], button:not([type])').first();
      if ((await submit.count()) === 0) continue;
      const submitted = await submit
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!submitted) continue;
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => null);
      await record(page.url(), `${new URL(urlString).pathname} form ${formIndex + 1} empty submit`, 200, {
        suffix: `-form-${formIndex + 1}`,
      });
    }
  }

  const collapsed = collapseBlockedRuns(pages);
  const result = { lane, role, viewport, theme, baseUrl, pageCount: collapsed.length, counts: countByClass(collapsed), pages: collapsed };
  fs.writeFileSync(path.join(runDir, "findings.json"), JSON.stringify(result, null, 2) + "\n");
  fs.writeFileSync(path.join(runDir, "contact-sheet.html"), renderContactSheet(result));
  await context.close();
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  let baseUrl = options.baseUrl ?? LANE_BASE_URLS[options.lane];
  if (!options.baseUrl && options.lane === "ci") {
    const { resolveDeployedBaseUrl } = await import("./use-deployed-base-url.js");
    baseUrl = await resolveDeployedBaseUrl(baseUrl);
  }
  if (options.roles.includes("customer") && !fs.existsSync(options.stateFile)) {
    throw new Error(`${options.stateFile} is missing. Run node scripts/mint-exploratory-state.mjs first.`);
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const runs = [];
  const pacer = createRequestPacer({
    budget: options.requestBudget,
    concurrency: options.viewports.length * options.themes.length,
  });
  try {
    for (const role of options.roles) {
      const storageState = role === "visitor" ? undefined : options.stateFile;
      const combinations = options.viewports.flatMap((viewport) => options.themes.map((theme) => ({ viewport, theme })));
      const results = await Promise.all(
        combinations.map(({ viewport, theme }) =>
          crawlOne({
            browser,
            lane: options.lane,
            role,
            viewport,
            theme,
            baseUrl,
            maxPages: options.maxPages,
            storageState,
            outDir: options.outDir,
            pacer,
          }),
        ),
      );
      runs.push(...results);
    }
  } finally {
    await browser.close();
  }
  fs.mkdirSync(options.outDir, { recursive: true });
  const summaryFile = path.join(options.outDir, `summary-${options.lane}.md`);
  fs.writeFileSync(summaryFile, renderSummary(runs));
  for (const run of runs) {
    console.log(`${run.lane}/${run.role}/${run.viewport}-${run.theme}: ${run.pageCount} pages ${JSON.stringify(run.counts)}`);
  }
  console.log(`Wrote ${summaryFile}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
