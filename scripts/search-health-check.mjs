#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-76 Check every site's live pages the way the search engines' site audits do
// - **Use when:** a task asks whether the live pages, sitemaps and robots.txt files of the six sites pass the checks that Google Search Console and Bing Webmaster Tools report, with no account and no API key.
// - **Does:** search-health-check.mjs reads the live sitemap of each site, then for each URL checks the status and redirect chain, the canonical, the robots meta tag and X-Robots-Tag header, the title and meta description, one h1, JSON-LD that parses and has a type, the viewport tag, image alternative text and the status of each internal link (each target once per site). It checks the sitemap (XML, host, lastmod, hreflang pairs), robots.txt (Googlebot and Bingbot may fetch every sitemap URL, no Crawl-delay, names the sitemap) and the IndexNow key file. It makes one request at a time per host with a pause, writes target/search-health-check.json and prints counts by check and each failing URL. It exits 0 unless --fail-on-errors is given.
// - **Run:** `npm run search:health`; `npm run search:health -- --site diya-gl.co.uk --out target/one.json`
// - **Entry:** `scripts/search-health-check.mjs:main`
// - **Files:** scripts/search-health-check.mjs, app/unit-tests/scripts/searchHealthCheck.test.js
// - **Keywords:** search health, seo audit, site scan, canonical, noindex, sitemap, robots.txt, hreflang, structured data, broken links, indexnow
// - **Related:** DATA-69, OPS-143
// @end-capability

// Usage: node scripts/search-health-check.mjs [--site <host>]... [--out <path>] [--pause <ms>] [--fail-on-errors]
//
// Each check names the report or rule of a search engine's tool that it mirrors. The names come from
// these pages, read on 2026-11-13:
//   Google Search Console, Page indexing report: https://support.google.com/webmasters/answer/7440203
//     reasons "Server error (5xx)", "Redirect error", "URL blocked by robots.txt", "URL marked 'noindex'",
//     "Not found (404)", "Alternate page with proper canonical tag", "Duplicate without user-selected canonical",
//     "Page with redirect".
//   Bing Webmaster Tools, Site Scan: the rule list page (https://www.bing.com/webmasters/help/site-scan-rules-5ba0a3f3)
//     answered 404 on that day, so a check that mirrors a Site Scan rule is named by what it tests, from
//     third-party descriptions of the scan (missing or long title, missing or long meta description, missing
//     or multiple h1, multiple canonical tags, missing image alt attribute, 4xx links).
// The title and description limits below are the usual snippet limits; no existing test fixes them.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { findKeyFile } from "./indexnow-submit.mjs";

const USER_AGENT = "search-health-check (self audit of our own sites)";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const DEFAULT_PAUSE_MS = 250;
const DEFAULT_OUT = "target/search-health-check.json";
export const TITLE_MIN = 10;
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 160;
const STDOUT_URLS_PER_CHECK = 12;
const SKIPPED_LINK_EXTENSIONS = new Set(["zip", "pdf", "xlsx", "xls", "docx", "mp4", "webm", "png", "jpg", "jpeg", "gif", "webp", "svg"]);

/** The sites, with the host of each sitemap. A site with no sitemap is not offered to search engines. */
export const SITES = [
  {
    host: "submit.diyaccounting.co.uk",
    sitemap: "https://submit.diyaccounting.co.uk/sitemap.xml",
    indexNow: true,
  },
  { host: "spreadsheets.diyaccounting.co.uk", sitemap: "https://spreadsheets.diyaccounting.co.uk/sitemap.xml" },
  { host: "diya-gl.co.uk", sitemap: "https://diya-gl.co.uk/sitemap.xml" },
  { host: "diyaccounting.co.uk", sitemap: "https://diyaccounting.co.uk/sitemap.xml" },
  { host: "marketing.diyaccounting.co.uk", sitemap: null },
  { host: "developer.diyaccounting.co.uk", sitemap: null },
];

