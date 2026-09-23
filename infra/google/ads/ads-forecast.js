#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/google/ads/ads-forecast.js
//
// Read-only Google Ads keyword forecast for the account named in infra/google/ads/ads.toml, for
// a keyword list given on the command line: KeywordPlanIdeaService.GenerateKeywordHistoricalMetrics
// (monthly searches, competition and top-of-page bid range) and
// KeywordPlanIdeaService.GenerateKeywordForecastMetrics (expected clicks, cost and average CPC at
// a given daily budget, over a hypothetical Search campaign for the next 30 days). Reads
// credentials the same way infra/google/ads/ads-inventory.js does. It writes nothing anywhere:
// GenerateKeywordForecastMetrics forecasts against the hypothetical campaign described in its
// request body, and never creates, changes or spends against a live campaign.
//
// Geo and language are fixed to the United Kingdom (geoTargetConstants/2826) and English
// (languageConstants/1000). The forecast campaign uses a maximize-clicks bidding strategy at the
// given daily budget, which is what --budget-gbp maps onto without inventing a separate max CPC
// bid. Google Ads API v25's GenerateKeywordForecastMetricsResponse carries clicks, cost and
// average CPC but no impressions field, for any bidding strategy — the printed forecast omits it
// rather than showing a made-up number.
//
// Usage:
//   node infra/google/ads/ads-forecast.js --keywords "a,b" --budget-gbp 50 [--client-file <path>]
//   node infra/google/ads/ads-forecast.js --keywords-file <path> --budget-gbp 50 [--client-file <path>]

import { fileURLToPath } from "node:url";
import fs from "node:fs";

import { loadConfigFromRoot, getAdsAccessToken } from "./ads-inventory.js";

export const GEO_TARGET_CONSTANT_UK = "geoTargetConstants/2826";
export const LANGUAGE_CONSTANT_ENGLISH = "languageConstants/1000";

