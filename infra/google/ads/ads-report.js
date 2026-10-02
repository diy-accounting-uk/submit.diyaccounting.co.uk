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
//   node infra/google/ads/ads-report.js --status [--json] [--client-file <path>]
//
// --from and --to must be given together; without them the range is the 28 days ending
// yesterday. --json prints one JSON object instead of the stdout tables.
//
// --status replaces the metrics report with a serving-status read: account and billing status,
// then for each enabled campaign its status, primary status and reasons, budget, bidding and
// dates, and the status, primary status, reasons and approval of every ad group, ad and keyword.
// It answers why a campaign is serving nothing.

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

export const CUSTOMER_STATUS_QUERY = "SELECT customer.id, customer.descriptive_name, customer.status FROM customer";
export const BILLING_SETUP_QUERY = "SELECT billing_setup.id, billing_setup.status, billing_setup.payments_account FROM billing_setup";
export const CAMPAIGN_STATUS_QUERY =
  "SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.primary_status, campaign.primary_status_reasons, campaign.bidding_strategy_type, campaign.target_spend.cpc_bid_ceiling_micros, campaign.start_date_time, campaign.end_date_time, campaign_budget.amount_micros, campaign_budget.status FROM campaign WHERE campaign.status = 'ENABLED'";
export const AD_GROUP_STATUS_QUERY =
  "SELECT campaign.name, ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status, ad_group.primary_status_reasons FROM ad_group WHERE campaign.status = 'ENABLED'";
export const AD_STATUS_QUERY =
  "SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.primary_status, ad_group_ad.primary_status_reasons, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad WHERE campaign.status = 'ENABLED'";