/** Check id to the tool report or rule it mirrors. */
export const CHECKS = {
  "http-status": "Search Console Page indexing: Not found (404), Server error (5xx); Bing Site Scan: 4xx and 5xx pages",
  "redirect-chain": "Search Console Page indexing: Page with redirect, Redirect error",
  "canonical":
    "Search Console Page indexing: Duplicate without user-selected canonical, Alternate page with proper canonical tag; Bing Site Scan: missing or multiple canonical tags",
  "robots-meta": "Search Console Page indexing: URL marked 'noindex'; Bing Site Scan: noindex on a submitted page",
  "x-robots-tag": "Search Console Page indexing: URL marked 'noindex'",
  "title": "Bing Site Scan: missing or long title; Search Console snippet title",
  "meta-description": "Bing Site Scan: missing or long meta description",
  "h1": "Bing Site Scan: missing or multiple h1",
  "json-ld": "Search Console Enhancements: unparsable structured data",
  "viewport": "Search Console mobile usability: viewport not set",
  "image-alt": "Bing Site Scan: image without alt attribute",
  "internal-link": "Bing Site Scan: broken internal link; Search Console Page indexing: Not found (404)",
  "hreflang": "Search Console International targeting: hreflang return tags missing",
  "sitemap": "Search Console Sitemaps report: Couldn't fetch, Sitemap could not be read; Bing Sitemaps: feed status",
  "robots-txt": "Search Console Page indexing: URL blocked by robots.txt; Bing Webmaster crawl control: Crawl-delay",
  "indexnow": "Bing IndexNow: key file not found",
};

export function parseArgs(argv) {
  const opts = { sites: [], out: DEFAULT_OUT, pause: DEFAULT_PAUSE_MS, failOnErrors: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fail-on-errors") opts.failOnErrors = true;
    else if (arg === "--site") opts.sites.push(requireValue(argv[++i], "--site"));
    else if (arg === "--out") opts.out = requireValue(argv[++i], "--out");
    else if (arg === "--pause") opts.pause = nonNegativeInt(argv[++i], "--pause");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const host of opts.sites) {
    if (!SITES.some((site) => site.host === host)) throw new Error(`Unknown site: ${host}`);
  }
  return opts;
}

function requireValue(value, flag) {
  if (!value) throw new Error(`${flag} needs a value`);
  return value;
}

