#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-77 Report Bing Webmaster Tools statistics, crawl data and sitemap feeds
// - **Use when:** a task asks how the sites do in Bing, which queries and pages bring clicks there, what Bingbot reports as crawl issues, or whether Bing holds each sitemap.
// - **Does:** webmaster-report.js is a read-only report over the sites verified in the Bing Webmaster Tools account that owns BING_WEBMASTER_API_KEY. For each verified site it reads query and page statistics, daily rank and traffic, crawl statistics, crawl issues, the submitted feeds, the crawl settings and the URL information of the top pages, and writes one JSON report shaped like the Search Console report. It calls only Get methods, sends the key in the query string as the API takes it, and never prints the key or a request URL.
// - **Run:** `npm run bing:report-prod -- --out target/bing-webmaster-report.json` (reads prod/submit/bing/webmaster_api_key with the diya-submit-prod SSO profile); `BING_WEBMASTER_API_KEY=... npm run bing:report -- --out target/bing-webmaster-report.json`
// - **Entry:** `infra/bing/webmaster-report.js:main`
// - **Files:** infra/bing/webmaster-report.js, scripts/bing-report-secret.sh, app/unit-tests/scripts/bingWebmasterReport.test.js, app/unit-tests/fixtures/bing/
// - **Keywords:** bing webmaster, bing report, bing crawl issues, bing sitemap feeds, bing query statistics, bingbot, bing api key
// - **Related:** DATA-69, DATA-76
// @end-capability

// infra/bing/webmaster-report.js
//
// Usage:
//   BING_WEBMASTER_API_KEY=<key> node infra/bing/webmaster-report.js [--site <url>]... [--url-info <n>] [--json] [--out <path>]
//
// The API: https://learn.microsoft.com/en-us/bingwebmaster/api-protocols gives the JSON form
// `https://ssl.bing.com/webmaster/api.svc/json/<Method>?apikey=<key>&<parameter>=<value>`. The SOAP and
// POX forms retire on 2026-08-31; the JSON form stays. Each method's response sample is on its page
// under https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.<method in lower case>.
// A key is generated in Bing Webmaster Tools under Settings, API Access, Generate API Key
// (https://learn.microsoft.com/en-us/bingwebmaster/getting-access).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
export const KEY_VARIABLE = "BING_WEBMASTER_API_KEY";
export const DEFAULT_URL_INFO = 20;
const ROW_LIMIT = 50;
const CRAWL_ROWS = 30;
const REQUEST_TIMEOUT_MS = 30000;

