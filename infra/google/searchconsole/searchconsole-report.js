#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-68 Report Search Console search analytics and URL inspection
// - **Use when:** a task asks how the sites rank, which queries and pages bring clicks, or whether Google has indexed each sitemap URL.
// - **Does:** searchconsole-report.js is a read-only report over the properties in searchconsole.toml. It reads 90 days of search analytics (top queries and top pages with clicks, impressions, CTR and position) and runs the URL Inspection API on every URL in each declared sitemap, within the 2,000 a day quota of a property. Each inspection gives the verdict, coverage state, last crawl and Google's canonical against the declared one. It uses the webmasters.readonly scope and writes nothing to Google.
// - **Run:** `npm run searchconsole:report`; `npm run searchconsole:report -- --json --out target/searchconsole-report.json`
// - **Entry:** `infra/google/searchconsole/searchconsole-report.js:main`
// - **Files:** infra/google/searchconsole/searchconsole-report.js, infra/google/searchconsole/searchconsole.toml, app/unit-tests/scripts/searchconsoleReport.test.js, app/unit-tests/fixtures/searchconsole/
// - **Keywords:** search console report, search analytics, url inspection, indexing, sitemap urls, clicks, impressions, canonical
// - **Related:** DATA-67, DATA-47, DATA-53
// @end-capability

// infra/google/searchconsole/searchconsole-report.js
//
// Usage:
//   node infra/google/searchconsole/searchconsole-report.js [--days 90] [--max-inspections 2000] [--json] [--out <path>]
//
// Credentials: application default credentials, from google-github-actions/auth's federated
// exchange in CI or from scripts/gcp-as-sso.sh locally.
//
// URL inspection replaces the page indexing report, which has no API. Core Web Vitals field data
// comes from the CrUX API, which takes an API key; none is declared, so the report omits it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGoogleAuthorizedClient, assertFederatedCredentials } from "../lib/googleAuth.js";
import { loadConfigFromRoot, domainSiteUrl } from "./searchconsole-sync.js";

const SEARCH_CONSOLE_V3 = "https://www.googleapis.com/webmasters/v3";
const URL_INSPECTION = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const WEBMASTERS_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export const INSPECTION_DAILY_QUOTA = 2000;
export const DEFAULT_DAYS = 90;
const ANALYTICS_ROW_LIMIT = 50;
// Search analytics data lags by about three days.
const ANALYTICS_LAG_DAYS = 3;
const INSPECTION_CONCURRENCY = 4;

export function parseArgs(argv) {
  const opts = { days: DEFAULT_DAYS, maxInspections: INSPECTION_DAILY_QUOTA, json: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--days") {
      opts.days = positiveInt(argv[++i], "--days");
    } else if (arg === "--max-inspections") {
      opts.maxInspections = positiveInt(argv[++i], "--max-inspections");
    } else if (arg === "--out") {
      opts.out = argv[++i];
      if (!opts.out) throw new Error("--out needs a path");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function positiveInt(value, flag) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} needs a positive whole number`);
  return n;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * The search analytics date range: `days` days ending three days before `today`.
 *
 * @param {Date} today
 * @param {number} days
 * @returns {{startDate: string, endDate: string}}
 */
export function analyticsDateRange(today, days = DEFAULT_DAYS) {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ANALYTICS_LAG_DAYS));
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { startDate: isoDay(start), endDate: isoDay(end) };
}

/** The searchAnalytics.query body for one dimension. */
export function buildAnalyticsRequest(dimension, range) {
  return { ...range, dimensions: [dimension], rowLimit: ANALYTICS_ROW_LIMIT, dataState: "final" };
}

/**
 * Shape searchAnalytics rows: the dimension key plus clicks, impressions, CTR (percent) and
 * position, in the order the API returned them (highest clicks first).
 */
export function shapeAnalyticsRows(rows = []) {
  return rows.map((row) => ({
    key: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctrPercent: Math.round((row.ctr ?? 0) * 1000) / 10,
    position: Math.round((row.position ?? 0) * 10) / 10,
  }));
}

/** The `<loc>` URLs of a sitemap or sitemap index document. */
export function parseSitemapLocs(xml) {
  const text = String(xml);
  const locs = [];
  let from = 0;
  for (;;) {
    const open = text.indexOf("<loc>", from);
    if (open === -1) break;
    const close = text.indexOf("</loc>", open);
    if (close === -1) break;
    locs.push(
      text
        .slice(open + 5, close)
        .trim()
        .replaceAll("&amp;", "&"),
    );
    from = close + 6;
  }
  return locs;
}

/**
 * Shape one URL Inspection API answer. The Google canonical differs from the declared one when
 * Google chose another page as the representative of this URL.
 *
 * @param {string} url
 * @param {object} response the urlInspection index:inspect answer
 */
export function shapeInspection(url, response) {
  const index = response?.inspectionResult?.indexStatusResult ?? {};
  const googleCanonical = index.googleCanonical ?? null;
  const userCanonical = index.userCanonical ?? null;
  return {
    url,
    verdict: index.verdict ?? "UNKNOWN",
    coverageState: index.coverageState ?? "",
    indexingState: index.indexingState ?? "",
    robotsTxtState: index.robotsTxtState ?? "",
    lastCrawlTime: index.lastCrawlTime ?? null,
    googleCanonical,
    userCanonical,
    canonicalMatches: googleCanonical !== null && userCanonical !== null ? googleCanonical === userCanonical : null,
  };
}

/** A row for a URL whose inspection call failed, so one failure does not lose the others. */
export function inspectionFailure(url, message) {
  return {
    url,
    verdict: "ERROR",
    coverageState: String(message),
    indexingState: "",
    robotsTxtState: "",
    lastCrawlTime: null,
    googleCanonical: null,
    userCanonical: null,
    canonicalMatches: null,
  };
}

/**
 * Cut a URL list to the quota left for one property.
 *
 * @returns {{inspect: string[], skipped: number}}
 */
export function limitToQuota(urls, maxInspections = INSPECTION_DAILY_QUOTA) {
  const unique = [...new Set(urls)];
  return { inspect: unique.slice(0, maxInspections), skipped: Math.max(0, unique.length - maxInspections) };
}

/**
 * Count inspections by verdict and by coverage state, and list the canonical mismatches.
 */
export function summariseInspections(inspections) {
  const byVerdict = {};
  const byCoverageState = {};
  for (const inspection of inspections) {
    byVerdict[inspection.verdict] = (byVerdict[inspection.verdict] ?? 0) + 1;
    const state = inspection.coverageState || "(none)";
    byCoverageState[state] = (byCoverageState[state] ?? 0) + 1;
  }
  return {
    total: inspections.length,
    byVerdict,
    byCoverageState,
    canonicalMismatches: inspections
      .filter((i) => i.canonicalMatches === false)
      .map((i) => ({ url: i.url, google: i.googleCanonical, declared: i.userCanonical })),
  };
}

/** Stdout lines for one property's report. */
export function renderPropertyReport(report) {
  const lines = [`## ${report.siteUrl} (${report.range.startDate} to ${report.range.endDate})`];
  for (const [title, rows] of [
    ["Top queries", report.queries],
    ["Top pages", report.pages],
  ]) {
    lines.push("", `${title}: clicks, impressions, CTR %, position`);
    if (rows.length === 0) lines.push("  (no data)");
    for (const row of rows) lines.push(`  ${row.clicks}\t${row.impressions}\t${row.ctrPercent}\t${row.position}\t${row.key}`);
  }
  const s = report.inspectionSummary;
  lines.push("", `URL inspection: ${s.total} URLs inspected, ${report.inspectionSkipped} skipped over the quota`);
  for (const [verdict, count] of Object.entries(s.byVerdict)) lines.push(`  verdict ${verdict}: ${count}`);
  for (const [state, count] of Object.entries(s.byCoverageState)) lines.push(`  coverage ${state}: ${count}`);
  for (const m of s.canonicalMismatches) lines.push(`  canonical differs: ${m.url} -> Google ${m.google}, declared ${m.declared}`);
  return lines;
}

