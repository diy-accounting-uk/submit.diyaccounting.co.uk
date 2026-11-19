// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-59 Pull Google Ads daily cost into the lake
// - **Use when:** Google Ads impressions, clicks, cost and conversions must land in the lake, or backfill a date range.
// - **Does:** adsCostPull.js reads Google Ads performance (impressions, clicks, cost and conversions) by day, campaign and ad group through the Ads API, for today and the 90 days before it (CONVERSION_WINDOW_DAYS), because Google adds a conversion to the day of its click for as long as the conversion action's click-through window runs, and the upload purchase action (Import from clicks) has Google's 90-day default; one campaign search and one ad group search cover the range, and each day is written to its own dt= partition under a fixed key, so a re-pull replaces it. It authenticates with an OAuth client and a refresh token that it reads from Secrets Manager (ADS_OAUTH_CLIENT_SECRET_ARN, ADS_REFRESH_TOKEN_SECRET_ARN). A campaign with no ad groups (Performance Max) receives one row with an empty ad group, so daily rows always sum to the campaign total. It writes gzipped NDJSON under curated/ads/ads_cost/dt=YYYY-MM-DD/. AdsCostTables.java provisions the ads_cost Glue table with dt partition projection. The job exists only in prod when ADS_COST_PULL_ENABLED is true. msAdsCostPull.js writes the Microsoft Advertising rows (platform microsoft, with conversions) by day and campaign beside them, from infra/microsoft/ads/msads.toml and the shared app/lib/microsoftAdsReporting.js, in prod only. v_ads_cost_daily sums by day, platform and campaign; v_ads_cost_per_paid_landing_daily divides each platform's daily cost by v_paid_landings_daily's gclid (google) or msclkid (microsoft) count. operatorSnapshotPublish.js measures ads-cost-gbp, ads-cost-per-paid-landing-gbp and a ms- twin of each Ads row from them, and draws both platforms' conversions on the Ads conversions tab from v_ads_performance_daily. fxRatePull.js reads the European Central Bank 90-day reference rates nightly into curated/fx/fx_rates/ (FxRateTables.java); v_usd_gbp_daily carries the last rate over non-working days and v_contribution_daily converts the dollar AWS bill to pounds with it.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/analytics/adsCostPull.js:handler`
// - **Files:** app/functions/analytics/adsCostPull.js, app/unit-tests/analytics/adsCostPull.test.js, app/functions/analytics/msAdsCostPull.js, app/unit-tests/analytics/msAdsCostPull.test.js, app/lib/microsoftAdsReporting.js, app/functions/analytics/fxRatePull.js, app/unit-tests/analytics/fxRatePull.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/FxRateTables.java, app/unit-tests/analytics/fixtures/adsCostAdGroupSearch.json, app/unit-tests/analytics/fixtures/adsCostCampaignSearch.json, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AdsCostTables.java, infra/main/resources/analytics/views/v_ads_cost_daily.sql, infra/main/resources/analytics/views/v_ads_cost_per_paid_landing_daily.sql, infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflow.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViewsTest.java
// - **Keywords:** google ads cost, google ads conversions, impressions clicks, ads api, workload identity federation, curated ads, performance max, cost per paid landing, nightly pull, operator objective
// - **Related:** DATA-58, DATA-32, DATA-33
// @end-capability

// app/functions/analytics/adsCostPull.js
//
// Nightly job that pulls Google Ads impressions, clicks, cost and conversions per campaign and ad
// group, for today and the 90 days before it, through the Ads API and writes them as gzipped
// NDJSON under the lake's curated/ads/ prefix, one object per day. A campaign with no ad groups (Performance Max) gets one row with an empty
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

const DATE_FIELDS = ["campaign.id", "campaign.name", "metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions"];

// The query's date condition: one day, or every day from the first to the last inclusive. Each
// result row carries its own segments.date, so a range gives each day the metrics a one-day
// query of that day gives.
function dateCondition(firstDate, lastDate) {
  return firstDate === lastDate ? `segments.date = '${firstDate}'` : `segments.date BETWEEN '${firstDate}' AND '${lastDate}'`;
}

export function buildCampaignQuery(firstDate, lastDate = firstDate) {
  return `SELECT segments.date, ${DATE_FIELDS.join(", ")} FROM campaign WHERE ${dateCondition(firstDate, lastDate)}`;
}

export function buildAdGroupQuery(firstDate, lastDate = firstDate) {
  return `SELECT segments.date, ${DATE_FIELDS.slice(0, 2).join(", ")}, ad_group.id, ad_group.name, ${DATE_FIELDS.slice(2).join(", ")} FROM ad_group WHERE ${dateCondition(firstDate, lastDate)}`;
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
    conversions: Number(metrics.conversions ?? 0),
  };
}