function nonNegativeInt(value, flag) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} needs a whole number of at least 0`);
  return n;
}

function issue(check, severity, url, value) {
  return { check, severity, url, value };
}

// happy-dom ends the document at a comment that holds a closing script tag, so comments go before
// the parse. A comment holds no page content.
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

function newWindow() {
  return new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
    },
  });
}

function parseHtml(html) {
  const window = newWindow();
  window.document.write(withoutComments(html));
  return window;
}

function squash(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function absolute(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/**
 * The sitemap's entries, or a parse error.
 *
 * @param {string} xml
 * @returns {{error: string|null, entries: {loc: string, lastmod: string|null, alternates: {hreflang: string, href: string}[]}[]}}
 */
export function parseSitemap(xml) {
  const window = newWindow();
  try {
    const doc = new window.DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelectorAll("parsererror").length > 0) return { error: "the XML does not parse", entries: [] };
    const root = doc.documentElement?.localName;
    if (root !== "urlset") return { error: `the root element is ${root ?? "missing"}, not urlset`, entries: [] };
    const entries = Array.from(doc.querySelectorAll("url"), (url) => ({
      loc: squash(url.querySelector("loc")?.textContent),
      lastmod: url.querySelector("lastmod") ? squash(url.querySelector("lastmod").textContent) : null,
      alternates: Array.from(url.getElementsByTagName("xhtml:link"))
        .filter((link) => link.getAttribute("rel") === "alternate")
        .map((link) => ({ hreflang: link.getAttribute("hreflang") ?? "", href: link.getAttribute("href") ?? "" })),
    }));
    return { error: null, entries };
  } finally {
    window.happyDOM.close();
  }
}

const LASTMOD_FORMAT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** The sitemap issues: the parse, the host of each loc, lastmod, and the hreflang pairs. */
export function checkSitemap(xml, host, sitemapUrl) {
  const { error, entries } = parseSitemap(xml);
  if (error) return { entries, issues: [issue("sitemap", "error", sitemapUrl, error)] };
  const issues = [];
  if (entries.length === 0) issues.push(issue("sitemap", "error", sitemapUrl, "the sitemap lists no URL"));
  const seen = new Set();
  for (const entry of entries) {
    const parsed = absolute(entry.loc, undefined);
    if (parsed === null) {
      issues.push(issue("sitemap", "error", sitemapUrl, `loc is not an absolute URL: ${entry.loc}`));
      continue;
    }
    if (new URL(parsed).host !== host) issues.push(issue("sitemap", "error", entry.loc, `loc is on ${new URL(parsed).host}, not ${host}`));
    if (seen.has(entry.loc)) issues.push(issue("sitemap", "warning", entry.loc, "loc appears twice"));
    seen.add(entry.loc);
    if (entry.lastmod === null) issues.push(issue("sitemap", "warning", entry.loc, "lastmod is missing"));
    else if (!LASTMOD_FORMAT.test(entry.lastmod) || Number.isNaN(Date.parse(entry.lastmod))) {
      issues.push(issue("sitemap", "warning", entry.loc, `lastmod is not a date: ${entry.lastmod}`));
    }
  }
  issues.push(...checkHreflangPairs(entries));
  return { entries, issues };
}

/** Each alternate must be a sitemap URL that lists the first URL back. */
export function checkHreflangPairs(entries) {
  const alternatesOf = new Map(entries.map((entry) => [entry.loc, entry.alternates]));
  const issues = [];
  for (const entry of entries) {
    for (const alternate of entry.alternates) {
      if (alternate.href === entry.loc) continue;
      if (!alternatesOf.has(alternate.href)) {
        issues.push(issue("hreflang", "error", entry.loc, `${alternate.hreflang} alternate ${alternate.href} is not in the sitemap`));
      } else if (!alternatesOf.get(alternate.href).some((back) => back.href === entry.loc)) {
        issues.push(issue("hreflang", "error", entry.loc, `${alternate.hreflang} alternate ${alternate.href} does not list this URL back`));
      }
    }
    if (entry.alternates.length > 0 && !entry.alternates.some((alternate) => alternate.href === entry.loc)) {
      issues.push(issue("hreflang", "warning", entry.loc, "the alternates do not include this URL itself"));
    }
  }
  return issues;
}

/** robots.txt as groups of user agents with their rules, and the sitemap and crawl-delay lines. */
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  const crawlDelays = [];
  let current = null;
  let collecting = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!collecting) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collecting = true;
      continue;
    }
    collecting = false;
    if (key === "sitemap") sitemaps.push(value);
    else if (current && (key === "allow" || key === "disallow")) current.rules.push({ allow: key === "allow", pattern: value });
    else if (key === "crawl-delay") crawlDelays.push({ agents: current ? current.agents : [], value });
  }
  return { groups, sitemaps, crawlDelays };
}

function patternMatches(pattern, path) {
  if (pattern === "") return false;
  let source = "";
  for (const char of pattern) {
    if (char === "*") source += ".*";
    else if (char === "$") source += "$";
    else source += char.replace(/[.+?^{}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}`).test(path);
}

/** Whether the agent may fetch the path: the group that names the agent, else `*`; the longest matching rule wins and Allow wins a tie. */
export function robotsAllows(robots, agent, path) {
  const name = agent.toLowerCase();
  const named = robots.groups.filter((group) => group.agents.includes(name));
  const groups = named.length > 0 ? named : robots.groups.filter((group) => group.agents.includes("*"));
  let best = null;
  for (const rule of groups.flatMap((group) => group.rules)) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (best === null || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow))
      best = rule;
  }
  return best === null ? true : best.allow;
}