// --- Network ---

async function queryAnalytics(client, siteUrl, body) {
  const res = await client.request({
    url: `${SEARCH_CONSOLE_V3}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    method: "POST",
    data: body,
  });
  return res.data?.rows ?? [];
}

async function inspectUrl(client, siteUrl, url) {
  try {
    const res = await client.request({ url: URL_INSPECTION, method: "POST", data: { inspectionUrl: url, siteUrl } });
    return shapeInspection(url, res.data);
  } catch (err) {
    return inspectionFailure(url, err?.response?.status ?? err?.message ?? "request failed");
  }
}

async function fetchSitemapUrls(sitemapUrl) {
  const res = await fetch(sitemapUrl);
  if (!res.ok) throw new Error(`${sitemapUrl} answered ${res.status}`);
  return parseSitemapLocs(await res.text());
}

async function inspectAll(client, siteUrl, urls) {
  const results = new Array(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const index = next++;
      results[index] = await inspectUrl(client, siteUrl, urls[index]);
    }
  }
  await Promise.all(Array.from({ length: INSPECTION_CONCURRENCY }, worker));
  return results;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const config = loadConfigFromRoot();

  assertFederatedCredentials();
  const client = await createGoogleAuthorizedClient([WEBMASTERS_READONLY_SCOPE]);
  const range = analyticsDateRange(new Date(), opts.days);

  const reports = [];
  for (const property of config.properties) {
    const siteUrl = domainSiteUrl(property.domain);
    const queries = shapeAnalyticsRows(await queryAnalytics(client, siteUrl, buildAnalyticsRequest("query", range)));
    const pages = shapeAnalyticsRows(await queryAnalytics(client, siteUrl, buildAnalyticsRequest("page", range)));

    const urls = [];
    for (const sitemap of property.sitemaps) urls.push(...(await fetchSitemapUrls(sitemap)));
    const { inspect, skipped } = limitToQuota(urls, opts.maxInspections);
    const inspections = await inspectAll(client, siteUrl, inspect);

    const report = {
      siteUrl,
      range,
      queries,
      pages,
      inspections,
      inspectionSummary: summariseInspections(inspections),
      inspectionSkipped: skipped,
    };
    reports.push(report);
    if (!opts.json) for (const line of renderPropertyReport(report)) console.log(line);
  }

  const output = {
    generated: new Date().toISOString(),
    coreWebVitals: "omitted: the CrUX API takes an API key and none is declared",
    properties: reports,
  };
  if (opts.json) console.log(JSON.stringify(output, null, 2));
  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, JSON.stringify(output, null, 2));
  }
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Search Console report failed:", err.message);
    process.exit(1);
  });
}
