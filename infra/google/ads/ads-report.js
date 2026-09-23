#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/google/ads/ads-report.js
//
// Read-only Google Ads performance report for the account named in infra/google/ads/ads.toml:
// impressions, clicks, cost, average CPC, CTR, conversions and conversion value, per campaign,
// per ad group and per keyword, over a date range. Reads credentials and calls googleAds:search
// the same way infra/google/ads/ads-inventory.js does. It writes nothing anywhere.
//
// Usage:
//   node infra/google/ads/ads-report.js [--from YYYY-MM-DD --to YYYY-MM-DD] [--json] [--client-file <path>]
//
// --from and --to must be given together; without them the range is the 28 days ending
// yesterday. --json prints one JSON object instead of the stdout tables.

import { fileURLToPath } from "node:url";

import { loadConfigFromRoot, getAdsAccessToken, googleAdsSearch } from "./ads-inventory.js";

// Cost and average CPC come back from the API in micros (millionths of the account currency);
// CTR, conversions and conversion value do not.
export const CAMPAIGN_FIELDS = [
  "campaign.id",
  "campaign.name",
  "metrics.impressions",
  "metrics.clicks",
  "metrics.cost_micros",
  "metrics.average_cpc",
  "metrics.ctr",
  "metrics.conversions",
  "metrics.conversions_value",
];
export const AD_GROUP_FIELDS = [
  "campaign.name",
  "ad_group.id",
  "ad_group.name",
  "metrics.impressions",
  "metrics.clicks",
  "metrics.cost_micros",
  "metrics.average_cpc",
  "metrics.ctr",
  "metrics.conversions",
  "metrics.conversions_value",
];
export const KEYWORD_FIELDS = [
  "campaign.name",
  "ad_group.name",
  "ad_group_criterion.keyword.text",
  "ad_group_criterion.keyword.match_type",
  "metrics.impressions",
  "metrics.clicks",
  "metrics.cost_micros",
  "metrics.average_cpc",
  "metrics.ctr",
  "metrics.conversions",
  "metrics.conversions_value",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `segments.date BETWEEN` clause for a GAQL WHERE, after checking both dates are YYYY-MM-DD.
 *
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
export function buildDateRangeClause(from, to) {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    throw new Error(`--from and --to must be YYYY-MM-DD dates, got "${from}" and "${to}"`);
  }
  return `segments.date BETWEEN '${from}' AND '${to}'`;
}

export function buildCampaignQuery(from, to) {
  return `SELECT ${CAMPAIGN_FIELDS.join(", ")} FROM campaign WHERE ${buildDateRangeClause(from, to)}`;
}

export function buildAdGroupQuery(from, to) {
  return `SELECT ${AD_GROUP_FIELDS.join(", ")} FROM ad_group WHERE ${buildDateRangeClause(from, to)}`;
}