/** The robots.txt issues for a site: Googlebot and Bingbot may fetch every sitemap URL, no Crawl-delay, the sitemap is named. */
export function checkRobots(text, { host, sitemapUrl, urls }) {
  const robotsUrl = `https://${host}/robots.txt`;
  const robots = parseRobots(text);
  const issues = [];
  if (robots.groups.length === 0) issues.push(issue("robots-txt", "error", robotsUrl, "robots.txt holds no user-agent group"));
  for (const entry of robots.crawlDelays) {
    issues.push(issue("robots-txt", "error", robotsUrl, `Crawl-delay ${entry.value} for ${entry.agents.join(", ") || "no agent"}`));
  }
  if (sitemapUrl && !robots.sitemaps.includes(sitemapUrl))
    issues.push(issue("robots-txt", "error", robotsUrl, `no Sitemap line for ${sitemapUrl}`));
  for (const bot of ["Googlebot", "Bingbot"]) {
    for (const url of urls) {
      const parsed = new URL(url);
      if (!robotsAllows(robots, bot, parsed.pathname + parsed.search))
        issues.push(issue("robots-txt", "error", url, `${bot} may not fetch this sitemap URL`));
    }
  }
  return issues;
}

/** The IndexNow key file must answer 200 with the key alone. */
export function checkIndexNowKey(status, body, key, keyUrl) {
  if (status !== 200) return [issue("indexnow", "error", keyUrl, `the key file answers ${status}`)];
  if (squash(body) !== key) return [issue("indexnow", "error", keyUrl, "the key file does not hold the key")];
  return [];
}

function metaContent(document, name) {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
}

function hasNoindex(value) {
  return (
    value !== null &&
    value
      .toLowerCase()
      .split(/[\s,]+/)
      .includes("noindex")
  );
}

function jsonLdTypes(parsed) {
  const nodes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
  return nodes.filter((node) => node && typeof node === "object" && node["@type"]);
}

/**
 * The checks that need one fetched page.
 *
 * @param {{url: string, status: number, headers: Record<string, string>, html: string, redirects: string[]}} page
 * @returns {{issues: object[], links: string[]}}
 */
export function checkPage(page) {
  const { url, status, headers, redirects } = page;
  const issues = [];
  if (redirects.length > 0)
    issues.push(issue("redirect-chain", "warning", url, `${redirects.length} redirect(s): ${redirects.join(" > ")}`));
  if (status !== 200) {
    issues.push(issue("http-status", "error", url, `status ${status}`));
    return { issues, links: [] };
  }
  const xRobots = headers["x-robots-tag"] ?? null;
  if (hasNoindex(xRobots)) issues.push(issue("x-robots-tag", "error", url, `X-Robots-Tag: ${xRobots}`));

  const window = parseHtml(page.html);
  try {
    const { document } = window;
    const robotsMeta = metaContent(document, "robots");
    if (hasNoindex(robotsMeta)) issues.push(issue("robots-meta", "error", url, `robots meta: ${robotsMeta}`));

    const canonicals = Array.from(document.querySelectorAll('link[rel="canonical"]'), (link) => link.getAttribute("href") ?? "");
    if (canonicals.length === 0) issues.push(issue("canonical", "error", url, "no canonical link"));
    else if (canonicals.length > 1) issues.push(issue("canonical", "error", url, `${canonicals.length} canonical links`));
    else if (!/^https?:\/\//.test(canonicals[0]))
      issues.push(issue("canonical", "error", url, `canonical is not absolute: ${canonicals[0]}`));
    else if (canonicals[0] !== url) {
      issues.push(issue("canonical", "warning", url, `canonical points to ${canonicals[0]}`));
    }

    const title = squash(document.querySelector("title")?.textContent);
    if (title === "") issues.push(issue("title", "error", url, "no title"));
    else if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      issues.push(issue("title", "warning", url, `title is ${title.length} characters (${TITLE_MIN} to ${TITLE_MAX}): ${title}`));
    }

    const description = squash(metaContent(document, "description"));
    if (description === "") issues.push(issue("meta-description", "error", url, "no meta description"));
    else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
      issues.push(
        issue(
          "meta-description",
          "warning",
          url,
          `description is ${description.length} characters (${DESCRIPTION_MIN} to ${DESCRIPTION_MAX})`,
        ),
      );
    }

    const h1Count = document.querySelectorAll("h1").length;
    if (h1Count !== 1) issues.push(issue("h1", "error", url, `${h1Count} h1 elements`));

    const blocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    if (blocks.length === 0) issues.push(issue("json-ld", "warning", url, "no JSON-LD"));
    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block.textContent);
        if (jsonLdTypes(parsed).length === 0) issues.push(issue("json-ld", "error", url, "a JSON-LD block has no @type"));
      } catch (error) {
        issues.push(issue("json-ld", "error", url, `a JSON-LD block does not parse: ${error.message}`));
      }
    }

    const viewport = metaContent(document, "viewport");
    if (viewport === null || !/width\s*=\s*device-width/.test(viewport))
      issues.push(issue("viewport", "error", url, `viewport: ${viewport ?? "missing"}`));

    const noAlt = Array.from(document.querySelectorAll("img")).filter((image) => !image.hasAttribute("alt"));
    if (noAlt.length > 0) {
      const sources = noAlt.slice(0, 3).map((image) => image.getAttribute("src") ?? "(no src)");
      issues.push(issue("image-alt", "warning", url, `${noAlt.length} image(s) without alt: ${sources.join(", ")}`));
    }

    return { issues, links: internalLinks(document, url) };
  } finally {
    window.happyDOM.close();
  }
}