export const KEYWORD_STATUS_QUERY =
  "SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.primary_status, ad_group_criterion.primary_status_reasons, ad_group_criterion.system_serving_status, ad_group_criterion.approval_status, ad_group_criterion.quality_info.quality_score FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND campaign.status = 'ENABLED'";

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
  const opts = { from: undefined, to: undefined, json: false, status: false, clientFile: undefined };
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
    } else if (arg === "--status") {
      opts.status = true;
    } else if (arg === "--client-file") {
      const value = argv[++i];
      if (!value) throw new Error("--client-file requires a path argument");
      opts.clientFile = value;
    } else if (arg === "--help") {
      console.log(
        "Usage: node infra/google/ads/ads-report.js [--from YYYY-MM-DD --to YYYY-MM-DD] [--json] [--client-file <path>]\n       node infra/google/ads/ads-report.js --status [--json] [--client-file <path>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if ((opts.from && !opts.to) || (!opts.from && opts.to)) {
    throw new Error("--from and --to must be given together");
  }
  if (opts.status && (opts.from || opts.to)) {
    throw new Error("--status reads current serving status and takes no --from or --to");
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

// --- Serving status: current state, not metrics. ---

export function shapeCustomerStatus(searchBody) {
  const row = (searchBody.results ?? [])[0]?.customer ?? {};
  return { id: row.id, name: row.descriptiveName, status: row.status };
}

export function shapeBillingSetups(searchBody) {
  return (searchBody.results ?? []).map((row) => ({
    id: row.billingSetup.id,
    status: row.billingSetup.status,
    paymentsAccount: row.billingSetup.paymentsAccount,
  }));
}

export function shapeCampaignStatusRows(searchBody) {
  return (searchBody.results ?? []).map((row) => ({
    id: row.campaign.id,
    name: row.campaign.name,
    status: row.campaign.status,
    servingStatus: row.campaign.servingStatus,
    primaryStatus: row.campaign.primaryStatus,
    primaryStatusReasons: row.campaign.primaryStatusReasons ?? [],
    budgetGbp: microsToPounds(row.campaignBudget?.amountMicros),
    budgetStatus: row.campaignBudget?.status,
    biddingStrategyType: row.campaign.biddingStrategyType,
    cpcCeilingGbp: microsToPounds(row.campaign.targetSpend?.cpcBidCeilingMicros),
    startDate: row.campaign.startDateTime,
    endDate: row.campaign.endDateTime,
  }));
}

export function shapeAdGroupStatusRows(searchBody) {
  return (searchBody.results ?? []).map((row) => ({
    campaignName: row.campaign.name,
    id: row.adGroup.id,
    name: row.adGroup.name,
    status: row.adGroup.status,
    primaryStatus: row.adGroup.primaryStatus,
    primaryStatusReasons: row.adGroup.primaryStatusReasons ?? [],
  }));
}

export function shapeAdStatusRows(searchBody) {
  return (searchBody.results ?? []).map((row) => {
    const ad = row.adGroupAd;
    return {
      campaignName: row.campaign.name,
      adGroupName: row.adGroup.name,
      id: ad.ad?.id,
      status: ad.status,
      primaryStatus: ad.primaryStatus,
      primaryStatusReasons: ad.primaryStatusReasons ?? [],
      approvalStatus: ad.policySummary?.approvalStatus,
      reviewStatus: ad.policySummary?.reviewStatus,
      policyTopics: (ad.policySummary?.policyTopicEntries ?? []).map((entry) => `${entry.type}:${entry.topic}`),
    };
  });
}

export function shapeKeywordStatusRows(searchBody) {
  return (searchBody.results ?? []).map((row) => {
    const criterion = row.adGroupCriterion;
    return {
      campaignName: row.campaign.name,
      adGroupName: row.adGroup.name,
      text: criterion.keyword?.text,
      matchType: criterion.keyword?.matchType,
      status: criterion.status,
      primaryStatus: criterion.primaryStatus,
      primaryStatusReasons: criterion.primaryStatusReasons ?? [],
      systemServingStatus: criterion.systemServingStatus,
      approvalStatus: criterion.approvalStatus,
      qualityScore: criterion.qualityInfo?.qualityScore ?? null,
    };
  });
}

export function buildStatusReport({ customer, billingSetups, campaigns, adGroups, ads, keywords }) {
  return { customer, billingSetups, campaigns, adGroups, ads, keywords };
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

function joinList(values) {
  return values.length === 0 ? "-" : values.join(",");
}

export function printStatusReport(report) {
  const { customer } = report;
  console.log(`=== Google Ads serving status: ${customer.name} (${customer.id}) ===\n`);
  console.log(`Account status: ${customer.status}`);
  console.log(`Billing setups (${report.billingSetups.length}):`);
  if (report.billingSetups.length === 0) console.log("  (none)");
  for (const setup of report.billingSetups) console.log(`  ${setup.id}  ${setup.status}  ${setup.paymentsAccount}`);
  console.log("");
  for (const campaign of report.campaigns) {
    console.log(`Campaign ${campaign.name} (${campaign.id})`);
    console.log(`  status ${campaign.status}  serving ${campaign.servingStatus}  primary ${campaign.primaryStatus}`);
    console.log(`  primary reasons: ${joinList(campaign.primaryStatusReasons)}`);
    console.log(`  budget ${formatGbp(campaign.budgetGbp)}/day  budget status ${campaign.budgetStatus}`);
    console.log(`  bidding ${campaign.biddingStrategyType}  CPC ceiling ${formatGbp(campaign.cpcCeilingGbp)}`);
    console.log(`  start ${campaign.startDate ?? "-"}  end ${campaign.endDate ?? "-"}\n`);
  }
  printTable(
    "Ad groups",
    [
      { label: "Ad group", value: (r) => r.name },
      { label: "Status", value: (r) => r.status },
      { label: "Primary", value: (r) => r.primaryStatus },
      { label: "Reasons", value: (r) => joinList(r.primaryStatusReasons) },
    ],
    report.adGroups,
  );
  printTable(
    "Ads",
    [
      { label: "Ad group", value: (r) => r.adGroupName },
      { label: "Ad", value: (r) => String(r.id) },
      { label: "Status", value: (r) => r.status },
      { label: "Primary", value: (r) => r.primaryStatus },
      { label: "Reasons", value: (r) => joinList(r.primaryStatusReasons) },
      { label: "Approval", value: (r) => String(r.approvalStatus) },
      { label: "Review", value: (r) => String(r.reviewStatus) },
      { label: "Policy topics", value: (r) => joinList(r.policyTopics) },
    ],
    report.ads,
  );
  printTable(
    "Keywords",
    [
      { label: "Ad group", value: (r) => r.adGroupName },
      { label: "Keyword", value: (r) => r.text },
      { label: "Status", value: (r) => r.status },
      { label: "Primary", value: (r) => r.primaryStatus },
      { label: "Reasons", value: (r) => joinList(r.primaryStatusReasons) },
      { label: "Serving", value: (r) => String(r.systemServingStatus) },
      { label: "Approval", value: (r) => String(r.approvalStatus) },
      { label: "QS", value: (r) => String(r.qualityScore ?? "-") },
    ],
    report.keywords,
  );
}

async function runStatus(config, token, opts) {
  const search = (query) => googleAdsSearch(token, config.customerId, config.apiVersion, query);
  const [customerBody, billingBody, campaignBody, adGroupBody, adBody, keywordBody] = await Promise.all([
    search(CUSTOMER_STATUS_QUERY),
    search(BILLING_SETUP_QUERY),
    search(CAMPAIGN_STATUS_QUERY),
    search(AD_GROUP_STATUS_QUERY),
    search(AD_STATUS_QUERY),
    search(KEYWORD_STATUS_QUERY),
  ]);
  const report = buildStatusReport({
    customer: shapeCustomerStatus(customerBody),
    billingSetups: shapeBillingSetups(billingBody),
    campaigns: shapeCampaignStatusRows(campaignBody),
    adGroups: shapeAdGroupStatusRows(adGroupBody),
    ads: shapeAdStatusRows(adBody),
    keywords: shapeKeywordStatusRows(keywordBody),
  });
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printStatusReport(report);
  }
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.status) {
    const statusConfig = loadConfigFromRoot();
    const statusToken = await getAdsAccessToken(statusConfig, { clientFile: opts.clientFile });
    return runStatus(statusConfig, statusToken, opts);
  }
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
