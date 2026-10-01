// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/adsCostPull.js
//
// Nightly job that pulls the previous day's Google Ads impressions, clicks and cost per campaign
// and ad group through the Ads API and writes them as gzipped NDJSON under the lake's
// curated/ads/ prefix. A campaign with no ad groups (Performance Max) gets one row with an empty
// ad group, so the day's rows always sum to the campaign's total. A lake row carries no visitor
// or click identifier.

import { readFileSync } from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "../../lib/logger.js";
import { daysOf, toNdjsonGzip } from "./paypalDonationsPull.js";

const logger = createLogger({ source: "app/functions/analytics/adsCostPull.js" });

const ADS_CONFIG_PATH = "infra/google/ads/ads.toml";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MICROS_PER_POUND = 1_000_000;

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

async function readSecret(secretId) {
  const { SecretString } = await getSecretsClient().send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!SecretString) throw new Error(`Secret ${secretId} has no SecretString`);
  return SecretString;
}

/**
 * The Ads customer id and API version from infra/google/ads/ads.toml.
 *
 * @param {string} [cwd]
 * @returns {{customerId: string, apiVersion: string}}
 */
export function readAdsAccount(cwd = process.cwd()) {
  const parsed = TOML.parse(readFileSync(path.join(cwd, ADS_CONFIG_PATH), "utf-8"));
  const customerId = parsed.account?.customer_id;
  const apiVersion = parsed.api?.version;
  if (!customerId || !apiVersion) throw new Error(`${ADS_CONFIG_PATH} is missing [account].customer_id or [api].version`);
  return { customerId, apiVersion };
}

/**
 * The Ads API bearer token: the stored OAuth client and refresh token exchanged at Google's token
 * endpoint.
 *
 * @param {{oauthClientSecretArn: string, refreshTokenSecretArn: string}} secrets
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export async function fetchAdsAccessToken({ oauthClientSecretArn, refreshTokenSecretArn }, fetchImpl = fetch) {
  const [clientJson, refreshJson] = await Promise.all([readSecret(oauthClientSecretArn), readSecret(refreshTokenSecretArn)]);
  const installed = JSON.parse(clientJson).installed;
  const refreshToken = JSON.parse(refreshJson).refresh_token;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error(`Secret ${oauthClientSecretArn} does not have the {"installed": {"client_id", "client_secret"}} shape`);
  }
  if (!refreshToken) throw new Error(`Secret ${refreshTokenSecretArn} has no refresh_token`);
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: installed.client_id,
      client_secret: installed.client_secret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`${response.status} from Google token endpoint: ${(await response.text()).slice(0, 500)}`);
  const { access_token: accessToken } = await response.json();
  if (!accessToken) throw new Error("Google token endpoint returned no access_token");
  return accessToken;
}

const DATE_FIELDS = ["campaign.id", "campaign.name", "metrics.impressions", "metrics.clicks", "metrics.cost_micros"];

export function buildCampaignQuery(date) {
  return `SELECT segments.date, ${DATE_FIELDS.join(", ")} FROM campaign WHERE segments.date = '${date}'`;
}

export function buildAdGroupQuery(date) {
  return `SELECT segments.date, ${DATE_FIELDS.slice(0, 2).join(", ")}, ad_group.id, ad_group.name, ${DATE_FIELDS.slice(2).join(", ")} FROM ad_group WHERE segments.date = '${date}'`;
}

/**
 * Every page of a googleAds:search query.
 *
 * @returns {Promise<Array<Object>>} the result rows
 */
export async function searchAllPages({ accessToken, customerId, apiVersion, query, fetchImpl = fetch }) {
  const rows = [];
  let pageToken;
  do {
    const response = await fetchImpl(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
    });
    if (!response.ok) throw new Error(`${response.status} from googleAds:search: ${(await response.text()).slice(0, 500)}`);
    const body = await response.json();
    rows.push(...(body.results ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return rows;
}

function metricsOf(result) {
  const metrics = result.metrics ?? {};
  return {
    impressions: Number(metrics.impressions ?? 0),
    clicks: Number(metrics.clicks ?? 0),
    cost_gbp: Number(metrics.costMicros ?? 0) / MICROS_PER_POUND,
  };
}

/**
 * The lake rows for one day from the campaign-level and ad-group-level search results. An ad
 * group row is kept as it is. A campaign with no ad-group row that day (Performance Max has no
 * ad groups) gets one row with an empty ad group id and name. A row with no impressions, clicks
 * or cost is left out.
 *
 * @param {Array<Object>} campaignResults
 * @param {Array<Object>} adGroupResults
 * @returns {Array<Object>}
 */
export function adsCostRows(campaignResults, adGroupResults) {
  const rows = [];
  const campaignsWithAdGroups = new Set();
  for (const result of adGroupResults) {
    campaignsWithAdGroups.add(result.campaign.id);
    rows.push({
      date: result.segments.date,
      campaign_id: result.campaign.id,
      campaign_name: result.campaign.name,
      ad_group_id: result.adGroup.id,
      ad_group_name: result.adGroup.name,
      ...metricsOf(result),
    });
  }
  for (const result of campaignResults) {
    if (campaignsWithAdGroups.has(result.campaign.id)) continue;
    rows.push({
      date: result.segments.date,
      campaign_id: result.campaign.id,
      campaign_name: result.campaign.name,
      ad_group_id: "",
      ad_group_name: "",
      ...metricsOf(result),
    });
  }
  return rows.filter((row) => row.impressions > 0 || row.clicks > 0 || row.cost_gbp > 0);
}

export function objectKey(dateStr) {
  return `curated/ads/ads_cost/dt=${dateStr}/ads_cost.json.gz`;
}

/**
 * Pull Google Ads cost into the lake, one object per day.
 *
 * @param {{date?: string, from?: string, to?: string}} [event] - `date` ("YYYY-MM-DD") overrides
 *   yesterday; `from` and `to` (inclusive, at most 93 days) backfill a range.
 * @returns {Promise<{days: Array<{date: string, key: string, count: number}>}>}
 */
export async function handler(event = {}) {
  const bucket = requireEnv("ANALYTICS_LAKE_BUCKET_NAME");
  const oauthClientSecretArn = requireEnv("ADS_OAUTH_CLIENT_SECRET_ARN");
  const refreshTokenSecretArn = requireEnv("ADS_REFRESH_TOKEN_SECRET_ARN");
  const days = daysOf(event);

  const { customerId, apiVersion } = readAdsAccount();
  const accessToken = await fetchAdsAccessToken({ oauthClientSecretArn, refreshTokenSecretArn });

  const results = [];
  for (const targetDate of days) {
    const [campaignResults, adGroupResults] = await Promise.all([
      searchAllPages({ accessToken, customerId, apiVersion, query: buildCampaignQuery(targetDate) }),
      searchAllPages({ accessToken, customerId, apiVersion, query: buildAdGroupQuery(targetDate) }),
    ]);
    const rows = adsCostRows(campaignResults, adGroupResults);

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
    logger.info({ message: "Ads cost pull complete", date: targetDate, count: rows.length, key });
    results.push({ date: targetDate, key, count: rows.length });
  }
  return { days: results };
}