export function parseArgs(argv) {
  const opts = { keywords: undefined, keywordsFile: undefined, budgetGbp: undefined, clientFile: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--keywords") {
      const value = argv[++i];
      if (!value) throw new Error("--keywords requires a comma-separated list argument");
      opts.keywords = value;
    } else if (arg === "--keywords-file") {
      const value = argv[++i];
      if (!value) throw new Error("--keywords-file requires a path argument");
      opts.keywordsFile = value;
    } else if (arg === "--budget-gbp") {
      const value = argv[++i];
      if (!value) throw new Error("--budget-gbp requires a number argument");
      opts.budgetGbp = value;
    } else if (arg === "--client-file") {
      const value = argv[++i];
      if (!value) throw new Error("--client-file requires a path argument");
      opts.clientFile = value;
    } else if (arg === "--help") {
      console.log(
        'Usage: node infra/google/ads/ads-forecast.js --keywords "a,b" --budget-gbp 50 [--client-file <path>]\n' +
          "   or: node infra/google/ads/ads-forecast.js --keywords-file <path> --budget-gbp 50 [--client-file <path>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.keywords && !opts.keywordsFile) throw new Error("one of --keywords or --keywords-file is required");
  if (opts.keywords && opts.keywordsFile) throw new Error("--keywords and --keywords-file are mutually exclusive");
  if (!opts.budgetGbp) throw new Error("--budget-gbp is required");
  return opts;
}

export function parseKeywordsList(value) {
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

export function readKeywordsFile(path, readFileSync = fs.readFileSync) {
  return readFileSync(path, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function resolveKeywords(opts, readFileSync = fs.readFileSync) {
  const keywords = opts.keywords ? parseKeywordsList(opts.keywords) : readKeywordsFile(opts.keywordsFile, readFileSync);
  if (keywords.length === 0) throw new Error("no keywords given");
  return keywords;
}

export function parseBudgetGbp(value) {
  const gbp = Number(value);
  if (!Number.isFinite(gbp) || gbp <= 0) throw new Error(`--budget-gbp must be a positive number, got "${value}"`);
  return gbp;
}

function poundsToMicros(gbp) {
  return String(Math.round(gbp * 1_000_000));
}

function microsToPounds(micros) {
  if (micros === null || micros === undefined) return 0;
  return Number(micros) / 1_000_000;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * The forecast window GenerateKeywordForecastMetrics needs: a start date in the future through
 * 30 days after that, in the caller's UTC calendar.
 *
 * @param {Date} [now]
 * @returns {{from: string, to: string}}
 */
export function defaultForecastPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30));
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

/**
 * Request body for KeywordPlanIdeaService.GenerateKeywordHistoricalMetrics.
 *
 * @param {string[]} keywords
 * @returns {object}
 */
export function buildHistoricalMetricsRequest(keywords) {
  return {
    keywords,
    language: LANGUAGE_CONSTANT_ENGLISH,
    geoTargetConstants: [GEO_TARGET_CONSTANT_UK],
    keywordPlanNetwork: "GOOGLE_SEARCH",
  };
}

/**
 * Request body for KeywordPlanIdeaService.GenerateKeywordForecastMetrics: a hypothetical Search
 * campaign with one ad group holding `keywords` as broad match, a maximize-clicks bidding
 * strategy at the given daily budget, geo UK, language English.
 *
 * @param {string[]} keywords
 * @param {number} budgetGbp
 * @param {{from: string, to: string}} period
 * @returns {object}
 */
export function buildForecastMetricsRequest(keywords, budgetGbp, period) {
  return {
    forecastPeriod: { startDate: period.from, endDate: period.to },
    campaign: {
      languageConstants: [LANGUAGE_CONSTANT_ENGLISH],
      geoTargetConstants: [GEO_TARGET_CONSTANT_UK],
      biddingStrategy: { maximizeClicksBiddingStrategy: { dailyTargetSpendMicros: poundsToMicros(budgetGbp) } },
      adGroups: [{ keywords: keywords.map((text) => ({ text, matchType: "BROAD" })) }],
    },
  };
}

// --- Shaping: turn one API's raw response body into the plain rows the report prints. Pure
// and network-free so they are unit tested against recorded response fixtures. ---

export function shapeHistoricalMetrics(searchBody) {
  return (searchBody.results ?? []).map((row) => {
    const metrics = row.keywordMetrics ?? {};
    return {
      text: row.text,
      closeVariants: row.closeVariants ?? [],
      avgMonthlySearches: Number(metrics.avgMonthlySearches ?? 0),
      competition: metrics.competition ?? "UNSPECIFIED",
      competitionIndex:
        metrics.competitionIndex === undefined || metrics.competitionIndex === null ? null : Number(metrics.competitionIndex),
      lowTopOfPageBidGbp: microsToPounds(metrics.lowTopOfPageBidMicros),
      highTopOfPageBidGbp: microsToPounds(metrics.highTopOfPageBidMicros),
    };
  });
}

export function shapeForecastMetrics(forecastBody) {
  const metrics = forecastBody.campaignForecastMetrics ?? {};
  return {
    clicks: Number(metrics.clicks ?? 0),
    costGbp: microsToPounds(metrics.costMicros),
    averageCpcGbp: microsToPounds(metrics.averageCpcMicros),
  };
}

export function buildForecastReport({ keywords, budgetGbp, period, historical, forecast }) {
  return { keywords, budgetGbp, period, historical, forecast };
}

export function printForecastReport(report) {
  console.log(
    `=== Google Ads keyword forecast: ${report.keywords.length} keyword(s), £${report.budgetGbp.toFixed(2)}/day, ${report.period.from} to ${report.period.to} ===\n`,
  );

  console.log(`Historical metrics (${report.historical.length}):`);
  for (const row of report.historical) {
    const competitionIndex = row.competitionIndex === null ? "" : ` (${row.competitionIndex})`;
    console.log(
      `  ${row.text}: ${row.avgMonthlySearches} avg monthly searches, competition ${row.competition}${competitionIndex}, top-of-page bid £${row.lowTopOfPageBidGbp.toFixed(2)}-£${row.highTopOfPageBidGbp.toFixed(2)}`,
    );
  }
  console.log("");

  console.log("Forecast at this daily budget:");
  console.log(
    `  expected clicks ${report.forecast.clicks.toFixed(1)}, cost £${report.forecast.costGbp.toFixed(2)}, average CPC £${report.forecast.averageCpcGbp.toFixed(2)}`,
  );
  console.log("  no impressions field: Google Ads API v25's forecast response does not carry one");
}

async function keywordPlanIdeaServiceCall(token, customerId, apiVersion, method, requestBody) {
  const res = await fetch(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}:${method}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) throw new Error(`${res.status} from ${method}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const keywords = resolveKeywords(opts);
  const budgetGbp = parseBudgetGbp(opts.budgetGbp);
  const period = defaultForecastPeriod();

  const config = loadConfigFromRoot();
  const token = await getAdsAccessToken(config, { clientFile: opts.clientFile });

  const [historicalBody, forecastBody] = await Promise.all([
    keywordPlanIdeaServiceCall(
      token,
      config.customerId,
      config.apiVersion,
      "generateKeywordHistoricalMetrics",
      buildHistoricalMetricsRequest(keywords),
    ),
    keywordPlanIdeaServiceCall(
      token,
      config.customerId,
      config.apiVersion,
      "generateKeywordForecastMetrics",
      buildForecastMetricsRequest(keywords, budgetGbp, period),
    ),
  ]);

  const report = buildForecastReport({
    keywords,
    budgetGbp,
    period,
    historical: shapeHistoricalMetrics(historicalBody),
    forecast: shapeForecastMetrics(forecastBody),
  });
  printForecastReport(report);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("ads-forecast failed:", err.message);
    process.exit(1);
  });
}