/**
 * The lake rows from the campaign-level and ad-group-level search results, for every day they
 * cover. An ad group row is kept as it is. A campaign with no ad-group row on a day (Performance
 * Max has no ad groups) gets one row for that day with an empty ad group id and name. A row with no impressions, clicks,
 * cost or conversions is left out. Google counts a conversion on the day of the click that led to
 * it, so a later pull of the same day can carry more conversions.
 *
 * @param {Array<Object>} campaignResults
 * @param {Array<Object>} adGroupResults
 * @returns {Array<Object>}
 */
export function adsCostRows(campaignResults, adGroupResults) {
  const rows = [];
  const campaignDaysWithAdGroups = new Set();
  for (const result of adGroupResults) {
    campaignDaysWithAdGroups.add(`${result.segments.date}|${result.campaign.id}`);
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
    if (campaignDaysWithAdGroups.has(`${result.segments.date}|${result.campaign.id}`)) continue;
    rows.push({
      date: result.segments.date,
      campaign_id: result.campaign.id,
      campaign_name: result.campaign.name,
      ad_group_id: "",
      ad_group_name: "",
      ...metricsOf(result),
    });
  }
  return rows.filter((row) => row.impressions > 0 || row.clicks > 0 || row.cost_gbp > 0 || row.conversions > 0);
}

export function objectKey(dateStr) {
  return `curated/ads/ads_cost/dt=${dateStr}/ads_cost.json.gz`;
}

// Google adds a conversion to the day of its click for as long as the conversion window runs.
// The longest window of the counted actions is the upload purchase action's: an Import from
// clicks action with Google's default click-through window of 90 days. A run with no event
// re-pulls today and the 90 days before it, so each click day's conversions are read again until
// its window closes. The two searches stay far under one 10,000-row page (about 91 days times
// the campaigns and ad groups), and searchAllPages follows any further page.
export const CONVERSION_WINDOW_DAYS = 90;

/**
 * Today and the CONVERSION_WINDOW_DAYS days before it, oldest first, as "YYYY-MM-DD" in UTC.
 *
 * @param {Date} [now]
 * @returns {string[]}
 */
export function conversionWindowDays(now = new Date()) {
  return Array.from({ length: CONVERSION_WINDOW_DAYS + 1 }, (_, index) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (CONVERSION_WINDOW_DAYS - index)))
      .toISOString()
      .slice(0, 10),
  );
}

/**
 * Pull Google Ads cost into the lake, one object per day. The days are read with one campaign
 * search and one ad group search over the whole range, and each day is written to its own dt=
 * partition under a fixed object key, so a re-pull of a day replaces its object. A day with no
 * rows is written empty, so a re-pull also clears a day that has lost its rows.
 *
 * @param {{date?: string, from?: string, to?: string}} [event] - `date` ("YYYY-MM-DD") pulls one
 *   day; `from` and `to` (inclusive, at most 93 days) backfill a range; with neither, today and the
 *   CONVERSION_WINDOW_DAYS days before it.
 * @returns {Promise<{days: Array<{date: string, key: string, count: number}>}>}
 */
export async function handler(event = {}) {
  const bucket = requireEnv("ANALYTICS_LAKE_BUCKET_NAME");
  const oauthClientSecretArn = requireEnv("ADS_OAUTH_CLIENT_SECRET_ARN");
  const refreshTokenSecretArn = requireEnv("ADS_REFRESH_TOKEN_SECRET_ARN");
  const days = event.date || event.from || event.to ? daysOf(event) : conversionWindowDays();
  const firstDate = days[0];
  const lastDate = days[days.length - 1];

  const { customerId, apiVersion } = readAdsAccount();
  const accessToken = await fetchAdsAccessToken({ oauthClientSecretArn, refreshTokenSecretArn });

  const [campaignResults, adGroupResults] = await Promise.all([
    searchAllPages({ accessToken, customerId, apiVersion, query: buildCampaignQuery(firstDate, lastDate) }),
    searchAllPages({ accessToken, customerId, apiVersion, query: buildAdGroupQuery(firstDate, lastDate) }),
  ]);
  const rowsByDay = new Map(days.map((day) => [day, []]));
  for (const row of adsCostRows(campaignResults, adGroupResults)) rowsByDay.get(row.date)?.push(row);

  const results = [];
  for (const [targetDate, rows] of rowsByDay) {
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