function internalLinks(document, pageUrl) {
  const host = new URL(pageUrl).host;
  const targets = new Set();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    if (href === "" || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    const resolved = absolute(href, pageUrl);
    if (resolved === null) continue;
    const parsed = new URL(resolved);
    if (!/^https?:$/.test(parsed.protocol) || parsed.host !== host) continue;
    parsed.hash = "";
    const extension = parsed.pathname.split(".").pop().toLowerCase();
    if (SKIPPED_LINK_EXTENSIONS.has(extension)) continue;
    targets.add(parsed.href);
  }
  return [...targets];
}

/** The count of issues per check, errors and warnings together. */
export function countByCheck(issues) {
  const counts = {};
  for (const found of issues) counts[found.check] = (counts[found.check] ?? 0) + 1;
  return counts;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hostFetcher(pause) {
  const lastRequestAt = new Map();
  return async function politeFetch(url, method = "GET") {
    const host = new URL(url).host;
    const wait = (lastRequestAt.get(host) ?? 0) + pause - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
    const response = await fetch(url, {
      method,
      redirect: "manual",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const body = method === "GET" ? await response.text() : "";
    if (method === "HEAD") await response.body?.cancel();
    return { status: response.status, headers, body };
  };
}

async function fetchFollowing(politeFetch, url) {
  const redirects = [];
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await politeFetch(current);
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      current = absolute(location, current);
      redirects.push(`${response.status} ${current}`);
      if (current === null) return { ...response, redirects, finalUrl: url };
      continue;
    }
    return { ...response, redirects, finalUrl: current };
  }
  return { status: 310, headers: {}, body: "", redirects, finalUrl: current };
}

async function linkStatus(politeFetch, url) {
  let response = await politeFetch(url, "HEAD");
  if (response.status === 403 || response.status === 405) response = await politeFetch(url, "GET");
  return response.status;
}

async function checkSite(site, pause) {
  const politeFetch = hostFetcher(pause);
  const report = { host: site.host, sitemap: site.sitemap, urls: 0, pages: [], issues: [], notes: [] };
  const robotsUrl = `https://${site.host}/robots.txt`;
  const robotsResponse = await politeFetch(robotsUrl);

  if (site.sitemap === null) {
    report.notes.push(`no sitemap: robots.txt answers ${robotsResponse.status}`);
    if (robotsResponse.status === 200) {
      const robots = parseRobots(robotsResponse.body);
      if (robotsAllows(robots, "Googlebot", "/") || robotsAllows(robots, "Bingbot", "/")) {
        report.issues.push(issue("robots-txt", "warning", robotsUrl, "the site has no sitemap and robots.txt allows the root"));
      }
    }
    return report;
  }

  const sitemapResponse = await politeFetch(site.sitemap);
  if (sitemapResponse.status !== 200) {
    report.issues.push(issue("sitemap", "error", site.sitemap, `the sitemap answers ${sitemapResponse.status}`));
    return report;
  }
  const { entries, issues: sitemapIssues } = checkSitemap(sitemapResponse.body, site.host, site.sitemap);
  report.issues.push(...sitemapIssues);
  const urls = entries.map((entry) => entry.loc).filter((loc) => absolute(loc, undefined) !== null);
  report.urls = urls.length;

  if (robotsResponse.status !== 200)
    report.issues.push(issue("robots-txt", "error", robotsUrl, `robots.txt answers ${robotsResponse.status}`));
  else report.issues.push(...checkRobots(robotsResponse.body, { host: site.host, sitemapUrl: site.sitemap, urls }));

  if (site.indexNow) {
    const keyFile = findKeyFile(resolve(dirname(fileURLToPath(import.meta.url)), "../web/public"));
    if (keyFile === undefined) {
      report.issues.push(issue("indexnow", "error", `https://${site.host}/`, "web/public holds no single IndexNow key file"));
    } else {
      const keyUrl = `https://${site.host}/${keyFile.fileName}`;
      const keyResponse = await politeFetch(keyUrl);
      report.issues.push(...checkIndexNowKey(keyResponse.status, keyResponse.body, keyFile.key, keyUrl));
    }
  }

  const fetchedStatus = new Map();
  const linkSources = new Map();
  for (const url of urls) {
    let response;
    try {
      response = await fetchFollowing(politeFetch, url);
    } catch (error) {
      report.issues.push(issue("http-status", "error", url, `request failed: ${error.message}`));
      continue;
    }
    fetchedStatus.set(url, response.status);
    const { issues, links } = checkPage({
      url,
      status: response.status,
      headers: response.headers,
      html: response.body,
      redirects: response.redirects,
    });
    report.issues.push(...issues);
    report.pages.push({ url, status: response.status, issues: issues.length });
    for (const link of links) {
      if (!linkSources.has(link)) linkSources.set(link, []);
      linkSources.get(link).push(url);
    }
  }

  for (const [target, sources] of linkSources) {
    if (target === robotsUrl) continue;
    let status = fetchedStatus.get(target);
    if (status === undefined) {
      try {
        status = await linkStatus(politeFetch, target);
      } catch (error) {
        report.issues.push(issue("internal-link", "error", sources[0], `${target} request failed: ${error.message}`));
        continue;
      }
    }
    if (status !== 200) {
      const severity = status >= 400 ? "error" : "warning";
      report.issues.push(
        issue("internal-link", severity, sources[0], `${target} answers ${status} (linked from ${sources.length} page(s))`),
      );
    }
  }
  return report;
}

export function renderSummary(reports) {
  const lines = [];
  for (const report of reports) {
    lines.push(`${report.host}: ${report.urls} sitemap URLs, ${report.issues.length} findings`);
    for (const note of report.notes) lines.push(`  note: ${note}`);
    const counts = countByCheck(report.issues);
    for (const [check, count] of Object.entries(counts).sort()) lines.push(`  ${check}: ${count}`);
    const byCheck = new Map();
    for (const found of report.issues) {
      if (!byCheck.has(found.check)) byCheck.set(found.check, []);
      byCheck.get(found.check).push(found);
    }
    for (const [check, found] of byCheck) {
      for (const item of found.slice(0, STDOUT_URLS_PER_CHECK)) lines.push(`    [${item.severity}] ${check} ${item.url} ${item.value}`);
      if (found.length > STDOUT_URLS_PER_CHECK)
        lines.push(`    ... ${found.length - STDOUT_URLS_PER_CHECK} more ${check} findings in the JSON file`);
    }
  }
  return lines;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const sites = opts.sites.length > 0 ? SITES.filter((site) => opts.sites.includes(site.host)) : SITES;
  const reports = [];
  for (const site of sites) reports.push(await checkSite(site, opts.pause));

  const output = { generated: new Date().toISOString(), checks: CHECKS, sites: reports };
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(output, null, 2));
  for (const line of renderSummary(reports)) console.log(line);
  console.log(`wrote ${opts.out}`);
  const errors = reports.flatMap((report) => report.issues).filter((found) => found.severity === "error").length;
  if (opts.failOnErrors && errors > 0) process.exitCode = 1;
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Search health check failed:", error.message);
    process.exit(1);
  });
}