export function parseArgs(argv) {
  const opts = { sites: [], urlInfo: DEFAULT_URL_INFO, json: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--site") {
      const site = argv[++i];
      if (!site) throw new Error("--site needs a site URL");
      opts.sites.push(site);
    } else if (arg === "--url-info") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0) throw new Error("--url-info needs a whole number of at least 0");
      opts.urlInfo = n;
    } else if (arg === "--out") {
      opts.out = argv[++i];
      if (!opts.out) throw new Error("--out needs a path");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

/**
 * The request URL for a method. The key is part of it, so a caller must not log it.
 *
 * @param {string} method
 * @param {Record<string, string>} params
 * @param {string} apiKey
 */
export function buildRequestUrl(method, params, apiKey) {
  const query = new URLSearchParams({ ...params, apikey: apiKey });
  return `${API_BASE}/${method}?${query.toString()}`;
}

/**
 * Call one Get method and return its payload. The documented answer wraps the payload as {"d": ...}.
 * An error carries the method and Bing's message, never the request URL.
 *
 * @param {string} method
 * @param {Record<string, string>} params
 * @param {{apiKey: string, fetchImpl?: typeof fetch}} context
 */
export async function callBing(method, params, { apiKey, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(buildRequestUrl(method, params, apiKey), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Bing Webmaster API ${method}: the request failed`);
  }
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Bing Webmaster API ${method}: status ${response.status} with a body that is not JSON`);
  }
  if (!response.ok) {
    throw new Error(
      `Bing Webmaster API ${method}: status ${response.status}, ${body?.Message ?? "no message"} (error code ${body?.ErrorCode ?? "none"})`,
    );
  }
  return body !== null && typeof body === "object" && "d" in body ? body.d : body;
}

/** An ISO day from Bing's `/Date(1316156400000-0700)/`; null when the text has no timestamp. */
export function parseBingDate(value) {
  const text = String(value ?? "");
  if (!text.startsWith("/Date(") || !text.endsWith(")/")) return null;
  const inner = text.slice(6, -2);
  const offsetAt = Math.max(inner.lastIndexOf("+"), inner.lastIndexOf("-"));
  const milliseconds = Number(offsetAt > 0 ? inner.slice(0, offsetAt) : inner);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString().slice(0, 10) : null;
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Query or page statistics as Search Console shapes them: one row per key with summed clicks and
 * impressions and the impression-weighted average position, most impressions first. Bing returns one
 * row per key per date, and names the page URL `Query` in GetPageStats.
 *
 * @param {object[]} rows QueryStats rows
 * @param {number} [limit]
 */
export function shapeStatRows(rows = [], limit = ROW_LIMIT) {
  const byKey = new Map();
  for (const row of rows) {
    const key = row.Query ?? "";
    const total = byKey.get(key) ?? { key, clicks: 0, impressions: 0, weightedPosition: 0 };
    total.clicks += row.Clicks ?? 0;
    total.impressions += row.Impressions ?? 0;
    total.weightedPosition += (row.AvgImpressionPosition ?? 0) * (row.Impressions ?? 0);
    byKey.set(key, total);
  }
  return [...byKey.values()]
    .map((total) => ({
      key: total.key,
      clicks: total.clicks,
      impressions: total.impressions,
      ctrPercent: total.impressions > 0 ? round1((total.clicks / total.impressions) * 100) : 0,
      position: total.impressions > 0 ? round1(total.weightedPosition / total.impressions) : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, limit);
}

/** Daily clicks and impressions, oldest first. */
export function shapeTraffic(rows = []) {
  return rows
    .map((row) => ({ date: parseBingDate(row.Date), clicks: row.Clicks ?? 0, impressions: row.Impressions ?? 0 }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Crawl statistics: the latest rows and the sum of each counter across all rows returned. */
export function shapeCrawl(rows = []) {
  const days = rows
    .map((row) => ({
      date: parseBingDate(row.Date),
      crawledPages: row.CrawledPages ?? 0,
      crawlErrors: row.CrawlErrors ?? 0,
      code2xx: row.Code2xx ?? 0,
      code301: row.Code301 ?? 0,
      code302: row.Code302 ?? 0,
      code4xx: row.Code4xx ?? 0,
      code5xx: row.Code5xx ?? 0,
      blockedByRobotsTxt: row.BlockedByRobotsTxt ?? 0,
      containsMalware: row.ContainsMalware ?? 0,
      allOtherCodes: row.AllOtherCodes ?? 0,
      inIndex: row.InIndex ?? 0,
      inLinks: row.InLinks ?? 0,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const counters = [
    "crawledPages",
    "crawlErrors",
    "code2xx",
    "code301",
    "code302",
    "code4xx",
    "code5xx",
    "blockedByRobotsTxt",
    "containsMalware",
    "allOtherCodes",
  ];
  const totals = Object.fromEntries(counters.map((counter) => [counter, days.reduce((sum, day) => sum + day[counter], 0)]));
  return { rows: days.length, totals, latest: days.slice(-CRAWL_ROWS) };
}

/** Crawl issues: the URL, its HTTP code and the issue flags as Bing returns them (a number in JSON). */
export function shapeIssues(rows = []) {
  return rows.map((row) => ({
    url: row.Url ?? "",
    httpCode: row.HttpCode ?? null,
    issueFlags: row.Issues ?? null,
    inLinks: row.InLinks ?? 0,
  }));
}

/** Submitted feeds (sitemaps). */
export function shapeFeeds(rows = []) {
  return rows.map((row) => ({
    url: row.Url ?? "",
    type: row.Type ?? "",
    status: row.Status ?? "",
    urlCount: row.UrlCount ?? 0,
    fileSize: row.FileSize ?? 0,
    compressed: row.Compressed ?? false,
    submitted: parseBingDate(row.Submitted),
    lastCrawled: parseBingDate(row.LastCrawled),
  }));
}

/** Crawl settings: the AJAX flag and the 24 hourly crawl-rate values. */
export function shapeSettings(settings) {
  return { ajaxEnabled: settings?.AjaxEnabled ?? null, crawlRate: Array.isArray(settings?.CrawlRate) ? settings.CrawlRate : null };
}

/** One URL's index details. */
export function shapeUrlInfo(url, info) {
  return {
    url,
    httpStatus: info?.HttpStatus ?? null,
    isPage: info?.IsPage ?? null,
    documentSize: info?.DocumentSize ?? null,
    anchorCount: info?.AnchorCount ?? null,
    discoveryDate: parseBingDate(info?.DiscoveryDate),
    lastCrawledDate: parseBingDate(info?.LastCrawledDate),
    totalChildUrlCount: info?.TotalChildUrlCount ?? null,
  };
}

/** The verified sites, from GetUserSites rows. */
export function shapeSites(rows = []) {
  return rows.map((row) => ({ url: row.Url ?? "", verified: row.IsVerified === true }));
}

/**
 * Read every section for one site. A method that fails is recorded under `errors` with its
 * message, so the report shows what is missing.
 */
export async function reportSite(siteUrl, context, urlInfoLimit = DEFAULT_URL_INFO) {
  const errors = {};
  const get = async (section, method, params, shape) => {
    try {
      return shape(await callBing(method, { siteUrl, ...params }, context));
    } catch (error) {
      errors[section] = error.message;
      return null;
    }
  };
  const queries = await get("queries", "GetQueryStats", {}, (rows) => shapeStatRows(rows));
  const pages = await get("pages", "GetPageStats", {}, (rows) => shapeStatRows(rows));
  const traffic = await get("traffic", "GetRankAndTrafficStats", {}, shapeTraffic);
  const crawl = await get("crawl", "GetCrawlStats", {}, shapeCrawl);
  const issues = await get("issues", "GetCrawlIssues", {}, shapeIssues);
  const feeds = await get("feeds", "GetFeeds", {}, shapeFeeds);
  const settings = await get("settings", "GetCrawlSettings", {}, shapeSettings);
  const urlInfo = [];
  for (const page of (pages ?? []).slice(0, urlInfoLimit)) {
    const info = await get(`urlInfo ${page.key}`, "GetUrlInfo", { url: page.key }, (answer) => shapeUrlInfo(page.key, answer));
    if (info) urlInfo.push(info);
  }
  return { siteUrl, queries, pages, traffic, crawl, issues, feeds, settings, urlInfo, errors };
}

export function renderSiteReport(report) {
  const lines = [`${report.siteUrl}`];
  const section = (name, rows) => lines.push(`  ${name}: ${rows === null ? "not read" : rows.length}`);
  section("queries", report.queries);
  section("pages", report.pages);
  section("feeds", report.feeds);
  section("crawl issues", report.issues);
  for (const row of (report.pages ?? []).slice(0, 5))
    lines.push(`    ${row.key} ${row.clicks} clicks, ${row.impressions} impressions, position ${row.position}`);
  for (const feed of report.feeds ?? []) lines.push(`    feed ${feed.url} ${feed.status}, ${feed.urlCount} URLs`);
  for (const [name, message] of Object.entries(report.errors)) lines.push(`  error in ${name}: ${message}`);
  return lines;
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const opts = parseArgs(argv);
  const apiKey = env[KEY_VARIABLE];
  if (!apiKey) {
    console.error(`Bing report skipped: set ${KEY_VARIABLE} to a Bing Webmaster Tools API key.`);
    process.exitCode = 1;
    return null;
  }
  const context = { apiKey, fetchImpl };
  const sites = shapeSites(await callBing("GetUserSites", {}, context));
  const wanted = opts.sites.length > 0 ? sites.filter((site) => opts.sites.includes(site.url)) : sites.filter((site) => site.verified);

  const reports = [];
  for (const site of wanted) {
    const report = await reportSite(site.url, context, opts.urlInfo);
    reports.push(report);
    if (!opts.json) for (const line of renderSiteReport(report)) console.log(line);
  }
  const output = { generated: new Date().toISOString(), sites, reports };
  if (opts.json) console.log(JSON.stringify(output, null, 2));
  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, JSON.stringify(output, null, 2));
  }
  if (reports.some((report) => Object.keys(report.errors).length > 0)) process.exitCode = 1;
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Bing Webmaster report failed:", err.message);
    process.exit(1);
  });
}
