// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/msAdsCostPull.js
//
// Nightly job that pulls the Microsoft Advertising campaign performance report by day (impressions,
// clicks, spend, conversions) through the Reporting service and writes it as gzipped NDJSON under
// the lake's curated/ads/ads_cost/ prefix, beside the Google Ads rows. A row carries platform
// "microsoft" and no ad group, and no visitor or click identifier. The account signs in with
// Google, so the credentials are the ones infra/microsoft/ads/msads.js reads.

import { readFileSync } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "../../lib/logger.js";
import { parseConfig, openSession, discoverCustomer, runCampaignReport } from "../../lib/microsoftAdsReporting.js";
import { daysOf, toNdjsonGzip } from "./paypalDonationsPull.js";

const logger = createLogger({ source: "app/functions/analytics/msAdsCostPull.js" });

const MSADS_CONFIG_PATH = "infra/microsoft/ads/msads.toml";
const ACCOUNT_CURRENCY = "GBP";

let cachedS3Client = null;
let cachedSecretsClient = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

function getSecretsClient() {
  if (!cachedSecretsClient) {
    cachedSecretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsClient;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

/**
 * The lake rows of one day from the daily report rows: one row per campaign, with no ad group. A
 * row with no impressions, clicks or spend is left out.
 *
 * @param {Array<{date: string, campaignId: string, campaign: string, impressions: number, clicks: number, spend: number, conversions: number}>} reportRows
 * @returns {Array<Object>}
 */
export function msAdsCostRows(reportRows) {
  return reportRows
    .map((row) => ({
      date: row.date,
      platform: "microsoft",
      campaign_id: row.campaignId,
      campaign_name: row.campaign,
      ad_group_id: "",
      ad_group_name: "",
      impressions: row.impressions,
      clicks: row.clicks,
      cost_gbp: row.spend,
      conversions: row.conversions,
    }))
    .filter((row) => row.impressions > 0 || row.clicks > 0 || row.cost_gbp > 0);
}

export function objectKey(dateStr) {
  return `curated/ads/ads_cost/dt=${dateStr}/ms_ads_cost.json.gz`;
}

/**
 * Pull Microsoft Advertising cost into the lake, one object per day.
 *
 * @param {{date?: string, from?: string, to?: string}} [event] - `date` ("YYYY-MM-DD") overrides
 *   yesterday and today so far; `from` and `to` (inclusive, at most 93 days) backfill a range.
 * @returns {Promise<{days: Array<{date: string, key: string, count: number}>}>}
 */
export async function handler(event = {}) {
  const bucket = requireEnv("ANALYTICS_LAKE_BUCKET_NAME");
  const days = daysOf(event);

  const config = parseConfig(readFileSync(path.join(process.cwd(), MSADS_CONFIG_PATH), "utf-8"));
  const smClient = getSecretsClient();
  const clientSecret = (await smClient.send(new GetSecretValueCommand({ SecretId: config.oauthClientSecretName }))).SecretString;
  const installed = JSON.parse(clientSecret).installed;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error(`Secret ${config.oauthClientSecretName} does not have the {"installed": {"client_id", "client_secret"}} shape`);
  }
  const session = await openSession({
    config,
    clientCredentials: { client_id: installed.client_id, client_secret: installed.client_secret },
    smClient,
  });
  const { account } = await discoverCustomer(session);
  if (account.currency !== ACCOUNT_CURRENCY) {
    throw new Error(`Microsoft Advertising account ${config.accountNumber} reports in ${account.currency}, not ${ACCOUNT_CURRENCY}`);
  }

  const reportRows = await runCampaignReport(session, { from: days[0], to: days.at(-1), aggregation: "Daily" });
  const results = [];
  for (const targetDate of days) {
    const rows = msAdsCostRows(reportRows.filter((row) => row.date === targetDate));
    const key = objectKey(targetDate);
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: toNdjsonGzip(rows),
        ContentType: "application/json",
        ContentEncoding: "gzip",
      }),
    );
    logger.info({ message: "Microsoft Ads cost pull complete", date: targetDate, count: rows.length, key });
    results.push({ date: targetDate, key, count: rows.length });
  }
  return { days: results };
}
