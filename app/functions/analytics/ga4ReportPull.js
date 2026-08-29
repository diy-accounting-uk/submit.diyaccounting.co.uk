// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/ga4ReportPull.js
//
// Nightly job that pulls three GA4 Data API reports — traffic, pages and events — for the
// previous day and writes them as gzipped NDJSON under the lake's curated/ga4/ prefix. GA4's
// `date` dimension comes back as "YYYYMMDD" with no separators, and every metric value comes
// back as a string regardless of its declared type; both are converted here so a downstream
// Athena query never has to.

import { gzipSync } from "zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/ga4ReportPull.js" });

const REPORTS = [
  {
    name: "traffic",
    dimensions: ["date", "country", "sessionDefaultChannelGroup"],
    metrics: ["sessions", "activeUsers", "newUsers", "engagedSessions", "averageSessionDuration"],
  },
  {
    name: "pages",
    dimensions: ["date", "pagePath", "hostName"],
    metrics: ["screenPageViews", "activeUsers"],
  },
  {
    name: "events",
    dimensions: ["date", "eventName"],
    metrics: ["eventCount", "activeUsers", "eventValue"],
  },
];

let cachedS3Client = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

let cachedSecretsManagerClient = null;

function getSecretsManagerClient() {
  if (!cachedSecretsManagerClient) {
    cachedSecretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsManagerClient;
}

/**
 * Resolve the GA4 service-account key JSON, preferring a plain env var (used by tests and local
 * runs) over Secrets Manager, the same precedence stripeClient.js uses for the Stripe key.
 *
 * @returns {Promise<string>}
 */
async function resolveServiceAccountCredentialsJson() {
  if (process.env.GA4_SERVICE_ACCOUNT_JSON) {
    return process.env.GA4_SERVICE_ACCOUNT_JSON;
  }
  const arn = process.env.GA4_SERVICE_ACCOUNT_ARN;
  if (!arn) {
    throw new Error("Neither GA4_SERVICE_ACCOUNT_JSON nor GA4_SERVICE_ACCOUNT_ARN is set");
  }
  const result = await getSecretsManagerClient().send(new GetSecretValueCommand({ SecretId: arn }));
  return result.SecretString;
}

let cachedGa4Client = null;
let cachedCredentialsJson = null;

/**
 * Get a lazy-initialized GA4 Data API client, caching it across Lambda warm starts the same way
 * getStripeClient() does for Stripe.
 *
 * @returns {Promise<BetaAnalyticsDataClient>}
 */
async function getGa4Client() {
  const credentialsJson = await resolveServiceAccountCredentialsJson();
  if (cachedGa4Client && cachedCredentialsJson === credentialsJson) {
    return cachedGa4Client;
  }
  const credentials = JSON.parse(credentialsJson);
  cachedGa4Client = new BetaAnalyticsDataClient({ credentials });
  cachedCredentialsJson = credentialsJson;
  return cachedGa4Client;
}

/**
 * Yesterday's date in UTC, as "YYYY-MM-DD". The default report target: a run that fires just
 * after midnight reports on the day that just ended.
 *
 * @returns {string}
 */
export function defaultTargetDate() {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().slice(0, 10);
}

/**
 * Convert GA4's `date` dimension value, "YYYYMMDD" with no separators, into "YYYY-MM-DD".
 *
 * @param {string} value
 * @returns {string}
 */
export function formatGa4Date(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/**
 * Convert one GA4 report row into a plain object keyed by dimension and metric name. GA4 returns
 * every metric value as a string regardless of its declared numeric type, so each one is cast to
 * a number here rather than left for every downstream query to cast inconsistently.
 *
 * @param {{dimensionValues: {value: string}[], metricValues: {value: string}[]}} row
 * @param {string[]} dimensionNames
 * @param {string[]} metricNames
 * @returns {object}
 */
export function rowToRecord(row, dimensionNames, metricNames) {
  const record = {};
  dimensionNames.forEach((name, index) => {
    const raw = row.dimensionValues[index].value;
    record[name] = name === "date" ? formatGa4Date(raw) : raw;
  });
  metricNames.forEach((name, index) => {
    record[name] = Number(row.metricValues[index].value);
  });
  return record;
}

/**
 * Gzip a list of records as newline-delimited JSON, one object per line. An empty list still
 * produces a valid (empty) gzip member rather than being skipped, so a quiet day's object always
 * exists and a downstream `SELECT count(*)` returns zero, not "table missing".
 *
 * @param {object[]} records
 * @returns {Buffer}
 */
export function toNdjsonGzip(records) {
  const ndjson = records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
  return gzipSync(Buffer.from(ndjson, "utf8"));
}

async function runOneReport(client, propertyId, report, targetDate) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: targetDate, endDate: targetDate }],
    dimensions: report.dimensions.map((name) => ({ name })),
    metrics: report.metrics.map((name) => ({ name })),
  });
  const rows = response.rows ?? [];
  return rows.map((row) => rowToRecord(row, report.dimensions, report.metrics));
}

function objectKey(reportName, dateStr) {
  return `curated/ga4/report=${reportName}/dt=${dateStr}/${reportName}.json.gz`;
}

async function putReportObject(s3Client, bucket, reportName, dateStr, records) {
  const key = objectKey(reportName, dateStr);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: toNdjsonGzip(records),
      ContentType: "application/json",
      ContentEncoding: "gzip",
    }),
  );
  return key;
}

/**
 * Pull one day of GA4 traffic, pages and events reports into the lake.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides yesterday,
 *   which is what a backfill invoke passes.
 * @returns {Promise<{date: string, keys: object, counts: object}>}
 */
export async function handler(event = {}) {
  const targetDate = event.date ?? defaultTargetDate();

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("GA4_PROPERTY_ID environment variable is required");
  }

  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!bucket) {
    throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");
  }

  // Resolved before any report runs or object is written, so a missing credential throws rather
  // than leaving a partial or empty day's worth of objects in the lake.
  const client = await getGa4Client();

  const s3Client = getS3Client();
  const keys = {};
  const counts = {};
  for (const report of REPORTS) {
    const records = await runOneReport(client, propertyId, report, targetDate);
    keys[report.name] = await putReportObject(s3Client, bucket, report.name, targetDate, records);
    counts[report.name] = records.length;
  }

  logger.info({ message: "GA4 report pull complete", date: targetDate, counts, keys });

  return { date: targetDate, keys, counts };
}