export function buildKeywordQuery(from, to) {
  return `SELECT ${KEYWORD_FIELDS.join(", ")} FROM keyword_view WHERE ${buildDateRangeClause(from, to)}`;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * The 28 days ending yesterday, in the caller's UTC calendar.
 *
 * @param {Date} [now]
 * @returns {{from: string, to: string}}
 */
export function defaultDateRange(now = new Date()) {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const from = new Date(yesterday);
  from.setUTCDate(from.getUTCDate() - 27);
  return { from: toIsoDate(from), to: toIsoDate(yesterday) };
}

export function parseArgs(argv) {
  const opts = { from: undefined, to: undefined, json: false, clientFile: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") {
      const value = argv[++i];
      if (!value) throw new Error("--from requires a YYYY-MM-DD date argument");
      opts.from = value;
    } else if (arg === "--to") {
      const value = argv[++i];
      if (!value) throw new Error("--to requires a YYYY-MM-DD date argument");
      opts.to = value;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--client-file") {
      const value = argv[++i];
      if (!value) throw new Error("--client-file requires a path argument");
      opts.clientFile = value;
    } else if (arg === "--help") {
      console.log("Usage: node infra/google/ads/ads-report.js [--from YYYY-MM-DD --to YYYY-MM-DD] [--json] [--client-file <path>]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if ((opts.from && !opts.to) || (!opts.from && opts.to)) {
    throw new Error("--from and --to must be given together");
  }
  return opts;
}

function microsToPounds(micros) {
  if (micros === null || micros === undefined) return 0;
  return Number(micros) / 1_000_000;
}

// --- Shaping: turn one API's raw response body into the plain rows the report prints. Pure
// and network-free so they are unit tested against a recorded response fixture. ---

export function shapeCampaignRows(searchBody) {
  return (searchBody.results ?? []).map((row) => {
    const metrics = row.metrics ?? {};
    return {
      id: row.campaign.id,
      name: row.campaign.name,
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      costGbp: microsToPounds(metrics.costMicros),
      averageCpcGbp: microsToPounds(metrics.averageCpc),
      ctr: Number(metrics.ctr ?? 0),
      conversions: Number(metrics.conversions ?? 0),
      conversionsValueGbp: Number(metrics.conversionsValue ?? 0),
    };
  });
}

export function shapeAdGroupRows(searchBody) {
  return (searchBody.results ?? []).map((row) => {
    const metrics = row.metrics ?? {};
    return {
      campaignName: row.campaign.name,
      id: row.adGroup.id,
      name: row.adGroup.name,
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      costGbp: microsToPounds(metrics.costMicros),
      averageCpcGbp: microsToPounds(metrics.averageCpc),
      ctr: Number(metrics.ctr ?? 0),
      conversions: Number(metrics.conversions ?? 0),
      conversionsValueGbp: Number(metrics.conversionsValue ?? 0),
    };
  });
}

export function shapeKeywordRows(searchBody) {
  return (searchBody.results ?? []).map((row) => {
    const metrics = row.metrics ?? {};
    const keyword = row.adGroupCriterion?.keyword ?? {};
    return {
      campaignName: row.campaign.name,
      adGroupName: row.adGroup.name,
      text: keyword.text,
      matchType: keyword.matchType,
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      costGbp: microsToPounds(metrics.costMicros),
      averageCpcGbp: microsToPounds(metrics.averageCpc),
      ctr: Number(metrics.ctr ?? 0),
      conversions: Number(metrics.conversions ?? 0),
      conversionsValueGbp: Number(metrics.conversionsValue ?? 0),
    };
  });
}

export function buildReport({ from, to, campaigns, adGroups, keywords }) {
  return { from, to, campaigns, adGroups, keywords };
}

function formatGbp(value) {
  return `£${value.toFixed(2)}`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

const CAMPAIGN_COLUMNS = [
  { label: "Campaign", value: (r) => r.name },
  { label: "Impressions", value: (r) => String(r.impressions) },
  { label: "Clicks", value: (r) => String(r.clicks) },
  { label: "Cost", value: (r) => formatGbp(r.costGbp) },
  { label: "Avg CPC", value: (r) => formatGbp(r.averageCpcGbp) },
  { label: "CTR", value: (r) => formatPercent(r.ctr) },
  { label: "Conversions", value: (r) => r.conversions.toFixed(2) },
  { label: "Conv. value", value: (r) => formatGbp(r.conversionsValueGbp) },
];
const AD_GROUP_COLUMNS = [
  { label: "Campaign", value: (r) => r.campaignName },
  { label: "Ad group", value: (r) => r.name },
  ...CAMPAIGN_COLUMNS.slice(1),
];
const KEYWORD_COLUMNS = [
  { label: "Campaign", value: (r) => r.campaignName },
  { label: "Ad group", value: (r) => r.adGroupName },
  { label: "Keyword", value: (r) => r.text },
  { label: "Match type", value: (r) => r.matchType },
  ...CAMPAIGN_COLUMNS.slice(1),
];

function printTable(title, columns, rows) {
  console.log(`${title} (${rows.length}):`);
  if (rows.length === 0) {
    console.log("  (no rows)\n");
    return;
  }
  const header = columns.map((column) => column.label);
  const lines = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = header.map((label, i) => Math.max(label.length, ...lines.map((line) => line[i].length)));
  const renderRow = (cells) => `  ${cells.map((cell, i) => cell.padEnd(widths[i])).join("  ")}`;
  console.log(renderRow(header));
  for (const line of lines) console.log(renderRow(line));
  console.log("");
}

export function printReport(report) {
  console.log(`=== Google Ads performance: ${report.from} to ${report.to} ===\n`);
  printTable("Campaigns", CAMPAIGN_COLUMNS, report.campaigns);
  printTable("Ad groups", AD_GROUP_COLUMNS, report.adGroups);
  printTable("Keywords", KEYWORD_COLUMNS, report.keywords);
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const { from, to } = opts.from ? { from: opts.from, to: opts.to } : defaultDateRange();
  buildDateRangeClause(from, to); // validates the format, including an explicit --from/--to

  const config = loadConfigFromRoot();
  const token = await getAdsAccessToken(config, { clientFile: opts.clientFile });

  const [campaignBody, adGroupBody, keywordBody] = await Promise.all([
    googleAdsSearch(token, config.customerId, config.apiVersion, buildCampaignQuery(from, to)),
    googleAdsSearch(token, config.customerId, config.apiVersion, buildAdGroupQuery(from, to)),
    googleAdsSearch(token, config.customerId, config.apiVersion, buildKeywordQuery(from, to)),
  ]);

  const report = buildReport({
    from,
    to,
    campaigns: shapeCampaignRows(campaignBody),
    adGroups: shapeAdGroupRows(adGroupBody),
    keywords: shapeKeywordRows(keywordBody),
  });

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("ads-report failed:", err.message);
    process.exit(1);
  });
}
